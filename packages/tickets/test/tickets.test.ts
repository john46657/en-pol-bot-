import { guildRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRestriction, revokeRestriction } from '@nexus/restrictions';
import { saveSettings } from '../src/index.js';
import { CLOSE_REASONS, fieldPlaceholder, parseFormFields, validateAnswer, TicketError, claim, setWaiting, closeTicket, deleteCategory, formatNumber, getByChannel, getByNumber, listTickets, openTicket, release, renderTranscript, saveCategory, setParticipant, setPriority, stats, ticketHistory, type Actor, type TicketDiscord, type TranscriptMessage } from '../src/index.js';

const G = 'tickettest-guild';
const [U1, U2, STAFF, ADMIN, OTHER] = ['900000000000210001', '900000000000210002', '900000000000210003', '900000000000210004', '900000000000210005'];
const ROLE = '900000000000219001';
const LOG = '800000000000210009';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof TicketError && e.code === code);

const staff: Actor = { userId: STAFF, roleIds: [ROLE], manage: false, handle: true };
const admin: Actor = { userId: ADMIN, roleIds: [], manage: true, handle: true };
const user = (id: string): Actor => ({ userId: id, roleIds: [], manage: false, handle: false });
const outsider: Actor = { userId: OTHER, roleIds: ['x'], manage: false, handle: true }; // handle, aber falsche Rolle

function fake(opts: { messages?: TranscriptMessage[]; failCreate?: boolean; failDm?: boolean } = {}) {
  let n = 0;
  const sent: { channel: string; payload: any }[] = [];
  const d: TicketDiscord & { sent: typeof sent; created: any[]; deleted: string[]; access: [string, string, boolean][] } = {
    sent, created: [], deleted: [], access: [],
    createChannel: vi.fn(async (i) => {
      if (opts.failCreate) throw new Error('403');
      d.created.push(i);
      return `80000000000021${String(++n).padStart(4, '0')}`;
    }),
    deleteChannel: vi.fn(async (c) => void d.deleted.push(c)),
    fetchMessages: vi.fn(async () => opts.messages ?? []),
    send: vi.fn(async (channel, payload) => void sent.push({ channel, payload })),
    sendDm: vi.fn(async () => { if (opts.failDm) throw new Error('DM zu'); }),
    setMemberAccess: vi.fn(async (c, u, a) => void d.access.push([c, u, a])),
    post: vi.fn(async (channel, payload) => { sent.push({ channel, payload }); return 'msg1'; }),
    edit: vi.fn(async () => undefined),
    sendFile: vi.fn(async (channel, payload, file) => void sent.push({ channel, payload: { ...payload, file } })),
    sendDmFile: vi.fn(async () => undefined),
  };
  return d;
}
const msg = (author: string, content: string, bot = false): TranscriptMessage => ({ id: String(Math.random()), authorId: author, author, bot, content, at: '2026-10-04T10:00:00.000Z', attachments: [], embeds: 0 });

let cat = '';
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Tickets', settings: { create: {} } } });
  cat = (await saveCategory(G, { name: 'Support', emoji: '🛠️', staffRoleIds: [ROLE], maxOpenPerUser: 2 }, 'boss')).id;
});
afterAll(async () => {
  await prisma.ticketCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Kategorien', () => {
  it('Validierung, Eindeutigkeit, Löschschutz', async () => {
    await err(saveCategory(G, { name: '' }, 'b'), 'invalid');
    await err(saveCategory(G, { name: 'X', defaultPriority: 'MEGA' }, 'b'), 'invalid');
    await err(saveCategory(G, { name: 'X', staffRoleIds: ['abc'] }, 'b'), 'invalid');
    await err(saveCategory(G, { name: 'X', maxOpenPerUser: 0 }, 'b'), 'invalid');
    await err(saveCategory(G, { name: 'Support' }, 'b'), 'conflict');
    await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Hilfe' }, fake());
    await err(deleteCategory(G, cat, 'b'), 'conflict');
    const c2 = await saveCategory(G, { name: 'Leer' }, 'b');
    await deleteCategory(G, c2.id, 'b');
  });
});

