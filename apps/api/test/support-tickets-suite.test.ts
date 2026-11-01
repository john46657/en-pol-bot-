import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { TicketEffect } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SupportTicketsService } from '../src/support-tickets/tickets.service';
import { TicketTranscriptService } from '../src/support-tickets/transcript.service';

/**
 * Ticket-System-Erweiterung: mehrere Panels/Kategorien, Panel-Aktivierung/-Limits, Auslastung, Zusatzpersonen, Schließ- und
 * Bewertungsformular, Weiterleiten, Erinnern, Schließungsanfrage mit Bestätigungen, Automatik je Ticket, Team-Transkript, Statistik.
 */
const TOKEN = 'test-bot-token-support-suite-0123456789abcd';
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const GUILD = '980000000000000001';
const CREATOR = '980000000000000011', CREATOR2 = '980000000000000012', CREATOR3 = '980000000000000013', CREATOR4 = '980000000000000014';
const STAFF = '980000000000000021', LEAD = '980000000000000022', OTHER = '980000000000000023', EXTRA = '980000000000000024';
const ROLE_A = '981000000000000001', ROLE_B = '981000000000000002', ROLE_X = '981000000000000003', ROLE_FWD = '981000000000000004';
let app: INestApplication; let prisma: PrismaService; let svc: SupportTicketsService; let jobs: TicketTranscriptService;
const http = () => request(app.getHttpServer());
let catA = '', catB = '', catC = '', panel1 = '', panel2 = '';
let channelSeq = 0;

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  svc = app.get(SupportTicketsService);
  jobs = app.get(TicketTranscriptService);
  for (const [n, roles, d] of [['tsu_admin', ['System Administrator'], null], ['tsu_staff', ['Ticket Support'], STAFF], ['tsu_lead', ['Ticket Leitung'], LEAD], ['tsu_other', ['Police Member'], OTHER], ['tsu_creator', ['Police Member'], CREATOR]] as const) {
    const u = await makeUser(prisma, n, [...roles]);
    if (d) await prisma.discordLink.create({ data: { userId: u.id, discordId: d } });
  }
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

const find = <T extends TicketEffect['type']>(effects: TicketEffect[] = [], type: T) => effects.filter((e): e is Extract<TicketEffect, { type: T }> => e.type === type);
const act = (id: string, discordId: string, body: Record<string, unknown>) => http().post(`/api/v1/support-tickets/${id}/actions`).set(bot(discordId)).send(body);
const open = (body: Record<string, unknown>) => http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ guildId: GUILD, discordName: 'Nutzer', memberRoleIds: [], ...body });
/** Ticket öffnen und einen (simulierten) Discord-Kanal zuordnen. */
async function openWithChannel(body: Record<string, unknown>) {
  const r = await open(body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  const channelId = `98200000000000${String(++channelSeq).padStart(4, '0')}`;
  await http().post(`/api/v1/bot/support-tickets/${r.body.ticket.id}/channel`).set(bot()).send({ channelId, controlMessageId: `98300000000000${String(channelSeq).padStart(4, '0')}` });
  return { id: r.body.ticket.id as string, channelId, res: r };
}
const message = (channelId: string, authorId: string, n: string) => http().post('/api/v1/bot/support-tickets/messages').set(bot()).send({ channelId, discordMessageId: `9840000000000${n.padStart(5, '0')}`, authorId, authorName: authorId === STAFF ? 'Staff' : 'Nutzer', isBot: false, content: `Nachricht ${n}`, attachments: [], embeds: [] });
const outbox = async () => (await prisma.discordOutbox.findMany({ where: { type: 'ticket.effects' } })).flatMap((o) => (o.payload as { effects: TicketEffect[] }).effects);
const logs = async (ticketId: string) => (await prisma.ticketLog.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } })).map((l) => l.action);

