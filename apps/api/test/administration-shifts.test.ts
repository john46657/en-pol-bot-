import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { localParts } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { NotifyService } from '../src/notifications/notify.service';
import { ShiftPlanService } from '../src/shiftplan/shiftplan.service';

const TOKEN = 'test-bot-token-shiftplan-0123456789-abcdef';
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, sup: Agent, lead: Agent, m1: Agent, m2: Agent;
const ids: Record<string, string> = {};
const H = 3_600_000;
const at = (h: number) => new Date(Date.now() + h * H).toISOString();
const http = () => request(app.getHttpServer());
const bot = (discordId: string) => ({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': discordId });
const D1 = '397310000000000001';

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'sp_admin', ['System Administrator']);
  ids.sup = (await makeUser(prisma, 'sp_sup', ['Police Member', 'Supervisor'])).id;
  ids.m1 = (await makeUser(prisma, 'sp_m1', ['Police Member'])).id;
  ids.m2 = (await makeUser(prisma, 'sp_m2', ['Police Member'])).id;
  ids.m3 = (await makeUser(prisma, 'sp_m3', ['Police Member'])).id;
  ids.lead = (await makeUser(prisma, 'sp_lead', ['Police Member', 'Police Administration'])).id;
  lead = (await login(app, 'sp_lead')).agent;
  admin = (await login(app, 'sp_admin')).agent; sup = (await login(app, 'sp_sup')).agent;
  m1 = (await login(app, 'sp_m1')).agent; m2 = (await login(app, 'sp_m2')).agent;
  await prisma.discordLink.create({ data: { userId: ids.m1!, discordId: D1 } });
});
afterAll(async () => {
  delete process.env.BOT_API_TOKEN;
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['leave.config', 'shiftplan.config', 'notifications.rules'] } } }); // andere Testdateien erwarten die Standardwerte
  await app.close();
});

const base = (h: number, extra: Record<string, unknown> = {}) => ({ name: 'Frühschicht', startsAt: at(h), endsAt: at(h + 4), minStaff: 1, maxStaff: 2, ...extra });

describe('Schichtplanung: Rechte, Entwürfe, Validierung', () => {
  it('nur shiftplan.manage plant; Entwürfe sieht nur die Planung', async () => {
    expect((await m1.post('/api/v1/shiftplan').send(base(48))).status).toBe(403);
    const r = await sup.post('/api/v1/shiftplan').send(base(48, { leaderId: ids.sup, department: 'Polizei' }));
    expect(r.status).toBe(201);
    ids.s1 = r.body.ids[0];
    const asMember = await m1.get('/api/v1/shiftplan');
    expect(asMember.status).toBe(200);
    expect(asMember.body.items.some((s: { id: string }) => s.id === ids.s1)).toBe(false);
    expect((await m1.get(`/api/v1/shiftplan/${ids.s1}`)).status).toBe(404);
    expect((await sup.get('/api/v1/shiftplan')).body.items.some((s: { id: string }) => s.id === ids.s1)).toBe(true);
  });
  it('ungültige Eingaben werden abgelehnt', async () => {
    expect((await sup.post('/api/v1/shiftplan').send(base(48, { endsAt: at(47) }))).status).toBe(400);
    expect((await sup.post('/api/v1/shiftplan').send(base(-10))).status).toBe(400);
    expect((await sup.post('/api/v1/shiftplan').send(base(48, { minStaff: 3, maxStaff: 2 }))).status).toBe(400);
    expect((await sup.post('/api/v1/shiftplan').send(base(48, { department: 'Gibt-es-nicht' }))).status).toBe(400);
    expect((await sup.post('/api/v1/shiftplan').send(base(48, { endsAt: at(80) }))).status).toBe(400);
  });
  it('veröffentlichen → sichtbar und Zugewiesene werden benachrichtigt', async () => {
    const pub = await sup.post(`/api/v1/shiftplan/${ids.s1}/publish`);
    expect(pub.status).toBe(200);
    expect(pub.body.status).toBe('PUBLISHED');
    expect((await sup.post(`/api/v1/shiftplan/${ids.s1}/publish`)).status).toBe(409);
    expect((await m1.get('/api/v1/shiftplan')).body.items.some((s: { id: string }) => s.id === ids.s1)).toBe(true);
  });
});

