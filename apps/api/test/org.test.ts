import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
const ids: Record<string, string> = {};
const uid = (n: string) => ids[n] as string;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  for (const [n, roles] of Object.entries({ g_admin: ['System Administrator'], g_off: ['Police Member'], g_off2: ['Police Member'], g_hr: ['Police Member', 'Police Administration'], g_none: [] as string[] })) ids[n] = (await makeUser(prisma, n, roles)).id;
});
afterAll(async () => { await app.close(); });

describe('personnel', () => {
  it('is hidden from officers, writes audit on read, protects own rank, tracks promotions', async () => {
    const hr = (await login(app, 'g_hr')).agent;
    const off = (await login(app, 'g_off')).agent;
    expect((await off.get('/api/v1/personnel')).status).toBe(403);
    const p = (await hr.post('/api/v1/personnel').send({ userId: uid("g_off"), rank: 'Officer', callsign: 'a-12' })).body;
    expect(p.callsign).toBe('A-12');
    expect((await hr.post('/api/v1/personnel').send({ userId: uid("g_off") })).status).toBe(409);
    expect((await hr.get(`/api/v1/personnel/${p.id}`)).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'personnel.read', entityId: p.id } })).toBe(1);
    expect((await hr.post(`/api/v1/personnel/${p.id}/promote`).send({ rank: 'Senior Officer', reason: 'Good work' })).status).toBe(201);
    expect((await hr.get(`/api/v1/personnel/${p.id}`)).body.records[0].summary).toBe('Officer → Senior Officer');
    const self = (await hr.post('/api/v1/personnel').send({ userId: uid("g_hr"), rank: 'Chief' })).body;
    expect((await hr.post(`/api/v1/personnel/${self.id}/promote`).send({ rank: 'Commissioner', reason: 'self' })).status).toBe(409);
    expect(await prisma.notification.count({ where: { userId: uid("g_off"), type: 'PERSONNEL' } })).toBe(1);
  });
});

describe('duty', () => {
  it('tracks explicit duty status sessions', async () => {
    const off = (await login(app, 'g_off')).agent;
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY' })).status).toBe(200);
    expect((await off.put('/api/v1/team/me/status').send({ status: 'ON_DUTY' })).status).toBe(409);
    expect((await off.get('/api/v1/team')).body.some((s: { userId: string }) => s.userId === uid("g_off"))).toBe(true);
    await off.put('/api/v1/team/me/status').send({ status: 'BREAK' });
    await off.put('/api/v1/team/me/status').send({ status: 'OFF_DUTY' });
    expect(await prisma.dutySession.count({ where: { userId: uid("g_off"), endedAt: null } })).toBe(0);
    expect(await prisma.dutySession.count({ where: { userId: uid("g_off") } })).toBe(2);
  });
});

describe('applications', () => {
  it('accepts public submissions validated against the form, blocks duplicates, separates review/decide', async () => {
    const http = () => request(app.getHttpServer());
    const full = { experience: 'a', availability: 'b', motivation: 'c', roleplayKnowledge: 'd', erlcKnowledge: 'e' };
    expect((await http().post('/api/v1/applications').send({ robloxUsername: 'Applicant', answers: { experience: 'only this' } })).status).toBe(400);
    const ok = await http().post('/api/v1/applications').send({ robloxUsername: 'Applicant', robloxUserId: '777', answers: full });
    expect(ok.status).toBe(201);
    expect((await http().post('/api/v1/applications').send({ robloxUsername: 'Applicant', robloxUserId: '777', answers: full })).status).toBe(409);
    const hr = (await login(app, 'g_hr')).agent;
    const off = (await login(app, 'g_off')).agent;
    expect((await off.get('/api/v1/applications')).status).toBe(403);
    const a = (await hr.get('/api/v1/applications?q=Applicant')).body.items[0];
    expect((await hr.put(`/api/v1/applications/${a.id}/status`).send({ status: 'ACCEPTED', reason: 'skip' })).status).toBe(400);
    expect((await hr.put(`/api/v1/applications/${a.id}/status`).send({ status: 'INTERVIEW' })).status).toBe(409);
    for (const s of ['SCREENING', 'INTERVIEW', 'PENDING_DECISION']) expect((await hr.put(`/api/v1/applications/${a.id}/status`).send({ status: s })).status).toBe(200);
    expect((await hr.post(`/api/v1/applications/${a.id}/decide`).send({ accept: true })).status).toBe(400);
    expect((await hr.post(`/api/v1/applications/${a.id}/decide`).send({ accept: true, reason: 'Great interview' })).status).toBe(201);
  });
});

describe('academy', () => {
  it('computes pass/fail server-side and adds qualification', async () => {
    const hr = (await login(app, 'g_hr')).agent;
    const adm = (await login(app, 'g_admin')).agent;
    const pers = (await adm.post('/api/v1/personnel').send({ userId: uid("g_off2") })).body;
    const course = (await adm.post('/api/v1/academy/courses').send({ title: 'Traffic Stops', passScore: 70 })).body;
    const en = (await adm.post(`/api/v1/academy/courses/${course.id}/enroll`).send({ personnelId: pers.id })).body;
    expect((await adm.post(`/api/v1/academy/enrollments/${en.id}/grade`).send({ score: 50 })).body.passed).toBe(false);
    expect((await adm.post(`/api/v1/academy/enrollments/${en.id}/grade`).send({ score: 85 })).body.passed).toBe(true);
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: pers.id } })).qualifications).toEqual(['Traffic Stops']);
    void hr;
  });
});

