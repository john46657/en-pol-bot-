import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'test-bot-token-training-0123456789abcdef0123';
const CH = '740000000000000001', A = '740000000000000010', B = '740000000000000011', C = '740000000000000012';
let app: INestApplication; let prisma: PrismaService; let pa: string; let rankId: string;
const started = new Date();
const http = () => request(app.getHttpServer());
const bot = { Authorization: `Bot ${TOKEN}` };
const posts = async () => (await prisma.discordOutbox.findMany({ where: { type: 'message.post', createdAt: { gte: started } }, orderBy: { createdAt: 'asc' } })).map((o) => o.payload as { channelId: string; stateKey: string; forceNew: boolean; message: { thread?: string; buttons?: { id: string }[]; embeds: { title: string; description: string; fields?: { name: string; value: string }[] }[] } }).filter((p) => p.channelId === CH);

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ts_admin', ['System Administrator']);
  const u = await makeUser(prisma, 'ts_anw', ['Police Member']);
  await prisma.discordLink.create({ data: { userId: u.id, discordId: A } });
  pa = (await prisma.personnel.create({ data: { userId: u.id, rank: 'Anwärter-T' } })).id;
  rankId = (await prisma.hrRank.create({ data: { name: 'Polizeimeister-T', discordRoleIds: ['740000000000000099'], position: 99 } })).id;
});
afterAll(async () => {
  await prisma.hrTrainingSession.deleteMany({});
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'bot.state.training-' } } });
  await prisma.personnel.deleteMany({ where: { id: pa } });
  await prisma.hrRank.deleteMany({ where: { id: rankId } });
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('Ausbildungstermine', () => {
  it('announce with sign-up and thread; sign up from Discord (also without account); evaluate → message, training record, promotion', async () => {
    const admin = (await login(app, 'ts_admin')).agent;
    const s = (await admin.post('/api/v1/hr/training-sessions').send({ title: 'Grundausbildung', startsAt: new Date(Date.now() + 86_400_000).toISOString(), forRank: 'Polizeianwärter', duration: '60–120 Minuten', channelId: CH, promoteRankId: rankId, maxSignups: 2 })).body;
    expect(s).toMatchObject({ status: 'PLANNED', number: expect.stringMatching(/^AB-/) });
    const ann = (await posts())[0]!;
    expect(ann).toMatchObject({ stateKey: `training-${s.id}`, forceNew: true });
    expect(ann.message.thread).toContain('Grundausbildung');
    expect(ann.message.embeds[0]!.description).toContain('**Für den Rang:** Polizeianwärter');
    expect(ann.message.buttons!.map((b) => b.id)).toEqual([`trn:join:${s.id}`, `trn:leave:${s.id}`, 'link']);
    // der Bot meldet, wo die Ankündigung steht (sonst wird nichts aktualisiert)
    await prisma.systemSetting.create({ data: { key: `bot.state.training-${s.id}`, value: { channelId: CH, messageId: '740000000000000500' } } });
    // Anmeldung über Discord – A mit Konto, B ohne
    expect((await http().post(`/api/v1/bot/training-sessions/${s.id}/signup`).set(bot).send({ discordId: A, name: 'Anwärter A', join: true })).status).toBe(200);
    expect((await http().post(`/api/v1/bot/training-sessions/${s.id}/signup`).set(bot).send({ discordId: B, name: 'Gast B', join: true })).status).toBe(200);
    expect((await http().post(`/api/v1/bot/training-sessions/${s.id}/signup`).set(bot).send({ discordId: C, name: 'C', join: true })).status).toBe(409); // voll
    const upd = (await posts()).filter((p) => p.stateKey === `training-${s.id}`).pop()!;
    expect(upd.forceNew).toBe(false);
    expect(upd.message.embeds[0]!.fields![0]).toEqual({ name: 'Angemeldet (2/2)', value: `<@${A}> <@${B}>` });
    // Auswertung: beide erschienen, A bestanden
    const ev = await admin.post(`/api/v1/hr/training-sessions/${s.id}/evaluate`).send({ attended: [A, B], passed: [A], actualDuration: '1 Std' });
    expect(ev.status).toBe(200);
    expect(ev.body.results).toEqual([{ discordId: A, promoted: true }]);
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: pa } })).rank).toBe('Polizeimeister-T');
    expect(await prisma.personnelRecord.count({ where: { personnelId: pa, type: { in: ['TRAINING', 'PROMOTION'] } } })).toBe(2);
    const evalMsg = (await posts()).find((p) => p.message.embeds[0]!.title.startsWith('📋 Auswertung'))!;
    expect(evalMsg.message.embeds[0]!.description).toContain(`**Angemeldet und erschienen:** <@${A}> <@${B}>`);
    expect(evalMsg.message.embeds[0]!.description).toContain(`**Bestanden:** <@${A}>`);
    expect(evalMsg.message.embeds[0]!.description).toContain('**Dauer war:** 1 Std');
    expect((await http().post(`/api/v1/bot/training-sessions/${s.id}/signup`).set(bot).send({ discordId: C, name: 'C', join: true })).status).toBe(409); // vorbei
    expect((await admin.get('/api/v1/hr/training-sessions?scope=past')).body.map((x: { id: string }) => x.id)).toContain(s.id);
  });
});