describe('Anmeldungen und Konflikte', () => {
  it('Anmeldung, doppelte Anmeldung, volle Schicht', async () => {
    const r = await m1.post(`/api/v1/shiftplan/${ids.s1}/signup`);
    expect(r.status).toBe(200);
    expect(r.body.assignees.map((a: { userId: string }) => a.userId)).toContain(ids.m1);
    expect((await m1.post(`/api/v1/shiftplan/${ids.s1}/signup`)).status).toBe(409);
    expect((await m2.post(`/api/v1/shiftplan/${ids.s1}/signup`)).status).toBe(200);
    const full = await sup.post(`/api/v1/shiftplan/${ids.s1}/assign`).send({ userIds: [ids.m3] });
    expect(full.status).toBe(409);
    expect(full.body.message).toMatch(/voll/);
    // Leiter wurde über Anmeldungen informiert
    expect(await prisma.notification.count({ where: { userId: ids.sup, event: 'shift.changed', entityId: ids.s1 } })).toBeGreaterThanOrEqual(1);
  });
  it('überlappende Schicht für dieselbe Person wird verhindert', async () => {
    const s2 = await sup.post('/api/v1/shiftplan').send(base(50, { name: 'Überlappend', publish: true }));
    expect(s2.status).toBe(201);
    ids.s2 = s2.body.ids[0];
    const c = await m1.post(`/api/v1/shiftplan/${ids.s2}/signup`);
    expect(c.status).toBe(409);
    expect(c.body.message).toMatch(/Frühschicht/);
  });
  it('abmelden bleibt in der Historie; erneute Anmeldung reaktiviert', async () => {
    expect((await m2.post(`/api/v1/shiftplan/${ids.s1}/withdraw`).send({ reason: 'krank' })).status).toBe(200);
    const row = await prisma.shiftAssignment.findUniqueOrThrow({ where: { shiftId_userId: { shiftId: ids.s1!, userId: ids.m2! } } });
    expect(row.status).toBe('WITHDRAWN');
    expect((await m2.post(`/api/v1/shiftplan/${ids.s1}/signup`)).status).toBe(200);
    expect((await prisma.shiftAssignment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('ACTIVE');
    expect(await prisma.auditLog.count({ where: { entityId: ids.s1, action: { in: ['shiftplan.signup', 'shiftplan.withdraw'] } } })).toBeGreaterThanOrEqual(3);
  });
  it('genehmigte Abwesenheit blockiert die Anmeldung (ohne Grund in der Meldung)', async () => {
    await prisma.leaveRequest.create({ data: { number: 'LOA-T-1', userId: ids.m3!, startsAt: new Date(Date.now() + 49 * H), endsAt: new Date(Date.now() + 60 * H), reason: 'Privat – sehr sensibel', status: 'APPROVED' } });
    const r = await m1.post(`/api/v1/shiftplan/${ids.s2}/signup`); // m1 ist verplant (s1) → Konflikt; m3 testen wir über assign
    expect(r.status).toBe(409);
    const a = await sup.post(`/api/v1/shiftplan/${ids.s2}/assign`).send({ userIds: [ids.m3] });
    expect(a.status).toBe(409);
    expect(a.body.message).toMatch(/abgemeldet/);
    expect(a.body.message).not.toMatch(/sensibel/);
  });
  it('Änderung melden geht an den Leiter', async () => {
    const r = await m1.post(`/api/v1/shiftplan/${ids.s1}/report`).send({ message: 'Komme 15 Minuten später' });
    expect(r.status).toBe(200);
    expect(r.body.delivered).toBe(1);
    expect((await m2.post(`/api/v1/shiftplan/${ids.s2}/report`).send({ message: 'nicht eingeteilt' })).status).toBe(403);
  });
});

describe('Bearbeiten, Absagen, Löschen, Kopieren, Wiederholung, Export', () => {
  it('Versionskonflikt und Benachrichtigung bei Zeitänderung', async () => {
    const cur = (await sup.get(`/api/v1/shiftplan/${ids.s1}`)).body;
    const upd = await sup.patch(`/api/v1/shiftplan/${ids.s1}`).send({ ...base(47), name: 'Frühschicht', leaderId: ids.sup, version: cur.version });
    expect(upd.status).toBe(200);
    expect((await sup.patch(`/api/v1/shiftplan/${ids.s1}`).send({ ...base(47), version: cur.version })).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'shift.changed', entityId: ids.s1 } })).toBe(1);
  });
  it('Löschen nur ohne Nachweise; sonst absagen (Historie bleibt)', async () => {
    expect((await sup.delete(`/api/v1/shiftplan/${ids.s1}`)).status).toBe(409);
    const d = await sup.post('/api/v1/shiftplan').send(base(100, { name: 'Wegwerf' }));
    expect((await sup.delete(`/api/v1/shiftplan/${d.body.ids[0]}`)).status).toBe(200);
    const c = await sup.post(`/api/v1/shiftplan/${ids.s2}/cancel`).send({ reason: 'Zu wenig Personal' });
    expect(c.status).toBe(200);
    expect(c.body.status).toBe('CANCELLED');
    expect(await prisma.plannedShift.count({ where: { id: ids.s2 } })).toBe(1);
  });
  it('kopieren und wiederkehrend planen (gleiche lokale Uhrzeit)', async () => {
    const cp = await sup.post(`/api/v1/shiftplan/${ids.s1}/copy`).send({ startsAt: at(24 * 9) });
    expect(cp.status).toBe(201);
    const copy = await prisma.plannedShift.findUniqueOrThrow({ where: { id: cp.body.ids[0] }, include: { assignments: true } });
    expect(copy.status).toBe('DRAFT');
    expect(copy.assignments).toHaveLength(0);
    const rec = await sup.post('/api/v1/shiftplan').send(base(24 * 3, { name: 'Serie', recurrence: { freq: 'WEEKLY', count: 4 } }));
    expect(rec.status).toBe(201);
    expect(rec.body.created).toBe(4);
    const series = await prisma.plannedShift.findMany({ where: { seriesId: rec.body.seriesId }, orderBy: { startsAt: 'asc' } });
    expect(new Set(series.map((s) => `${localParts(s.startsAt).h}:${localParts(s.startsAt).min}`)).size).toBe(1);
  });
  it('CSV-Export', async () => {
    const r = await sup.get('/api/v1/shiftplan/export');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.text).toMatch(/Frühschicht/);
  });
});

