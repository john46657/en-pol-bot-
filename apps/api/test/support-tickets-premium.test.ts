import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { FormModalSpec, TicketEffect } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SupportTicketsService } from '../src/support-tickets/tickets.service';
import { TicketTranscriptService } from '../src/support-tickets/transcript.service';
import { seedTicketPremium } from '../src/seed/ticket-defaults';

const TOKEN = 'test-bot-token-premium-tickets-0123456789abcd';
const bot = (discordId?: string) => ({ Authorization: `Bot ${TOKEN}`, ...(discordId ? { 'X-Discord-User': discordId } : {}) });
const GUILD = '800000000000000001';
const USER = '800000000000000011', STAFF = '800000000000000012', LEAD = '800000000000000014', OUTSIDER = '800000000000000015', STAFF2 = '800000000000000016';
const STAFF_ROLE = '810000000000000001', TECH_ROLE = '810000000000000002', LEAD_ROLE = '810000000000000003';
const PNG = 'https://cdn.discordapp.com/attachments/1/2/screen.png';
let app: INestApplication; let prisma: PrismaService; let svc: SupportTicketsService; let jobs: TicketTranscriptService;
const http = () => request(app.getHttpServer());
const realFetch = globalThis.fetch;
const find = <T extends TicketEffect['type']>(effects: TicketEffect[], type: T) => effects.filter((e): e is Extract<TicketEffect, { type: T }> => e.type === type);
const act = (id: string, discordId: string, body: Record<string, unknown>) => http().post(`/api/v1/support-tickets/${id}/actions`).set(bot(discordId)).send(body);
const catId = async (name: string) => (await prisma.ticketCategory.findFirstOrThrow({ where: { name } })).id;
const user = { categoryId: '', guildId: GUILD, discordId: USER, discordName: 'Erika Beispiel', memberRoleIds: [] as string[] };
/** frühere Tickets „älter machen“ (Doppelklick-Schutz von 10 Sekunden) */
/** Ticket-Einstellungen gelten je Discord-Server (wie im Dashboard mit gewähltem Server bzw. bei Bot-Anfragen). */
const saveSettings = async (patch: Record<string, unknown>) => {
  const key = `tickets.settings@${GUILD}`;
  const cur = (await prisma.systemSetting.findUnique({ where: { key } }))?.value as Record<string, unknown> | undefined;
  const value = { ...(cur ?? {}), ...patch } as object;
  await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
};
const age = () => prisma.supportTicket.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) }, where: { createdAt: { gt: new Date(Date.now() - 60_000) } } });

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input).startsWith('https://cdn.discordapp.com/')) return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]), { status: 200 });
    return realFetch(input, init);
  });
  ({ app, prisma } = await createTestApp());
  svc = app.get(SupportTicketsService); jobs = app.get(TicketTranscriptService);
  const users: [string, string[], string | null][] = [['pt_admin', ['System Administrator'], null], ['pt_staff', ['Ticket Support'], STAFF], ['pt_staff2', ['Ticket Support'], STAFF2], ['pt_lead', ['Ticket Leitung'], LEAD], ['pt_creator', ['Police Member'], USER], ['pt_outsider', ['Police Member'], OUTSIDER]];
  for (const [n, roles, d] of users) {
    const u = await makeUser(prisma, n, roles);
    if (d) await prisma.discordLink.create({ data: { userId: u.id, discordId: d } });
  }
  await prisma.systemSetting.upsert({ where: { key: 'discord.channels' }, create: { key: 'discord.channels', value: { staffRole: STAFF_ROLE } }, update: { value: { staffRole: STAFF_ROLE } } });
});
afterAll(async () => { vi.restoreAllMocks(); delete process.env.BOT_API_TOKEN; await app.close(); });

