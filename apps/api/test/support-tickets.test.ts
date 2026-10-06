import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { TicketEffect } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SupportTicketsService } from '../src/support-tickets/tickets.service';

const TOKEN = 'test-bot-token-support-tickets-0123456789ab';
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const GUILD = '900000000000000001', USER = '900000000000000011', STAFF = '900000000000000012', OTHER = '900000000000000013', LEAD = '900000000000000014';
const ROLE_SUPPORT = '910000000000000001', ROLE_MEMBER = '910000000000000002';
let app: INestApplication; let prisma: PrismaService; let svc: SupportTicketsService;
const http = () => request(app.getHttpServer());
const realFetch = globalThis.fetch;
let categoryId = '';

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://cdn.discordapp.com/')) return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), { status: 200 });
    return realFetch(input, init);
  });
  ({ app, prisma } = await createTestApp());
  svc = app.get(SupportTicketsService);
  for (const [n, roles] of Object.entries({ tk_admin: ['System Administrator'], tk_staff: ['Ticket Support'], tk_lead: ['Ticket Leitung'], tk_none: ['Police Member'] })) {
    const u = await makeUser(prisma, n, roles);
    const d = { tk_staff: STAFF, tk_lead: LEAD, tk_none: OTHER }[n];
    if (d) await prisma.discordLink.create({ data: { userId: u.id, discordId: d } });
  }
});
afterAll(async () => { vi.restoreAllMocks(); delete process.env.BOT_API_TOKEN; await app.close(); });

const open = (body: Record<string, unknown> = {}) => http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ categoryId, guildId: GUILD, discordId: USER, discordName: 'Max Mustermann', memberRoleIds: [ROLE_MEMBER], ...body });
const act = (id: string, discordId: string, body: Record<string, unknown>) => http().post(`/api/v1/support-tickets/${id}/actions`).set(bot(discordId)).send(body);
const find = <T extends TicketEffect['type']>(effects: TicketEffect[], type: T) => effects.filter((e): e is Extract<TicketEffect, { type: T }> => e.type === type);

describe('ticket configuration (dashboard)', () => {
  it('starts with editable example data and validates everything', async () => {
    const admin = (await login(app, 'tk_admin')).agent;
    const cfg = (await admin.get('/api/v1/support-tickets/config')).body;
    expect(cfg.statuses.map((s: { name: string }) => s.name)).toContain('Eskaliert');
    expect(cfg.priorities).toHaveLength(5);
    expect(cfg.reasons.map((r: { text: string }) => r.text)).toContain('Problem gelöst');
    expect(cfg.panels[0].title).toBe('🎫 EN | POLIZEI Support');
    // eigene Kategorie mit Fragen aller Typen
    const res = await admin.post('/api/v1/support-tickets/categories').send({
      name: 'Spieler melden', emoji: '🚨', channelNameFormat: 'melden-{username}-{ticket_id}', staffRoleIds: [ROLE_SUPPORT], maxOpen: 1, cooldownMinutes: 0,
      accessRoleNames: ['Ticket Support', 'Ticket Leitung'], requiredRoleIds: [ROLE_MEMBER], closeReasonMode: 'REQUIRED', ratingEnabled: true, transcriptOnClose: true, transcriptChannelId: '920000000000000001',
      questions: [
        { id: 'who', label: 'Wen möchtest du melden?', type: 'SHORT', required: true, options: [] },
        { id: 'proof', label: 'Hast du Beweise?', type: 'YESNO', required: true, options: [] },
        { id: 'where', label: 'Wo ist es passiert?', type: 'SELECT', required: false, options: ['Stadt', 'Autobahn'] },
      ],
    });
    expect(res.status).toBe(201);
    categoryId = res.body.id;
    expect(res.body.buttons.length).toBeGreaterThan(5); // Standard-Buttons
    expect((await admin.post('/api/v1/support-tickets/categories').send({ name: 'x', questions: [{ id: 'a', label: 'Wahl?', type: 'SELECT', required: true, options: ['nur eine'] }] })).status).toBe(400);
    expect((await (await login(app, 'tk_staff')).agent.post('/api/v1/support-tickets/categories').send({ name: 'x' })).status).toBe(403);
  });
});