describe('Ticket eröffnen', () => {
  it('privater Kanal mit Ersteller + Bearbeiter-Rollen, Nummer, Priorität aus Kategorie, Willkommensnachricht mit Buttons', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'Max Müller!', categoryId: cat, subject: 'Mein Anliegen', description: 'Details' }, d);
    expect(t).toMatchObject({ number: 1, status: 'OPEN', priority: 'NORMAL', userId: U1 });
    expect(d.created[0]).toMatchObject({ userIds: [U1], roleIds: [ROLE], name: 'ticket-0001-max-muller' });
    expect(t.channelId).toBeTruthy();
    expect(d.sent[0]!.payload.embeds[0].title).toBe('🎫 Ticket geöffnet');
    expect(d.sent[0]!.payload.embeds[0].fields.map((f: any) => f.value)).toContain('#0001');
    expect(JSON.stringify(d.sent[0]!.payload.components)).toContain('ticket:claim');
    expect((await getByChannel(G, t.channelId!))?.id).toBe(t.id);
  });
  it('Nummern parallel, Limit je Kategorie, Validierung, Discord-Fehler rollt zurück', async () => {
    const d = fake();
    await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat, subject: 'Eins eins' }, d);
    await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat, subject: 'Zwei zwei' }, d);
    await err(openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat, subject: 'Drei drei' }, d), 'conflict');
    await err(openTicket({ guildId: G, userId: U2, username: 'b', categoryId: cat, subject: 'x' }, d), 'invalid');
    await err(openTicket({ guildId: G, userId: U2, username: 'b', categoryId: 'nix', subject: 'Hallo du' }, d), 'not-found');
    await err(openTicket({ guildId: G, userId: U2, username: 'b', categoryId: cat, subject: 'Hallo du' }, fake({ failCreate: true })), 'conflict');
    expect(await prisma.ticket.count({ where: { guildId: G, userId: U2 } })).toBe(0);
    const par = await Promise.all([U2, OTHER, ADMIN].map((u) => openTicket({ guildId: G, userId: u, username: 'p', categoryId: cat, subject: 'Parallel' }, d)));
    expect(new Set(par.map((p) => p.number)).size).toBe(3);
  });
});