describe('defaults: categories, departments, lifecycle', () => {
  it('creates the 8 standard categories once, with departments, forms and the full status lifecycle', async () => {
    const cats = await prisma.ticketCategory.findMany({ where: { archivedAt: null } });
    for (const n of ['Beschwerden', 'Support und technische Probleme', 'Allgemeine Fragen', 'Bewerbungen und Personalangelegenheiten', 'Leitung und vertrauliche Anliegen', 'Vorschläge und Verbesserungen', 'Partnerschaften und externe Anfragen', 'Sonstiges'])
      expect(cats.filter((c) => c.name === n)).toHaveLength(1);
    const sonst = cats.find((c) => c.name === 'Sonstiges')!;
    expect(sonst).toMatchObject({ emoji: '📩', formMode: 'MODAL', confidential: false, description: 'Für alle Anliegen, die keiner anderen Kategorie zugeordnet werden können.' });
    expect((await prisma.ticketDepartment.findUniqueOrThrow({ where: { id: sonst.departmentId! } })).name).toBe('Allgemeiner Support');
    const q = sonst.questions as { id: string; label: string; type: string; required: boolean; options: string[]; maxLength?: number; minLength?: number }[];
    expect(q.map((x) => [x.label, x.type, x.required])).toEqual([['Betreff', 'SHORT', true], ['Worum geht es?', 'SELECT', true], ['Beschreibung des Anliegens', 'LONG', true], ['Betroffener Bereich', 'SELECT', false], ['Zusätzliche Informationen', 'LONG', false], ['Anhang oder Screenshot', 'FILE', false]]);
    expect(q[0]!.maxLength).toBe(100); expect(q[2]).toMatchObject({ minLength: 10, maxLength: 2000 }); expect(q[1]!.options).toHaveLength(7); expect(q[3]!.options).toContain('Nicht zutreffend');
    expect((await prisma.ticketCategory.findFirstOrThrow({ where: { name: 'Leitung und vertrauliche Anliegen' } })).confidential).toBe(true);
    const keys = (await prisma.ticketStatus.findMany()).map((s) => s.key);
    for (const k of ['OPEN', 'CLAIMED', 'IN_PROGRESS', 'WAITING_USER', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED', 'ARCHIVED']) expect(keys).toContain(k);
    expect((await prisma.ticketFormVersion.count({ where: { categoryId: sonst.id } }))).toBe(1);
    // erneut ausführen: keine Duplikate
    const before = [await prisma.ticketCategory.count(), await prisma.ticketStatus.count(), await prisma.ticketDepartment.count(), await prisma.ticketPanel.count()];
    await seedTicketPremium(prisma as never);
    expect([await prisma.ticketCategory.count(), await prisma.ticketStatus.count(), await prisma.ticketDepartment.count(), await prisma.ticketPanel.count()]).toEqual(before);
  });
  it('the ticket-center panel uses a dropdown that opens the form directly', async () => {
    const p = await prisma.ticketPanel.findFirstOrThrow({ where: { name: 'Ticket-Center' } });
    const msg = await svc.panelMessage(p.id);
    expect(msg.select!.options).toHaveLength(8);
    expect(msg.select!.options!.every((o) => o.value.endsWith(':f'))).toBe(true);
  });
});

describe('Discord form before creating the ticket (Sonstiges)', () => {
  let draft = '', ticketId = '';
  it('opening without the form only asks for the form; start checks eligibility and returns step 1', async () => {
    user.categoryId = await catId('Sonstiges');
    const r = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send(user);
    expect(r.body.form).toMatchObject({ categoryId: user.categoryId });
    expect(await prisma.supportTicket.count({ where: { creatorId: USER } })).toBe(0);
    const s = await http().post('/api/v1/bot/support-tickets/form/start').set(bot()).send(user);
    expect(s.status).toBe(200);
    draft = s.body.draftId;
    const modal = s.body.modal as FormModalSpec;
    expect(s.body.steps).toBe(2);
    expect(modal.id).toBe(`tk:formsub:${draft}:0`);
    expect(modal.fields.map((f) => f.kind)).toEqual(['text', 'select', 'paragraph', 'select', 'paragraph']);
  });
  it('rejects invalid and manipulated values server-side and keeps them for a retry', async () => {
    const submit = (step: number, values: Record<string, unknown>, files: Record<string, unknown> = {}, discordId = USER) => http().post(`/api/v1/bot/support-tickets/form/${draft}/submit`).set(bot()).send({ discordId, step, values, files });
    expect((await submit(0, {}, {}, OUTSIDER)).status).toBe(404); // fremder Entwurf
    const bad = await submit(0, { subject: 'x'.repeat(101), topic: 'Hackerangriff', description: 'kurz', injected: 'x' });
    expect(bad.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(['Beschreibung des Anliegens', 'Betreff', 'Worum geht es?']);
    const retry = await http().get(`/api/v1/bot/support-tickets/form/${draft}/modal?discordId=${USER}&step=0`).set(bot());
    expect(retry.body.modal.fields[2].value).toBe('kurz');
    expect((await submit(1, {})).status).toBe(409); // Schritt 2 erst nach Schritt 1
    const ok = await submit(0, { subject: 'Login-Problem', topic: 'Technisches Problem', description: 'Seit heute komme ich nicht mehr ins Dashboard.', area: ['Web-Dashboard'] });
    expect(ok.body).toEqual({ next: 1, steps: 2 });
    const exe = await submit(1, {}, { attachment: [{ name: 'virus.exe', url: 'https://cdn.discordapp.com/x/virus.exe', size: 100, contentType: 'application/x-msdownload' }] });
    expect(exe.body.errors[0].message).toContain('Dateityp');
    expect((await submit(1, {}, { attachment: [{ name: 'a.png', url: 'https://evil.example/a.png', size: 10, contentType: 'image/png' }] })).status).toBe(400);
  });
  it('creates exactly one ticket with permanent ID, answers, department and attachment; re-submitting returns the same ticket', async () => {
    const send = () => http().post(`/api/v1/bot/support-tickets/form/${draft}/submit`).set(bot()).send({ discordId: USER, step: 1, values: {}, files: { attachment: [{ name: 'screen.png', url: PNG, size: 11, contentType: 'image/png' }] } });
    const r = await send();
    expect(r.status).toBe(200);
    ticketId = r.body.ticket.id;
    expect(r.body.ticket.ref).toMatch(/^EMD-\d{6}$/);
    expect(r.body.ticket.subject).toBe('Login-Problem');
    const create = find(r.body.effects, 'create')[0]!;
    expect(create.messages[0]!.embeds![0]!.title).toContain(r.body.ticket.ref);
    expect(create.viewers.map((v) => v.id)).toContain(STAFF_ROLE); // allgemeiner Support ohne eigene Rolle → allgemeine Staff-Rolle
    const again = await send();
    expect(again.body).toMatchObject({ existing: true, effects: [], ticket: { id: ticketId } });
    expect(await prisma.supportTicket.count({ where: { creatorId: USER } })).toBe(1);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(t.formVersion).toBe(1);
    expect((t.answers as { label: string; value: string }[]).map((a) => a.value)).toEqual(['Login-Problem', 'Technisches Problem', 'Seit heute komme ich nicht mehr ins Dashboard.', 'Web-Dashboard', '—', 'screen.png']);
    const att = await prisma.ticketMessage.findFirstOrThrow({ where: { ticketId } });
    expect((att.attachments as { storageKey: string }[])[0]!.storageKey).toMatch(/\.png$/);
    await http().post(`/api/v1/bot/support-tickets/${ticketId}/channel`).set(bot()).send({ channelId: '830000000000000001', controlMessageId: '830000000000000002' });
  });
  it('form changes create a new version; submitted tickets keep their original labels', async () => {
    const admin = (await login(app, 'pt_admin')).agent;
    const cfg = (await admin.get('/api/v1/support-tickets/config')).body;
    const cat = cfg.categories.find((c: { name: string }) => c.name === 'Sonstiges');
    const questions = cat.questions.map((q: { id: string; label: string }) => (q.id === 'subject' ? { ...q, label: 'Titel deines Anliegens' } : q));
    const saved = await admin.put(`/api/v1/support-tickets/categories/${cat.id}`).send({ ...cat, id: undefined, questions });
    expect(saved.body.formVersion).toBe(2);
    expect((await admin.get(`/api/v1/support-tickets/categories/${cat.id}/form-versions`)).body.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect((t.answers as { label: string }[])[0]!.label).toBe('Betreff');
    // Vorschau prüft wie der Server, legt aber kein Ticket an
    const n = await prisma.supportTicket.count();
    const prev = await admin.post('/api/v1/support-tickets/forms/preview').send({ fields: questions, values: { subject: '', topic: 'Sonstiges' } });
    expect(prev.body.ok).toBe(false);
    expect(Object.keys(prev.body.errors)).toEqual(['subject', 'description']);
    expect(await prisma.supportTicket.count()).toBe(n);
    expect((await (await login(app, 'pt_staff')).agent.post('/api/v1/support-tickets/forms/preview').send({ fields: questions, values: {} })).status).toBe(403);
  });
});

describe('duplicates, limits and permanent IDs', () => {
  it('the same Discord interaction never creates two tickets; refs are unique and searchable', async () => {
    const cat = await prisma.ticketCategory.create({ data: { name: 'Kanal-Fragen', formMode: 'CHANNEL', maxOpen: 0, questions: [] } });
    const body = { ...user, discordId: '800000000000000021', categoryId: cat.id, interactionId: '880000000000000001' };
    const [a, b] = await Promise.all([http().post('/api/v1/bot/support-tickets/open').set(bot()).send(body), http().post('/api/v1/bot/support-tickets/open').set(bot()).send(body)]);
    expect(a.body.ticket.id).toBe(b.body.ticket.id);
    expect([a.body.effects.length, b.body.effects.length].sort()).toEqual([0, 1]);
    expect(await prisma.supportTicket.count({ where: { creatorId: body.discordId } })).toBe(1);
    // Doppelklick (zwei Interaktionen) direkt danach
    expect((await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ ...body, interactionId: '880000000000000002' })).status).toBe(409);
    const staff = (await login(app, 'pt_staff')).agent;
    const list = (await staff.get(`/api/v1/support-tickets?kind=all&q=${a.body.ticket.ref}`)).body;
    expect(list.items.map((t: { id: string }) => t.id)).toEqual([a.body.ticket.id]);
  });
  it('global limit of open tickets per user, bypassed by staff with ticket.bypass_limits', async () => {
    await age();
    await saveSettings({ maxOpenPerUser: 1 });
    const other = await catId('Kanal-Fragen');
    const r = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ ...user, categoryId: other });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('mehr als 1');
    const lead1 = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ ...user, discordId: LEAD, categoryId: other });
    await age();
    const lead2 = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ ...user, discordId: LEAD, categoryId: other });
    expect([lead1.status, lead2.status]).toEqual([201, 201]);
    await saveSettings({ maxOpenPerUser: 0 });
  });
});

