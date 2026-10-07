import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const TOKEN = 'test-bot-token-embeds-0123456789abcdef01234';
const bot = () => ({ Authorization: `Bot ${TOKEN}` });
const CH = '460000000000000001', CH2 = '460000000000000002';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const started = new Date();

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'emb_admin', ['System Administrator']);
  await makeUser(prisma, 'emb_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'embeds.messages' } });
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('embed builder', () => {
  const id = randomUUID();
  const doc = { id, name: 'Karriereweg', channelId: CH, title: 'Rang Ordnung und Aufgaben', color: '#8b5cf6', fields: [{ name: '👑 | Kommandant:', value: 'Gesamtverantwortung für das SEK.' }, { name: '🔰 | Personalleiter:', value: 'Verwaltung des Personals.' }] };

  it('saves with validation; only settings.manage', async () => {
    const admin = (await login(app, 'emb_admin')).agent;
    const off = (await login(app, 'emb_off')).agent;
    expect((await off.put(`/api/v1/embeds/${id}`).send(doc)).status).toBe(403);
    expect((await admin.put(`/api/v1/embeds/${id}`).send({ ...doc, title: '', fields: [] })).status).toBe(400); // leer
    expect((await admin.put(`/api/v1/embeds/${id}`).send({ ...doc, image: 'http://x.de/a.png' })).status).toBe(400);
    expect((await admin.put(`/api/v1/embeds/${id}`).send({ ...doc, description: 'x'.repeat(4000), fields: [{ name: 'a', value: 'y'.repeat(1024) }, { name: 'b', value: 'y'.repeat(1024) }] })).status).toBe(400); // > 6000
    expect((await admin.put(`/api/v1/embeds/${randomUUID()}`).send(doc)).status).toBe(400); // ID passt nicht
    const r = await admin.put(`/api/v1/embeds/${id}`).send(doc);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'Karriereweg', posted: null, fields: [{ inline: false }, { inline: false }] });
    expect((await off.get('/api/v1/embeds')).status).toBe(403);
  });

  it('send queues a new message; after the bot reports back, send edits the same message; new channel → new message', async () => {
    const admin = (await login(app, 'emb_admin')).agent;
    expect((await admin.post(`/api/v1/embeds/${id}/send`).send({})).body).toEqual({ queued: true, edit: false });
    const job = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'embed.post' }, orderBy: { createdAt: 'desc' } });
    expect(job.payload).toMatchObject({ embedId: id, channelId: CH, messageId: null, message: { embeds: [{ title: 'Rang Ordnung und Aufgaben', color: 0x8b5cf6, fields: [{ name: '👑 | Kommandant:' }, {}] }] } });
    await http().post(`/api/v1/bot/embeds/${id}/posted`).set(bot()).send({ channelId: CH, messageId: '470000000000000001' }).expect(204);
    expect((await admin.post(`/api/v1/embeds/${id}/send`).send({ mode: 'update' })).body.edit).toBe(true);
    const job2 = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'embed.post' }, orderBy: { createdAt: 'desc' } });
    expect(job2.payload).toMatchObject({ messageId: '470000000000000001' });
    expect((await admin.post(`/api/v1/embeds/${id}/send`).send({ mode: 'new' })).body.edit).toBe(false);
    // Kanal gewechselt → neue Nachricht; gespeichert bleibt der Ort der letzten
    await admin.put(`/api/v1/embeds/${id}`).send({ ...doc, channelId: CH2 });
    expect((await admin.get('/api/v1/embeds')).body[0].posted).toMatchObject({ channelId: CH, messageId: '470000000000000001' });
    expect((await admin.post(`/api/v1/embeds/${id}/send`).send({ mode: 'update' })).body.edit).toBe(false);
    expect((await http().post(`/api/v1/bot/embeds/${id}/posted`).send({ channelId: CH, messageId: '1' })).status).toBe(401);
  });

  it('duplicate and delete', async () => {
    const admin = (await login(app, 'emb_admin')).agent;
    const d = await admin.post(`/api/v1/embeds/${id}/duplicate`);
    expect(d.body).toMatchObject({ name: 'Karriereweg (Kopie)', posted: null });
    expect((await admin.delete(`/api/v1/embeds/${d.body.id}`)).status).toBe(204);
    expect((await admin.get('/api/v1/embeds')).body).toHaveLength(1);
  });
});