describe('Bearbeiten', () => {
  let ticketId = '';
  let d: ReturnType<typeof fake>;
  beforeEach(async () => {
    d = fake();
    ticketId = (await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Hilfe bitte' }, d)).id;
  });
  it('Übernahme: nur Bearbeiter der Kategorie, genau einer, Verwaltung kann umzuweisen, Freigabe', async () => {
    await err(claim(G, ticketId, user(U1), d), 'forbidden');
    await err(claim(G, ticketId, outsider, d), 'forbidden'); // falsche Rolle
    const c = await claim(G, ticketId, staff, d);
    expect(c).toMatchObject({ status: 'IN_PROGRESS', claimedBy: STAFF });
    await err(claim(G, ticketId, staff, d), 'conflict'); // schon selbst
    await err(claim(G, ticketId, { ...staff, userId: 'x2' }, d), 'conflict'); // fremd übernommen
    expect((await claim(G, ticketId, admin, d)).claimedBy).toBe(ADMIN); // Verwaltung darf übernehmen
    await err(release(G, ticketId, staff, d), 'forbidden');
    expect((await release(G, ticketId, admin, d)).status).toBe('OPEN');
    await err(release(G, ticketId, admin, d), 'conflict');
    expect((await ticketHistory(G, ticketId)).map((e) => e.type)).toEqual(['opened', 'claimed', 'claimed', 'released']);
  });
  it('Priorität: nur Bearbeiter, validiert, protokolliert', async () => {
    await err(setPriority(G, ticketId, 'URGENT', user(U1)), 'forbidden');
    await err(setPriority(G, ticketId, 'MEGA', staff), 'invalid');
    expect((await setPriority(G, ticketId, 'URGENT', staff)).priority).toBe('URGENT');
    expect((await ticketHistory(G, ticketId)).find((e) => e.type === 'priority')?.data).toMatchObject({ from: 'NORMAL', to: 'URGENT' });
  });
  it('Mitglieder hinzufügen/entfernen: Ersteller und Bearbeiter dürfen, Kanalrecht wird gesetzt', async () => {
    await setParticipant(G, ticketId, U2, true, user(U1), d);
    expect(d.access).toEqual([[expect.any(String), U2, true]]);
    await err(setParticipant(G, ticketId, U2, true, staff, d), 'conflict');
    await err(setParticipant(G, ticketId, OTHER, true, user(U2), d), 'forbidden');
    await err(setParticipant(G, ticketId, U1, true, staff, d), 'invalid'); // Ersteller
    await setParticipant(G, ticketId, U2, false, staff, d);
    await err(setParticipant(G, ticketId, U2, false, staff, d), 'conflict');
    await err(setParticipant(G, ticketId, 'abc', true, staff, d), 'invalid');
  });
});

describe('Schließen, Transkript, Archiv', () => {
  it('Transkript + Log-Kanal + DM + Kanal gelöscht; danach nichts mehr änderbar', async () => {
    await guildRepository.setSelection(G, 'ticket-log-channel', LOG);
    await saveSettings(G, { deleteAfterMinutes: 0 }, 'b'); // sofort löschen (Standard: 10 Minuten, siehe Ticket-v2-Tests)
    const d = fake({ messages: [msg(U1, 'Hallo, ich brauche Hilfe'), msg(STAFF, 'Gerne!'), msg('bot', 'Willkommen', true)] });
    const t = await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Hilfe bitte' }, d);
    await claim(G, t.id, staff, d);
    await err(closeTicket(G, t.id, 'fertig', user(OTHER), d), 'forbidden');
    const r = await closeTicket(G, t.id, 'Problem gelöst', staff, d);
    expect(r).toMatchObject({ transcriptMessages: 3, contentAvailable: true, logged: true, dmDelivered: true, channelDeleted: true });
    expect(r.ticket).toMatchObject({ status: 'CLOSED', closedBy: STAFF, closeReason: 'Problem gelöst' });
    expect(d.sent.at(-1)).toMatchObject({ channel: LOG });
    expect(d.deleted).toEqual([t.channelId]);
    const txt = renderTranscript(r.ticket);
    expect(txt).toContain('Hallo, ich brauche Hilfe');
    expect(txt).toContain('Willkommen');
    expect(txt).toContain('(Bot)');
    await err(closeTicket(G, t.id, 'nochmal', staff, d), 'conflict');
    await err(claim(G, t.id, staff, d), 'conflict');
    await err(setPriority(G, t.id, 'LOW', staff), 'conflict');
    expect(await getByChannel(G, t.channelId!)).toBeNull();
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'ticket.closed' } })).toBe(1);
  });
  it('Ersteller darf schließen; fehlende Inhalte (kein Message-Content-Intent) werden ehrlich festgehalten; DM/Log-Fehler brechen nichts ab', async () => {
    const d = fake({ messages: [msg(U1, ''), msg(STAFF, '')], failDm: true });
    const t = await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Frage' }, d);
    const r = await closeTicket(G, t.id, 'Anfrage erledigt', user(U1), d);
    expect(r).toMatchObject({ contentAvailable: false, logged: false, dmDelivered: false });
    expect(r.ticket.transcriptContent).toBe(false);
    expect(renderTranscript(r.ticket)).toContain('Message-Content-Intent');
  });
  it('Archiv: suchen und filtern; Statistik', async () => {
    const d = fake();
    const a = await openTicket({ guildId: G, userId: U1, username: 'a', categoryId: cat, subject: 'Waffenschein beantragen' }, d);
    const b = await openTicket({ guildId: G, userId: U2, username: 'b', categoryId: cat, subject: 'Beschwerde Streife' }, d);
    await closeTicket(G, a.id, 'erledigt', staff, d);
    const n = async (f: object) => (await listTickets({ guildId: G, ...f })).items.map((t) => t.number).sort();
    expect(await n({})).toEqual([1, 2]);
    expect(await n({ closed: true })).toEqual([1]);
    expect(await n({ open: true })).toEqual([2]);
    expect(await n({ query: 'waffen' })).toEqual([1]);
    expect(await n({ query: '#2' })).toEqual([2]);
    expect(await n({ userId: U2 })).toEqual([2]);
    expect(await n({ categoryId: cat, status: 'CLOSED' })).toEqual([1]);
    expect(formatNumber(12)).toBe('#0012');
    expect((await getByNumber(G, 2)).id).toBe(b.id);
    await err(getByNumber(G, 99), 'not-found');
    expect(await stats(G)).toMatchObject({ byStatus: { CLOSED: 1, OPEN: 1 } });
  });
});