describe('panels and categories (dashboard configuration)', () => {
  it('creates several independent categories and panels with the new options', async () => {
    const admin = (await login(app, 'tsu_admin')).agent;
    const cat = (body: Record<string, unknown>) => admin.post('/api/v1/support-tickets/categories').send({ guildId: GUILD, maxOpen: 5, ...body });
    const a = await cat({
      name: 'Suite A', staffRoleIds: [ROLE_A], extraUserIds: [EXTRA], capacity: 1, capacityAction: 'BLOCK', closeRequestApprovers: 'BOTH', closeReasonMode: 'OPTIONAL',
      closeForm: [{ id: 'reason', label: 'Was wurde gelöst?', type: 'SHORT', required: true, options: [], minLength: 3, maxLength: 100 }],
      ratingForm: [{ id: 'comment', label: 'Begründung', type: 'LONG', required: false, options: [] }, { id: 'again', label: 'Wieder?', type: 'SELECT', required: true, options: ['Ja', 'Nein'] }],
      teamReminderMinutes: 20, closeRequestTimeoutMinutes: 60, formMode: 'CHANNEL',
    });
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body).toMatchObject({ extraUserIds: [EXTRA], capacityAction: 'BLOCK', closeRequestApprovers: 'BOTH' });
    expect(a.body.closeForm).toHaveLength(1);
    catA = a.body.id;
    catB = (await cat({ name: 'Suite B', staffRoleIds: [ROLE_B], automationSource: 'PANEL', formMode: 'CHANNEL' })).body.id;
    catC = (await cat({ name: 'Suite C', staffRoleIds: [ROLE_B], formMode: 'CHANNEL' })).body.id;
    // Schließformular: höchstens 5 Felder (Discord-Formular)
    const six = Array.from({ length: 6 }, (_, i) => ({ id: `f${i}`, label: `Feld ${i}`, type: 'SHORT', required: false, options: [] }));
    expect((await cat({ name: 'Zu viele Felder', closeForm: six })).status).toBe(400);
    const p1 = await admin.post('/api/v1/support-tickets/panels').send({
      guildId: GUILD, name: 'Suite Panel 1', title: 'Hilfe', position: 900, categoryIds: [catA, catB], channelId: '985000000000000001', channelNameFormat: 'p1-{ticket_id}', mentionRoleIds: [ROLE_A, ROLE_X], maxOpen: 1,
      internalNote: 'Haupt-Panel', automation: { creatorReminderMinutes: 30, noResponseMinutes: 15 },
    });
    expect(p1.status, JSON.stringify(p1.body)).toBe(201);
    expect(p1.body).toMatchObject({ active: true, maxOpen: 1, internalNote: 'Haupt-Panel', automation: { creatorReminderMinutes: 30, noResponseMinutes: 15 } });
    panel1 = p1.body.id;
    panel2 = (await admin.post('/api/v1/support-tickets/panels').send({ guildId: GUILD, name: 'Suite Panel 2', position: 901, categoryIds: [catB], active: false, style: 'DROPDOWN' })).body.id;
  });

  it('deactivated panels, foreign categories and panel limits are enforced by the server', async () => {
    expect((await open({ categoryId: catB, panelId: panel2, discordId: CREATOR })).body.message).toContain('deaktiviert');
    expect((await open({ categoryId: catC, panelId: panel1, discordId: CREATOR })).body.message).toContain('nicht verfügbar');
    // deaktiviertes Panel: Nachricht mit gesperrter Auswahl
    const msg = await svc.panelMessage(panel2);
    expect(msg.embeds![0]!.fields!.map((f) => f.name)).toContain('⛔ Derzeit deaktiviert');
    expect(msg.select!.placeholder).toBe('Derzeit deaktiviert');
  });

  it('opens privately: channel format of the panel, extra persons, only roles with access are mentioned', async () => {
    const { id, res } = await openWithChannel({ categoryId: catA, panelId: panel1, discordId: CREATOR });
    const [create] = find(res.body.effects, 'create');
    expect(create!.name).toMatch(/^p1-\d{4}$/);
    expect(create!.viewers).toEqual(expect.arrayContaining([{ id: CREATOR, kind: 'user', send: true }, { id: EXTRA, kind: 'user', send: true }, { id: ROLE_A, kind: 'role', send: true }]));
    expect(create!.viewers.map((v) => v.id)).not.toContain(ROLE_B); // keine fremden Teams
    expect(create!.control.mentionRoles).toEqual([ROLE_A]); // ROLE_X hat keinen Zugriff → nicht gepingt
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).panelId).toBe(panel1);
    // Panel-Limit: höchstens 1 offenes Ticket je Nutzer über dieses Panel
    expect((await open({ categoryId: catB, panelId: panel1, discordId: CREATOR })).body.message).toContain('über dieses Panel');
  });

  it('capacity: BLOCK prevents new tickets when full, WARN opens with a notice; the panel shows the load level', async () => {
    const blocked = await open({ categoryId: catA, discordId: CREATOR2 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toContain('voll ausgelastet');
    const msg = await svc.panelMessage(panel1);
    expect(msg.buttons!.find((b) => b.id.includes(catA))).toMatchObject({ disabled: true, label: 'Suite A (voll)' });
    const admin = (await login(app, 'tsu_admin')).agent;
    const full = (await admin.get('/api/v1/support-tickets/config')).body.categories.find((c: { id: string }) => c.id === catA);
    expect((await admin.put(`/api/v1/support-tickets/categories/${catA}`).send({ ...full, id: undefined, archivedAt: undefined, formVersion: undefined, capacityAction: 'WARN' })).status).toBe(200);
    const warn = await openWithChannel({ categoryId: catA, discordId: CREATOR2 });
    const [create] = find(warn.res.body.effects, 'create');
    expect(create!.messages.some((m) => m.embeds?.[0]?.description?.includes('Hohe Auslastung'))).toBe(true);
    expect(await logs(warn.id)).toContain('capacity_warning');
  });
});

