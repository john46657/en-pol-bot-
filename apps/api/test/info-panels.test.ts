import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { infoPanelSchema } from '@enrp/shared';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'test-bot-token-infopanel-0123456789abcdef012';
const CH = '750000000000000001';
let app: INestApplication; let prisma: PrismaService;
const started = new Date();

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ip_admin', ['System Administrator']);
  await makeUser(prisma, 'ip_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'discord.infoPanels' } });
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('Info-Panels', () => {
  it('saved in the dashboard, sent with a select menu; the bot reads the option texts', async () => {
    const admin = (await login(app, 'ip_admin')).agent;
    const off = (await login(app, 'ip_off')).agent;
    const doc = infoPanelSchema.parse({ id: randomUUID(), name: 'Aufgaben als Ausbilder', channelId: CH });
    expect((await off.put(`/api/v1/discord-panels/info/${doc.id}`).send(doc)).status).toBe(403);
    expect((await admin.put(`/api/v1/discord-panels/info/${doc.id}`).send({ ...doc, options: [doc.options[0], doc.options[0]] })).status).toBe(400); // Kürzel doppelt
    expect((await admin.put(`/api/v1/discord-panels/info/${doc.id}`).send(doc)).status).toBe(200);
    expect((await admin.post(`/api/v1/discord-panels/info/${doc.id}/send`).send({ mode: 'new' })).status).toBe(202);
    const out = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'message.post', createdAt: { gte: started } }, orderBy: { createdAt: 'desc' } });
    expect(out.payload).toMatchObject({ channelId: CH, stateKey: `ipanel-${doc.id}`, message: { select: { id: `ipnl:${doc.id}`, placeholder: 'Triff eine Auswahl', options: [{ value: 'aufgaben', label: 'Aufgaben' }, { value: 'doku', label: 'Dokumentation' }] } } });
    const bot = await request(app.getHttpServer()).get(`/api/v1/bot/panels/info/${doc.id}`).set({ Authorization: `Bot ${TOKEN}` });
    expect(bot.body.options[1]).toMatchObject({ id: 'doku', title: 'Dokumentation' });
  });
});
