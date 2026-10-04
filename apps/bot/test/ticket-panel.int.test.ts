import { permissionRepository, prisma } from '@nexus/database';
import { saveCategory, saveSettings, type TicketDiscord } from '@nexus/tickets';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReviewPort } from '../src/applications/review-handlers.js';
import { handleInteraction } from '../src/interactions/handlers.js';
import { setTicketDiscordForTests } from '../src/tickets/ticket-core.js';
import '../src/commands/ticket.js';

/**
 * Abnahme Ticket-Panel: Kategorie wählen → Ticket, Formular, Claim (Umschalten), Benachrichtigung, Informationen,
 * Schließen mit Bestätigung / mit Grund, „Ticket mit Bewerber“ und „View Applicants Application“. Echte Datenbank, Discord als Attrappe.
 */
const G = 'tpanel-guild';
const [USER, STAFF, OTHER, APPLICANT] = ['900000000000230001', '900000000000230002', '900000000000230003', '900000000000230004'];
const STAFF_ROLE = '900000000000239001';
let seq = 0;
const sent: { channel: string; payload: any }[] = [];
const discord: TicketDiscord & { files: any[] } = {
  files: [],
  createChannel: vi.fn(async () => `80000000000023${String(++seq).padStart(4, '0')}`),
  deleteChannel: vi.fn(async () => {}),
  fetchMessages: vi.fn(async () => [{ id: '1', authorId: USER, author: 'Max', bot: false, content: 'Hallo', at: '2026-10-04T10:00:00Z', attachments: [], embeds: 0 }]),
  send: vi.fn(async (channel, payload) => void sent.push({ channel, payload })),
  sendDm: vi.fn(async () => {}),
  setMemberAccess: vi.fn(async () => {}),
  post: vi.fn(async () => 'm1'),
  edit: vi.fn(async () => {}),
  sendFile: vi.fn(async (_c, _p, file) => void discord.files.push(file)),
  sendDmFile: vi.fn(async () => {}),
};

type Out = { replies: any[]; shown: any[]; updates: any[] };
function ix(kind: 'button' | 'select' | 'modal', customId: string, userId: string, roles: string[], o: { values?: string[]; fields?: Record<string, string>; guildMembers?: Record<string, any> } = {}) {
  const out: Out = { replies: [], shown: [], updates: [] };
  const member = { id: userId, displayName: `Name-${userId.slice(-2)}`, guild: { id: G, ownerId: 'x' }, roles: { cache: new Map(roles.map((r) => [r, {}])) }, permissions: { has: () => false } };
  const i: any = {
    customId, user: { id: userId }, guildId: G, member, replied: false, deferred: false, values: o.values, out,
    guild: { id: G, ownerId: 'x', members: { cache: new Map(), fetch: async (id: string) => o.guildMembers?.[id] ?? (id === userId ? member : null) } },
    message: { edit: vi.fn(async () => undefined) },
    fields: { getTextInputValue: (k: string) => o.fields?.[k] ?? '' },
    isMessageComponent: () => kind !== 'modal', isModalSubmit: () => kind === 'modal', isButton: () => kind === 'button', isStringSelectMenu: () => kind === 'select', isRepliable: () => true,
    reply: vi.fn(async (x: any) => { i.replied = true; out.replies.push(x); }),
    deferReply: vi.fn(async () => { i.deferred = true; }),
    editReply: vi.fn(async (x: any) => void out.replies.push(x)),
    update: vi.fn(async (x: any) => { i.replied = true; out.updates.push(x); }),
    followUp: vi.fn(async (x: any) => void out.replies.push(x)),
    showModal: vi.fn(async (m: any) => void out.shown.push(m.toJSON ? m.toJSON() : m)),
  };
  return i;
}
const client = () => ({ user: { id: 'bot' } }) as never;
const text = (i: any) => JSON.stringify([...i.out.replies, ...i.out.updates]);
const press = async (kind: 'button' | 'select' | 'modal', id: string, user: string, roles: string[], o?: Parameters<typeof ix>[4]) => {
  const i = ix(kind, id, user, roles, o);
  await handleInteraction(client(), i);
  return i;
};