describe('MDT und Leitstelle', () => {
  it('MDT: aktuelle Schicht mit Leiter', async () => {
    const ok = await sup.post('/api/v1/shiftplan').send({ name: 'Jetzt', startsAt: at(0.01), endsAt: at(3), leaderId: ids.sup, unit: 'Adam-10', minStaff: 2, maxStaff: 4, assigneeIds: [ids.m2], publish: true });
    expect(ok.status).toBe(201);
    ids.now = ok.body.ids[0];
    await prisma.plannedShift.update({ where: { id: ids.now }, data: { startsAt: new Date(Date.now() - H) } }); // läuft schon
    const cur = await m2.get('/api/v1/shiftplan/current');
    expect(cur.status).toBe(200);
    expect(cur.body.current).toMatchObject({ name: 'Jetzt', leaderName: 'sp_sup', unit: 'Adam-10' });
  });
  it('Leitstelle: geplant vs. im Dienst vs. abwesend – ohne Grund', async () => {
    await prisma.shiftAssignment.create({ data: { shiftId: ids.now!, userId: ids.m3!, source: 'ASSIGNED' } });
    await prisma.leaveRequest.update({ where: { number: 'LOA-T-1' }, data: { startsAt: new Date(Date.now() - H) } });
    await prisma.dutySession.create({ data: { userId: ids.m2!, status: 'ON_DUTY' } });
    await prisma.dutySession.create({ data: { userId: ids.m1!, status: 'ON_DUTY' } });
    const r = await sup.get('/api/v1/shiftplan/staffing');
    expect(r.status).toBe(200);
    const s = r.body.shifts.find((x: { id: string }) => x.id === ids.now);
    expect(s.plannedPresent.map((u: { userId: string }) => u.userId)).toEqual([ids.m2]);
    expect(s.plannedAbsent.map((u: { userId: string }) => u.userId)).toEqual([ids.m3]);
    expect(r.body.unplannedOnDuty.map((u: { userId: string }) => u.userId)).toContain(ids.m1);
    expect(JSON.stringify(r.body)).not.toMatch(/sensibel/);
  });
  it('Hintergrund: Erinnerung genau einmal, vergangene Schichten werden abgeschlossen', async () => {
    const svc = app.get(ShiftPlanService);
    const soon = await sup.post('/api/v1/shiftplan').send({ name: 'Gleich', startsAt: at(0.5), endsAt: at(2), minStaff: 1, assigneeIds: [ids.sup], publish: true });
    expect(soon.status).toBe(201);
    await svc.tick(); await svc.tick();
    expect(await prisma.notification.count({ where: { userId: ids.sup, event: 'calendar.reminder', entityId: soon.body.ids[0] } })).toBe(1);
    await prisma.plannedShift.update({ where: { id: soon.body.ids[0] }, data: { startsAt: new Date(Date.now() - 3 * H), endsAt: new Date(Date.now() - H) } });
    await svc.tick();
    expect((await prisma.plannedShift.findUniqueOrThrow({ where: { id: soon.body.ids[0] } })).status).toBe('COMPLETED');
  });
});

