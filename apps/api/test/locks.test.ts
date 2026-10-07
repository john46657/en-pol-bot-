import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'lk_a', ['Police Member', 'Senior Officer']);
  await makeUser(prisma, 'lk_b', ['Police Member', 'Senior Officer']);
  await makeUser(prisma, 'lk_view', ['Police Member']);
});
afterAll(async () => { await app.close(); });

describe('record locking', () => {
  it('first editor locks, second sees who and cannot save until released', async () => {
    const a = (await login(app, 'lk_a')).agent, b = (await login(app, 'lk_b')).agent;
    const p = (await a.post('/api/v1/persons').send({ robloxUsername: 'LockMe' })).body.person;
    const la = await a.post(`/api/v1/locks/person/${p.id}`).send({});
    expect(la.body).toMatchObject({ ok: true, locked: true, mine: true });
    const lb = await b.post(`/api/v1/locks/person/${p.id}`).send({});
    expect(lb.body).toMatchObject({ ok: false, locked: true, mine: false, holder: { displayName: 'lk_a' } });
    const save = await b.patch(`/api/v1/persons/${p.id}`).send({ version: p.version, notes: 'b' });
    expect(save.status).toBe(409);
    expect(save.body.message).toContain('lk_a');
    // Inhaber darf speichern, Lebenszeichen verlängert
    expect((await a.patch(`/api/v1/persons/${p.id}`).send({ version: p.version, notes: 'a' })).status).toBe(200);
    expect((await a.post(`/api/v1/locks/person/${p.id}`).send({})).body.ok).toBe(true);
    // freigeben → B kann sperren und speichern
    expect((await a.delete(`/api/v1/locks/person/${p.id}`)).status).toBe(204);
    expect((await b.post(`/api/v1/locks/person/${p.id}`).send({})).body.ok).toBe(true);
    expect((await b.patch(`/api/v1/persons/${p.id}`).send({ version: p.version + 1, notes: 'b' })).status).toBe(200);
  });

  it('expired locks are free; takeover is audited', async () => {
    const a = (await login(app, 'lk_a')).agent, b = (await login(app, 'lk_b')).agent;
    const p = (await a.post('/api/v1/persons').send({ robloxUsername: 'LockMe2' })).body.person;
    await a.post(`/api/v1/locks/person/${p.id}`).send({});
    await prisma.editLock.updateMany({ where: { entityId: p.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await b.get(`/api/v1/locks/person/${p.id}`)).body.locked).toBe(false);
    expect((await b.post(`/api/v1/locks/person/${p.id}`).send({})).body.ok).toBe(true);
    const take = await a.post(`/api/v1/locks/person/${p.id}`).send({ force: true });
    expect(take.body).toMatchObject({ ok: true, mine: true });
    expect(await prisma.auditLog.count({ where: { action: 'lock.takeover', entityId: p.id } })).toBe(1);
  });

  it('needs the module permission; logout releases own locks', async () => {
    const a = await login(app, 'lk_a'); const v = (await login(app, 'lk_view')).agent;
    const p = (await a.agent.post('/api/v1/persons').send({ robloxUsername: 'LockMe3' })).body.person;
    expect((await v.post(`/api/v1/locks/person/${p.id}`).send({})).status).toBe(403); // persons.edit fehlt
    expect((await v.get(`/api/v1/locks/person/${p.id}`)).status).toBe(200); // ansehen geht
    expect((await v.get(`/api/v1/locks/unknown/${p.id}`)).status).toBe(400);
    await a.agent.post(`/api/v1/locks/person/${p.id}`).send({});
    await a.agent.post('/api/v1/auth/logout');
    expect(await prisma.editLock.count({ where: { entityId: p.id } })).toBe(0);
  });
});