describe('opening a ticket from Discord', () => {
  let id = '';
  it('checks role and limit, then returns the create effect (channel, access, embed, first question)', async () => {
    expect((await open({ memberRoleIds: [] })).body.message).toContain('Rolle');
    const r = await open();
    expect(r.status).toBe(201);
    id = r.body.ticket.id;
    const [create] = find(r.body.effects, 'create');
    expect(create!.name).toMatch(/^melden-max-mustermann-\d{4}$/);
    expect(create!.viewers).toEqual(expect.arrayContaining([{ id: USER, kind: 'user', send: true }, { id: ROLE_SUPPORT, kind: 'role', send: true }]));
    expect(create!.control.content).toContain(`<@${USER}>`);
    expect(create!.control.buttons!.map((b) => b.id)).toContain(`tk:close:${id}:s`);
    expect(create!.messages[0]!.buttons![0]!.id).toBe(`tk:ans:${id}:who:s`);
    expect((await open()).body.message).toContain('bereits 1 offene');
    await http().post(`/api/v1/bot/support-tickets/${id}/channel`).set(bot()).send({ channelId: '930000000000000001', controlMessageId: '930000000000000002' });
  });

  it('only the creator answers; questions advance; optional ones can be skipped; summary at the end', async () => {
    const ans = (discordId: string, questionId: string, values: string[] | null) => http().post(`/api/v1/bot/support-tickets/${id}/answer`).set(bot()).send({ discordId, questionId, values });
    expect((await ans(OTHER, 'who', ['x'])).status).toBe(403);
    const a1 = await ans(USER, 'who', ['Spieler123']);
    expect(find(a1.body.effects, 'post')[0]!.message.buttons!.map((b) => b.id)).toEqual([`tk:ansv:${id}:proof:Ja`, `tk:ansv:${id}:proof:Nein`]);
    expect((await ans(USER, 'who', ['nochmal'])).status).toBe(409);
    await ans(USER, 'proof', ['Ja']);
    expect((await ans(USER, 'where', ['Mond'])).status).toBe(400);
    const last = await ans(USER, 'where', null);
    expect(last.body.done).toBe(true);
    expect(find(last.body.effects, 'post')[0]!.message.embeds![0]!.title).toBe('📝 Angaben');
  });

  it('staff actions need their own right and access to the category; claim mode SINGLE', async () => {
    expect((await act(id, OTHER, { action: 'claim' })).status).toBe(403);
    const c = await act(id, STAFF, { action: 'claim' });
    expect(c.status).toBe(200);
    const ctl = find(c.body.effects, 'control')[0]!;
    expect(ctl.message.embeds![0]!.fields!.find((f) => f.name.startsWith('Bearbeiter'))!.value).toBe(`<@${STAFF}>`);
    expect(c.body.ticket.status.name).toBe('In Bearbeitung');
    expect((await act(id, STAFF, { action: 'claim' })).status).toBe(409);
    // Leitung (ticket.manage) darf übernehmen
    expect((await act(id, LEAD, { action: 'claim' })).body.ticket.claimers).toEqual([LEAD]);
    const prio = (await prisma.ticketPriority.findFirstOrThrow({ where: { name: 'Hoch' } })).id;
    expect((await act(id, STAFF, { action: 'priority', priorityId: prio })).body.ticket.priority.name).toBe('Hoch');
    const add = await act(id, STAFF, { action: 'add_access', targetId: OTHER, kind: 'USER', minutes: 60 });
    expect(find(add.body.effects, 'access')[0]).toMatchObject({ targetId: OTHER, view: true });
    expect((await act(id, STAFF, { action: 'note', text: 'Bereits verwarnt.' })).status).toBe(200);
    expect((await act(id, STAFF, { action: 'delete' })).status).toBe(403); // Ticket Support darf nicht löschen
    expect((await act(id, STAFF, { action: 'lock' })).body.ticket.locked).toBe(true);
    expect((await act(id, STAFF, { action: 'escalate' })).body.ticket.status.name).toBe('Eskaliert');
  });

  it('records messages with attachments for the history and transcript', async () => {
    const r = await http().post('/api/v1/bot/support-tickets/messages').set(bot()).send({ channelId: '930000000000000001', discordMessageId: '940000000000000001', authorId: USER, authorName: 'Max', isBot: false, content: 'Hier ist mein **Beweis** <script>alert(1)</script>', attachments: [{ name: 'beweis.png', url: 'https://cdn.discordapp.com/attachments/1/2/beweis.png', size: 11, contentType: 'image/png' }] });
    expect(r.body.ok).toBe(true);
    await http().post('/api/v1/bot/support-tickets/messages').set(bot()).send({ channelId: '930000000000000001', discordMessageId: '940000000000000002', authorId: STAFF, authorName: 'Supporter', isBot: false, content: 'Danke, wir prüfen das.' });
    const msgs = await prisma.ticketMessage.findMany({ where: { ticketId: id }, orderBy: { createdAt: 'asc' } });
    expect(msgs.map((m) => m.isStaff)).toEqual([false, true]);
    expect((msgs[0]!.attachments as { storageKey: string }[])[0]!.storageKey).toMatch(/\.png$/);
  });

  it('close requires a reason here, shows CLOSED, removes user access, creates a transcript and asks for a rating', async () => {
    expect((await act(id, STAFF, { action: 'close' })).status).toBe(400);
    const r = await act(id, STAFF, { action: 'close', reason: 'Problem gelöst' });
    expect(r.status).toBe(200);
    const posts = find(r.body.effects, 'post').map((p) => p.message.embeds?.[0]);
    expect(posts.find((e) => e?.title === '🔒 CLOSED')!.description).toContain('**Grund:** Problem gelöst');
    expect(find(r.body.effects, 'access')).toEqual(expect.arrayContaining([expect.objectContaining({ targetId: USER, view: false }), expect.objectContaining({ targetId: OTHER, view: false })]));
    const tr = find(r.body.effects, 'transcript')[0]!;
    expect(tr.channelIds).toEqual(['920000000000000001']);
    expect(find(r.body.effects, 'dm')[0]!.message.buttons!.map((b) => b.id)).toContain(`tk:rate:${id}:5`);
    expect(find(r.body.effects, 'control')[0]!.message.buttons!.map((b) => b.id.split(':')[1])).toEqual(expect.arrayContaining(['reopen', 'delete', 'transcript']));
    const html = (await http().get(`/api/v1/bot/support-tickets/transcripts/${tr.transcriptId}`).set(bot())).body.html as string;
    expect(html).toContain('<strong>Beweis</strong>');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('Wen möchtest du melden?');
    expect(html).not.toContain('Bereits verwarnt'); // interne Notiz nie im Transcript
    // Bewertung
    expect((await http().post(`/api/v1/bot/support-tickets/${id}/rating`).set(bot()).send({ discordId: OTHER, stars: 5 })).status).toBe(403);
    expect((await http().post(`/api/v1/bot/support-tickets/${id}/rating`).set(bot()).send({ discordId: USER, stars: 4 })).body.ok).toBe(true);
    await http().post(`/api/v1/bot/support-tickets/${id}/rating-comment`).set(bot()).send({ discordId: USER, comment: 'Schnelle Hilfe' });
    expect((await http().post(`/api/v1/bot/support-tickets/${id}/rating`).set(bot()).send({ discordId: USER, stars: 1 })).status).toBe(409);
  });

  it('reopen restores access; dashboard view, transcripts, stats and ratings respect rights', async () => {
    const r = await act(id, STAFF, { action: 'reopen' });
    expect(find(r.body.effects, 'access')[0]).toMatchObject({ targetId: USER, view: true, send: false }); // noch gesperrt
    const staff = (await login(app, 'tk_staff')).agent;
    const d = (await staff.get(`/api/v1/support-tickets/${id}`)).body;
    expect(d.notes[0].text).toBe('Bereits verwarnt.');
    expect(d.logs.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(['created', 'answers', 'claimed', 'claim_transferred', 'priority_changed', 'user_added', 'note_added', 'locked', 'escalated', 'closed', 'transcript_created', 'rated', 'reopened'].filter((a) => a !== 'transcript_created')));
    const list = (await staff.get('/api/v1/support-tickets?kind=open')).body;
    expect(list.items.map((t: { id: string }) => t.id)).toContain(id);
    const tr = (await staff.get('/api/v1/support-tickets/transcripts?q=Max')).body;
    expect(tr.total).toBe(1);
    expect((await staff.get(`/api/v1/support-tickets/transcripts/${tr.items[0].id}`)).headers['content-security-policy']).toContain('sandbox');
    expect((await staff.delete(`/api/v1/support-tickets/transcripts/${tr.items[0].id}`)).status).toBe(403);
    const stats = (await staff.get('/api/v1/support-tickets/stats')).body;
    expect(stats).toMatchObject({ escalations: 1, ratings: { count: 1, average: 4, positive: 1 } });
    // Mitarbeiter ohne Zugriff auf die Kategorie sieht nichts
    await prisma.ticketCategory.update({ where: { id: categoryId }, data: { accessRoleNames: ['Ticket Leitung'] } });
    expect((await staff.get(`/api/v1/support-tickets/${id}`)).status).toBe(403);
    expect((await staff.get('/api/v1/support-tickets')).body.items.map((t: { id: string }) => t.id)).not.toContain(id);
    expect((await act(id, STAFF, { action: 'close', reason: 'x' })).status).toBe(403);
    await prisma.ticketCategory.update({ where: { id: categoryId }, data: { accessRoleNames: [] } });
  });

  it('actions from the dashboard go through the outbox; the creator may close their own ticket', async () => {
    const lead = (await login(app, 'tk_lead')).agent;
    await prisma.discordOutbox.deleteMany({ where: { type: 'ticket.effects' } });
    const r = await lead.post(`/api/v1/support-tickets/${id}/actions`).send({ action: 'unlock' });
    expect(r.body.effects).toEqual([]);
    const queued = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'ticket.effects' } });
    expect((queued.payload as { effects: TicketEffect[] }).effects.map((e) => e.type)).toEqual(expect.arrayContaining(['access', 'control', 'post']));
    expect((await http().post(`/api/v1/bot/support-tickets/${id}/creator-close`).set(bot()).send({ discordId: OTHER })).status).toBe(403);
    expect((await http().post(`/api/v1/bot/support-tickets/${id}/creator-close`).set(bot()).send({ discordId: USER })).status).toBe(400); // Grund Pflicht
    expect((await http().post(`/api/v1/bot/support-tickets/${id}/creator-close`).set(bot()).send({ discordId: USER, reason: 'Hat sich erledigt' })).body.ok).toBe(true);
  });
});