describe('departments, confidentiality and assignment', () => {
  let conf = '', normal = '';
  it('confidential tickets without a department role never fall back to the general staff role and stay hidden', async () => {
    const leitung = await catId('Leitung und vertrauliche Anliegen');
    const draft = (await http().post('/api/v1/bot/support-tickets/form/start').set(bot()).send({ ...user, discordId: '800000000000000031', categoryId: leitung })).body.draftId;
    const r = await http().post(`/api/v1/bot/support-tickets/form/${draft}/submit`).set(bot()).send({ discordId: '800000000000000031', step: 0, values: { subject: 'Vertraulich', description: 'Bitte nur die Leitung lesen lassen.' } });
    conf = r.body.ticket.id;
    const create = find(r.body.effects, 'create')[0]!;
    expect(create.viewers.map((v) => v.id)).toEqual(['800000000000000031']); // nur der Ersteller (+ Bot)
    expect(create.topic).not.toContain('800000000000000031');
    expect((await prisma.ticketLog.findMany({ where: { ticketId: conf } })).map((l) => l.action)).toContain('routing_warning');
    const staff = (await login(app, 'pt_staff')).agent;
    expect((await staff.get(`/api/v1/support-tickets/${conf}`)).status).toBe(403);
    expect((await staff.get('/api/v1/support-tickets?kind=all&pageSize=500')).body.items.map((t: { id: string }) => t.id)).not.toContain(conf);
    expect((await (await login(app, 'pt_lead')).agent.get(`/api/v1/support-tickets/${conf}`)).status).toBe(200);
    // Ersatz-Rollen aus den Einstellungen (z. B. Leitung) – nie die allgemeine Staff-Rolle
    await saveSettings({ confidentialFallbackRoleIds: [LEAD_ROLE] });
    const d2 = (await http().post('/api/v1/bot/support-tickets/form/start').set(bot()).send({ ...user, discordId: '800000000000000032', categoryId: leitung })).body.draftId;
    const r2 = await http().post(`/api/v1/bot/support-tickets/form/${d2}/submit`).set(bot()).send({ discordId: '800000000000000032', step: 0, values: { subject: 'Vertraulich 2', description: 'Bitte nur die Leitung lesen lassen.' } });
    expect(find(r2.body.effects, 'create')[0]!.viewers.map((v) => v.id)).toEqual(['800000000000000032', LEAD_ROLE]);
  });
  it('assigning needs ticket.assign and a staff member with access; department change moves channel access', async () => {
    normal = (await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: USER } })).id;
    expect((await act(normal, STAFF, { action: 'assign', targetId: STAFF2 })).status).toBe(403);
    expect((await act(normal, LEAD, { action: 'assign', targetId: OUTSIDER })).status).toBe(400); // kein Teammitglied mit ticket.claim
    const a = await act(normal, LEAD, { action: 'assign', targetId: STAFF2 });
    expect(a.status).toBe(200);
    expect(a.body.ticket.claimers).toEqual([STAFF2]);
    expect(a.body.ticket.status.key).toBe('CLAIMED');
    const admin = (await login(app, 'pt_admin')).agent;
    const tech = (await prisma.ticketDepartment.findFirstOrThrow({ where: { name: 'Technik' } }));
    const dep = (await admin.put(`/api/v1/support-tickets/departments/${tech.id}`).send({ name: 'Technik', staffRoleIds: [TECH_ROLE], leadRoleIds: [LEAD_ROLE], accessRoleNames: ['Ticket Leitung'] })).body;
    expect(dep.staffRoleIds).toEqual([TECH_ROLE]);
    expect((await admin.post('/api/v1/support-tickets/departments').send({ name: 'technik' })).status).toBe(409);
    expect((await (await login(app, 'pt_staff')).agent.post('/api/v1/support-tickets/departments').send({ name: 'Neu' })).status).toBe(403);
    // Ticket Support hat kein ticket.change_department
    expect((await act(normal, STAFF2, { action: 'department', departmentId: tech.id })).status).toBe(403);
    const m = await act(normal, LEAD, { action: 'department', departmentId: tech.id });
    expect(m.status).toBe(200);
    expect(find(m.body.effects, 'access')).toEqual(expect.arrayContaining([
      expect.objectContaining({ targetId: STAFF_ROLE, view: null }), expect.objectContaining({ targetId: TECH_ROLE, view: true }), expect.objectContaining({ targetId: STAFF2, view: null }),
    ]));
    // STAFF2 (Ticket Support) hat keinen Zugriff auf Technik-Tickets (nur Ticket Leitung) → als Bearbeiter entfernt, sieht es nicht mehr
    expect(m.body.ticket.claimers).toEqual([]);
    expect((await (await login(app, 'pt_staff2')).agent.get(`/api/v1/support-tickets/${normal}`)).status).toBe(403);
    expect((await prisma.supportTicket.findUniqueOrThrow({ where: { id: normal } })).departmentId).toBe(tech.id);
    // wieder zurück in den allgemeinen Support, damit die folgenden Tests das Team nutzen können
    const general = await prisma.ticketDepartment.findFirstOrThrow({ where: { name: 'Allgemeiner Support' } });
    expect((await act(normal, LEAD, { action: 'department', departmentId: general.id })).status).toBe(200);
  });
  it('only ticket.manage may move a confidential ticket into a non-confidential category', async () => {
    const role = await prisma.role.create({ data: { name: 'Vertrauen Test', permissions: { create: ['ticket.view', 'ticket.change_category', 'ticket.change_department'].map((permissionKey) => ({ permissionKey })) } } });
    const u = await makeUser(prisma, 'pt_conf', []);
    await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
    await prisma.discordLink.create({ data: { userId: u.id, discordId: '800000000000000041' } });
    await prisma.ticketCategory.updateMany({ where: { name: 'Leitung und vertrauliche Anliegen' }, data: { accessRoleNames: ['Vertrauen Test'] } });
    const r = await act(conf, '800000000000000041', { action: 'category', categoryId: await catId('Allgemeine Fragen') });
    expect(r.status).toBe(403);
    expect(r.body.message).toContain('vertrauliches Ticket');
    expect((await prisma.auditLog.findMany({ where: { entityId: conf, result: 'DENIED' } })).length).toBeGreaterThan(0);
  });
});