describe('ticket handling', () => {
  let tid = '', ch = '';
  it('private: only authorized staff see a ticket; the creator does not get staff data', async () => {
    tid = (await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: CREATOR, categoryId: catA } })).id;
    ch = (await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } })).channelId!;
    expect((await (await login(app, 'tsu_other')).agent.get(`/api/v1/support-tickets/${tid}`)).status).toBe(403);
    expect((await (await login(app, 'tsu_creator')).agent.get(`/api/v1/support-tickets/${tid}`)).status).toBe(403);
    expect((await (await login(app, 'tsu_staff')).agent.get(`/api/v1/support-tickets/${tid}`)).status).toBe(200);
  });

  it('claim/unclaim with double-claim protection; add and remove persons', async () => {
    expect((await act(tid, STAFF, { action: 'claim' })).status).toBe(200);
    expect((await act(tid, STAFF, { action: 'claim' })).body.message).toContain('bereits');
    expect((await act(tid, STAFF, { action: 'unclaim' })).body.message).toContain('freigegeben');
    expect((await act(tid, STAFF, { action: 'claim' })).status).toBe(200);
    const add = await act(tid, STAFF, { action: 'add_access', targetId: CREATOR3, kind: 'USER' });
    expect(find(add.body.effects, 'access')[0]).toMatchObject({ targetId: CREATOR3, view: true });
    const rm = await act(tid, STAFF, { action: 'remove_access', targetId: CREATOR3 });
    expect(find(rm.body.effects, 'access')[0]).toMatchObject({ targetId: CREATOR3, view: null });
    expect(await logs(tid)).toEqual(expect.arrayContaining(['claimed', 'unclaimed', 'user_added', 'user_removed']));
  });

  it('remind the creator (ticket + DM), with protection against repeated reminders', async () => {
    const r = await act(tid, STAFF, { action: 'remind', text: 'Bitte antworte!' });
    expect(r.status).toBe(200);
    expect(find(r.body.effects, 'dm')[0]).toMatchObject({ userId: CREATOR });
    expect(find(r.body.effects, 'post').some((p) => p.channelId === ch && p.message.mentionUsers?.includes(CREATOR))).toBe(true);
    expect((await act(tid, STAFF, { action: 'remind' })).status).toBe(409);
    expect(await logs(tid)).toContain('reminder_sent');
  });

  it('private team notes are stored with author and time, never shown to the creator', async () => {
    expect((await act(tid, STAFF, { action: 'note', text: 'GEHEIM-SUITE-NOTIZ' })).status).toBe(200);
    const note = await prisma.ticketNote.findFirstOrThrow({ where: { ticketId: tid } });
    expect(note).toMatchObject({ authorId: STAFF, text: 'GEHEIM-SUITE-NOTIZ' });
    expect(note.createdAt).toBeInstanceOf(Date);
  });

  it('forward to a team member, a team role and another category; history and messages stay', async () => {
    await message(ch, CREATOR, '1');
    const before = await prisma.ticketMessage.count({ where: { ticketId: tid } });
    // Weiterleiten braucht ticket.forward (Ticket Support hat es nicht, die Leitung schon)
    expect((await act(tid, STAFF, { action: 'forward', target: 'USER', targetId: LEAD })).status).toBe(403);
    const u = await act(tid, LEAD, { action: 'forward', target: 'USER', targetId: LEAD, note: 'Bitte übernehmen' });
    expect(u.status, JSON.stringify(u.body)).toBe(200);
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } })).claimers).toEqual([LEAD]);
    expect((await act(tid, LEAD, { action: 'forward', target: 'USER', targetId: OTHER })).status).toBe(400); // kein Teammitglied mit Zugriff
    const r = await act(tid, LEAD, { action: 'forward', target: 'ROLE', targetId: ROLE_FWD });
    expect(find(r.body.effects, 'access')[0]).toMatchObject({ targetId: ROLE_FWD, kind: 'role', view: true });
    expect(await prisma.ticketAccess.findFirst({ where: { ticketId: tid, targetId: ROLE_FWD, kind: 'ROLE' } })).toBeTruthy();
    const c = await act(tid, LEAD, { action: 'forward', target: 'CATEGORY', targetId: catB });
    expect(c.status, JSON.stringify(c.body)).toBe(200);
    const access = find(c.body.effects, 'access');
    expect(access).toEqual(expect.arrayContaining([expect.objectContaining({ targetId: ROLE_A, view: null }), expect.objectContaining({ targetId: ROLE_B, view: true }), expect.objectContaining({ targetId: EXTRA, view: null })]));
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } });
    expect(t.categoryId).toBe(catB);
    expect(await prisma.ticketMessage.count({ where: { ticketId: tid } })).toBe(before);
    expect((await logs(tid)).filter((x) => x === 'forwarded')).toHaveLength(3);
    expect((await prisma.ticketNote.findMany({ where: { ticketId: tid } })).map((n) => n.text)).toContain('📨 Weiterleitung: Bitte übernehmen');
    expect((await act(tid, LEAD, { action: 'forward', target: 'CATEGORY', targetId: 'kaputt' })).status).toBe(400);
    // zurück in A für die folgenden Tests
    expect((await act(tid, LEAD, { action: 'category', categoryId: catA })).status).toBe(200);
  });

  it('close request (creator AND staff must confirm): partial approval does not close, decline never closes', async () => {
    const answer = (discordId: string, accept: boolean) => http().post(`/api/v1/bot/support-tickets/${tid}/close-request`).set(bot()).send({ discordId, accept });
    const req = await act(tid, LEAD, { action: 'close_request' });
    expect(req.status).toBe(200);
    expect(find(req.body.effects, 'post')[0]!.message.mentionUsers).toEqual(expect.arrayContaining([CREATOR, LEAD]));
    expect((await act(tid, LEAD, { action: 'close_request' })).status).toBe(409); // läuft bereits
    expect((await answer(OTHER, true)).status).toBe(403);
    expect((await answer(CREATOR, false)).body.message).toContain('offen');
    let t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } });
    expect(t.closedAt).toBeNull();
    expect(t.closeRequestedAt).toBeNull();
    await act(tid, LEAD, { action: 'close_request' });
    expect((await answer(CREATOR, true)).body.message).toContain('weitere Bestätigung');
    t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } });
    expect(t.closedAt).toBeNull();
    expect(t.closeRequestApprovals).toEqual([`creator:${CREATOR}`]);
    // Mitarbeiter bestätigt über das Dashboard (gleiche Regel)
    const staff = await act(tid, LEAD, { action: 'close_request_answer', accept: true });
    expect(staff.status, JSON.stringify(staff.body)).toBe(200);
    t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } });
    expect(t.closedAt).not.toBeNull();
    expect(t.closeReason).toBe('Schließungsanfrage bestätigt');
    expect(await logs(tid)).toEqual(expect.arrayContaining(['close_requested', 'close_request_declined', 'close_request_approved', 'close_request_accepted', 'closed']));
  });

  it('transcript: team version contains notes and forwarding history, creator version never', async () => {
    await jobs.processDue();
    const tr = await prisma.ticketTranscript.findFirstOrThrow({ where: { ticketId: tid, status: 'DONE' }, orderBy: { version: 'desc' } });
    expect(tr.staffHtml).toContain('GEHEIM-SUITE-NOTIZ');
    expect(tr.staffHtml).toContain('Team-Fassung');
    expect(tr.staffHtml).toContain('Weitergeleitet');
    expect(tr.staffText).toContain('[INTERNE NOTIZ]');
    for (const x of [tr.html, tr.text, JSON.stringify(tr.data)]) expect(x).not.toContain('GEHEIM-SUITE-NOTIZ');
    const asCreator = await (await login(app, 'tsu_creator')).agent.get(`/api/v1/support-tickets/transcripts/${tr.id}`);
    expect(asCreator.status).toBe(200);
    expect(asCreator.text).not.toContain('GEHEIM-SUITE-NOTIZ');
    const asStaff = await (await login(app, 'tsu_lead')).agent.get(`/api/v1/support-tickets/transcripts/${tr.id}`);
    expect(asStaff.text).toContain('GEHEIM-SUITE-NOTIZ');
    const txt = await (await login(app, 'tsu_creator')).agent.get(`/api/v1/support-tickets/transcripts/${tr.id}?format=txt`);
    expect(txt.text).not.toContain('GEHEIM-SUITE-NOTIZ');
    expect((await (await login(app, 'tsu_other')).agent.get(`/api/v1/support-tickets/transcripts/${tr.id}`)).status).toBe(404);
  });

  it('rating: configurable scale, rating form, internal log with form answers, public log only from the minimum and only released fields', async () => {
    const admin = (await login(app, 'tsu_admin')).agent;
    const s = (await admin.get('/api/v1/support-tickets/config')).body.settings;
    expect((await admin.put('/api/v1/support-tickets/settings').send({ ...s, ratingScale: 10, ratingPublicMinStars: 8, ratingChannelId: '986000000000000001', ratingPublicChannelId: '986000000000000002', ratingPublicFields: ['category'] })).status).toBe(200);
    const form = await http().get(`/api/v1/bot/support-tickets/${tid}/rating-form?discordId=${CREATOR}&stars=6`).set(bot());
    expect(form.body.modal.fields.map((f: { id: string }) => f.id)).toEqual(['comment', 'again']);
    const rate = (stars: number, values?: Record<string, unknown>) => http().post(`/api/v1/bot/support-tickets/${tid}/rating`).set(bot()).send({ discordId: CREATOR, stars, ...(values ? { values } : {}) });
    expect((await rate(6)).status).toBe(400); // Pflichtfeld im Bewertungsformular
    expect((await rate(6, { comment: 'ok', again: 'Vielleicht' })).status).toBe(400);
    await prisma.discordOutbox.deleteMany({ where: { type: 'ticket.effects' } });
    expect((await rate(6, { comment: 'Lief gut', again: ['Ja'] })).status).toBe(200);
    expect((await rate(7, { comment: 'nochmal', again: ['Ja'] })).status).toBe(409);
    const r = await prisma.ticketRating.findUniqueOrThrow({ where: { ticketId: tid } });
    expect(r).toMatchObject({ stars: 6, scale: 10, comment: 'Lief gut' });
    const posts = find(await outbox(), 'post');
    const team = posts.find((p) => p.channelId === '986000000000000001');
    expect(team!.message.embeds![0]!.fields!.map((f) => f.name)).toEqual(expect.arrayContaining(['Begründung', 'Wieder?']));
    expect(posts.some((p) => p.channelId === '986000000000000002')).toBe(false); // 6 < 8 → nicht öffentlich
    const detail = (await admin.get(`/api/v1/support-tickets/${tid}`)).body;
    expect(detail.rating).toMatchObject({ stars: 6, scale: 10 });
    expect(await logs(tid)).toContain('rated');
    await admin.put('/api/v1/support-tickets/settings').send({ ...s });
  });
});

