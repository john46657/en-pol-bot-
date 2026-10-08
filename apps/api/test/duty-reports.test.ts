import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication; let prisma: PrismaService; let userId: string;
const TPL = randomUUID();
const template = { id: TPL, name: 'Tagesbericht Test', period: 'DAILY', fields: [{ id: 'dienstzeit', label: 'Dienstzeit', type: 'short', required: true }, { id: 'taetigkeiten', label: 'Tätigkeiten', type: 'long', required: true }], onePerPeriod: false };

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  userId = (await makeUser(prisma, 'drep_off', ['Police Member'])).id;
  await makeUser(prisma, 'drep_admin', ['System Administrator']);
  await prisma.systemSetting.upsert({ where: { key: 'org.timezone' }, create: { key: 'org.timezone', value: 'UTC' }, update: { value: 'UTC' } });
});
afterAll(async () => {
  await prisma.dutyReport.deleteMany({ where: { templateId: TPL } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['dutyReports.templates', 'org.timezone'] } } });
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
});