describe('lifecycle: waiting for the user, status rules, archive', () => {
  let id = '';
  it('a question to the user pauses the SLA; the answer resumes it and notifies the assignee', async () => {
    id = (await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: USER } })).id;
    await act(id, LEAD, { action: 'assign', targetId: STAFF });
    const q = await act(id, STAFF, { action: 'request_info', text: 'Welchen Browser nutzt du?' });
    expect(q.body.ticket.status.key).toBe('WAITING_USER');
    expect(find(q.body.effects, 'post')[0]!.message.content).toBe(`<@${USER}>`);
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.waitingSince).not.toBeNull();
    await prisma.supportTicket.update({ where: { id }, data: { waitingSince: new Date(Date.now() - 120_000) } });
    await prisma.notification.deleteMany({});
    await http().post('/api/v1/bot/support-tickets/messages').set(bot()).send({ channelId: '830000000000000001', discordMessageId: '840000000000000001', authorId: USER, authorName: 'Erika', isBot: false, content: 'Firefox' });
    const after = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect((await prisma.ticketStatus.findUniqueOrThrow({ where: { id: after.statusId } })).key).toBe('IN_PROGRESS');
    expect(after.waitingSince).toBeNull();
    expect(after.waitingSeconds).toBeGreaterThanOrEqual(119);
    expect(await prisma.notification.count()).toBe(1); // Bearbeiter im Dashboard
    await http().post('/api/v1/bot/support-tickets/messages').set(bot()).send({ channelId: '830000000000000001', discordMessageId: '840000000000000002', authorId: USER, authorName: 'Erika', isBot: false, content: 'Und Chrome' });
    expect(await prisma.notification.count()).toBe(1); // höchstens alle X Minuten
  });
  it('status changes are validated centrally; archiving needs its own right; archived tickets stay readable', async () => {
    const closed = await prisma.ticketStatus.findUniqueOrThrow({ where: { key: 'CLOSED' } });
    expect((await act(id, STAFF, { action: 'status', statusId: closed.id })).body.message).toContain('Schließen');
    const resolved = await prisma.ticketStatus.findUniqueOrThrow({ where: { key: 'RESOLVED' } });
    expect((await act(id, STAFF, { action: 'status', statusId: resolved.id })).body.ticket.status.key).toBe('RESOLVED');
    expect((await act(id, '800000000000000041', { action: 'archive' })).status).toBe(403); // ohne ticket.archive
    expect((await act(id, LEAD, { action: 'archive' })).body.message).toContain('geschlossene');
    expect((await act(id, STAFF, { action: 'close', reason: 'Gelöst' })).status).toBe(200);
    expect((await act(id, LEAD, { action: 'archive' })).status).toBe(200);
    const reopenOnly = await prisma.role.create({ data: { name: 'Nur Wiederöffnen', permissions: { create: ['ticket.view', 'ticket.reopen'].map((permissionKey) => ({ permissionKey })) } } });
    const ru = await makeUser(prisma, 'pt_reopen', []);
    await prisma.userRole.create({ data: { userId: ru.id, roleId: reopenOnly.id } });
    await prisma.discordLink.create({ data: { userId: ru.id, discordId: '800000000000000042' } });
    expect((await act(id, '800000000000000042', { action: 'reopen' })).body.message).toContain('Archiv'); // archiviert → nur mit Archiv-Recht
    const staff = (await login(app, 'pt_staff')).agent;
    const d = (await staff.get(`/api/v1/support-tickets/${id}`)).body;
    expect(d.status.key).toBe('ARCHIVED');
    expect(d.archivedAt).not.toBeNull();
    expect((await staff.get('/api/v1/support-tickets?kind=archived')).body.items.map((t: { id: string }) => t.id)).toContain(id);
  });
});

