import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_CONFIG } from '../src/qualifications/qualifications.config';

const TOKEN = 'test-bot-token-application-bans-0123456789ab';
const bot = { Authorization: `Bot ${TOKEN}` };
const GUILD_A = '710000000000000001', GUILD_B = '710000000000000002', PERSON = '720000000000000001';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const check = (scope: string, guildId: string) => http().get(`/api/v1/bot/application-bans/check?discordId=${PERSON}&scope=${scope}&guildId=${guildId}`).set(bot);

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ban_admin', ['System Administrator']);
  await makeUser(prisma, 'ban_member', ['Police Member']);
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('Bewerbungssperren (je Discord-Server)', () => {
  let banId = '';
  it('nur mit Entscheidungsrecht anlegen; gilt nur auf dem eigenen Server und nur für die gewählte Bewerbung', async () => {
    const member = (await login(app, 'ban_member')).agent;
    const admin = (await login(app, 'ban_admin')).agent;
    expect((await member.post('/api/v1/application-bans').set('x-guild-id', GUILD_A).send({ discordId: PERSON, scopes: ['sek'], reason: 'Regelverstoß' })).status).toBe(403);
    expect((await admin.post('/api/v1/application-bans').set('x-guild-id', GUILD_A).send({ scopes: ['sek'], reason: 'Regelverstoß' })).status).toBe(400);
    const r = await admin.post('/api/v1/application-bans').set('x-guild-id', GUILD_A).send({ discordId: PERSON, name: 'Oscar', scopes: ['sek'], reason: 'Regelverstoß' });
    expect(r.status).toBe(201);
    banId = r.body.id;
    expect((await check('sek', GUILD_A)).body).toMatchObject({ banned: true });
    expect((await check('sek', GUILD_A)).body.message).toContain('Regelverstoß');
    expect((await check('flugstaffel', GUILD_A)).body.banned).toBe(false);
    expect((await check('sek', GUILD_B)).body.banned).toBe(false);
    // Liste je Server
    expect(((await admin.get('/api/v1/application-bans').set('x-guild-id', GUILD_A)).body as { id: string }[]).map((b) => b.id)).toContain(banId);
    expect(((await admin.get('/api/v1/application-bans').set('x-guild-id', GUILD_B)).body as { id: string }[]).map((b) => b.id)).not.toContain(banId);
  });

  it('Absenden einer gesperrten Qualifikations-Bewerbung wird abgewiesen', async () => {
    const n = DEFAULT_CONFIG.units.find((u) => u.key === 'sek')!.questions.length;
    const answers = Array.from({ length: n }, (_, i) => ({ question: `Q${i + 1}`, answer: `Antwort ${i + 1}` }));
    const r = await http().post('/api/v1/bot/qualifications/applications').set(bot).send({ unit: 'sek', discordId: PERSON, discordName: 'oscar', answers, guildId: GUILD_A });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('gesperrt');
  });

  it('Aufheben: danach wieder erlaubt; nicht von einem anderen Server aus', async () => {
    const admin = (await login(app, 'ban_admin')).agent;
    expect((await admin.post(`/api/v1/application-bans/${banId}/lift`).set('x-guild-id', GUILD_B)).status).toBe(404);
    expect((await admin.post(`/api/v1/application-bans/${banId}/lift`).set('x-guild-id', GUILD_A)).status).toBe(200);
    expect((await check('sek', GUILD_A)).body.banned).toBe(false);
  });

  it('„Alle Bewerbungen“ ohne Server gilt überall', async () => {
    const admin = (await login(app, 'ban_admin')).agent;
    expect((await admin.post('/api/v1/application-bans').send({ discordId: PERSON, scopes: ['*', 'sek'], reason: 'Dauerhaft ausgeschlossen' })).body.scopes).toEqual(['*']);
    expect((await check('police', GUILD_B)).body.banned).toBe(true);
    expect((await check('ausbilder', GUILD_A)).body.banned).toBe(true);
  });
});