describe('Discord (Bot im Namen des Benutzers)', () => {
  it('Schichtplan ansehen/anmelden erlaubt, planen nicht', async () => {
    expect((await http().get('/api/v1/shiftplan/mine').set(bot(D1))).status).toBe(200);
    expect((await http().post('/api/v1/shiftplan').set(bot(D1)).send(base(200))).status).toBe(403);
  });
});

describe('Abwesenheit: Prüfung, Benachrichtigung, Schutz des Grundes', () => {
  it('In Prüfung → genehmigt; Leitung erfährt Schichtkonflikt; Log ohne Grund', async () => {
    await admin.put('/api/v1/leave/config').send({ enabled: true, logChannelId: '400000000000000001', roleIds: [], maxDays: 30 });
    const s = await sup.post('/api/v1/shiftplan').send({ name: 'Spät', startsAt: at(72), endsAt: at(78), leaderId: ids.sup, minStaff: 1, assigneeIds: [ids.m1], publish: true });
    expect(s.status).toBe(201);
    const req = await m1.post('/api/v1/leave').send({ startsAt: at(70), endsAt: at(80), reason: 'Arzttermin vertraulich' });
    expect(req.status).toBe(201);
    expect(await prisma.notification.count({ where: { event: 'leave.requested', entityId: req.body.id } })).toBeGreaterThanOrEqual(1);
    expect((await m1.post(`/api/v1/leave/${req.body.id}/review`)).status).toBe(403);
    expect((await sup.post(`/api/v1/leave/${req.body.id}/review`)).status).toBe(403); // Schichtleitung ohne leave.manage
    const rv = await lead.post(`/api/v1/leave/${req.body.id}/review`);
    expect(rv.status).toBe(200);
    expect(rv.body).toMatchObject({ status: 'IN_REVIEW', reviewerName: 'sp_lead' });
    expect((await admin.post(`/api/v1/leave/${req.body.id}/review`)).status).toBe(409);
    const d = await admin.post(`/api/v1/leave/${req.body.id}/decision`).send({ status: 'APPROVED' });
    expect(d.status).toBe(200);
    expect(await prisma.notification.count({ where: { userId: ids.m1, event: 'leave.approved' } })).toBe(1);
    const conflict = await prisma.notification.findFirst({ where: { userId: ids.sup, event: 'shift.changed', entityId: s.body.ids[0] } });
    expect(conflict?.title).toMatch(/abgemeldet/);
    expect(conflict?.title).not.toMatch(/Arzt/);
    // Zuweisung bleibt bestehen (nichts wird automatisch geändert)
    expect((await prisma.shiftAssignment.findFirstOrThrow({ where: { shiftId: s.body.ids[0], userId: ids.m1 } })).status).toBe('ACTIVE');
    const logs = await prisma.discordOutbox.findMany({ where: { type: 'leave.log' } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs.map((l) => l.payload))).not.toMatch(/Arzttermin/);
  });
});