describe('notifications', () => {
  it('only exposes own notifications, supports read/archive', async () => {
    await prisma.notification.createMany({ data: [{ userId: uid("g_off"), type: 'X', title: 'mine' }, { userId: uid("g_off2"), type: 'X', title: 'theirs' }] });
    const off = (await login(app, 'g_off')).agent;
    const list = (await off.get('/api/v1/notifications?filter=all&pageSize=100')).body;
    expect(list.items.every((n: { userId: string }) => n.userId === uid("g_off"))).toBe(true);
    const other = await prisma.notification.findFirstOrThrow({ where: { userId: uid("g_off2") } });
    expect((await off.post(`/api/v1/notifications/${other.id}/read`)).body.updated).toBe(0);
    expect((await off.post('/api/v1/notifications/read-all')).status).toBe(200);
    expect((await off.get('/api/v1/notifications')).body.unread).toBe(0);
  });
});

describe('search (mandatory test 13)', () => {
  it('returns only records the user may see and leaks nothing otherwise', async () => {
    const adm = (await login(app, 'g_admin')).agent;
    const off = (await login(app, 'g_off')).agent;
    const none = (await login(app, 'g_none')).agent;
    await adm.post('/api/v1/persons').send({ robloxUsername: 'Zebrafinch', robloxUserId: '9090' });
    await adm.post('/api/v1/investigations').send({ title: 'Zebrafinch smuggling ring' });
    const forAdmin = (await adm.get('/api/v1/search?q=zebrafinch')).body.results;
    expect(forAdmin.map((r: { type: string }) => r.type).sort()).toEqual(['investigation', 'person']);
    const forOfficer = (await off.get('/api/v1/search?q=zebrafinch')).body.results;
    expect(forOfficer.map((r: { type: string }) => r.type)).toEqual(['person']); // no investigations.view
    expect((await off.get('/api/v1/search?q=9090')).body.results).toHaveLength(1); // roblox id
    expect((await none.get('/api/v1/search?q=zebrafinch')).body.results).toEqual([]);
  });
  it('does not reveal other officers’ draft reports', async () => {
    const adm = (await login(app, 'g_admin')).agent;
    const off = (await login(app, 'g_off')).agent;
    await adm.post('/api/v1/reports').send({ type: 'GENERAL', title: 'Quokka secret draft', content: { a: 1 } });
    // admin holds reports.review so sees it; officer must not
    expect((await adm.get('/api/v1/search?q=quokka')).body.results).toHaveLength(1);
    expect((await off.get('/api/v1/search?q=quokka')).body.results).toHaveLength(0);
  });
});

describe('communication', () => {
  it('enforces channel permissions server-side and supports reply/pin/delete', async () => {
    const off = (await login(app, 'g_off')).agent;
    const adm = (await login(app, 'g_admin')).agent;
    const m = await off.post('/api/v1/communication/channels/TEAM/messages').send({ body: 'hello team' });
    expect(m.status).toBe(201);
    expect((await off.post('/api/v1/communication/channels/TEAM/messages').send({ body: 're', replyToId: m.body.id })).status).toBe(201);
    expect((await off.get('/api/v1/communication/channels/SUPERVISOR/messages')).status).toBe(403);
    expect((await off.get('/api/v1/communication/channels/DISPATCH/messages')).status).toBe(200);
    expect((await off.post('/api/v1/communication/channels/ANNOUNCEMENT/messages').send({ body: 'fake announcement' })).status).toBe(403);
    expect((await adm.post('/api/v1/communication/channels/ANNOUNCEMENT/messages').send({ body: 'real' })).status).toBe(201);
    expect((await off.get('/api/v1/communication/channels/BOGUS/messages')).status).toBe(400);
    expect((await off.post(`/api/v1/communication/messages/${m.body.id}/pin`)).status).toBe(403);
    expect((await adm.post(`/api/v1/communication/messages/${m.body.id}/pin`)).body.pinned).toBe(true);
    expect((await off.post(`/api/v1/communication/messages/${m.body.id}/delete`)).status).toBe(201);
    expect((await off.get('/api/v1/communication/channels/TEAM/messages?q=hello')).body).toHaveLength(0);
  });
});

describe('analytics', () => {
  it('gates metrics by permission', async () => {
    const adm = (await login(app, 'g_admin')).agent;
    const hr = (await login(app, 'g_hr')).agent;
    const off = (await login(app, 'g_off')).agent;
    expect((await off.get('/api/v1/analytics/overview')).status).toBe(403);
    const a = (await adm.get('/api/v1/analytics/overview')).body;
    expect(a.personnel).toBeDefined();
    expect(a.incidents).toBeDefined();
    const h = (await hr.get('/api/v1/analytics/overview')).body;
    expect(h.personnel).toBeDefined();
    expect(h.reports).toBeUndefined(); // no reports.review
    await prisma.userPermissionOverride.create({ data: { userId: uid("g_off"), permissionKey: 'analytics.view', effect: 'ALLOW' } });
    const o = (await off.get('/api/v1/analytics/overview')).body;
    expect(o.personnel).toBeUndefined(); // sensitive staff stats stay hidden
    expect(o.incidents).toBeDefined();
  });
});
