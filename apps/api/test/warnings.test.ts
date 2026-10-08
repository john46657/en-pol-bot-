import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const CH = '730000000000000001', ROLE = '730000000000000099', DISCORD = '730000000000000010';
let app: INestApplication; let prisma: PrismaService; let target: string;
const started = new Date();
const posts = async () => (await prisma.discordOutbox.findMany({ where: { type: 'message.post', createdAt: { gte: started } }, orderBy: { createdAt: 'asc' } })).map((o) => o.payload as { channelId: string; message: { content?: string; embeds: { description: string }[] } }).filter((p) => p.channelId === CH);

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'wn_admin', ['System Administrator']);
  const u = await makeUser(prisma, 'wn_target', ['Police Member']);
  await prisma.discordLink.create({ data: { userId: u.id, discordId: DISCORD } });
  target = (await prisma.personnel.create({ data: { userId: u.id, rank: 'Anwärter' } })).id;
});
afterAll(async () => {
  await prisma.personnel.deleteMany({ where: { id: target } });
  await prisma.systemSetting.deleteMany({ where: { key: 'hr.config' } });
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  await app.close();
});

describe('Verwarnungen', () => {
  it('message in Discord with counter (Wer / Grund / x/limit); at the limit: ping, status, roles removed; overview and revoke', async () => {
    const admin = (await login(app, 'wn_admin')).agent;
    const cfg = (await admin.get('/api/v1/hr/config')).body;
    expect((await admin.put('/api/v1/hr/config').send({ ...cfg, warnings: { limit: 2, channelId: CH, dm: true, atLimit: { pingDiscordRoleIds: [ROLE], removeDiscordRoleIds: [ROLE], status: 'SUSPENDED' } } })).status).toBe(200);
    const first = await admin.post('/api/v1/hr/warnings/discord').send({ discordId: DISCORD, reason: 'Shift Abuse' });
    expect(first.body).toMatchObject({ count: 1, limit: 2 });
    expect((await posts())[0]!.message.embeds[0]!.description).toBe(`**Wer:** <@${DISCORD}>\n**Grund:** Shift Abuse\n**Verwarnungen:** 1/2`);
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: target } })).employmentStatus).not.toBe('SUSPENDED');
    expect((await admin.post('/api/v1/hr/warnings/discord').send({ discordId: DISCORD, reason: 'Funkdisziplin', severity: 'REPRIMAND' })).body).toMatchObject({ count: 2, limit: 2 });
    const second = (await posts())[1]!;
    expect(second.message.content).toBe(`<@&${ROLE}>`);
    expect(second.message.embeds[0]!.description).toContain('Grenze erreicht (2/2)');
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: target } })).employmentStatus).toBe('SUSPENDED');
    expect(await prisma.discordOutbox.findFirst({ where: { type: 'bot.dm', createdAt: { gte: started } } })).not.toBeNull();
    // Übersicht mit Zähler; zurücknehmen senkt ihn
    const list = (await admin.get('/api/v1/hr/warnings')).body;
    expect(list.limit).toBe(2);
    const mine = list.items.filter((w: { personnelId: string }) => w.personnelId === target);
    expect(mine.map((w: { active: number }) => w.active)).toEqual([2, 2]);
    expect((await admin.patch(`/api/v1/hr/records/${mine[0].id}`).send({ status: 'REVOKED' })).status).toBe(200);
    expect((await admin.get('/api/v1/hr/warnings')).body.items.filter((w: { personnelId: string }) => w.personnelId === target).map((w: { active: number }) => w.active)).toEqual([1]);
    expect((await admin.post('/api/v1/hr/warnings/discord').send({ discordId: '730000000000000077', reason: 'x y' })).status).toBe(404);
  });
});
