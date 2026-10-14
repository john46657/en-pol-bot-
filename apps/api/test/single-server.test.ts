import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SINGLE_SERVER_FLAG, SingleServerMigrationService } from '../src/server/single-server-migration.service';
import { BackupService } from '../src/backup/backup.service';
import { loadEnv } from '../src/config/env';

const TOKEN = 'test-bot-token-single-server-0123456789abcd';
const HOME = '910000000000000001', OTHER = '910000000000000002';
const bot = (discordId: string, guild?: string) => ({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': discordId, ...(guild ? { 'X-Guild-Id': guild } : {}) });
/** Früherer Datenbereich eines Servers (wie im alten Server-Verbund). */
const spaceOf = (g: string) => { const h = createHash('sha256').update(`records:${g}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; };
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  process.env.DISCORD_GUILD_ID = HOME;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'ss_admin', ['System Administrator']);
  const off = await makeUser(prisma, 'ss_off', ['Police Member']);
  await prisma.discordLink.create({ data: { userId: off.id, discordId: '920000000000000001' } });
});
afterAll(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'modules.config' } });
  await rm(path.resolve(loadEnv().STORAGE_DIR, 'backups'), { recursive: true, force: true });
  delete process.env.BOT_API_TOKEN; delete process.env.DISCORD_GUILD_ID;
  await app.close();
});

describe('ein fester Discord-Server', () => {
  it('Discord-Befehle nur vom eigenen Server; der Bot erfährt Server und abgeschaltete Module', async () => {
    expect((await http().get('/api/v1/radio-codes').set(bot('920000000000000001', HOME))).status).toBe(200);
    const foreign = await http().get('/api/v1/radio-codes').set(bot('920000000000000001', OTHER));
    expect(foreign.status).toBe(403);
    expect(foreign.body.details).toMatchObject({ reason: 'FOREIGN_GUILD' });
    expect((await http().get('/api/v1/bot/server').set({ Authorization: `Bot ${TOKEN}` })).body).toEqual({ guildId: HOME, disabled: [] });
    expect((await http().get('/api/v1/bot/server')).status).toBe(401);
    // die alten Multi-Server-Schnittstellen gibt es nicht mehr
    expect((await http().get(`/api/v1/bot/servers/${HOME}/modules`).set({ Authorization: `Bot ${TOKEN}` })).status).toBe(404);
  });

  it('Module zentral an/aus: gesperrt in API und Rechten, auch für Administratoren; Abhängigkeiten und Versionen geprüft', async () => {
    const admin = (await login(app, 'ss_admin')).agent;
    const off = (await login(app, 'ss_off')).agent;
    const list = (await admin.get('/api/v1/modules')).body;
    expect(list.modules.find((m: { key: string }) => m.key === 'cad')).toMatchObject({ enabled: true });
    expect((await off.patch('/api/v1/modules/cad').send({ enabled: false, version: list.version })).status).toBe(403);
    expect((await admin.patch('/api/v1/modules/core').send({ enabled: false, version: list.version })).status).toBe(400);
    const r = await admin.patch('/api/v1/modules/cad').send({ enabled: false, version: list.version });
    expect(r.status).toBe(200);
    expect((await admin.patch('/api/v1/modules/cad').send({ enabled: true, version: list.version })).status).toBe(409); // veralteter Stand
    const denied = await admin.get('/api/v1/cad/units');
    expect(denied.status).toBe(403);
    expect(denied.body.details).toMatchObject({ reason: 'MODULE_DISABLED' });
    expect(((await admin.get('/api/v1/auth/me')).body.permissions as string[]).some((p) => p.startsWith('cad.'))).toBe(false);
    expect((await http().get('/api/v1/bot/server').set({ Authorization: `Bot ${TOKEN}` })).body.disabled).toEqual(['cad']);
    expect((await admin.patch('/api/v1/modules/cad').send({ enabled: true, version: r.body.version })).status).toBe(200);
    expect((await admin.get('/api/v1/cad/units')).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: { in: ['module.enable', 'module.disable'] }, entityId: 'cad' } })).toBe(2);
  });
});

describe('einmalige Umstellung von „mehrere Server“ auf einen Server', () => {
  const ids: Record<string, string> = {};
  let backupName = '';

  it('führt Einstellungen, Rollen, Ausnahmen, Module und Daten zusammen – mit Backup vorher und ohne etwas zu löschen', async () => {
    await prisma.systemSetting.deleteMany({ where: { key: SINGLE_SERVER_FLAG } });
    const [home, other] = [await prisma.discordServer.create({ data: { guildId: HOME, name: 'EN Polizei' } }), await prisma.discordServer.create({ data: { guildId: OTHER, name: 'Test-Server' } })];
    // Einstellungen: org.name zuletzt auf dem Server geändert, theme.accent zuletzt zentral, cad.config nur auf dem fremden Server
    await prisma.systemSetting.upsert({ where: { key: 'org.name' }, create: { key: 'org.name', value: 'Alt' }, update: { value: 'Alt' } });
    await prisma.systemSetting.create({ data: { key: `org.name@${HOME}`, value: 'EN | Polizei Emden' } });
    await prisma.systemSetting.create({ data: { key: `theme.accent@${HOME}`, value: 'red' } });
    await prisma.systemSetting.upsert({ where: { key: 'theme.accent' }, create: { key: 'theme.accent', value: 'blue' }, update: { value: 'blue' } });
    await prisma.systemSetting.create({ data: { key: `cad.config@${OTHER}`, value: { incidentNumberPrefix: 'X' } } });
    // Rollen: zentrale Vorlage + Kopie des Servers (später geändert), Server-Rolle ohne Gegenstück, Rolle eines fremden Servers
    const u1 = await makeUser(prisma, 'ss_u1'), u2 = await makeUser(prisma, 'ss_u2');
    ids.u1 = u1.id; ids.u2 = u2.id;
    const tpl = await prisma.role.create({ data: { name: 'Streife', priority: 300, permissions: { create: [{ permissionKey: 'reports.view', effect: 'ALLOW' }] } } });
    const copy = await prisma.role.create({ data: { guildId: HOME, name: 'Streife', priority: 300, permissions: { create: [{ permissionKey: 'reports.view', effect: 'ALLOW' }, { permissionKey: 'reports.create', effect: 'ALLOW' }] } } });
    const onlyHome = await prisma.role.create({ data: { guildId: HOME, name: 'Nur auf dem Server', priority: 310, permissions: { create: [{ permissionKey: 'wanted.view', effect: 'ALLOW' }] } } });
    const foreign = await prisma.role.create({ data: { guildId: OTHER, name: 'Fremd', priority: 320, permissions: { create: [{ permissionKey: 'audit.view', effect: 'ALLOW' }] } } });
    ids.tpl = tpl.id; ids.copy = copy.id; ids.onlyHome = onlyHome.id; ids.foreign = foreign.id;
    await prisma.auditLog.create({ data: { action: 'role.update', module: 'permissions', entityType: 'Role', entityId: tpl.id, createdAt: new Date(Date.now() - 60_000) } });
    await prisma.auditLog.create({ data: { action: 'role.permission.allow', module: 'permissions', entityType: 'Role', entityId: copy.id } });
    await prisma.discordRoleMapping.create({ data: { serverId: home.id, discordRoleId: '930000000000000001', roleId: copy.id } });
    await prisma.userRole.createMany({ data: [{ userId: u1.id, roleId: copy.id, guildIds: [HOME] }, { userId: u1.id, roleId: onlyHome.id, guildIds: [] }, { userId: u2.id, roleId: tpl.id, guildIds: [] }, { userId: u2.id, roleId: foreign.id, guildIds: [] }] });
    // persönliche Ausnahmen: nur auf dem Server, bzw. Widerspruch zentral ALLOW ↔ Server DENY
    await prisma.userPermissionOverride.createMany({ data: [
      { userId: u1.id, guildId: HOME, permissionKey: 'reports.view', effect: 'DENY' },
      { userId: u2.id, guildId: null, permissionKey: 'audit.export', effect: 'ALLOW' },
      { userId: u2.id, guildId: HOME, permissionKey: 'audit.export', effect: 'DENY' },
    ] });
    // Module: auf dem Server war „SEK“ aus (Modul-Katalog legte die alte Version beim Start an)
    for (const key of ['sek', 'cad']) await prisma.appModule.upsert({ where: { key }, create: { key, name: key }, update: {} });
    await prisma.serverModuleSetting.create({ data: { serverId: home.id, moduleKey: 'sek', enabled: false } });
    await prisma.serverModuleSetting.create({ data: { serverId: other.id, moduleKey: 'cad', enabled: false } });
    // Daten in den früheren Bereichen, mit Kollisionen bei eindeutigen Rufnamen
    const units = await prisma.unit.createManyAndReturn({ data: [
      { callsign: 'SS-1', serverId: spaceOf(HOME) }, { callsign: 'SS-1' }, { callsign: 'SS-1', serverId: spaceOf(OTHER) }, { callsign: 'SS-9', serverId: spaceOf(OTHER) },
    ] });
    ids.unitHome = units[0]!.id; ids.unitLegacy = units[1]!.id; ids.unitOtherClash = units[2]!.id; ids.unitOther = units[3]!.id;
    const author = await prisma.user.findUniqueOrThrow({ where: { username: 'ss_admin' } });
    await prisma.report.createMany({ data: [{ number: 'SS-R-1', type: 'GENERAL', title: 'Home', authorId: author.id, serverId: spaceOf(HOME) }, { number: 'SS-R-2', type: 'GENERAL', title: 'Fremd', authorId: author.id, serverId: spaceOf(OTHER) }] });

    const counts = async () => ({ roles: await prisma.role.count(), userRoles: await prisma.userRole.count(), overrides: await prisma.userPermissionOverride.count(), units: await prisma.unit.count(), reports: await prisma.report.count(), servers: await prisma.discordServer.count() });
    const before = await counts();
    const r = await app.get(SingleServerMigrationService).run();
    expect(r).toMatchObject({ status: 'done', guildId: HOME, modules: ['sek'] });
    expect(r.backup).toMatch(/^vor-umstellung-\d{8}-\d{6}\.json\.gz$/);
    backupName = r.backup!;
    // nichts gelöscht (Zuweisungen/Ausnahmen kommen nur hinzu)
    const after = await counts();
    expect(after).toMatchObject({ roles: before.roles, units: before.units, reports: before.reports, servers: before.servers });
    expect(after.userRoles).toBeGreaterThanOrEqual(before.userRoles);
    expect(after.overrides).toBeGreaterThanOrEqual(before.overrides);
    expect(await prisma.systemSetting.findUnique({ where: { key: `org.name@${HOME}` } })).not.toBeNull(); // archivierter Wert bleibt

    // Einstellungen
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'org.name' } })).value).toBe('EN | Polizei Emden');
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'theme.accent' } })).value).toBe('blue');
    const flag = (await prisma.systemSetting.findUniqueOrThrow({ where: { key: SINGLE_SERVER_FLAG } })).value as { replaced: Record<string, unknown>; guildId: string };
    expect(flag).toMatchObject({ guildId: HOME, replaced: { 'org.name': 'Alt' } });
    expect(flag.replaced).not.toHaveProperty('cad.config');
    // Rollen: zentrale Rolle mit den (neueren) Rechten des Servers + Discord-Zuordnung, Zuweisungen vereinigt
    const streife = await prisma.role.findUniqueOrThrow({ where: { id: ids.tpl }, include: { permissions: true, users: true } });
    expect(streife.permissions.map((p) => p.permissionKey).sort()).toEqual(['reports.create', 'reports.view']);
    expect(streife.discordRoleIds).toContain('930000000000000001');
    expect(streife.users.map((u) => u.userId).sort()).toEqual([ids.u1, ids.u2].sort());
    expect(streife.users.find((u) => u.userId === ids.u1)!.guildIds).toEqual([HOME]); // weiter über Discord vergeben
    expect((await prisma.role.findUniqueOrThrow({ where: { id: ids.onlyHome } })).guildId).toBeNull();
    expect((await prisma.role.findUniqueOrThrow({ where: { id: ids.foreign } })).guildId).toBe(OTHER); // bleibt als Archiv, gilt nicht
    // Ausnahmen: zentral, bei Widerspruch gewinnt das Verbot
    expect(await prisma.userPermissionOverride.findFirst({ where: { userId: ids.u1, guildId: null, permissionKey: 'reports.view' } })).toMatchObject({ effect: 'DENY' });
    expect(await prisma.userPermissionOverride.findFirst({ where: { userId: ids.u2, guildId: null, permissionKey: 'audit.export' } })).toMatchObject({ effect: 'DENY' });
    // Module
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'modules.config' } })).value).toMatchObject({ disabled: ['sek'] });
    // Daten: ein Bestand; Kollisionen bleiben sichtbar, aber getrennt
    const unit = async (id: string) => (await prisma.unit.findUniqueOrThrow({ where: { id } })).serverId;
    expect(await unit(ids.unitHome)).toBeNull();
    expect(await unit(ids.unitOther)).toBeNull();
    expect(await unit(ids.unitLegacy)).not.toBeNull();
    expect(await unit(ids.unitOtherClash)).toBe(spaceOf(OTHER));
    expect(await prisma.report.count({ where: { number: { in: ['SS-R-1', 'SS-R-2'] }, serverId: null } })).toBe(2);

    // im Betrieb: die zusammengeführten Rechte gelten, Rollen fremder Server nicht
    const agent = async (u: string) => (await login(app, u)).agent;
    const me1 = (await (await agent('ss_u1')).get('/api/v1/auth/me')).body;
    expect(me1.roles.sort()).toEqual(['Nur auf dem Server', 'Streife']);
    expect(me1.permissions).toContain('reports.create');
    expect(me1.permissions).toContain('wanted.view');
    expect(me1.permissions).not.toContain('reports.view'); // persönliches Verbot
    const me2 = (await (await agent('ss_u2')).get('/api/v1/auth/me')).body;
    expect(me2.roles).toEqual(['Streife']);
    expect(me2.permissions).not.toContain('audit.view');
    // zweiter Lauf: nichts mehr zu tun
    expect((await app.get(SingleServerMigrationService).run()).status).toBe('nothing');
  });

  it('das Backup von vor der Umstellung enthält den alten Stand und lässt sich einspielen; danach wird erneut umgestellt', async () => {
    const backup = app.get(BackupService);
    expect((await backup.listData()).map((f) => f.kind)).toContain('vor-umstellung');
    const body = JSON.parse(gunzipSync(await backup.readData(backupName)).toString('utf8')) as { tables: Record<string, Record<string, unknown>[]> };
    expect(body.tables.SystemSetting!.find((s) => s.key === 'org.name')!.value).toBe('Alt');
    expect(body.tables.SystemSetting!.some((s) => s.key === SINGLE_SERVER_FLAG)).toBe(false);
    expect(body.tables.Role!.find((x) => x.id === ids.copy)!.guildId).toBe(HOME);
    expect(body.tables.Unit!.find((x) => x.id === ids.unitHome)!.serverId).toBe(spaceOf(HOME));

    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'ss_admin' } });
    const restored = await backup.restoreData({ userId: admin.id }, { name: backupName });
    expect(restored.rows).toBeGreaterThan(0);
    // nach dem Einspielen läuft die Umstellung sofort wieder (mit eigenem Backup) – Ergebnis wie zuvor
    expect(await prisma.systemSetting.findUnique({ where: { key: SINGLE_SERVER_FLAG } })).not.toBeNull();
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'org.name' } })).value).toBe('EN | Polizei Emden');
    expect((await prisma.unit.findUniqueOrThrow({ where: { id: ids.unitHome } })).serverId).toBeNull();
    expect((await prisma.role.findUniqueOrThrow({ where: { id: ids.copy } })).guildId).toBe(HOME); // Kopie bleibt Archiv
    expect((await backup.listData()).filter((f) => f.kind === 'vor-umstellung').length).toBeGreaterThanOrEqual(2);
    await prisma.systemSetting.deleteMany({ where: { key: 'modules.config' } });
  });

  it('ohne eingerichteten Server und mit Daten mehrerer Server: keine Umstellung (nichts wird verändert)', async () => {
    delete process.env.DISCORD_GUILD_ID;
    try {
      await prisma.systemSetting.deleteMany({ where: { key: SINGLE_SERVER_FLAG } });
      await prisma.systemSetting.create({ data: { key: `org.name@${'940000000000000001'}`, value: 'A' } });
      await prisma.systemSetting.create({ data: { key: `org.name@${'940000000000000002'}`, value: 'B' } });
      const svc = app.get(SingleServerMigrationService);
      const channels = await prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } });
      const guilds = await prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } });
      await prisma.systemSetting.deleteMany({ where: { key: { in: ['discord.channels', 'discord.guilds'] } } });
      const r = await svc.run();
      expect(r.status).toBe('postponed');
      expect(await prisma.systemSetting.findUnique({ where: { key: SINGLE_SERVER_FLAG } })).toBeNull();
      for (const s of [channels, guilds]) if (s) await prisma.systemSetting.create({ data: { key: s.key, value: s.value as never } });
    } finally {
      process.env.DISCORD_GUILD_ID = HOME;
    }
  });
});
