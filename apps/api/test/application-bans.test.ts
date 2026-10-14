import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DEFAULT_CONFIG } from '../src/qualifications/qualifications.config';

const TOKEN = 'test-bot-token-application-bans-0123456789ab';
const bot = { Authorization: `Bot ${TOKEN}` };
const PERSON = '720000000000000001';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const check = (scope: string) => http().get(`/api/v1/bot/application-bans/check?discordId=${PERSON}&scope=${scope}`).set(bot);

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  // andere Testdateien speichern eigene Qualifikations-Einstellungen (z. B. ohne „sek“) – hier gelten die Standardwerte
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'qualifications.config' } } });
  await makeUser(prisma, 'ban_admin', ['System Administrator']);
  await makeUser(prisma, 'ban_member', ['Police Member']);
});
afterAll(async () => { delete process.env.BOT_API_TOKEN; await app.close(); });

describe('Bewerbungssperren', () => {
  let banId = '';
  it('nur mit Entscheidungsrecht anlegen; gilt nur für die gewählte Bewerbung', async () => {
    const member = (await login(app, 'ban_member')).agent;
    const admin = (await login(app, 'ban_admin')).agent;
    expect((await member.post('/api/v1/application-bans').send({ discordId: PERSON, scopes: ['sek'], reason: 'Regelverstoß' })).status).toBe(403);
    expect((await admin.post('/api/v1/application-bans').send({ scopes: ['sek'], reason: 'Regelverstoß' })).status).toBe(400);
    const r = await admin.post('/api/v1/application-bans').send({ discordId: PERSON, name: 'Oscar', scopes: ['sek'], reason: 'Regelverstoß' });
    expect(r.status).toBe(201);
    banId = r.body.id;
    expect((await check('sek')).body).toMatchObject({ banned: true });
    expect((await check('sek')).body.message).toContain('Regelverstoß');
    expect((await check('flugstaffel')).body.banned).toBe(false);
    expect(((await admin.get('/api/v1/application-bans')).body as { id: string }[]).map((b) => b.id)).toContain(banId);
  });

  it('Absenden einer gesperrten Qualifikations-Bewerbung wird abgewiesen', async () => {
    const n = DEFAULT_CONFIG.units.find((u) => u.key === 'sek')!.questions.length;
    const answers = Array.from({ length: n }, (_, i) => ({ question: `Q${i + 1}`, answer: `Antwort ${i + 1}` }));
    const r = await http().post('/api/v1/bot/qualifications/applications').set(bot).send({ unit: 'sek', discordId: PERSON, discordName: 'oscar', answers });
    expect(r.status).toBe(409);
    expect(r.body.message).toContain('gesperrt');
  });

  it('Aufheben: danach wieder erlaubt', async () => {
    const admin = (await login(app, 'ban_admin')).agent;
    expect((await admin.post('/api/v1/application-bans/00000000-0000-4000-8000-000000000000/lift')).status).toBe(404);
    expect((await admin.post(`/api/v1/application-bans/${banId}/lift`)).status).toBe(200);
    expect((await check('sek')).body.banned).toBe(false);
  });

  it('„Alle Bewerbungen“ gilt für jede Bewerbung; ältere Sperren mit Server-Bezug gelten weiter', async () => {
    const admin = (await login(app, 'ban_admin')).agent;
    expect((await admin.post('/api/v1/application-bans').send({ discordId: PERSON, scopes: ['*', 'sek'], reason: 'Dauerhaft ausgeschlossen' })).body.scopes).toEqual(['*']);
    expect((await check('police')).body.banned).toBe(true);
    expect((await check('ausbilder')).body.banned).toBe(true);
    // Sperre aus der früheren Multi-Server-Zeit (nur für einen Server angelegt) bleibt wirksam
    await prisma.applicationBan.updateMany({ where: { discordId: PERSON, liftedAt: null }, data: { liftedAt: new Date() } });
    await prisma.applicationBan.create({ data: { guildId: '710000000000000002', discordId: PERSON, name: 'Oscar', scopes: ['police'], reason: 'Alt' } });
    expect((await check('police')).body.banned).toBe(true);
  });
});
