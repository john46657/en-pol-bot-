import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { CalendarService } from '../src/calendar/calendar.service';

const TOKEN = 'test-bot-token-hrcal-0123456789-abcdefgh';
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, lead: Agent, sup: Agent, m1: Agent, m2: Agent;
const ids: Record<string, string> = {};
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const http = () => request(app.getHttpServer());
const D1 = '397320000000000001';
const bot = { Authorization: `Bot ${TOKEN}`, 'X-Discord-User': D1 };

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'hc_admin', ['System Administrator']);
  ids.lead = (await makeUser(prisma, 'hc_lead', ['Police Member', 'Police Administration'])).id;
  ids.sup = (await makeUser(prisma, 'hc_sup', ['Police Member', 'Supervisor'])).id;
  ids.m1 = (await makeUser(prisma, 'hc_m1', ['Police Member'])).id;
  ids.m2 = (await makeUser(prisma, 'hc_m2', ['Police Member'])).id;
  admin = (await login(app, 'hc_admin')).agent; lead = (await login(app, 'hc_lead')).agent; sup = (await login(app, 'hc_sup')).agent;
  m1 = (await login(app, 'hc_m1')).agent; m2 = (await login(app, 'hc_m2')).agent;
  await prisma.discordLink.create({ data: { userId: ids.m1!, discordId: D1 } });
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('Beförderungs- und Versetzungsanträge (selbst gestellt)', () => {
  it('Vorbereitung: Ränge mit Voraussetzung, Personalakte', async () => {
    const low = await admin.post('/api/v1/hr/ranks').send({ name: 'HC-Meister' });
    const high = await admin.post('/api/v1/hr/ranks').send({ name: 'HC-Kommissar', requirements: [{ id: '0a1b2c3d-1111-4222-8333-444455556666', type: 'MIN_DAYS_IN_RANK', label: '', value: 30 }] });
    expect(low.status).toBe(201); expect(high.status).toBe(201);
    ids.low = low.body.id; ids.high = high.body.id;
    await admin.put('/api/v1/hr/ranks/order').send({ ids: [ids.high, ids.low] });
    ids.p1 = (await prisma.personnel.create({ data: { userId: ids.m1!, rank: 'HC-Meister', team: 'Polizei' } })).id;
  });
  it('Ziele: nächster Rang mit offenen Voraussetzungen, andere Abteilungen', async () => {
    const t = await m1.get('/api/v1/hr/requests/targets');
    expect(t.status).toBe(200);
    expect(t.body.ranks).toEqual([expect.objectContaining({ id: ids.high, eligible: false })]);
    expect(t.body.departments).toContain('Leitstelle');
    expect((await m2.get('/api/v1/hr/requests/targets')).status).toBe(404); // keine Personalakte
  });
  it('Beförderung nur mit erfüllten Voraussetzungen; nie automatisch ausgeführt', async () => {
    const no = await m1.post('/api/v1/hr/requests/self').send({ kind: 'PROMOTION', to: ids.high, reason: 'Ich habe viel Erfahrung gesammelt.' });
    expect(no.status).toBe(409);
    expect(no.body.message).toMatch(/Voraussetzungen/);
    expect((await m1.post('/api/v1/hr/requests/self').send({ kind: 'PROMOTION', to: ids.high, reason: 'kurz' })).status).toBe(400);
    await prisma.personnel.update({ where: { id: ids.p1 }, data: { rankSince: new Date(Date.now() - 40 * 24 * H) } });
    const ok = await m1.post('/api/v1/hr/requests/self').send({ kind: 'PROMOTION', to: ids.high, reason: 'Ich habe viel Erfahrung gesammelt.' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ origin: 'SELF', status: 'OPEN' });
    ids.req = ok.body.id;
    expect((await m1.post('/api/v1/hr/requests/self').send({ kind: 'PROMOTION', to: ids.high, reason: 'Noch einmal derselbe Antrag.' })).status).toBe(409);
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: ids.p1 } })).rank).toBe('HC-Meister');
  });
  it('Rückfrage → Rückfrage erforderlich; nur der Antragsteller antwortet', async () => {
    expect((await m2.post(`/api/v1/hr/requests/${ids.req}/query`).send({ question: 'Warum jetzt?' })).status).toBe(403);
    const q = await lead.post(`/api/v1/hr/requests/${ids.req}/query`).send({ question: 'Welche Einsätze hast du geleitet?' });
    expect(q.status).toBe(200);
    expect(q.body.status).toBe('NEEDS_INFO');
    expect((await lead.post(`/api/v1/hr/requests/${ids.req}/query`).send({ question: 'Noch eine Frage?' })).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'hr.request.query' } })).toBe(1);
    const mine = await m1.get('/api/v1/hr/requests/mine');
    expect(mine.body[0]).toMatchObject({ statusLabel: 'Rückfrage erforderlich', openQuery: expect.objectContaining({ question: 'Welche Einsätze hast du geleitet?' }) });
    expect((await m2.post(`/api/v1/hr/requests/${ids.req}/answer`).send({ answer: 'fremd' })).status).toBe(404);
    const a = await m1.post(`/api/v1/hr/requests/${ids.req}/answer`).send({ answer: 'Drei Großlagen im Oktober.' });
    expect(a.status).toBe(200);
    expect(a.body.status).toBe('IN_REVIEW');
    expect(await prisma.notification.count({ where: { userId: ids.lead, event: 'hr.request.query' } })).toBe(1);
  });
  it('eigener Antrag kann nicht selbst genehmigt werden; Durchführung erst nach Genehmigung, mit Audit', async () => {
    await prisma.personnel.create({ data: { userId: ids.lead!, rank: 'HC-Kommissar', team: 'Polizei' } });
    const self = await m1.post(`/api/v1/hr/requests/${ids.req}/decide`).send({ decision: 'APPROVE' });
    expect(self.status).toBe(403);
    let r = await lead.post(`/api/v1/hr/requests/${ids.req}/decide`).send({ decision: 'APPROVE' });
    for (let i = 0; r.status === 200 && r.body.status === 'IN_REVIEW' && i < 3; i++) r = await admin.post(`/api/v1/hr/requests/${ids.req}/decide`).send({ decision: 'APPROVE' });
    expect(r.status).toBe(200);
    const after = await prisma.hrRequest.findUniqueOrThrow({ where: { id: ids.req } });
    if (after.status === 'APPROVED') {
      expect((await prisma.personnel.findUniqueOrThrow({ where: { id: ids.p1 } })).rank).toBe('HC-Meister');
      expect((await admin.post(`/api/v1/hr/requests/${ids.req}/execute`)).status).toBe(200);
    }
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: ids.p1 } })).rank).toBe('HC-Kommissar');
    expect(await prisma.auditLog.count({ where: { action: 'promotion.execute', entityId: ids.p1 } })).toBe(1);
  });
  it('Versetzung beantragen und zurückziehen; Bot darf nur eigene Anträge', async () => {
    const t = await http().post('/api/v1/hr/requests/self').set(bot).send({ kind: 'TRANSFER', to: 'Leitstelle', reason: 'Ich möchte in die Leitstelle wechseln.' });
    expect(t.status).toBe(201);
    expect((await http().get('/api/v1/hr/requests/mine').set(bot)).body.some((x: { id: string }) => x.id === t.body.id)).toBe(true);
    expect((await http().post('/api/v1/hr/requests').set(bot).send({ kind: 'TRANSFER', personnelId: ids.p1, to: 'Leitstelle', reason: 'x' })).status).toBe(403);
    const w = await http().post(`/api/v1/hr/requests/${t.body.id}/withdraw`).set(bot);
    expect(w.status).toBe(200);
    expect(w.body.status).toBe('CANCELLED');
    expect((await m2.post(`/api/v1/hr/requests/${t.body.id}/withdraw`)).status).toBe(404);
  });
});