describe('SLA, reminders and escalation', () => {
  it('only configured targets count; reminders are deduplicated; leads are alerted once without gaining access', async () => {
    const admin = (await login(app, 'pt_admin')).agent;
    const normal = await prisma.ticketPriority.findFirstOrThrow({ where: { name: 'Normal' } });
    await admin.put(`/api/v1/support-tickets/priorities/${normal.id}`).send({ ...normal, id: undefined, firstResponseMinutes: 5, resolutionMinutes: 60 });
    const cat = await prisma.ticketCategory.create({ data: { name: 'SLA-Test', formMode: 'CHANNEL', maxOpen: 0, defaultPriorityId: normal.id, departmentId: (await prisma.ticketDepartment.findFirstOrThrow({ where: { name: 'Technik' } })).id } });
    await prisma.ticketDepartment.updateMany({ where: { name: 'Technik' }, data: { notifyChannelId: '850000000000000001' } });
    const r = await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ ...user, discordId: '800000000000000051', categoryId: cat.id });
    const id = r.body.ticket.id;
    const t = await prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    expect(t.firstResponseDueAt!.getTime() - t.createdAt.getTime()).toBe(5 * 60_000);
    const now = new Date(t.createdAt.getTime() + 10 * 60_000);
    await prisma.discordOutbox.deleteMany({ where: { type: 'ticket.effects' } });
    expect(await svc.runAutomation(now)).toMatchObject({ reminded: 1, escalated: 0 });
    expect(await svc.runAutomation(new Date(now.getTime() + 60_000))).toMatchObject({ reminded: 0 });
    expect(await svc.runAutomation(new Date(now.getTime() + 30 * 60_000))).toMatchObject({ escalated: 1 });
    expect(await svc.runAutomation(new Date(now.getTime() + 31 * 60_000))).toMatchObject({ escalated: 0 });
    const posts = (await prisma.discordOutbox.findMany({ where: { type: 'ticket.effects' } })).flatMap((o) => (o.payload as { effects: TicketEffect[] }).effects).filter((e) => e.type === 'post') as Extract<TicketEffect, { type: 'post' }>[];
    expect(posts.some((p) => p.channelId === '850000000000000001' && p.message.mentionRoles?.includes(LEAD_ROLE))).toBe(true);
    expect((await prisma.ticketAccess.count({ where: { ticketId: id } }))).toBe(0); // Eskalation gibt keinen Zugriff
    await prisma.supportTicket.update({ where: { id }, data: { firstResponseDueAt: new Date(Date.now() - 60_000) } });
    const lead = (await login(app, 'pt_lead')).agent;
    expect((await lead.get('/api/v1/support-tickets?queue=overdue')).body.items.map((x: { id: string }) => x.id)).toContain(id);
    expect((await lead.get('/api/v1/support-tickets/overview')).body.overdue).toBeGreaterThanOrEqual(1);
    await admin.put(`/api/v1/support-tickets/priorities/${normal.id}`).send({ ...normal, id: undefined, firstResponseMinutes: null, resolutionMinutes: null });
  });
});