describe('Ticketsperre (Phase 47)', () => {
  it('gesperrter Benutzer kann kein Ticket öffnen (verständliche Meldung); Team-Eröffnung und andere Benutzer nicht betroffen; nach Aufheben frei', async () => {
    const r = await createRestriction({ guildId: G, userId: U1, type: 'TICKET', reason: 'Missbrauch des Supports', actorId: ADMIN });
    await expect(openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Hilfe' }, fake())).rejects.toSatisfy((e) => e instanceof TicketError && e.code === 'forbidden' && e.message.includes('Missbrauch des Supports') && e.message.includes('für Tickets gesperrt'));
    expect(await prisma.ticket.count({ where: { guildId: G } })).toBe(0);
    await openTicket({ guildId: G, userId: U2, username: 'Eva', categoryId: cat, subject: 'Hilfe' }, fake()); // anderer Benutzer
    await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Gespräch', openedBy: STAFF }, fake()); // vom Team eröffnet
    await prisma.restriction.update({ where: { id: r.id }, data: { endsAt: new Date(Date.now() - 1000) } }); // abgelaufen
    await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Wieder frei' }, fake());
    const r2 = await createRestriction({ guildId: G, userId: U2, type: 'TICKET', reason: 'Zweite Sperre', actorId: ADMIN });
    await revokeRestriction(G, r2.id, 'Irrtum', ADMIN);
    await openTicket({ guildId: G, userId: U2, username: 'Eva', categoryId: cat, subject: 'Nach Aufheben' }, fake());
  });
});

describe('Status IN_PROGRESS / WAITING und Pflicht-Schließungsgrund (Phase 49)', () => {
  it('OPEN → IN_PROGRESS → WAITING → IN_PROGRESS; wartend zählt als offen; nur Bearbeiter; Ereignisse', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Frage' }, d);
    expect(t.status).toBe('OPEN');
    await err(setWaiting(G, t.id, false, staff, d), 'conflict'); // wartet nicht
    await err(setWaiting(G, t.id, true, user(U1), d), 'forbidden'); // Ersteller ist kein Bearbeiter
    expect((await claim(G, t.id, staff, d)).status).toBe('IN_PROGRESS');
    const w = await setWaiting(G, t.id, true, staff, d);
    expect(w.status).toBe('WAITING');
    expect(w.claimedBy).toBe(STAFF);
    await err(setWaiting(G, t.id, true, staff, d), 'conflict');
    expect((await listTickets({ guildId: G, open: true })).items.map((x) => x.id)).toContain(t.id);
    expect((await listTickets({ guildId: G, status: 'WAITING' })).items).toHaveLength(1);
    expect(d.sent.some((m) => JSON.stringify(m.payload).includes('wartet auf eine Rückmeldung'))).toBe(true);
    expect((await setWaiting(G, t.id, false, staff, d)).status).toBe('IN_PROGRESS');
    const types = (await prisma.ticketEvent.findMany({ where: { ticketId: t.id }, orderBy: { at: 'asc' } })).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['claimed', 'waiting', 'resumed']));
    await setWaiting(G, t.id, true, staff, d);
    expect((await closeTicket(G, t.id, 'Problem gelöst', staff, d)).ticket.status).toBe('CLOSED'); // wartend lässt sich schließen
    await err(setWaiting(G, t.id, true, staff, d), 'conflict'); // geschlossen
  });

  it('ohne Übernahme: wartend → zurück auf OPEN; Freigeben aus WAITING', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Frage' }, d);
    expect((await setWaiting(G, t.id, true, staff, d)).status).toBe('WAITING');
    expect((await setWaiting(G, t.id, false, staff, d)).status).toBe('OPEN');
    await claim(G, t.id, staff, d);
    await setWaiting(G, t.id, true, staff, d);
    expect((await release(G, t.id, staff, d)).status).toBe('OPEN');
  });

  it('Schließen verlangt einen Grund; Ticket bleibt sonst unverändert; Vorschläge vorhanden', async () => {
    const d = fake();
    const t = await openTicket({ guildId: G, userId: U1, username: 'Max', categoryId: cat, subject: 'Frage' }, d);
    for (const bad of [undefined, '', '  ', 'ab']) await err(closeTicket(G, t.id, bad, staff, d), 'invalid');
    await err(closeTicket(G, t.id, 'x'.repeat(301), staff, d), 'invalid');
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('OPEN');
    expect(CLOSE_REASONS).toContain('Problem gelöst');
    const r = await closeTicket(G, t.id, 'Sonstiger Grund: Test', staff, d);
    expect(r.ticket).toMatchObject({ status: 'CLOSED', closeReason: 'Sonstiger Grund: Test', closedBy: STAFF });
    expect(r.ticket.closedAt).not.toBeNull();
  });
});

