import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, PASSWORD } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
let http: Awaited<ReturnType<typeof createTestApp>>['http'];

beforeAll(async () => {
  const t = await createTestApp();
  app = t.app; prisma = t.prisma; http = t.http;
  await makeUser(prisma, 'officer', ['Police Member']);
  await makeUser(prisma, 'nobody', []);
  await makeUser(prisma, 'admin', ['System Administrator']);
  await makeUser(prisma, 'sup', ['Police Member', 'Supervisor']);
});
afterAll(async () => { await app.close(); });

describe('auth', () => {
  it('rejects unauthenticated requests with standard error format', async () => {
    const res = await http().get('/api/v1/persons');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(res.body.requestId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });
  it('logs in, returns profile + sets httpOnly cookie, and logs out (session invalidated)', async () => {
    const { agent, res } = await login(app, 'officer');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect(res.body.passwordHash).toBeUndefined();
    expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    expect((await agent.post('/api/v1/auth/logout')).status).toBe(204);
    const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;
    const replay = await http().get('/api/v1/auth/me').set('Cookie', cookie);
    expect(replay.status).toBe(401);
  });
  it('own password change (old password required, other sessions end) and own session management', async () => {
    await makeUser(prisma, 'pwuser', ['Police Member']);
    const a = (await login(app, 'pwuser')).agent;
    const b = (await login(app, 'pwuser')).agent;
    const c = (await login(app, 'pwuser')).agent;
    const list = (await a.get('/api/v1/auth/sessions')).body as { id: string; current: boolean }[];
    expect(list).toHaveLength(3);
    expect(list.filter((x) => x.current)).toHaveLength(1);
    // eine bestimmte Sitzung beenden, die aktuelle nicht
    const other = list.find((x) => !x.current)!;
    expect((await a.post('/api/v1/auth/sessions/revoke').send({ sessionId: list.find((x) => x.current)!.id })).status).toBe(400);
    expect((await a.post('/api/v1/auth/sessions/revoke').send({ sessionId: other.id })).body.revoked).toBe(1);
    expect((await a.get('/api/v1/auth/sessions')).body).toHaveLength(2);
    // Passwort: falsches altes / zu kurzes neues abgelehnt
    expect((await a.put('/api/v1/auth/password').send({ current: 'wrong-password-1', next: 'brand-new-password-42' })).status).toBe(400);
    expect((await a.put('/api/v1/auth/password').send({ current: PASSWORD, next: 'short' })).status).toBe(400);
    expect((await a.put('/api/v1/auth/password').send({ current: PASSWORD, next: 'brand-new-password-42' })).status).toBe(204);
    expect((await a.get('/api/v1/auth/me')).status).toBe(200); // aktuelle Sitzung bleibt
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
    expect((await c.get('/api/v1/auth/me')).status).toBe(401);
    expect((await login(app, 'pwuser')).res.status).toBe(401);
    expect((await login(app, 'pwuser', 'brand-new-password-42')).res.status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'auth.password.change' } })).toBe(1);
  });
  it('admin resets another account\'s password (sessions end), never their own or a higher rank', async () => {
    await makeUser(prisma, 'pwtarget', ['Police Member']);
    const adm = (await login(app, 'admin')).agent;
    const sup = (await login(app, 'sup')).agent;
    const t = (await login(app, 'pwtarget')).agent;
    const target = await prisma.user.findUniqueOrThrow({ where: { username: 'pwtarget' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect((await sup.put(`/api/v1/users/${target.id}/password`).send({ password: 'reset-password-123' })).status).toBe(403);
    expect((await adm.put(`/api/v1/users/${admin.id}/password`).send({ password: 'reset-password-123' })).status).toBe(409);
    expect((await adm.put(`/api/v1/users/${target.id}/password`).send({ password: 'short' })).status).toBe(400);
    expect((await adm.put(`/api/v1/users/${target.id}/password`).send({ password: 'reset-password-123' })).status).toBe(204);
    expect((await t.get('/api/v1/auth/me')).status).toBe(401);
    expect((await login(app, 'pwtarget', 'reset-password-123')).res.status).toBe(200);
  });
  it('rejects wrong password, records history + security event, locks after repeated failures', async () => {
    await makeUser(prisma, 'victim', ['Police Member']);
    for (let i = 0; i < 5; i++) expect((await login(app, 'victim', 'wrong-password-x')).res.status).toBe(401);
    expect((await login(app, 'victim')).res.status).toBe(401); // locked, even with correct password
    expect(await prisma.securityEvent.count({ where: { type: 'LOGIN_FAILURE' } })).toBeGreaterThanOrEqual(5);
    expect(await prisma.loginHistory.count({ where: { username: 'victim', success: false } })).toBeGreaterThanOrEqual(5);
  });
  it('never stores plaintext passwords', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'officer' } });
    expect(u.passwordHash).not.toContain(PASSWORD);
    expect(u.passwordHash.startsWith('scrypt$')).toBe(true);
  });
});