describe('transcripts: background jobs, versions, access control', () => {
  let ticketId = '', ref = '', trId = '';
  it('closing queues one job (idempotent); processing creates HTML/TXT/JSON with checksum and without internal notes', async () => {
    ticketId = (await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: USER } })).id;
    await act(ticketId, LEAD, { action: 'note', text: 'GEHEIME-INTERNE-NOTIZ' });
    const jobs0 = await prisma.ticketTranscript.findMany({ where: { ticketId } });
    expect(jobs0).toHaveLength(1); // beim Schließen oben angelegt
    const again = await jobs.enqueue(ticketId, { trigger: 'close', key: jobs0[0]!.jobKey!, actor: { id: null, name: 'Test' } });
    expect(again.created).toBe(false);
    await jobs.processDue();
    const tr = await prisma.ticketTranscript.findUniqueOrThrow({ where: { id: jobs0[0]!.id } });
    trId = tr.id;
    ref = (tr.data as { ref: string }).ref;
    expect(tr).toMatchObject({ status: 'DONE', version: 1 });
    expect(tr.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(tr.text).toContain(ref);
    expect(tr.html).toContain(tr.sha256!);
    for (const x of [tr.html, tr.text, JSON.stringify(tr.data)]) { expect(x).not.toContain('GEHEIME-INTERNE-NOTIZ'); expect(x).not.toContain('Interne Notiz'); }
  });
  it('failed jobs are retried with limits, then marked FAILED and can be retried safely', async () => {
    const spy = vi.spyOn(jobs, 'render').mockRejectedValue(new Error('Renderer kaputt'));
    const v2 = await act(ticketId, LEAD, { action: 'transcript' });
    expect(v2.body.message).toContain('Version 2');
    const job = await prisma.ticketTranscript.findFirstOrThrow({ where: { ticketId, version: 2 } });
    let t = Date.now();
    for (let i = 0; i < 5; i++) { await jobs.processDue(new Date(t)); t += 2 * 3_600_000; }
    expect((await prisma.ticketTranscript.findUniqueOrThrow({ where: { id: job.id } }))).toMatchObject({ status: 'FAILED', attempts: 5, lastError: 'Renderer kaputt' });
    await jobs.processDue(new Date(t + 3_600_000));
    expect((await prisma.ticketTranscript.findUniqueOrThrow({ where: { id: job.id } })).attempts).toBe(5); // keine Endlosschleife
    spy.mockRestore();
    expect((await act(ticketId, '800000000000000042', { action: 'transcript_retry', transcriptId: job.id })).status).toBe(403); // ohne ticket.transcript_manage
    expect((await act(ticketId, LEAD, { action: 'transcript_retry', transcriptId: job.id })).status).toBe(200);
    await jobs.processDue();
    // abgebrochener Auftrag (Neustart während der Verarbeitung) wird nach Ablauf der Sperre fortgesetzt
    const v3 = await jobs.enqueue(ticketId, { trigger: 'manual', actor: { id: null, name: 'Test' } });
    await prisma.ticketTranscript.update({ where: { id: v3.transcript.id }, data: { status: 'RUNNING', nextAttemptAt: new Date(Date.now() - 1000) } });
    await jobs.processDue();
    expect((await prisma.ticketTranscript.findMany({ where: { ticketId }, orderBy: { version: 'asc' } })).map((x) => [x.version, x.status])).toEqual([[1, 'DONE'], [2, 'DONE'], [3, 'DONE']]);
  });
  it('the transcript page is protected server-side: staff, the creator (own ticket only), never others or anonymous', async () => {
    const page = (agent: ReturnType<typeof request.agent>) => agent.get(`/api/v1/support-tickets/transcripts/ref/${ref}`);
    expect((await http().get(`/api/v1/support-tickets/transcripts/ref/${ref}`)).status).toBe(401);
    const staff = (await login(app, 'pt_staff')).agent;
    const s = await page(staff);
    expect(s.status).toBe(200);
    expect(s.headers['cache-control']).toContain('no-store');
    expect(s.headers['x-robots-tag']).toContain('noindex');
    expect(s.body.versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    const creator = (await login(app, 'pt_creator')).agent;
    const c = await page(creator);
    expect(c.body).toMatchObject({ as: 'creator', canJson: false, ticketId: null });
    const html = await creator.get(`/api/v1/support-tickets/transcripts/${trId}`);
    expect(html.status).toBe(200);
    expect(html.headers['content-security-policy']).toContain('sandbox');
    expect((await creator.get(`/api/v1/support-tickets/transcripts/${trId}?format=txt`)).text).toContain(ref);
    expect((await creator.get(`/api/v1/support-tickets/transcripts/${trId}?format=json`)).status).toBe(404);
    expect(JSON.parse((await staff.get(`/api/v1/support-tickets/transcripts/${trId}?format=json`)).text)).toMatchObject({ ref, version: 1 });
    // fremde Person: gleiche Antwort wie „gibt es nicht“ – auch beim Durchprobieren von IDs
    const out = (await login(app, 'pt_outsider')).agent;
    expect((await page(out)).status).toBe(404);
    expect((await out.get(`/api/v1/support-tickets/transcripts/${trId}`)).status).toBe(404);
    expect((await out.get('/api/v1/support-tickets/transcripts/ref/EMD-999999')).status).toBe(404);
    expect((await out.get(`/api/v1/support-tickets/transcripts/ref/XYZ-${ref.slice(4)}`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: 'ticket.transcript_denied', result: 'DENIED' } })).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: 'ticket.transcript_viewed', entityId: ticketId } })).toBeGreaterThan(0);
    // vertrauliches Ticket: Ticket Support ohne Zugriffsrolle bekommt kein Transkript
    const confT = await prisma.supportTicket.findFirstOrThrow({ where: { creatorId: '800000000000000031' } });
    const confJob = await jobs.enqueue(confT.id, { trigger: 'manual', actor: { id: null, name: 'Test' } });
    await jobs.processDue();
    expect((await staff.get(`/api/v1/support-tickets/transcripts/${confJob.transcript.id}`)).status).toBe(404);
    expect((await staff.get('/api/v1/support-tickets/transcripts?pageSize=500')).body.items.map((x: { ticketId: string }) => x.ticketId)).not.toContain(confT.id);
  });
});

