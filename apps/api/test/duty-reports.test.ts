import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService; let userId: string;
const TOKEN = 'test-bot-token-duty-reports-0123456789abcdef', OFF_D = '610000000000000001', ADMIN_D = '610000000000000002';
const bot = (discordId: string) => ({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': discordId });
const TPL = randomUUID();
const template = { id: TPL, name: 'Tagesbericht Test', period: 'DAILY', fields: [{ id: 'dienstzeit', label: 'Dienstzeit', type: 'short', required: true }, { id: 'taetigkeiten', label: 'Tätigkeiten', type: 'long', required: true }], onePerPeriod: false };

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  userId = (await makeUser(prisma, 'drep_off', ['Police Member'])).id;
  const adminId = (await makeUser(prisma, 'drep_admin', ['System Administrator'])).id;
  await prisma.discordLink.create({ data: { userId: adminId, discordId: ADMIN_D } });
  await prisma.systemSetting.upsert({ where: { key: 'org.timezone' }, create: { key: 'org.timezone', value: 'UTC' }, update: { value: 'UTC' } });
});
afterAll(async () => {
  await prisma.dutyReport.deleteMany({ where: { templateId: TPL } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['dutyReports.templates', 'org.timezone'] } } });
  delete process.env.BOT_API_TOKEN;
  await app.close();
});