describe('authorization (mandatory tests 1-3, 8)', () => {
  it('1: user without permission gets 403', async () => {
    const { agent } = await login(app, 'nobody');
    const res = await agent.get('/api/v1/persons');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });
  it('2: user with permission may act', async () => {
    const { agent } = await login(app, 'officer');
    expect((await agent.get('/api/v1/persons')).status).toBe(200);
  });
  it('police member cannot view audit logs or manage permissions', async () => {
    const { agent } = await login(app, 'officer');
    expect((await agent.get('/api/v1/audit')).status).toBe(403);
    expect((await agent.get('/api/v1/roles')).status).toBe(403);
  });
  it('3: user DENY overrides role ALLOW; user ALLOW grants beyond role', async () => {
    const adminLogin = await login(app, 'admin');
    const target = await makeUser(prisma, 'target', ['Police Member']);
    const { agent } = await login(app, 'target');
    expect((await agent.get('/api/v1/vehicles')).status).toBe(200);

    const deny = await adminLogin.agent.put(`/api/v1/users/${target.id}/overrides`).send({ permission: 'vehicles.view', effect: 'DENY', reason: 'test' });
    expect(deny.status).toBe(200);
    expect((await agent.get('/api/v1/vehicles')).status).toBe(403);

    const allow = await adminLogin.agent.put(`/api/v1/users/${target.id}/overrides`).send({ permission: 'audit.view', effect: 'ALLOW' });
    expect(allow.status).toBe(200);
    expect((await agent.get('/api/v1/audit')).status).toBe(200);

    expect((await adminLogin.agent.delete(`/api/v1/users/${target.id}/overrides/vehicles.view`)).status).toBe(204);
    expect((await agent.get('/api/v1/vehicles')).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['user.override.add', 'user.override.remove'] }, entityId: target.id } })).toBe(3);
  });
  it('8: audit log cannot be modified or deleted, even at DB level', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow();
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow();
    const { agent } = await login(app, 'admin');
    expect((await agent.delete(`/api/v1/audit/${row.id}`)).status).toBe(404);
  });
  it('audit list filters by free text, user and time range', async () => {
    const { agent } = await login(app, 'admin');
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
    const all = (await agent.get('/api/v1/audit?pageSize=500')).body.total as number;
    const mine = (await agent.get(`/api/v1/audit?actorUserId=${admin.id}`)).body;
    expect(mine.items.every((x: { actorUserId: string }) => x.actorUserId === admin.id)).toBe(true);
    expect((await agent.get('/api/v1/audit?q=override')).body.items.every((x: { action: string; reason: string | null }) => /override/i.test(x.action) || /override/i.test(x.reason ?? ''))).toBe(true);
    expect((await agent.get(`/api/v1/audit?from=${new Date(Date.now() + 86_400_000).toISOString()}`)).body.total).toBe(0);
    expect((await agent.get('/api/v1/audit?from=2000-01-01')).body.total).toBe(all);
  });
  it('rejects mutating requests from foreign origins (CSRF)', async () => {
    const { agent } = await login(app, 'officer');
    const res = await agent.post('/api/v1/persons').set('Origin', 'https://evil.example').send({ robloxUsername: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ORIGIN_REJECTED');
  });
});

describe('roblox user id (mandatory test 14)', () => {
  it('admin can set a Roblox user id manually; status MANUAL; validated; audited', async () => {
    const { agent } = await login(app, 'admin');
    const u = await makeUser(prisma, 'rbx', ['Police Member']);
    const bad = await agent.put(`/api/v1/users/${u.id}/roblox`).send({ robloxUserId: 'abc' });
    expect(bad.status).toBe(400);
    const ok = await agent.put(`/api/v1/users/${u.id}/roblox`).send({ robloxUserId: '123456789', robloxUsername: 'RbxName' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ robloxUserId: '123456789', robloxStatus: 'MANUAL' });
    expect(await prisma.auditLog.count({ where: { action: 'user.roblox.set', entityId: u.id } })).toBe(1);
    const dup = await makeUser(prisma, 'rbx2', []);
    expect((await agent.put(`/api/v1/users/${dup.id}/roblox`).send({ robloxUserId: '123456789' })).status).toBe(409);
  });
  it('normal officers cannot set roblox ids', async () => {
    const { agent } = await login(app, 'officer');
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'nobody' } });
    expect((await agent.put(`/api/v1/users/${u.id}/roblox`).send({ robloxUserId: '5' })).status).toBe(403);
  });
});

