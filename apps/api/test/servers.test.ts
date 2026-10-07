import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const A = '810000000000000001', B = '810000000000000002';
let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  const guild = (id: string, name: string, banner: string | null) => ({ id, name, icon: `https://cdn.discordapp.com/icons/${id}/a.png`, banner, memberCount: 42, channels: [], roles: [] });
  await prisma.systemSetting.upsert({ where: { key: 'discord.guilds' }, create: { key: 'discord.guilds', value: [guild(A, 'Server A', 'https://cdn.discordapp.com/banners/a.png'), guild(B, 'Server B', null)] }, update: { value: [guild(A, 'Server A', 'https://cdn.discordapp.com/banners/a.png'), guild(B, 'Server B', null)] } });
  const role = await prisma.role.create({ data: { name: 'Nur Server A', guildId: A, priority: 80, permissions: { create: [{ permissionKey: 'dashboard.view', effect: 'ALLOW' }] } } });
  const u = await makeUser(prisma, 'sv_a');
  await prisma.userRole.create({ data: { userId: u.id, roleId: role.id } });
  await makeUser(prisma, 'sv_admin', ['System Administrator']);
});
afterAll(async () => { await app.close(); });

describe('server selection', () => {
  it('lists only the servers the user may open, with banner and member count', async () => {
    const { agent } = await login(app, 'sv_a');
    const r = await agent.get('/api/v1/auth/servers').expect(200);
    expect(r.body).toEqual({ allServers: false, invite: [], servers: [{ id: A, name: 'Server A', icon: expect.any(String), banner: 'https://cdn.discordapp.com/banners/a.png', memberCount: 42 }] });
  });
  it('global roles see every server and the "all servers" option', async () => {
    const { agent } = await login(app, 'sv_admin');
    const r = await agent.get('/api/v1/auth/servers').expect(200);
    expect(r.body.allServers).toBe(true);
    expect(r.body.servers.map((s: { id: string }) => s.id)).toEqual([A, B]);
  });
});