describe('close form', () => {
  it('requires the configured fields and stores the answers (team only)', async () => {
    const { id } = await openWithChannel({ categoryId: catA, discordId: CREATOR3 });
    const modal = await http().get(`/api/v1/bot/support-tickets/${id}/close-form`).set(bot());
    expect(modal.body.modal.id).toBe(`tk:closefm:${id}`);
    const opts = await http().get(`/api/v1/bot/support-tickets/${id}/close-options`).set(bot());
    expect(opts.body.form).toBe(true);
    expect((await act(id, STAFF, { action: 'close' })).status).toBe(400);
    expect((await act(id, STAFF, { action: 'close', answers: { reason: 'ab' } })).status).toBe(400); // Mindestlänge 3
    const ok = await act(id, STAFF, { action: 'close', answers: { reason: 'Passwort zurückgesetzt' } });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.closeReason).toBe('Passwort zurückgesetzt');
    expect(t.closeAnswers).toEqual([expect.objectContaining({ questionId: 'reason', value: 'Passwort zurückgesetzt' })]);
  });
});

describe('automations', () => {
  it('per-panel defaults: automatic reply when the team does not respond, then a reminder to the creator', async () => {
    const { id, channelId } = await openWithChannel({ categoryId: catB, panelId: panel1, discordId: CREATOR4 });
    await prisma.supportTicket.update({ where: { id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });
    await svc.runAutomation();
    let t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.noResponseSentAt).not.toBeNull();
    expect(await logs(id)).toContain('no_response_reply');
    // Team schreibt, Ersteller antwortet nicht → nach 30 Min. Erinnerung (einmal)
    await message(channelId, STAFF, '20');
    await prisma.supportTicket.update({ where: { id }, data: { lastStaffMessageAt: new Date(Date.now() - 31 * 60_000) } });
    await svc.runAutomation();
    t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.creatorRemindedAt).not.toBeNull();
    const reminded = t.creatorRemindedAt!;
    await svc.runAutomation();
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).creatorRemindedAt).toEqual(reminded);
    expect((await logs(id)).filter((x) => x === 'reminder_sent')).toHaveLength(1);
  });

  it('pausing/disabling per ticket is stored in the database (survives restarts) and skips all automations', async () => {
    const { id } = await openWithChannel({ categoryId: catA, discordId: '980000000000000015' });
    expect((await act(id, STAFF, { action: 'automation', mode: 'pause' })).status).toBe(400); // Dauer fehlt
    expect((await act(id, STAFF, { action: 'automation', mode: 'disable' })).status).toBe(200);
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).automationDisabled).toBe(true);
    await prisma.supportTicket.update({ where: { id }, data: { createdAt: new Date(Date.now() - 25 * 60_000) } });
    // „Neustart“: die Automatik liest ihren Zustand bei jedem Lauf aus der Datenbank – kein Speicher im Prozess
    await svc.runAutomation();
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).teamRemindedAt).toBeNull();
    const until = Date.now() + 60 * 60_000;
    expect((await act(id, STAFF, { action: 'automation', mode: 'pause', minutes: 60 })).status).toBe(200);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.automationDisabled).toBe(false);
    expect(Math.abs(t.automationPausedUntil!.getTime() - until)).toBeLessThan(10_000);
    await svc.runAutomation();
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).teamRemindedAt).toBeNull();
    // wieder an → Team-Erinnerung der Kategorie (20 Min., nicht übernommen) greift
    expect((await act(id, STAFF, { action: 'automation', mode: 'enable' })).status).toBe(200);
    await svc.runAutomation();
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id } })).teamRemindedAt).not.toBeNull();
    expect(await logs(id)).toEqual(expect.arrayContaining(['automation_changed', 'team_reminder']));
    // unberechtigt: kein Teammitglied
    expect((await act(id, OTHER, { action: 'automation', mode: 'disable' })).status).toBe(403);
  });

  it('close request without reaction is closed after the configured time', async () => {
    const t = await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: '980000000000000015' } });
    expect((await act(t.id, STAFF, { action: 'close_request' })).status).toBe(200);
    await prisma.supportTicket.update({ where: { id: t.id }, data: { closeRequestedAt: new Date(Date.now() - 61 * 60_000) } });
    await svc.runAutomation();
    const after = await prisma.supportTicket.findUniqueOrThrow({ where: { id: t.id } });
    expect(after.closedAt).not.toBeNull();
    expect(after.closeReason).toContain('ohne Antwort');
  });
});

