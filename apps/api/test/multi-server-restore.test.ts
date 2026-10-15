import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DATA_TABLES, GUILD_TABLES, MULTI_RESTORE_FLAG, MultiServerRestoreService, SINGLE_SERVER_FLAG } from '../src/multi-server/multi-server-restore.service';
import { ownSpace, ServerLinksService } from '../src/server-links/server-links.service';
import { AuthorizationService } from '../src/authz/authorization.service';
import { loadEnv } from '../src/config/env';
import { scopeOfSpace } from '../src/duty/weekly-reset';

const HOME = '960000000000000001', OTHER = '960000000000000002';
let app: INestApplication; let prisma: PrismaService;
const id = { off: '', gone: '', pw: '', dcAdmin: '', person: '', personnel: '', otherPerson: '', deletedRole: '', mbDoc: '' };
const KEYS = [SINGLE_SERVER_FLAG, MULTI_RESTORE_FLAG, 'servers.links', 'modules.config', 'org.name', `org.name@${HOME}`, 'teamchance', `teamchance@${HOME}`];

/** Gemeinsame Test-Datenbank: was vor dem Test „ohne Server“ war (aus anderen Tests), danach wieder so – nur unsere Einträge bleiben verschoben. */
const before: { table: string; col: string; ids: string[] }[] = [];
const pk = (table: string) => (table === 'CadIncidentStat' ? 'incidentId' : 'id');
async function snapshot() {
  for (const [table] of DATA_TABLES) before.push({ table, col: 'serverId', ids: (await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT "id"::text AS id FROM "${table}" WHERE "serverId" IS NULL`)).map((r) => r.id) });
  for (const table of [...GUILD_TABLES, 'RadioCode']) before.push({ table, col: 'guildId', ids: (await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT "${pk(table)}"::text AS id FROM "${table}" WHERE "guildId" IS NULL`)).map((r) => r.id) });
}
async function reset() {
  for (const b of before) if (b.ids.length) await prisma.$executeRawUnsafe(`UPDATE "${b.table}" SET "${b.col}" = NULL WHERE "${pk(b.table)}"::text = ANY($1::text[])`, b.ids);
}

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await snapshot();
  // ── Stand wie im Ein-Server-Betrieb (für HOME zusammengeführt) ──
  const off = await makeUser(prisma, 'rs_officer'), gone = await makeUser(prisma, 'rs_removed'), pw = await makeUser(prisma, 'rs_password');
  const dcAdmin = await makeUser(prisma, 'rs_dcadmin');
  id.off = off.id; id.gone = gone.id; id.pw = pw.id; id.dcAdmin = dcAdmin.id;
  await prisma.discordLink.createMany({ data: [{ userId: off.id, discordId: '961000000000000001' }, { userId: gone.id, discordId: '961000000000000002' }, { userId: dcAdmin.id, discordId: '961000000000000003' }] });
  await prisma.systemSetting.create({ data: { key: SINGLE_SERVER_FLAG, value: { guildId: HOME } } });
  // Server-Verbund von früher: HOME und OTHER teilten den gemeinsamen Bestand
  await prisma.systemSetting.upsert({ where: { key: 'servers.links' }, create: { key: 'servers.links', value: { groups: [], sharedRecords: [HOME, OTHER] } }, update: { value: { groups: [], sharedRecords: [HOME, OTHER] } } });
  await app.get(ServerLinksService).reload();
  // Akten im Bestand
  id.person = (await prisma.person.create({ data: { robloxUsername: 'RsMaxRestore', serverId: null } })).id;
  id.personnel = (await prisma.personnel.create({ data: { userId: off.id, serverId: null, team: 'Polizei', serviceNumber: 'RS-1' } })).id;
  // OTHER hat eigene Akten aus der Multi-Server-Zeit
  id.otherPerson = (await prisma.person.create({ data: { robloxUsername: 'RsFremd', serverId: ownSpace(OTHER) } })).id;
  // zentrale Rolle = aktueller Stand; die alte Server-Rolle gleichen Namens ist überholt (gone wurde inzwischen entfernt)
  const central = await prisma.role.create({ data: { guildId: null, name: 'RS Streife', priority: 50, permissions: { create: [{ permissionKey: 'persons.view', effect: 'ALLOW' }, { permissionKey: 'dashboard.view', effect: 'ALLOW' }] } } });
  await prisma.userRole.createMany({ data: [{ userId: off.id, roleId: central.id, guildIds: [HOME] }, { userId: pw.id, roleId: central.id }] });
  const stale = await prisma.role.create({ data: { guildId: HOME, name: 'RS Streife', priority: 50, permissions: { create: [{ permissionKey: 'persons.merge', effect: 'ALLOW' }] } } });
  await prisma.userRole.create({ data: { userId: gone.id, roleId: stale.id, guildIds: [HOME] } });
  const deleted = await prisma.role.create({ data: { guildId: HOME, name: 'RS Gelöscht', permissions: { create: [{ permissionKey: 'persons.view', effect: 'ALLOW' }] } } });
  await prisma.userRole.create({ data: { userId: gone.id, roleId: deleted.id, guildIds: [HOME] } });
  id.deletedRole = deleted.id;
  // System Administrator über eine Discord-Rolle (im Ein-Server-Betrieb möglich)
  const sysAdmin = await prisma.role.findFirstOrThrow({ where: { guildId: null, name: 'System Administrator' } });
  await prisma.userRole.create({ data: { userId: dcAdmin.id, roleId: sysAdmin.id, guildIds: [HOME] } });
  // persönliche Ausnahmen: zentral aktuell, alte Server-Ausnahme überholt
  await prisma.userPermissionOverride.createMany({ data: [{ userId: off.id, guildId: null, permissionKey: 'reports.view', effect: 'ALLOW' }, { userId: gone.id, guildId: HOME, permissionKey: 'audit.view', effect: 'ALLOW' }] });
  // Einstellungen: zentral aktuell, Server-Wert von früher überholt
  for (const [key, value] of [['org.name', 'EN Polizei aktuell'], [`org.name@${HOME}`, 'veraltet']] as const) await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  await prisma.systemSetting.upsert({ where: { key: 'modules.config' }, create: { key: 'modules.config', value: { disabled: ['sek'], version: 3 } }, update: { value: { disabled: ['sek'], version: 3 } } });
  // „leer = alle Server“-Einträge und Message Builder ohne Server
  await prisma.radioCode.createMany({ data: [{ code: 'RS-10', meaning: 'zentral', guildId: null }, { code: 'RS-20', meaning: 'zentral verdeckt', guildId: null }, { code: 'rs-20', meaning: 'eigener', guildId: HOME }] });
  id.mbDoc = (await prisma.messageBuilderDocument.create({ data: { kind: 'TEMPLATE', name: 'RS Vorlage', data: { messages: [] } } })).id;
  // Wochenarchiv aus dem Ein-Server-Betrieb (unveränderlich)
  await prisma.dutyWeekArchive.create({ data: { scope: 'global', weekStart: new Date('2020-01-06T00:00:00Z'), weekEnd: new Date('2020-01-13T00:00:00Z'), weekKey: '2020-W02', label: 'KW 2', timezone: 'Europe/Berlin', totalMinutes: 60, activeUsers: 1, shiftCount: 1, ranking: [], sessions: [] } });
  await registerServer(prisma, OTHER, [], 'Anderer Server');
});
afterAll(async () => {
  await reset();
  await prisma.systemSetting.deleteMany({ where: { key: { in: KEYS } } });
  await app.get(ServerLinksService).reload();
  await rm(path.resolve(loadEnv().STORAGE_DIR, 'backups'), { recursive: true, force: true });
  await app.close();
});