describe('Kalender', () => {
  it('nur calendar.manage legt an; Einladung benachrichtigt; doppelte Anlage ergibt einen Termin', async () => {
    const body = { title: 'Dienstsport', category: 'EVENT', startsAt: at(0.5), endsAt: at(2), reminders: [60], participantIds: [ids.m1], maxParticipants: 2, idempotencyKey: 'dash-abc-12345' };
    expect((await m1.post('/api/v1/calendar').send(body)).status).toBe(403);
    const [a, b] = await Promise.all([sup.post('/api/v1/calendar').send(body), sup.post('/api/v1/calendar').send(body)]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.ids[0]).toBe(b.body.ids[0]);
    expect(await prisma.calendarEvent.count({ where: { title: 'Dienstsport' } })).toBe(1);
    ids.ev = a.body.ids[0];
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'calendar.new', entityId: ids.ev } })).toBe(1);
    expect((await sup.post('/api/v1/calendar').send({ ...body, idempotencyKey: undefined, category: 'SHIFT' })).status).toBe(400);
    expect((await sup.post('/api/v1/calendar').send({ ...body, idempotencyKey: undefined, endsAt: at(0.1) })).status).toBe(400);
  });
  it('Zusagen mit Höchstzahl, Absagen, Abwesenheit melden', async () => {
    expect((await m1.post(`/api/v1/calendar/${ids.ev}/respond`).send({ status: 'ACCEPTED' })).status).toBe(200);
    expect((await m1.post(`/api/v1/calendar/${ids.ev}/respond`).send({ status: 'ACCEPTED' })).status).toBe(409);
    expect((await m2.post(`/api/v1/calendar/${ids.ev}/respond`).send({ status: 'ACCEPTED' })).status).toBe(200);
    const full = await sup.post(`/api/v1/calendar/${ids.ev}/respond`).send({ status: 'ACCEPTED' });
    expect(full.status).toBe(409);
    expect(full.body.message).toMatch(/Plätze/);
    const ex = await m2.post(`/api/v1/calendar/${ids.ev}/respond`).send({ status: 'EXCUSED', note: 'Dienst' });
    expect(ex.body.myStatus).toBe('EXCUSED');
  });
  it('Erinnerung genau einmal; nach Verschieben erneut; Teilnehmer erfahren Änderungen', async () => {
    const cal = app.get(CalendarService);
    await cal.tick(); await cal.tick();
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'calendar.reminder', entityId: ids.ev } })).toBe(1);
    const cur = (await sup.get(`/api/v1/calendar/${ids.ev}`)).body;
    const moved = await sup.patch(`/api/v1/calendar/${ids.ev}`).send({ title: cur.title, category: 'EVENT', startsAt: at(0.75), endsAt: at(2), reminders: [60], maxParticipants: 2, openSignup: true, version: cur.version });
    expect(moved.status).toBe(200);
    expect((await sup.patch(`/api/v1/calendar/${ids.ev}`).send({ title: 'Veraltet', category: 'EVENT', startsAt: at(1), endsAt: at(2), version: cur.version })).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'calendar.changed', entityId: ids.ev } })).toBe(1);
    await cal.tick();
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'calendar.reminder', entityId: ids.ev } })).toBe(2);
    expect(await prisma.calendarReminderLog.count({ where: { eventId: ids.ev } })).toBe(2); // alter Eintrag bleibt
  });
  it('geschlossener Termin, Absage, Anwesenheit erst ab Beginn, Serie', async () => {
    const closed = await sup.post('/api/v1/calendar').send({ title: 'Prüfung Block A', category: 'EXAM', startsAt: at(30), endsAt: at(32), openSignup: false, participantIds: [ids.m1] });
    expect((await m2.post(`/api/v1/calendar/${closed.body.ids[0]}/respond`).send({ status: 'ACCEPTED' })).status).toBe(403);
    expect((await sup.post(`/api/v1/calendar/${closed.body.ids[0]}/attendance`).send({ entries: [{ userId: ids.m1, status: 'ATTENDED' }] })).status).toBe(409);
    expect((await m1.post(`/api/v1/calendar/${closed.body.ids[0]}/cancel`).send({ reason: 'keine Lust' })).status).toBe(403);
    expect((await sup.post(`/api/v1/calendar/${closed.body.ids[0]}/cancel`).send({ reason: 'Prüfer krank' })).status).toBe(200);
    expect((await m1.post(`/api/v1/calendar/${closed.body.ids[0]}/respond`).send({ status: 'ACCEPTED' })).status).toBe(409);
    const series = await sup.post('/api/v1/calendar').send({ title: 'Wochenbesprechung Leitstelle', category: 'INTERNAL', startsAt: at(48), endsAt: at(49), recurrence: { freq: 'WEEKLY', count: 3 } });
    expect(series.body.created).toBe(3);
  });
  it('Liste enthält Schichten virtuell (keine Kopie) und Filter', async () => {
    const s = await sup.post('/api/v1/shiftplan').send({ name: 'Kalender-Schicht', startsAt: at(5), endsAt: at(9), minStaff: 1, publish: true });
    expect(s.status).toBe(201);
    const l = await m1.get('/api/v1/calendar').query({ from: new Date().toISOString(), to: at(24 * 30) });
    expect(l.status).toBe(200);
    expect(l.body.items.some((x: { source: string; title: string }) => x.source === 'shiftplan' && x.title === 'Kalender-Schicht')).toBe(true);
    expect(await prisma.calendarEvent.count({ where: { title: 'Kalender-Schicht' } })).toBe(0);
    const only = await m1.get('/api/v1/calendar').query({ from: new Date().toISOString(), to: at(24 * 30), category: 'EXAM' });
    expect(only.body.items.every((x: { category: string }) => x.category === 'EXAM')).toBe(true);
    const up = await http().get('/api/v1/calendar/upcoming').set(bot);
    expect(up.status).toBe(200);
  });
});