describe('categories, panels, audit', () => {
  it('a deactivated category blocks new tickets but existing ones stay fully usable; categories with history are archived, not deleted', async () => {
    const admin = (await login(app, 'pt_admin')).agent;
    const cat = await prisma.ticketCategory.findFirstOrThrow({ where: { name: 'Kanal-Fragen' } });
    const existing = await prisma.supportTicket.findFirstOrThrow({ where: { categoryId: cat.id, closedAt: null } });
    await prisma.ticketCategory.update({ where: { id: cat.id }, data: { active: false } });
    await age();
    expect((await http().post('/api/v1/bot/support-tickets/open').set(bot()).send({ ...user, discordId: '800000000000000061', categoryId: cat.id })).body.message).toContain('deaktiviert');
    expect((await act(existing.id, STAFF, { action: 'claim' })).status).toBe(200);
    expect((await admin.delete(`/api/v1/support-tickets/categories/${cat.id}`)).status).toBe(409);
    const a = await admin.post(`/api/v1/support-tickets/categories/${cat.id}/archive`).send({ archived: true });
    expect(a.body.archivedAt).not.toBeNull();
    expect((await (await login(app, 'pt_staff')).agent.get(`/api/v1/support-tickets/${existing.id}`)).status).toBe(200);
  });
  it('dropdown panels split more than 25 categories into several menus; buttons stay within Discord limits; publish errors are stored', async () => {
    const admin = (await login(app, 'pt_admin')).agent;
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push((await prisma.ticketCategory.create({ data: { name: `Viele ${i}` } })).id);
    expect((await admin.post('/api/v1/support-tickets/panels').send({ name: 'Zu viele Buttons', style: 'BUTTONS', categoryIds: ids })).status).toBe(400);
    const p = (await admin.post('/api/v1/support-tickets/panels').send({ name: 'Viele', style: 'DROPDOWN', categoryIds: ids })).body;
    const msg = (await admin.get(`/api/v1/support-tickets/panels/${p.id}/preview`)).body;
    expect(msg.select.options).toHaveLength(25);
    expect(msg.selects).toHaveLength(1);
    expect(msg.selects[0].options).toHaveLength(5);
    expect(msg.selects[0].id).not.toBe(msg.select.id);
    await http().post(`/api/v1/bot/support-tickets/panels/${p.id}/failed`).set(bot()).send({ error: 'Missing Permissions' });
    expect((await prisma.ticketPanel.findUniqueOrThrow({ where: { id: p.id } })).publishError).toBe('Missing Permissions');
    await prisma.ticketCategory.deleteMany({ where: { id: { in: ids } } });
  });
  it('the audit log records ticket actions without contents and is only visible with ticket.audit', async () => {
    const lead = (await login(app, 'pt_lead')).agent;
    for (const x of ['ticket.created', 'ticket.assigned', 'ticket.department_changed', 'ticket.note_added', 'ticket.closed', 'ticket.archived', 'ticket.transcript_denied']) {
      expect((await lead.get(`/api/v1/support-tickets/audit?action=${x}`)).body.total, x).toBeGreaterThan(0);
    }
    const a = (await lead.get('/api/v1/support-tickets/audit?pageSize=200')).body;
    expect(JSON.stringify(a)).not.toContain('GEHEIME-INTERNE-NOTIZ');
    expect(JSON.stringify(a)).not.toContain(TOKEN);
    expect(a.items.every((i: { requestId: string | null }) => i.requestId)).toBe(true);
    expect((await (await login(app, 'pt_staff')).agent.get('/api/v1/support-tickets/audit')).status).toBe(403);
  });
});
