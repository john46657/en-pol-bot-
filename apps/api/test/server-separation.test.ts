import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Server laufen getrennt: Ein Administrator von Server B kommt weder per `?guildId=` noch per ID an Daten oder
 * Einstellungen von Server A, und Daten-Backups (alle Server samt Konten) bleiben globalen Systemadministratoren vorbehalten.
 */
const A = '740000000000000001', B = '740000000000000002';
let app: INestApplication; let prisma: PrismaService;
type Agent = Awaited<ReturnType<typeof login>>['agent'];
let global: Agent, bAdmin: Agent;
let appA: { id: string; number: string };
let backupA: { id: string };

const B_PERMS = ['applications.view', 'settings.view', 'settings.manage', 'ticket.view', 'ticket.settings', 'qualifications.view', 'qualifications.manage', 'dashboard.view'];

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  const root = await makeUser(prisma, 'sep_global', ['System Administrator']);
  const b = await makeUser(prisma, 'sep_b_admin');
  for (const g of [A, B]) await registerServer(prisma, g, [root.id, b.id]);
  // Administrator NUR auf Server B (Rolle mit guildId = B)
  const keys = (await prisma.permission.findMany({ where: { key: { in: B_PERMS } }, select: { key: true } })).map((p) => p.key);
  const role = await prisma.role.create({ data: { name: 'Leitung B', guildId: B, permissions: { create: keys.map((permissionKey) => ({ permissionKey })) } } });
  await prisma.userRole.create({ data: { userId: b.id, roleId: role.id } });
  appA = await prisma.application.create({ data: { number: 'APP-SEPA-0001', answers: {}, guildId: A, robloxUsername: 'Nur_Server_A' } });
  backupA = await prisma.discordBackup.create({ data: { guildId: A, guildName: 'Server A', name: 'Backup A' } });
  global = (await login(app, 'sep_global')).agent;
  bAdmin = (await login(app, 'sep_b_admin')).agent;
});
afterAll(async () => {
  await prisma.discordBackup.deleteMany({ where: { guildId: { in: [A, B] } } });
  await prisma.application.deleteMany({ where: { id: appA.id } });
  await app.close();
});

describe('Server getrennt: kein Zugriff auf fremde Server per Parameter', () => {
  it('Bewerbungen: ?guildId eines anderen Servers wird abgelehnt', async () => {
    expect((await bAdmin.get(`/api/v1/applications?guildId=${A}`).set('x-guild-id', B)).status).toBe(403);
    expect((await bAdmin.get(`/api/v1/applications/inbox?guildId=${A}`).set('x-guild-id', B)).status).toBe(403);
    const own = await bAdmin.get('/api/v1/applications?pageSize=100').set('x-guild-id', B);
    expect(own.status).toBe(200);
    expect((own.body.items as { id: string }[]).map((x) => x.id)).not.toContain(appA.id);
  });
  it('Einstellungen eines fremden Servers lassen sich weder lesen noch ändern', async () => {
    for (const path of ['/api/v1/welcome/config', '/api/v1/verification/config', '/api/v1/qualifications/config']) {
      expect((await bAdmin.get(`${path}?guildId=${A}`).set('x-guild-id', B)).status, path).toBe(403);
      expect((await bAdmin.get(`${path}?guildId=${B}`).set('x-guild-id', B)).status, path).toBe(200);
    }
    expect((await bAdmin.delete(`/api/v1/qualifications/config?guildId=${A}`).set('x-guild-id', B)).status).toBe(403);
  });
});

describe('Server getrennt: Einzelabruf und Suche', () => {
  it('Bewerbung von Server A ist auf Server B „nicht gefunden“, auf A sichtbar', async () => {
    expect((await global.get(`/api/v1/applications/${appA.id}`).set('x-guild-id', B)).status).toBe(404);
    expect((await global.get(`/api/v1/applications/${appA.id}`).set('x-guild-id', A)).status).toBe(200);
    expect((await global.get(`/api/v1/applications/${appA.id}`)).status).toBe(200); // „Alle Server“
  });
  it('die Suche auf Server B findet keine Bewerbungen von Server A', async () => {
    const hits = async (g: string) => ((await global.get('/api/v1/search?q=Nur_Server_A').set('x-guild-id', g)).body.results as { type: string; id: string }[]).filter((h) => h.type === 'application').map((h) => h.id);
    expect(await hits(B)).not.toContain(appA.id);
    expect(await hits(A)).toContain(appA.id);
  });
});

describe('Backups', () => {
  it('Daten-Backups (alle Server samt Konten) nur für globale Systemadministratoren', async () => {
    for (const path of ['/api/v1/backups/data', '/api/v1/backups/config']) {
      expect((await bAdmin.get(path).set('x-guild-id', B)).status, path).toBe(403);
      expect((await global.get(path)).status, path).toBe(200);
    }
    expect((await bAdmin.post('/api/v1/backups/data').set('x-guild-id', B)).status).toBe(403);
  });
  it('Discord-Backups: auf Server B nur die eigenen', async () => {
    const list = await bAdmin.get('/api/v1/backups/discord').set('x-guild-id', B);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).map((x) => x.id)).not.toContain(backupA.id);
    expect((await bAdmin.get(`/api/v1/backups/discord/${backupA.id}`).set('x-guild-id', B)).status).toBe(404);
    expect((await bAdmin.delete(`/api/v1/backups/discord/${backupA.id}`).set('x-guild-id', B)).status).toBe(404);
    expect((await bAdmin.post('/api/v1/backups/discord').set('x-guild-id', B).send({ guildId: A })).status).toBe(403);
    expect((await global.get(`/api/v1/backups/discord/${backupA.id}`).set('x-guild-id', A)).status).toBe(200);
  });
});
