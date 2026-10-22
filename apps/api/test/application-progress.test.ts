import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'test-bot-token-progress-0123456789abcdef';
const bot = { Authorization: `Bot ${TOKEN}` };
const ANNA = '720000000000000001', BEN = '720000000000000002';
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent, sup: Agent;
const http = () => request(app.getHttpServer());
const hour = () => new Date(Date.now() + 3_600_000).toISOString();

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await prisma.applicationProgress.deleteMany({}); // Reste anderer Tests (z. B. Web-Links)
  await makeUser(prisma, 'prog_admin', ['System Administrator']);
  await makeUser(prisma, 'prog_sup', ['Supervisor']); // applications.view, aber keine Einheiten-Bewerbungen
  admin = (await login(app, 'prog_admin')).agent;
  sup = (await login(app, 'prog_sup')).agent;
});
afterAll(async () => { await prisma.applicationProgress.deleteMany({}); delete process.env.BOT_API_TOKEN; await app.close(); });

describe('angefangene Bewerbungen („in Bearbeitung“)', () => {
  it('the bot reports progress; the dashboard lists it with the same filters and permissions as the inbox', async () => {
    const started = new Date().toISOString();
    expect((await http().post('/api/v1/bot/application-progress').send({ discordId: ANNA, discordName: 'anna', unit: '@polizei', unitName: 'EN Polizei', answered: 0, total: 5, startedAt: started, expiresAt: hour() })).status).toBe(401);
    expect((await http().post('/api/v1/bot/application-progress').set(bot).send({ discordId: ANNA, discordName: 'anna', unit: '@polizei', unitName: 'EN Polizei', answered: 0, total: 5, startedAt: started, expiresAt: hour() })).status).toBe(204);
    expect((await http().post('/api/v1/bot/application-progress').set(bot).send({ discordId: ANNA, discordName: 'anna', unit: '@polizei', unitName: 'EN Polizei', answered: 2, total: 5, startedAt: started, expiresAt: hour() })).status).toBe(204);
    await http().post('/api/v1/bot/application-progress').set(bot).send({ discordId: BEN, discordName: 'ben', unit: 'flugstaffel', unitName: 'Flugstaffel', answered: 1, total: 3, startedAt: started, expiresAt: hour() });
    await prisma.applicationProgress.create({ data: { discordId: '720000000000000009', discordName: 'old', unit: '@polizei', unitName: 'EN Polizei', expiresAt: new Date(Date.now() - 1000) } });

    const r = await admin.get('/api/v1/applications/in-progress');
    expect(r.status).toBe(200);
    expect(r.body.map((x: { discordName: string; typeKey: string; answered: number }) => `${x.discordName} ${x.typeKey} ${x.answered}`).sort()).toEqual(['anna police 2', 'ben q:flugstaffel 1']); // abgelaufene fallen weg
    expect((await admin.get('/api/v1/applications/in-progress').query({ type: 'q:flugstaffel' })).body).toHaveLength(1);
    expect((await admin.get('/api/v1/applications/in-progress').query({ q: 'ann' })).body).toHaveLength(1);
    const supView = await sup.get('/api/v1/applications/in-progress');
    expect(supView.body.map((x: { typeKey: string }) => x.typeKey)).toEqual(['police']);
    expect((await sup.get('/api/v1/applications/in-progress').query({ type: 'q:flugstaffel' })).body).toEqual([]);
  });

  it('cancelling and a bot restart remove the entries', async () => {
    expect((await http().delete('/api/v1/bot/application-progress').set(bot).query({ discordId: BEN, unit: 'flugstaffel' })).status).toBe(204);
    expect((await admin.get('/api/v1/applications/in-progress')).body.map((x: { discordName: string }) => x.discordName)).toEqual(['anna']);
    await prisma.applicationProgress.create({ data: { discordId: BEN, discordName: 'ben', unit: 'sek', unitName: 'SEK', source: 'WEB', expiresAt: new Date(Date.now() + 60_000) } });
    expect((await http().post('/api/v1/bot/application-progress/reset').set(bot)).status).toBe(204);
    expect((await admin.get('/api/v1/applications/in-progress')).body.map((x: { source: string }) => x.source)).toEqual(['WEB']); // Web-Links überleben den Bot-Neustart
  });
});