let cat = '';
beforeEach(async () => {
  sent.length = 0;
  discord.files.length = 0;
  setTicketDiscordForTests(discord);
  setReviewPort({ sendDm: vi.fn(), postMessage: vi.fn(async () => ({ id: 'x' })), editMessage: vi.fn(), roleDriver: () => ({ getRoleIds: async () => [], add: async () => {}, remove: async () => {} }) } as never);
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Panel', settings: { create: {} } } });
  const e = (key: string) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' });
  await permissionRepository.setPermissionsForRole(G, 'role-user', [e('tickets.create')], { name: 'Mitglied' });
  await permissionRepository.setPermissionsForRole(G, STAFF_ROLE, ['tickets.create', 'tickets.view', 'tickets.handle', 'applications.submissions.view'].map(e), { name: 'Support' });
  await saveSettings(G, { deleteAfterMinutes: 0, transcriptChannelId: '800000000000230099' }, 'x');
  cat = (await saveCategory(G, { name: 'Shader', emoji: '🎨', staffRoleIds: [STAFF_ROLE], maxOpenTotal: 3 }, 'x')).id;
});
afterAll(async () => {
  setTicketDiscordForTests(null);
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Panel → Ticket', () => {
  it('Auswahl erstellt das Ticket sofort; zweites Ticket derselben Kategorie: „Du hast bereits ein offenes Ticket.“; ohne Recht: abgelehnt', async () => {
    const a = await press('select', 'nexus:ticket:pick', USER, ['role-user'], { values: [cat] });
    expect(text(a)).toContain('Dein Ticket wurde eröffnet');
    expect(await prisma.ticket.count({ where: { guildId: G, userId: USER } })).toBe(1);
    const b = await press('select', 'nexus:ticket:pick', USER, ['role-user'], { values: [cat] });
    expect(text(b)).toContain('Du hast bereits ein offenes Ticket');
    const c = await press('select', 'nexus:ticket:pick', OTHER, [], { values: [cat] });
    expect(text(c)).toContain('keine Tickets');
    const bad = await press('select', 'nexus:ticket:pick', USER, ['role-user'], { values: ['<script>'] });
    expect(text(bad)).toContain('Ungültige Auswahl');
  });

  it('volle Kategorie: verständliche Meldung; Fehler in Discord → Nutzer sieht nur die allgemeine Meldung (keine Interna)', async () => {
    await prisma.ticketCategory.update({ where: { id: cat }, data: { maxOpenTotal: 1 } });
    await press('select', 'nexus:ticket:pick', USER, ['role-user'], { values: [cat] });
    const full = await press('select', 'nexus:ticket:pick', OTHER, ['role-user'], { values: [cat] });
    expect(text(full)).toContain('aktuell voll');
    await prisma.ticketCategory.update({ where: { id: cat }, data: { maxOpenTotal: 5 } });
    vi.mocked(discord.createChannel).mockRejectedValueOnce(new Error('Missing Permissions secret-token-123'));
    const err = await press('select', 'nexus:ticket:pick', OTHER, ['role-user'], { values: [cat] });
    expect(text(err)).not.toContain('secret-token-123');
    expect(text(err)).toContain('Ticket-Kanal konnte nicht angelegt werden');
  });

  it('Kategorie mit Formular: erst Modal mit den Feldern, dann Ticket mit Antworten', async () => {
    const f = (await saveCategory(G, { name: 'Bug', formFields: [{ id: 'f0', label: 'Was passiert?', style: 'paragraph', required: true }] }, 'x')).id;
    const pick = await press('select', 'nexus:ticket:pick', USER, ['role-user'], { values: [f] });
    expect(pick.out.shown[0].custom_id).toBe(`nexus:ticket:new:${f}`);
    expect(pick.out.shown[0].components[0].components[0].label).toBe('Was passiert?');
    const sub = await press('modal', pick.out.shown[0].custom_id, USER, ['role-user'], { fields: { f0: 'Shader flackert' } });
    expect(text(sub)).toContain('Dein Ticket wurde eröffnet');
    expect((await prisma.ticket.findFirstOrThrow({ where: { guildId: G, categoryId: f } })).formAnswers).toEqual([{ label: 'Was passiert?', value: 'Shader flackert' }]);
  });
});