describe('statistics, panels with history, bot helpers', () => {
  it('statistics are computed from stored tickets (median, p90, per day/week, heatmap, staff, load, leaderboards)', async () => {
    const admin = (await login(app, 'tsu_admin')).agent;
    const s = (await admin.get('/api/v1/support-tickets/stats')).body;
    const total = await prisma.supportTicket.count({ where: { deletedAt: null } });
    expect(s.total).toBe(total);
    expect(s.heatmap).toHaveLength(7);
    expect(s.heatmap.flat().reduce((a: number, b: number) => a + b, 0)).toBe(total);
    expect(s.perDay).toHaveLength(30);
    expect(s.perWeek.length).toBeGreaterThanOrEqual(12);
    expect(s.perDay.reduce((a: number, d: { created: number }) => a + d.created, 0)).toBeLessThanOrEqual(total);
    expect(s).toHaveProperty('medianFirstResponseMinutes');
    expect(s).toHaveProperty('p90FirstResponseMinutes');
    expect(s.leaderboards).toHaveProperty('handled');
    expect(s.perCategory.find((c: { id: string }) => c.id === catA)).toMatchObject({ capacity: 1 });
    // Mitarbeiter-Ansicht: nur sichtbare Tickets
    expect((await (await login(app, 'tsu_other')).agent.get('/api/v1/support-tickets/stats')).status).toBe(403);
  });

  it('panels with tickets cannot be deleted (deactivate instead); deactivating a published panel updates Discord', async () => {
    const admin = (await login(app, 'tsu_admin')).agent;
    expect((await admin.delete(`/api/v1/support-tickets/panels/${panel1}`)).status).toBe(409);
    await http().post(`/api/v1/bot/support-tickets/panels/${panel1}/posted`).set(bot()).send({ channelId: '985000000000000001', messageId: '985000000000000002' });
    await prisma.discordOutbox.deleteMany({ where: { type: 'ticket.effects' } });
    const p = (await admin.get('/api/v1/support-tickets/config')).body.panels.find((x: { id: string }) => x.id === panel1);
    expect((await admin.put(`/api/v1/support-tickets/panels/${panel1}`).send({ ...p, id: undefined, messageId: undefined, messageChannelId: undefined, publishedAt: undefined, publishError: undefined, createdAt: undefined, updatedAt: undefined, active: false })).status).toBe(200);
    const panelFx = find(await outbox(), 'panel');
    expect(panelFx[0]).toMatchObject({ panelId: panel1, messageId: '985000000000000002' });
    expect(panelFx[0]!.message.buttons!.every((b) => b.disabled)).toBe(true);
    expect((await admin.delete(`/api/v1/support-tickets/panels/${panel2}`)).status).toBe(204); // ohne Tickets
  });

  it('slash commands find the ticket of the current channel', async () => {
    const t = await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: CREATOR4 } });
    expect((await http().get(`/api/v1/bot/support-tickets/by-channel/${t.channelId}`).set(bot())).body.id).toBe(t.id);
    expect((await http().get('/api/v1/bot/support-tickets/by-channel/987000000000000001').set(bot())).status).toBe(404);
  });
});
