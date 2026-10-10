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
});