describe('Im Ticket', () => {
  let id = '';
  beforeEach(async () => {
    await press('select', 'nexus:ticket:pick', USER, ['role-user'], { values: [cat] });
    id = (await prisma.ticket.findFirstOrThrow({ where: { guildId: G } })).id;
  });

  it('Claim schaltet um (übernehmen → freigeben), Fremde dürfen nicht', async () => {
    const no = await press('button', `nexus:ticket:claim:${id}`, USER, ['role-user']);
    expect(text(no)).toContain('Nur Bearbeiter');
    const a = await press('button', `nexus:ticket:claim:${id}`, STAFF, [STAFF_ROLE]);
    expect(text(a)).toContain('bearbeitest dieses Ticket');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).claimedBy).toBe(STAFF);
    expect(sent.at(-1)!.payload.embeds[0].title).toBe('🎫 Ticket übernommen');
    const b = await press('button', `nexus:ticket:claim:${id}`, STAFF, [STAFF_ROLE]);
    expect(text(b)).toContain('freigegeben');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).claimedBy).toBeNull();
  });

  it('Informationen nur für Beteiligte; Benachrichtigung mit Wartezeit', async () => {
    expect(text(await press('button', `nexus:ticket:info:${id}`, USER, ['role-user']))).toContain('Ticket-ID');
    expect(text(await press('button', `nexus:ticket:info:${id}`, OTHER, ['role-user']))).toContain('Nur Beteiligte');
    expect(text(await press('button', `nexus:ticket:ping:${id}`, USER, ['role-user']))).toContain('Team wurde benachrichtigt');
    expect(text(await press('button', `nexus:ticket:ping:${id}`, USER, ['role-user']))).toContain('Bitte warte');
  });

  it('Schließen: Der Button öffnet das Pflicht-Formular (zugleich Bestätigung); ohne Grund bleibt das Ticket offen, mit Grund wird es geschlossen und das Transcript landet im Transcript-Kanal', async () => {
    const ask = await press('button', `nexus:ticket:close:${id}`, USER, ['role-user']);
    expect(ask.out.shown[0].title).toBe('Ticket schließen');
    expect(ask.out.shown[0].components[0].components[0]).toMatchObject({ required: true });
    const refused = await press('modal', `nexus:ticket:closem:${id}`, USER, ['role-user'], { fields: { reason: ' ' } });
    expect(text(refused)).toContain('Schließungsgrund');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id } })).status).toBe('OPEN');
    const yes = await press('modal', `nexus:ticket:closem:${id}`, USER, ['role-user'], { fields: { reason: 'Problem gelöst' } });
    expect(text(yes)).toContain('Ticket geschlossen');
    expect(await prisma.ticket.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'CLOSED', closeReason: 'Problem gelöst' });
    expect(discord.files[0].name).toMatch(/^ticket-0001-.*\.html$/);
    expect(discord.deleteChannel).toHaveBeenCalled();
  });

  it('Schließen mit Grund: Modal „Ticket schließen“ mit Pflichtfeld; Grund wird gespeichert und steht im Transcript', async () => {
    const open = await press('button', `nexus:ticket:closer:${id}`, STAFF, [STAFF_ROLE]);
    expect(open.out.shown[0].title).toBe('Ticket schließen');
    expect(open.out.shown[0].components[0].components[0]).toMatchObject({ label: 'Grund für das Schließen', required: true });
    const done = await press('modal', `nexus:ticket:closem:${id}`, STAFF, [STAFF_ROLE], { fields: { reason: 'Problem wurde gelöst.' } });
    expect(text(done)).toContain('Ticket geschlossen');
    const t = await prisma.ticket.findUniqueOrThrow({ where: { id } });
    expect(t).toMatchObject({ status: 'CLOSED', closeReason: 'Problem wurde gelöst.' });
    expect(t.transcriptHtml).toContain('Problem wurde gelöst.');
  });

  it('Schließen: ungültige IDs werden abgewiesen, ein geschlossenes Ticket lässt sich nicht erneut schließen', async () => {
    expect(text(await press('button', 'nexus:ticket:close:../../etc', USER, ['role-user']))).toContain('Das geht hier nicht');
    await press('modal', `nexus:ticket:closem:${id}`, USER, ['role-user'], { fields: { reason: 'Doppelt' } });
    expect(text(await press('button', `nexus:ticket:close:${id}`, USER, ['role-user']))).toContain('bereits geschlossen');
  });
});

describe('Bewerbung → Ticket', () => {
  it('„Ticket mit User“ öffnet ein Bewerbungsgespräch (einmalig); „View Applicants Application“ zeigt die Bewerbung nur Berechtigten', async () => {
    const app = await prisma.application.create({ data: { guildId: G, name: 'Flugstaffel', slug: 'flug', config: {}, createdBy: 'x', updatedBy: 'x' } });
    const version = await prisma.applicationVersion.create({ data: { applicationId: app.id, version: 1, questions: [], publishedById: 'x' } });
    const sub = await prisma.applicationSubmission.create({ data: { guildId: G, applicationId: app.id, versionId: version.id, userId: APPLICANT, usernameSnapshot: 'bewerber', displayNameSnapshot: 'Bewerber', status: 'SUBMITTED', submittedAt: new Date() } });
    const applicant = { id: APPLICANT, displayName: 'Bewerber', roles: { cache: new Map() } };
    const click = await press('button', `nexus:review:ticket:${sub.id}`, STAFF, [STAFF_ROLE], { guildMembers: { [APPLICANT]: applicant } });
    expect(text(click)).not.toContain('keine Berechtigung');
    const t = await prisma.ticket.findFirstOrThrow({ where: { guildId: G, submissionId: sub.id } });
    expect(t.userId).toBe(APPLICANT);
    const start = sent.find((s) => s.channel === t.channelId)!.payload;
    expect(start.embeds[0].title).toBe('🎫 Bewerbungsgespräch');
    expect(start.components[1].components[0].label).toBe('View Applicants Application');
    const again = await press('button', `nexus:review:ticket:${sub.id}`, STAFF, [STAFF_ROLE], { guildMembers: { [APPLICANT]: applicant } });
    expect(text(again)).toContain('bereits ein Gespräch');
    // Ansicht der Bewerbung im Ticket
    const view = await press('button', `nexus:ticket:app:${t.id}`, STAFF, [STAFF_ROLE]);
    expect(text(view)).toContain('Flugstaffel');
    const denied = await press('button', `nexus:ticket:app:${t.id}`, USER, ['role-user']);
    expect(text(denied)).toContain('❌');
  });
});