describe('Tages-/Wochenberichte: Dienstzeit automatisch', () => {
  it('fills the duty time from the duty sessions (form prefill and on submit when left empty)', async () => {
    const admin = (await login(app, 'drep_admin')).agent;
    const off = (await login(app, 'drep_off')).agent;
    expect((await admin.put(`/api/v1/duty-reports/templates/${TPL}`).send(template)).status).toBe(200);
    const today = new Date(); const d = (h: number, m = 0) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h, m));
    // nichts im Dienst → keine Vorbelegung
    expect((await off.get(`/api/v1/duty-reports/templates/${TPL}/prefill`)).body).toEqual({ values: {} });
    await prisma.dutySession.createMany({ data: [
      { userId, status: 'ON_DUTY', startedAt: d(0, 10), endedAt: d(1, 10) },
      { userId, status: 'BREAK', startedAt: d(1, 10), endedAt: d(1, 40) },
      { userId, status: 'ON_DUTY', startedAt: d(1, 40), endedAt: d(2, 0) },
    ] });
    expect((await off.get(`/api/v1/duty-reports/templates/${TPL}/prefill`)).body).toEqual({ values: { dienstzeit: '00:10–02:00 (1 h 20 min)' } });
    // leer eingereicht → automatisch ergänzt; selbst eingetragen → bleibt
    const r = await off.post('/api/v1/duty-reports').send({ templateId: TPL, values: { taetigkeiten: 'Streife' } });
    expect(r.status).toBe(201);
    expect(r.body.values.dienstzeit).toBe('00:10–02:00 (1 h 20 min)');
    expect((await off.post('/api/v1/duty-reports').send({ templateId: TPL, values: { dienstzeit: '18–20 Uhr', taetigkeiten: 'x' } })).body.values.dienstzeit).toBe('18–20 Uhr');
    await prisma.dutySession.deleteMany({ where: { userId } });
  });

  it('leadership reviews: returned with a note (author notified, DM), author improves → submitted again, then reviewed', async () => {
    const admin = (await login(app, 'drep_admin')).agent;
    const off = (await login(app, 'drep_off')).agent;
    await prisma.discordLink.create({ data: { userId, discordId: '660000000000000001' } });
    const r = (await off.post('/api/v1/duty-reports').send({ templateId: TPL, values: { dienstzeit: '1 h', taetigkeiten: 'kurz' } })).body;
    expect((await admin.post(`/api/v1/duty-reports/${r.id}/review`).send({ decision: 'RETURNED' })).status).toBe(400); // Anmerkung fehlt
    const ret = await admin.post(`/api/v1/duty-reports/${r.id}/review`).send({ decision: 'RETURNED', note: 'Bitte Tätigkeiten genauer.' });
    expect(ret.body).toMatchObject({ status: 'RETURNED', reviewNote: 'Bitte Tätigkeiten genauer.' });
    expect(await prisma.notification.findFirst({ where: { userId, type: 'REPORT_REVIEW', entityId: r.id } })).toMatchObject({ body: 'Bitte Tätigkeiten genauer.' });
    const dm = await prisma.discordOutbox.findFirst({ where: { type: 'bot.dm' }, orderBy: { createdAt: 'desc' } });
    expect(dm?.payload).toMatchObject({ discordId: '660000000000000001' });
    expect((await off.get(`/api/v1/duty-reports/${r.id}`)).body).toMatchObject({ status: 'RETURNED', reviewerName: 'drep_admin' });
    expect((await off.post(`/api/v1/duty-reports/${r.id}/review`).send({ decision: 'REVIEWED' })).status).toBe(403); // kein Recht
    // Verfasser bessert nach → wieder eingereicht
    expect((await off.patch(`/api/v1/duty-reports/${r.id}`).send({ values: { dienstzeit: '1 h', taetigkeiten: 'Streife, Verkehrskontrolle' } })).body.status).toBe('SUBMITTED');
    expect((await admin.post(`/api/v1/duty-reports/${r.id}/review`).send({ decision: 'REVIEWED', note: 'Passt.' })).body).toMatchObject({ status: 'REVIEWED', reviewNote: 'Passt.' });
    expect((await admin.post(`/api/v1/duty-reports/${r.id}/review`).send({ decision: 'SUBMITTED' })).body).toMatchObject({ status: 'SUBMITTED', reviewNote: null, reviewedById: null });
    await prisma.discordLink.deleteMany({ where: { userId } });
  });

  it('Discord (/dienstbericht): the bot may fill in, list, show and review reports in the user\'s name', async () => {
    const http = () => request(app.getHttpServer());
    await prisma.discordLink.create({ data: { userId, discordId: OFF_D } });
    expect((await http().get('/api/v1/duty-reports/templates?active=1').set(bot(OFF_D))).status).toBe(200);
    expect((await http().get(`/api/v1/duty-reports/templates/${TPL}/prefill`).set(bot(OFF_D))).status).toBe(200);
    const created = await http().post('/api/v1/duty-reports').set(bot(OFF_D)).send({ templateId: TPL, values: { dienstzeit: '1 h', taetigkeiten: 'Per Discord' }, source: 'DISCORD' });
    expect(created.status).toBe(201);
    expect((await http().patch(`/api/v1/duty-reports/${created.body.id}`).set(bot(OFF_D)).send({ values: { dienstzeit: '2 h', taetigkeiten: 'Per Discord' } })).status).toBe(200);
    const own = (await http().get(`/api/v1/duty-reports/${created.body.number}`).set(bot(OFF_D))).body;
    expect(own).toMatchObject({ number: created.body.number, canReview: false });
    // Leitung: Liste per Discord-ID des Verfassers, Bericht öffnen, prüfen
    const list = (await http().get(`/api/v1/duty-reports?status=SUBMITTED&discordId=${OFF_D}`).set(bot(ADMIN_D))).body;
    expect(list.seeAll).toBe(true);
    expect(list.items.map((x: { id: string }) => x.id)).toContain(created.body.id);
    expect(list.items.every((x: { authorId: string }) => x.authorId === userId)).toBe(true);
    expect((await http().get('/api/v1/duty-reports?discordId=699999999999999999').set(bot(ADMIN_D))).body.total).toBe(0);
    expect((await http().get(`/api/v1/duty-reports/${created.body.id}`).set(bot(ADMIN_D))).body.canReview).toBe(true);
    expect((await http().post(`/api/v1/duty-reports/${created.body.id}/review`).set(bot(OFF_D)).send({ decision: 'REVIEWED' })).status).toBe(403);
    expect((await http().post(`/api/v1/duty-reports/${created.body.id}/review`).set(bot(ADMIN_D)).send({ decision: 'REVIEWED' })).status).toBe(200);
  });
});