describe('Rück-Umstellung vom Ein-Server-Betrieb auf getrennte Server', () => {
  it('alle bisherigen Daten gehören danach dem Server, für den zusammengeführt wurde – mit Backup vorher, ohne Löschen von Akten', async () => {
    const svc = app.get(MultiServerRestoreService);
    const r = await svc.run();
    expect(r).toMatchObject({ status: 'done', guildId: HOME, backup: expect.stringMatching(/^vor-mehrserver-/) });
    expect(await svc.run()).toMatchObject({ status: 'nothing' }); // nur einmal
    // Akten im eigenen Bereich von HOME, die von OTHER bleiben bei OTHER
    expect((await prisma.person.findUniqueOrThrow({ where: { id: id.person } })).serverId).toBe(ownSpace(HOME));
    expect((await prisma.personnel.findUniqueOrThrow({ where: { id: id.personnel } })).serverId).toBe(ownSpace(HOME));
    expect((await prisma.person.findUniqueOrThrow({ where: { id: id.otherPerson } })).serverId).toBe(ownSpace(OTHER));
    // kein Server teilt mehr Akten
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: 'servers.links' } })).value).toEqual({ groups: [], sharedRecords: [] });
    // „leer = alle Server“ → HOME; verdeckter zentraler Funk-Code entfällt, eigener bleibt
    expect(await prisma.radioCode.findMany({ where: { code: { in: ['RS-10', 'RS-20', 'rs-20'] } }, select: { code: true, guildId: true }, orderBy: { code: 'asc' } })).toEqual([{ code: 'RS-10', guildId: HOME }, { code: 'rs-20', guildId: HOME }]);
    expect((await prisma.messageBuilderDocument.findUniqueOrThrow({ where: { id: id.mbDoc } })).guildId).toBe(HOME);
    // Wochenarchiv zusätzlich beim Server (Original bleibt, Archive sind unveränderlich)
    expect(await prisma.dutyWeekArchive.count({ where: { weekKey: '2020-W02' } })).toBe(2);
    expect(await prisma.dutyWeekArchive.count({ where: { weekKey: '2020-W02', scope: scopeOfSpace(ownSpace(HOME)) } })).toBe(1);
    // Einstellungen: aktueller Wert gilt für HOME, zentral kein Rückgriff mehr für neue Server
    expect((await prisma.systemSetting.findUniqueOrThrow({ where: { key: `org.name@${HOME}` } })).value).toBe('EN Polizei aktuell');
    expect(await prisma.systemSetting.findUnique({ where: { key: 'org.name' } })).toBeNull();
    // Module: zentral abgeschaltet → auf HOME abgeschaltet
    const server = await prisma.discordServer.findUniqueOrThrow({ where: { guildId: HOME } });
    expect(server.status).toBe('ACTIVE');
    expect((await prisma.serverModuleSetting.findUniqueOrThrow({ where: { serverId_moduleKey: { serverId: server.id, moduleKey: 'sek' } } })).enabled).toBe(false);
  });

  it('Rollen und Ausnahmen exakt nach aktuellem Stand – entzogene Rechte kommen nicht zurück', async () => {
    const role = await prisma.role.findFirstOrThrow({ where: { guildId: HOME, name: 'RS Streife' }, include: { permissions: true, users: true } });
    expect(role.permissions.map((p) => p.permissionKey).sort()).toEqual(['dashboard.view', 'persons.view']);
    expect(role.users.map((u) => u.userId).sort()).toEqual([id.off, id.pw].sort());
    expect(await prisma.role.findUnique({ where: { id: id.deletedRole } })).toBeNull();
    const central = await prisma.role.findFirstOrThrow({ where: { guildId: null, name: 'RS Streife' }, include: { users: true } });
    expect(central.users).toHaveLength(0); // nur noch Vorlage
    expect(await prisma.userPermissionOverride.findMany({ where: { userId: { in: [id.off, id.gone] } }, select: { userId: true, guildId: true, permissionKey: true } })).toEqual([{ userId: id.off, guildId: HOME, permissionKey: 'reports.view' }]);
    const authz = app.get(AuthorizationService);
    const perms = app.get(AuthorizationService).effective.bind(authz);
    expect(await perms(id.gone, HOME)).not.toContain('persons.merge');
    expect(await perms(id.gone, HOME)).not.toContain('audit.view');
    // System Administrator über Discord → Administrator nur auf HOME
    const admin = await prisma.role.findFirstOrThrow({ where: { guildId: HOME, name: 'Server-Administrator' }, include: { users: true } });
    expect(admin.users.map((u) => u.userId)).toEqual([id.dcAdmin]);
    // Passwort-Konto behält Zugang (manuelle Mitgliedschaft), Discord-Konten werden über Discord geprüft
    const server = await prisma.discordServer.findUniqueOrThrow({ where: { guildId: HOME } });
    expect(await prisma.serverMembership.findUnique({ where: { serverId_userId: { serverId: server.id, userId: id.pw } } })).toMatchObject({ status: 'MEMBER', source: 'MANUAL' });
  });

  it('im Betrieb: HOME sieht seine Akten, ein anderer Server sieht sie nicht', async () => {
    const server = await prisma.discordServer.findUniqueOrThrow({ where: { guildId: HOME } });
    await prisma.serverMembership.upsert({ where: { serverId_userId: { serverId: server.id, userId: id.off } }, create: { serverId: server.id, userId: id.off, status: 'MEMBER', source: 'MANUAL' }, update: { status: 'MEMBER' } });
    const a = (await login(app, 'rs_officer')).agent;
    expect((await a.get(`/api/v1/persons/${id.person}`).set('X-Guild-Id', HOME)).status).toBe(200);
    const other = await makeUser(prisma, 'rs_other');
    const otherServer = await prisma.discordServer.findUniqueOrThrow({ where: { guildId: OTHER } });
    const r = await prisma.role.create({ data: { guildId: OTHER, name: 'RS Fremd', permissions: { create: [{ permissionKey: 'persons.view', effect: 'ALLOW' }, { permissionKey: 'dashboard.view', effect: 'ALLOW' }] } } });
    await prisma.userRole.create({ data: { userId: other.id, roleId: r.id } });
    await prisma.serverMembership.create({ data: { serverId: otherServer.id, userId: other.id, status: 'MEMBER', source: 'MANUAL' } });
    const b = (await login(app, 'rs_other')).agent;
    expect((await b.get(`/api/v1/persons/${id.person}`).set('X-Guild-Id', OTHER)).status).toBe(404);
    expect((await b.get(`/api/v1/persons/${id.otherPerson}`).set('X-Guild-Id', OTHER)).status).toBe(200);
    expect((await b.get(`/api/v1/persons/${id.person}`).set('X-Guild-Id', HOME)).status).toBe(403); // kein Mitglied auf HOME
  });
});
