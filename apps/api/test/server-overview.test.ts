import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const A = '970000000000000001', B = '970000000000000002', BOT_ONLY = '970000000000000003', MINE = '970000000000000004', FOREIGN = '970000000000000005';
let app: INestApplication; let prisma: PrismaService;
let prevGuilds: unknown;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  const u = await makeUser(prisma, 'ov_user');
  await prisma.discordLink.create({ data: { userId: u.id, discordId: '971000000000000001', managedGuilds: [{ id: A, name: 'A', icon: null }, { id: BOT_ONLY, name: 'Bot schon da', icon: null }, { id: MINE, name: 'Mein Server', icon: null }], guildsSyncedAt: new Date() } });
  await registerServer(prisma, A, [u.id], 'Server A');
  await registerServer(prisma, B, [], 'Server B'); // kein Mitglied → unsichtbar
  prevGuilds = (await prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
  const value = [{ id: A, name: 'Server A', icon: 'https://cdn.discordapp.com/icons/970000000000000001/a.png', channels: [], roles: [] }, { id: BOT_ONLY, name: 'Bot schon da', icon: null, channels: [], roles: [] }];
  await prisma.systemSetting.upsert({ where: { key: 'discord.guilds' }, create: { key: 'discord.guilds', value }, update: { value } });
});
afterAll(async () => {
  if (prevGuilds === undefined) await prisma.systemSetting.deleteMany({ where: { key: 'discord.guilds' } });
  else await prisma.systemSetting.update({ where: { key: 'discord.guilds' }, data: { value: prevGuilds as never } });
  await app.close();
});

describe('Server-Übersicht nach dem Login', () => {
  it('zeigt eigene Server: öffnen, wartet auf Freischaltung, einladen – fremde Server nicht', async () => {
    const a = (await login(app, 'ov_user')).agent;
    const r = await a.get('/api/v1/auth/servers');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'ov_user', globalAdmin: false });
    expect(r.body.servers).toEqual([
      { guildId: A, name: 'Server A', icon: 'https://cdn.discordapp.com/icons/970000000000000001/a.png', state: 'open' },
      { guildId: BOT_ONLY, name: 'Bot schon da', icon: null, state: 'pending' },
      { guildId: MINE, name: 'Mein Server', icon: null, state: 'invite' },
    ]);
  });

  it('„+“ nur für eigene Server ohne Bot', async () => {
    const a = (await login(app, 'ov_user')).agent;
    const foreign = await a.get(`/api/v1/auth/discord/add-server?guild=${FOREIGN}`);
    expect(foreign.status).toBe(302);
    expect(foreign.headers.location).toMatch(/\/servers\?discord=not_manager$/);
    const mine = await a.get(`/api/v1/auth/discord/add-server?guild=${MINE}`);
    expect(mine.status).toBe(302);
    expect(mine.headers.location).not.toMatch(/not_manager/); // Discord-Einladung (bzw. Hinweis, wenn Discord-Login nicht eingerichtet ist)
  });
});
