import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
afterAll(async () => { await app.close(); });

describe('Anzeigename', () => {
  it('everyone can rename themselves; others only with users.manage below their own rank', async () => {
    const admin = await makeUser(prisma, 'name_admin', ['System Administrator']);
    const member = await makeUser(prisma, 'name_member', ['Police Member']);
    const a = (await login(app, 'name_admin')).agent;
    const m = (await login(app, 'name_member')).agent;
    expect((await m.put('/api/v1/me/name').send({ displayName: '  Max Muster  ' })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).displayName).toBe('Max Muster');
    expect((await m.put('/api/v1/me/name').send({ displayName: '' })).status).toBe(400);
    expect((await m.put(`/api/v1/users/${admin.id}/name`).send({ displayName: 'Hack' })).status).toBe(403);
    expect((await a.put(`/api/v1/users/${member.id}/name`).send({ displayName: 'Officer Max' })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).displayName).toBe('Officer Max');
    expect(await prisma.auditLog.count({ where: { action: 'user.rename', entityId: member.id } })).toBe(2);
  });

  it('accounts can be deleted (not yourself, not the last admin), audited', async () => {
    const a1 = await makeUser(prisma, 'del_admin1', ['System Administrator']);
    const target = await makeUser(prisma, 'del_target', ['Police Member']);
    const m = await makeUser(prisma, 'del_member', ['Supervisor']);
    const admin = (await login(app, 'del_admin1')).agent;
    const sup = (await login(app, 'del_member')).agent;
    expect((await sup.delete(`/api/v1/users/${target.id}`)).status).toBe(403); // ohne users.manage
    expect((await admin.delete(`/api/v1/users/${a1.id}`)).status).toBe(409); // nicht sich selbst
    expect((await admin.delete(`/api/v1/users/${target.id}`)).status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'user.delete', entityId: target.id } })).toBe(1);
    expect(m.id).toBeTruthy();
  });
});
