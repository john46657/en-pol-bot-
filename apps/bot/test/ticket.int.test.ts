import { permissionRepository, prisma } from '@nexus/database';
import { saveCategory, saveSettings, type TicketDiscord } from '@nexus/tickets';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTicket } from '../src/commands/ticket.js';
import { openFromModal } from '../src/tickets/ticket-handlers.js';
import { setTicketDiscordForTests } from '../src/tickets/ticket-core.js';

const G = 'ticketbot-guild';
const [USER, STAFF, ADMIN] = ['900000000000220001', '900000000000220002', '900000000000220003'];
const ROLE = '900000000000229001';
let cat = '';
let channelSeq = 0;
const discord: TicketDiscord = {
  createChannel: vi.fn(async () => `80000000000022${String(++channelSeq).padStart(4, '0')}`),
  deleteChannel: vi.fn(async () => {}),
  fetchMessages: vi.fn(async () => [{ id: '1', authorId: USER, author: 'Max', bot: false, content: 'Hallo', at: '2026-10-04T10:00:00Z', attachments: [], embeds: 0 }]),
  send: vi.fn(async () => {}),
  sendDm: vi.fn(async () => {}),
  setMemberAccess: vi.fn(async () => {}),
  post: vi.fn(async () => 'm1'),
  edit: vi.fn(async () => {}),
  sendFile: vi.fn(async () => {}),
  sendDmFile: vi.fn(async () => {}),
};

beforeEach(async () => {
  setTicketDiscordForTests(discord);
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Tickets', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-user', [e('tickets.create')], { name: 'Mitglied' });
  await permissionRepository.setPermissionsForRole(G, 'role-staff', ['tickets.create', 'tickets.view', 'tickets.handle'].map(e), { name: 'Support' });
  await permissionRepository.setPermissionsForRole(G, 'role-admin', ['tickets.manage', 'tickets.view'].map(e), { name: 'Leitung' });
  await saveSettings(G, { deleteAfterMinutes: 0 }, 'x'); // Kanal sofort löschen (Standard: 10 Minuten)
  cat = (await saveCategory(G, { name: 'Support', staffRoleIds: [ROLE] }, 'x')).id;
});
afterAll(async () => {
  setTicketDiscordForTests(null);
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

function call(userId: string, roles: string[], sub: string, o: { str?: Record<string, string>; user?: string; channelId?: string } = {}) {
  const replies: any[] = [];
  const i: any = {
    guild: { id: G },
    channelId: o.channelId ?? '1',
    member: { id: userId, displayName: 'Max', guild: { id: G, ownerId: 'x' }, roles: { cache: new Map([...roles, ...(userId === STAFF ? [ROLE] : [])].map((r) => [r, {}])) }, permissions: { has: () => false } },
    user: { id: userId },
    options: { getSubcommand: () => sub, getString: (n: string, req?: boolean) => o.str?.[n] ?? (req ? (() => { throw new Error('fehlt'); })() : null), getUser: () => ({ id: o.user }), getChannel: () => null },
    reply: vi.fn(async (x: any) => void replies.push(x)),
    replies,
  };
  return runTicket(i).then(() => JSON.stringify(replies[0]));
}

describe('/ticket', () => {
  it('Lebenszyklus: neu → Bearbeiter übernimmt → Priorität → Mitglied hinzufügen → schließen → Archiv → Transkript', async () => {
    const created = await call(USER, ['role-user'], 'neu', { str: { kategorie: 'support', betreff: 'Mein Problem' } });
    expect(created).toContain('#0001');
    const t = await prisma.ticket.findFirstOrThrow({ where: { guildId: G } });
    expect(await call(USER, ['role-user'], 'uebernehmen', { str: { nummer: '1' } })).toContain('Nur Bearbeiter');
    expect(await call(STAFF, ['role-staff'], 'uebernehmen', { str: { nummer: '#1' } })).toContain('in Bearbeitung');
    expect(await call(STAFF, ['role-staff'], 'prioritaet', { str: { nummer: '1', stufe: 'URGENT' } })).toContain('Dringend');
    expect(await call(STAFF, ['role-staff'], 'hinzufuegen', { user: ADMIN, channelId: t.channelId! })).toContain('hinzugefügt'); // „dieses Ticket“ im Kanal
    expect(await call(USER, ['role-user'], 'liste')).toContain('Du benötigst');
    expect(await call(STAFF, ['role-staff'], 'liste')).toContain('Mein Problem');
    expect(await call(USER, ['role-user'], 'schliessen', { str: { nummer: '1', grund: 'Erledigt' } })).toContain('geschlossen');
    expect(discord.deleteChannel).toHaveBeenCalledWith(t.channelId);
    expect(await call(STAFF, ['role-staff'], 'archiv', { str: { suche: 'problem' } })).toContain('Mein Problem');
    expect(await call(STAFF, ['role-staff'], 'transkript', { str: { nummer: '1' } })).toContain('Hallo');
    expect(await call(USER, ['role-user'], 'transkript', { str: { nummer: '1' } })).toContain('Du benötigst');
  });
  it('Fehler verständlich: Limit, fremdes Ticket, unbekannte Kategorie', async () => {
    await call(USER, ['role-user'], 'neu', { str: { kategorie: 'Support', betreff: 'Eins eins' } });
    expect(await call(USER, ['role-user'], 'neu', { str: { kategorie: 'Support', betreff: 'Zwei zwei' } })).toContain('bereits ein offenes Ticket');
    expect(await call(USER, ['role-user'], 'neu', { str: { kategorie: 'Nix', betreff: 'Hallo du' } })).toContain('gibt es nicht');
    expect(await call('900000000000220009', ['role-user'], 'info', { str: { nummer: '1' } })).toContain('Du benötigst'); // fremdes Ticket
    expect(await call(USER, ['role-user'], 'info', { str: { nummer: '1' } })).toContain('Eins eins'); // eigenes
    expect(await call(USER, ['role-user'], 'info', {})).toContain('Gib die Ticketnummer an');
  });
});

describe('Modal-Eröffnung (Panel)', () => {
  it('legt das Ticket an und verweist auf den Kanal; ohne Recht nicht', async () => {
    const mk = (roles: string[]) => {
      const replies: any[] = [];
      const i: any = { guild: { id: G }, member: { id: USER, displayName: 'Max', roles: { cache: new Map(roles.map((r) => [r, {}])) }, guild: { id: G, ownerId: 'x' }, permissions: { has: () => false } }, fields: { getTextInputValue: (k: string) => (k === 'subject' ? 'Per Panel' : 'Details') }, deferReply: vi.fn(async () => { i.deferred = true; }), editReply: vi.fn(async (x: any) => void replies.push(x)), reply: vi.fn(async (x: any) => void replies.push(x)), replied: false, deferred: false, replies };
      return i;
    };
    const ok = mk(['role-user']);
    await openFromModal(ok, cat);
    expect(JSON.stringify(ok.replies[0])).toContain('Dein Ticket wurde eröffnet');
    expect(await prisma.ticket.count({ where: { guildId: G, subject: 'Per Panel' } })).toBe(1);
    const no = mk([]);
    await openFromModal(no, cat);
    expect(JSON.stringify(no.replies[0])).toContain('keine Tickets');
  });
});