describe('automation, panels, limits', () => {
  it('warns, auto-closes inactive tickets, expires temporary access and deletes after the configured time', async () => {
    const admin = (await login(app, 'tk_admin')).agent;
    const cfg = (await admin.get('/api/v1/support-tickets/config')).body;
    const support = cfg.categories.find((c: { name: string }) => c.name === 'Support');
    await prisma.ticketCategory.update({ where: { id: support.id }, data: { autoCloseMinutes: 60, autoCloseWarnMinutes: 15, deleteAfterMinutes: 30, ratingEnabled: false, closeReasonMode: 'OPTIONAL' } });
    const r = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ categoryId: support.id, guildId: GUILD, discordId: USER, discordName: 'Max' });
    const tid = r.body.ticket.id as string;
    await http().post(`/api/v1/bot/support-tickets/${tid}/channel`).set(bot()).send({ channelId: '930000000000000011', controlMessageId: null });
    await prisma.ticketAccess.create({ data: { ticketId: tid, targetId: OTHER, kind: 'USER', expiresAt: new Date(Date.now() - 1000) } });
    const t0 = Date.now();
    await prisma.supportTicket.update({ where: { id: tid }, data: { lastActivityAt: new Date(t0 - 50 * 60_000) } });
    expect(await svc.runAutomation(new Date(t0))).toMatchObject({ warned: 1, closed: 0, expired: 1 });
    expect(await svc.runAutomation(new Date(t0))).toMatchObject({ warned: 0 }); // nur einmal warnen
    expect(await svc.runAutomation(new Date(t0 + 11 * 60_000))).toMatchObject({ closed: 1 });
    const closed = await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } });
    expect(closed.closeReason).toContain('Automatisch');
    expect(await svc.runAutomation(new Date(t0 + 45 * 60_000))).toMatchObject({ deleted: 1 });
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: tid } })).deletedAt).not.toBeNull();
    expect(await prisma.ticketTranscript.count({ where: { ticketId: tid } })).toBe(1); // vor dem Löschen gesichert
  });

  it('cooldown between tickets, panel rendering (buttons/dropdown), publish and panel role restriction', async () => {
    const admin = (await login(app, 'tk_admin')).agent;
    await prisma.ticketCategory.update({ where: { id: categoryId }, data: { cooldownMinutes: 30, maxOpen: 0 } });
    const r = await open();
    expect(r.body.message).toContain('warte noch');
    const panel = (await admin.post('/api/v1/support-tickets/panels').send({ name: 'Melden', title: 'Melden', style: 'DROPDOWN', categoryIds: [categoryId], channelId: '950000000000000001', allowedRoleIds: ['910000000000000099'] })).body;
    const prev = (await admin.get(`/api/v1/support-tickets/panels/${panel.id}/preview`)).body;
    expect(prev.select.options[0]).toMatchObject({ label: 'Spieler melden', value: categoryId, emoji: '🚨' });
    await prisma.ticketCategory.update({ where: { id: categoryId }, data: { cooldownMinutes: 0 } });
    expect((await open({ panelId: panel.id })).status).toBe(403);
    expect((await admin.post(`/api/v1/support-tickets/panels/${panel.id}/publish`).send({})).body).toEqual({ ok: true, updating: false });
    await http().post(`/api/v1/bot/support-tickets/panels/${panel.id}/posted`).set(bot()).send({ channelId: '950000000000000001', messageId: '950000000000000002' });
    expect((await admin.post(`/api/v1/support-tickets/panels/${panel.id}/publish`).send({})).body.updating).toBe(true);
    const dup = (await admin.post(`/api/v1/support-tickets/panels/${panel.id}/duplicate`)).body;
    expect(dup.name).toBe('Melden (Kopie)');
    expect(dup.messageId).toBeNull();
  });
});