describe('persons / vehicles / tickets (mandatory tests 4, 6, 7)', () => {
  it('persons: create, duplicate roblox id conflicts, optimistic locking', async () => {
    const { agent } = await login(app, 'officer');
    const c = await agent.post('/api/v1/persons').send({ robloxUsername: 'Alice', robloxUserId: '1001' });
    expect(c.status).toBe(201);
    const dup = await agent.post('/api/v1/persons').send({ robloxUsername: 'Alice2', robloxUserId: '1001' });
    expect(dup.status).toBe(409);
    const soft = await agent.post('/api/v1/persons').send({ robloxUsername: 'alice' });
    expect(soft.status).toBe(201);
    expect(soft.body.possibleDuplicates.length).toBeGreaterThan(0); // Hinweis, kein Auto-Merge
    expect(await prisma.person.count({ where: { robloxUsername: { equals: 'alice', mode: 'insensitive' } } })).toBe(2);
  });
  it('persons: stale version update is rejected', async () => {
    const { agent } = await login(app, 'sup');
    const { agent: officer } = await login(app, 'officer');
    const p = (await officer.post('/api/v1/persons').send({ robloxUsername: 'Locky' })).body.person;
    const adm = await login(app, 'admin');
    expect((await adm.agent.patch(`/api/v1/persons/${p.id}`).send({ version: p.version, notes: 'a' })).status).toBe(200);
    expect((await adm.agent.patch(`/api/v1/persons/${p.id}`).send({ version: p.version, notes: 'b' })).status).toBe(409);
    void agent;
  });
  it('vehicles: create with owner, duplicate plate conflicts', async () => {
    const { agent } = await login(app, 'officer');
    const owner = (await agent.post('/api/v1/persons').send({ robloxUsername: 'Owner1', robloxUserId: '2002' })).body.person;
    const v = await agent.post('/api/v1/vehicles').send({ plate: 'ab 123', model: 'Falcon', ownerId: owner.id });
    expect(v.status).toBe(201);
    expect(v.body.plate).toBe('AB123');
    expect((await agent.post('/api/v1/vehicles').send({ plate: 'AB123' })).status).toBe(409);
  });
  it('4/6/7: ticket auto-links person and writes timeline + audit + notification; void needs permission + reason', async () => {
    const { agent } = await login(app, 'officer');
    const person = (await agent.post('/api/v1/persons').send({ robloxUsername: 'Speedy', robloxUserId: '3003' })).body.person;
    const code = await prisma.legalCode.create({ data: { code: 'T-TEST', title: 'Speeding', category: 'Traffic', penalty: { fine: 300 } } });
    const t = await agent.post('/api/v1/tickets').send({ personId: person.id, legalCodeId: code.id, reason: 'Speeding 120 in 60' });
    expect(t.status).toBe(201);
    expect(Number(t.body.amount)).toBe(300);
    expect(await prisma.recordLink.count({ where: { personId: person.id, entityType: 'Ticket', entityId: t.body.id } })).toBe(1);
    expect(await prisma.timelineEvent.count({ where: { entityType: 'Person', entityId: person.id, action: 'ticket.created' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ticket.create', entityId: t.body.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { entityId: t.body.id } })).toBe(1);
    const overview = await agent.get(`/api/v1/persons/${person.id}`);
    expect(overview.body.tickets).toHaveLength(1);

    expect((await agent.post(`/api/v1/tickets/${t.body.id}/void`).send({ reason: 'mistake' })).status).toBe(403);
    const sup = await login(app, 'sup');
    expect((await sup.agent.post(`/api/v1/tickets/${t.body.id}/void`).send({})).status).toBe(400);
    expect((await sup.agent.post(`/api/v1/tickets/${t.body.id}/void`).send({ reason: 'mistake' })).status).toBe(201);
    expect((await sup.agent.post(`/api/v1/tickets/${t.body.id}/void`).send({ reason: 'again' })).status).toBe(409);
  });
  it('ticket creation rolls back completely on failure', async () => {
    const { agent } = await login(app, 'officer');
    const before = { t: await prisma.ticket.count(), a: await prisma.auditLog.count(), tl: await prisma.timelineEvent.count() };
    const res = await agent.post('/api/v1/tickets').send({ personId: '00000000-0000-4000-8000-000000000000', reason: 'ghost' });
    expect(res.status).toBe(404);
    expect({ t: await prisma.ticket.count(), a: await prisma.auditLog.count(), tl: await prisma.timelineEvent.count() }).toEqual(before);
  });
});

describe('health', () => {
  it('health and readiness are public', async () => {
    expect((await http().get('/health')).status).toBe(200);
    const r = await http().get('/readiness');
    expect(r.status).toBe(200);
    expect(r.body.checks.database).toBe('ok');
  });
});

describe('same-origin and single-process web serving', () => {
  it('accepts a mutating request whose Origin equals the Host (same-origin) but still rejects foreign origins', async () => {
    const { agent } = await login(app, 'officer');
    const host = 'nexus.example.test:8443';
    const ok = await agent.post('/api/v1/persons').set('Host', host).set('Origin', `http://${host}`).send({ robloxUsername: 'SameOriginGuy' });
    expect(ok.status).toBe(201);
    expect((await agent.post('/api/v1/persons').set('Host', host).set('Origin', 'https://evil.example').send({ robloxUsername: 'x1' })).status).toBe(403);
    expect((await agent.post('/api/v1/persons').set('Host', host).set('Origin', 'http://nexus.example.test:9999').send({ robloxUsername: 'x2' })).status).toBe(403); // anderer Port = andere Origin
  });
});
