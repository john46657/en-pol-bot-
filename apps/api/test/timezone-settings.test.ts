import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

/** Zeitzone und Datumsformat der Organisation: nur gültige Werte, Standard für das Dashboard. */
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let admin: Agent;

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'tz_admin', ['System Administrator']);
  admin = (await login(app, 'tz_admin')).agent;
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['org.timezone', 'org.dateFormat'] } } });
  await app.close();
});

describe('Zeitzone der Organisation', () => {
  it('lehnt halbe oder unbekannte Zeitzonen ab', async () => {
    for (const value of ['Eur', 'Europe/Berli', 'Mars/Olympus']) expect((await admin.put('/api/v1/admin/settings/org.timezone').send({ value })).status, value).toBe(400);
    expect((await admin.put('/api/v1/admin/settings/org.timezone').send({ value: 'Europe/Vienna' })).status).toBe(200);
  });
  it('liefert Zeitzone und Datumsformat als Standard ans Dashboard', async () => {
    expect((await admin.put('/api/v1/admin/settings/org.dateFormat').send({ value: 'YYYY-MM-DD' })).status).toBe(200);
    const org = (await admin.get('/api/v1/studio/config')).body.org;
    expect(org).toMatchObject({ timezone: 'Europe/Vienna', dateFormat: 'YYYY-MM-DD' });
  });
  it('ein alter ungültiger Wert fällt auf Europe/Berlin zurück', async () => {
    await prisma.systemSetting.update({ where: { key: 'org.timezone' }, data: { value: 'Eur' } });
    expect((await admin.get('/api/v1/studio/config')).body.org.timezone).toBe('Europe/Berlin');
  });
});

describe('persönliche Zeitzone', () => {
  it('eine ungültige Zeitzone blockiert das Speichern nicht, sie wird verworfen', async () => {
    const res = await admin.put('/api/v1/me/preferences').send({ preferences: { timezone: 'Kaputt/Zone', fontSize: 16 } });
    expect(res.status).toBe(200);
    const got = (await admin.get('/api/v1/me/preferences')).body.preferences;
    expect(got.fontSize).toBe(16);
    expect(got.timezone).toBeUndefined();
    expect((await admin.put('/api/v1/me/preferences').send({ preferences: { timezone: 'UTC' } })).status).toBe(200);
    expect((await admin.get('/api/v1/me/preferences')).body.preferences.timezone).toBe('UTC');
  });
});