describe('Zentrale Benachrichtigungen', () => {
  it('Dubletten-Schutz und DM nur mit Zustimmung', async () => {
    const n = app.get(NotifyService);
    const before = await prisma.discordOutbox.count({ where: { type: 'bot.dm' } });
    expect(await n.emit('calendar.changed', [ids.m1!], { title: 'Test A', dedupeKey: 'x1' })).toBe(1);
    expect(await n.emit('calendar.changed', [ids.m1!], { title: 'Test A', dedupeKey: 'x1' })).toBe(0);
    expect(await prisma.discordOutbox.count({ where: { type: 'bot.dm' } })).toBe(before); // keine Zustimmung → keine DM
    const p = await m1.put('/api/v1/notifications/preferences').send({ dm: true, muted: [], important: [], dmEvents: [], reminders: true });
    expect(p.status).toBe(200);
    expect((await m1.get('/api/v1/notifications/preferences')).body).toMatchObject({ dm: true, discordLinked: true });
    expect(await n.emit('calendar.changed', [ids.m1!], { title: 'Test B', dedupeKey: 'x2', body: 'geheim' })).toBe(1);
    const dms = await prisma.discordOutbox.findMany({ where: { type: 'bot.dm' }, orderBy: { createdAt: 'desc' }, take: 1 });
    expect(dms).toHaveLength(1);
    expect(JSON.stringify(dms[0]!.payload)).toMatch(/Test B/);
    expect(JSON.stringify(dms[0]!.payload)).not.toMatch(/geheim/); // body nie in der DM
    // andere persönliche Einstellungen bleiben erhalten
    const prefs = await m1.get('/api/v1/me/preferences');
    expect(prefs.body.preferences.notifications.dm).toBe(true);
  });
  it('stumm geschaltet, Feed für MDT/Leitstelle, unbekannte Ereignisse abgelehnt, Regeln nur mit Recht', async () => {
    await m1.put('/api/v1/notifications/preferences').send({ dm: false, muted: ['meeting.task'], important: [], dmEvents: [], reminders: true });
    const n = app.get(NotifyService);
    expect(await n.emit('meeting.task', [ids.m1!], { title: 'stumm' })).toBe(0);
    expect((await m1.put('/api/v1/notifications/preferences').send({ muted: ['gibt.es.nicht'] })).status).toBe(400);
    const feed = await m1.get('/api/v1/notifications/feed?scope=cad');
    expect(feed.status).toBe(200);
    expect(feed.body.items.every((i: { event: string | null }) => ['shift.changed', 'calendar.changed', 'meeting.reminder', 'announcement.new', 'system.error', 'connection.problem'].includes(i.event ?? ''))).toBe(true);
    expect((await m1.put('/api/v1/notifications/rules').send({ disabled: [] })).status).toBe(403);
    expect((await admin.put('/api/v1/notifications/rules').send({ disabled: ['calendar.changed'] })).status).toBe(200);
    expect(await n.emit('calendar.changed', [ids.m1!], { title: 'aus', dedupeKey: 'x3' })).toBe(0);
    await admin.put('/api/v1/notifications/rules').send({ disabled: [] });
    const list = await m1.get('/api/v1/notifications?filter=all&group=Schichtplanung');
    expect(list.status).toBe(200);
    expect(list.body.items.every((i: { event: string }) => i.event.startsWith('shift.'))).toBe(true);
  });
});