describe('Fragetypen im Ticket-Formular (Phase 51)', () => {
  const f = (type: string, extra = {}) => parseFormFields([{ id: 'a', label: 'Frage', type, required: true, ...extra }])[0]!;
  const ok = (field: ReturnType<typeof f>, raw: string) => { const r = validateAnswer(field, raw); expect(r.ok, raw).toBe(true); return (r as { value: string }).value; };
  const no = (field: ReturnType<typeof f>, raw: string) => expect(validateAnswer(field, raw).ok, raw).toBe(false);

  it('alte Felder (nur style) bleiben text/paragraph; Auswahl ohne Optionen wird verworfen; höchstens 10 Optionen, 5 Felder', () => {
    expect(parseFormFields([{ label: 'A', style: 'paragraph' }, { label: 'B' }]).map((x) => x.type)).toEqual(['paragraph', 'text']);
    expect(parseFormFields([{ label: 'C', type: 'choice', options: ['nur eine'] }])).toEqual([]);
    expect(f('choice', { options: Array.from({ length: 15 }, (_, i) => `o${i}`) }).options).toHaveLength(10);
    expect(parseFormFields(Array.from({ length: 8 }, (_, i) => ({ label: `F${i}` })))).toHaveLength(5);
    expect(f('unbekannt').type).toBe('text');
  });
  it('Zahl, Datum, Ja/Nein, Benutzer', () => {
    expect(ok(f('number'), '12,5')).toBe('12.5');
    ['abc', '1e5', '12,'].forEach((x) => no(f('number'), x));
    expect(ok(f('date'), '4.10.2026')).toBe('04.10.2026');
    expect(ok(f('date'), '2026-10-04')).toBe('04.10.2026');
    ['31.02.2026', '4.13.2026', 'morgen'].forEach((x) => no(f('date'), x));
    expect([ok(f('yesno'), 'ja'), ok(f('yesno'), 'N'), ok(f('yesno'), 'Yes')]).toEqual(['Ja', 'Nein', 'Ja']);
    no(f('yesno'), 'vielleicht');
    expect(ok(f('user'), '<@!123456789012>')).toBe('<@123456789012>');
    expect(ok(f('user'), '123456789012')).toBe('<@123456789012>');
    ['@jemand', '12'].forEach((x) => no(f('user'), x));
  });
  it('Auswahl und Mehrfachauswahl nur aus den Optionen (Groß/Klein egal), Pflicht und optional', () => {
    const c = f('choice', { options: ['Support', 'Beschwerde'] });
    expect(ok(c, 'beschwerde')).toBe('Beschwerde');
    no(c, 'Sonstiges');
    const m = f('multichoice', { options: ['A', 'B', 'C'] });
    expect(ok(m, 'a, c; A')).toBe('A, C');
    no(m, 'A, D');
    no(f('text'), '  ');
    expect(ok(f('number', { required: false }), '')).toBe('');
    expect(fieldPlaceholder(c)).toContain('Support, Beschwerde');
    expect(fieldPlaceholder(f('date'))).toBe('TT.MM.JJJJ');
  });
});

describe('Ticket-Einzelrechte (isStaff)', async () => {
  const { isStaff } = await import('../src/index.js');
  const t = { category: { staffRoleIds: [] as string[] } };
  const base = { userId: 'u', roleIds: [] as string[], manage: false, handle: false };
  it('Einzelrecht gilt nur für die eigene Aktion; ohne rights gilt handle', () => {
    const a = { ...base, rights: { close: true } };
    expect(isStaff(t, a, 'close')).toBe(true);
    expect(isStaff(t, a, 'claim')).toBe(false);
    expect(isStaff(t, { ...base, handle: true }, 'priority')).toBe(true);
    expect(isStaff(t, { ...base, manage: true }, 'members')).toBe(true);
  });
});