describe('/support in Discord', () => {
  it('lists the openable ticket types for the bot and lets the team open a ticket for another member (with their own rights)', async () => {
    const cats = await http().get('/api/v1/bot/support-tickets/categories').set(bot());
    expect(cats.status).toBe(200);
    expect(cats.body.every((c: { id: string; requiredRoleIds: unknown }) => typeof c.id === 'string' && Array.isArray(c.requiredRoleIds))).toBe(true);
    expect((await http().get('/api/v1/bot/support-tickets/categories')).status).toBe(401);
    const MEMBER = '900000000000000099';
    await prisma.ticketCategory.update({ where: { id: categoryId }, data: { maxOpen: 1, cooldownMinutes: 0 } });
    // ohne ticket.create: abgelehnt
    expect((await http().post('/api/v1/support-tickets').set(bot(OTHER)).send({ categoryId, discordId: MEMBER, discordName: 'Gast', guildId: GUILD })).status).toBe(403);
    // Team: auch wenn das Mitglied die nötige Rolle nicht hat und schon ein Ticket offen ist (keine Limits fürs Team)
    const first = await http().post('/api/v1/support-tickets').set(bot(LEAD)).send({ categoryId, discordId: MEMBER, discordName: 'Gast', guildId: GUILD });
    expect(first.status).toBe(201);
    const create = find(first.body.effects as TicketEffect[], 'create')[0]!;
    expect(create).toMatchObject({ guildId: GUILD });
    expect(create.viewers.some((v) => v.id === MEMBER)).toBe(true);
    expect((await http().post('/api/v1/support-tickets').set(bot(LEAD)).send({ categoryId, discordId: MEMBER, discordName: 'Gast', guildId: GUILD })).status).toBe(201);
    // der Mitglied selbst unterliegt weiter dem Limit
    expect((await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ categoryId, guildId: GUILD, discordId: MEMBER, discordName: 'Gast', memberRoleIds: [ROLE_MEMBER] })).status).toBe(409);
  });
});
