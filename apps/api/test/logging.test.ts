import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { LoggingService } from '../src/logging/logging.service';

const CH = '710000000000000001', CH2 = '710000000000000002';
let app: INestApplication; let prisma: PrismaService;
const started = new Date();
const logs = async () => (await prisma.discordOutbox.findMany({ where: { type: 'message.post', createdAt: { gte: started } }, orderBy: { createdAt: 'asc' } })).map((o) => o.payload as { channelId: string; message: { embeds: { title: string; description: string; footer: string }[] } });

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'log_admin', ['System Administrator']);
  await makeUser(prisma, 'log_off', ['Police Member']);
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'logging.config' } });
  await app.get(LoggingService).reload();
  await prisma.unit.deleteMany({ where: { callsign: { startsWith: 'LOG-' } } }).catch(() => undefined);
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  await app.close();
});

describe('Logging → Discord', () => {
  it('settings: only settings.manage; types grouped by category', async () => {
    const admin = (await login(app, 'log_admin')).agent;
    const off = (await login(app, 'log_off')).agent;
    expect((await off.put('/api/v1/logging').send({ categories: { einsaetze: CH } })).status).toBe(403);
    expect((await admin.put('/api/v1/logging').send({ categories: { einsaetze: 'abc' } })).status).toBe(400);
    const types = (await admin.get('/api/v1/logging/types')).body as { key: string; types: { action: string; label: string }[] }[];
    expect(types.find((c) => c.key === 'einsaetze')?.types).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'cad.incident.create', label: 'Einsatz angelegt' })]));
  });

  it('actions go to the channel of their category; own channel per type; off; nothing without a channel', async () => {
    const admin = (await login(app, 'log_admin')).agent;
    expect((await admin.put('/api/v1/logging').send({ enabled: true, categories: { einsaetze: CH }, types: { 'cad.incident.create': CH2, 'cad.unit.update': 'off' } })).status).toBe(200);
    const before = (await logs()).length;
    const unit = (await admin.post('/api/v1/cad/units').send({ callsign: 'LOG-01' })).body;
    await admin.patch(`/api/v1/cad/units/${unit.id}`).send({ name: 'Test' }); // aus
    await admin.post('/api/v1/cad/incidents').send({ title: 'Log-Test Einsatz' });
    await admin.post('/api/v1/persons').send({ robloxUsername: 'Log_Person_Test' }); // Kategorie ohne Kanal
    const mine = (await logs()).slice(before).filter((l) => l.message.embeds[0]!.footer.includes('cad.unit') || l.message.embeds[0]!.footer.includes('cad.incident') || l.message.embeds[0]!.footer.includes('person'));
    expect(mine.map((l) => [l.channelId, l.message.embeds[0]!.title])).toEqual([[CH, '🚨 Einheit angelegt'], [CH2, '🚨 Einsatz angelegt']]);
    expect(mine[0]!.message.embeds[0]!.description).toContain('log_admin');
    await prisma.person.deleteMany({ where: { robloxUsername: 'Log_Person_Test' } });
    // Test-Meldung
    expect((await admin.post('/api/v1/logging/test').send({ category: 'akten' })).status).toBe(400);
    expect((await admin.post('/api/v1/logging/test').send({ category: 'einsaetze' })).status).toBe(200);
  });
});