describe('Besprechungen', () => {
  it('nur meetings.organize; Ankündigung in Discord mit Antwort-Buttons; Einladungen', async () => {
    const body = { title: 'Führungsrunde', startsAt: at(1), endsAt: at(2), participantIds: [ids.m1], mandatory: true, private: true, discordChannelId: '410000000000000001', agenda: '1. Lage\n2. Personal' };
    expect((await m1.post('/api/v1/meetings').send(body)).status).toBe(403);
    const r = await sup.post('/api/v1/meetings').send(body);
    expect(r.status).toBe(201);
    ids.meet = r.body.id; ids.meetEv = r.body.eventId;
    const post = await prisma.discordOutbox.findFirst({ where: { type: 'message.post', payload: { path: ['stateKey'], equals: `meeting-${ids.meetEv}` } } });
    expect(JSON.stringify(post?.payload)).toMatch(/meet:accept:/);
    expect(JSON.stringify(post?.payload)).not.toMatch(/everyone/);
    expect(await prisma.calendarEvent.count({ where: { id: ids.meetEv, category: 'MEETING' } })).toBe(1);
  });
  it('privates Protokoll: Organisator schreibt; Unbeteiligte sehen keinen Inhalt', async () => {
    const m = (await sup.get(`/api/v1/meetings/${ids.meet}`)).body;
    expect((await m2.patch(`/api/v1/meetings/${ids.meet}/minutes`).send({ notes: 'x', version: m.version })).status).toBe(403);
    const w = await sup.patch(`/api/v1/meetings/${ids.meet}/minutes`).send({ agenda: '1. Lage', notes: 'Vertrauliche Personalfrage X', decisions: 'Beschluss Y', version: m.version });
    expect(w.status).toBe(200);
    const other = await m2.get(`/api/v1/meetings/${ids.meet}`);
    expect(other.status).toBe(200);
    expect(other.body.minutes).toMatchObject({ notes: null, hidden: true });
    expect(JSON.stringify(other.body)).not.toMatch(/Vertrauliche/);
    expect((await lead.get(`/api/v1/meetings/${ids.meet}`)).body.minutes.notes).toMatch(/Vertrauliche/); // meetings.view_private
    const audit = await prisma.auditLog.findFirst({ where: { action: 'meetings.minutes', entityId: ids.meet } });
    expect(JSON.stringify(audit)).not.toMatch(/Vertrauliche/);
  });
  it('Anwesenheit, durchgeführt, Aufgaben, Export', async () => {
    expect((await sup.post(`/api/v1/meetings/${ids.meet}/conduct`)).status).toBe(409); // noch nicht begonnen
    await prisma.calendarEvent.update({ where: { id: ids.meetEv }, data: { startsAt: new Date(Date.now() - H / 2) } });
    expect((await sup.post(`/api/v1/calendar/${ids.meetEv}/attendance`).send({ entries: [{ userId: ids.m1, status: 'ATTENDED' }, { userId: ids.m2, status: 'ABSENT' }] })).status).toBe(200);
    expect((await m1.get(`/api/v1/meetings/${ids.meet}`)).body.minutes.notes).toMatch(/Vertrauliche/); // anwesend → darf lesen
    const c = await sup.post(`/api/v1/meetings/${ids.meet}/conduct`);
    expect(c.status).toBe(200);
    expect(c.body.conductedAt).toBeTruthy();
    expect((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ids.meetEv } })).status).toBe('DONE');
    const t = await sup.post(`/api/v1/meetings/${ids.meet}/tasks`).send({ title: 'Dienstplan überarbeiten', assigneeId: ids.m1, dueAt: at(72) });
    expect(t.status).toBe(201);
    const taskId = t.body.tasks[0].id;
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'meeting.task' } })).toBe(1);
    expect((await m2.patch(`/api/v1/meetings/tasks/${taskId}`).send({ status: 'DONE' })).status).toBe(403);
    expect((await m1.get('/api/v1/meetings/tasks')).body.map((x: { id: string }) => x.id)).toContain(taskId);
    expect((await m1.patch(`/api/v1/meetings/tasks/${taskId}`).send({ status: 'DONE' })).status).toBe(200);
    const csv = await sup.get(`/api/v1/meetings/${ids.meet}/participants.csv`);
    expect(csv.status).toBe(200);
    expect(csv.text).toMatch(/hc_m1;Anwesend/);
    expect(await prisma.auditLog.count({ where: { action: 'meetings.conducted', entityId: ids.meet } })).toBe(1);
  });
  it('Zusage über Discord-Button-Route (Bot im Namen des Benutzers)', async () => {
    const m = await sup.post('/api/v1/meetings').send({ title: 'Offene Runde', startsAt: at(10), endsAt: at(11) });
    const r = await http().post(`/api/v1/calendar/${m.body.eventId}/respond`).set(bot).send({ status: 'ACCEPTED' });
    expect(r.status).toBe(200);
    expect(r.body.myStatus).toBe('ACCEPTED');
  });
});
