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
});
