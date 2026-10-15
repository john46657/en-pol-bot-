import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MODULES } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService, setAfterRestore } from '../backup/backup.service';
import { ownSpace, ServerLinksService } from '../server-links/server-links.service';
import { PER_SERVER_SETTING_KEYS, SERVER_SCOPED_SETTINGS } from '../common/guild-context';
import { ADMIN_ROLE_NAME } from './server-roles';
import { scopeOfSpace } from '../duty/weekly-reset';

/** Gesetzt von der früheren Umstellung „ein fester Discord-Server“ (Wert: `guildId` des Servers, für den zusammengeführt wurde). */
export const SINGLE_SERVER_FLAG = 'migration.singleServer';
/** Gesetzt, sobald die Daten aus dem Ein-Server-Betrieb wieder einem Server gehören. */
export const MULTI_RESTORE_FLAG = 'migration.multiServerRestore';

/**
 * Tabellen mit Akten-Bereich (`serverId`) und ihren Eindeutigkeiten je Bereich. Im Ein-Server-Betrieb gehörte alles zum
 * Bestand `serverId` = NULL; jetzt gehört es dem Server, für den damals zusammengeführt wurde.
 */
export const DATA_TABLES: [string, string[]][] = [
  ['Person', ['robloxUserId']], ['Vehicle', ['plate']], ['Weapon', ['serial']], ['Report', []], ['Complaint', []], ['Investigation', []], ['WantedRecord', []],
  ['Evidence', []], ['DutySession', []], ['Ticket', []], ['LegalCode', ['code']], ['Incident', []], ['Unit', ['callsign']], ['CadMapObject', []],
  ['CadMember', ['userId', 'discordId']], ['Personnel', ['userId', 'callsign', 'serviceNumber']], ['HrRank', ['name']], ['HrRequest', []], ['HrTraining', []],
  ['HrExam', []], ['HrAnnouncement', []], ['HrPoll', []], ['ServiceNumberRange', []], ['ServiceNumber', ['display']], ['HireQueue', []], ['AcademyCourse', []],
  ['SekMember', ['userId']], ['SekReport', []], ['RadioWhitelist', ['userId']], ['Workflow', []], ['Conversation', []],
];
/**
 * Tabellen mit Discord-Server-Spalte (`guildId`), in denen „leer“ für ALLE Server gilt (bzw. keinem gehört). Was im
 * Ein-Server-Betrieb ohne Server entstand, gehört dem Server – sonst sähe es jeder neue Server.
 */
export const GUILD_TABLES = [
  'Unit', 'Incident', 'LeaveRequest', 'Application', 'ApplicationBan', 'QualificationApplication', 'TicketPanel', 'TicketCategory', 'ErlcServer',
  'CadIncidentLog', 'CadRadioMessage', 'PanelSubmission', 'DutyReport', 'HrTrainingSession', 'CadHandover', 'CadIncidentStat',
  'MessageBuilderCategory', 'MessageBuilderDocument', 'MessageBuilderSend', 'MessageBuilderAction', 'MessageBuilderWebhook',
];

export interface RestoreResult { status: 'nothing' | 'done' | 'postponed'; guildId: string | null; backup?: string; reason?: string; summary?: Record<string, unknown> }

/**
 * Einmalige Rück-Umstellung vom Ein-Server-Betrieb auf getrennte Discord-Server (eine Website, je Server eigene Akten).
 * Alles, was es gibt, gehört danach dem Server, für den damals zusammengeführt wurde (z. B. EN | Polizei):
 *  - Akten (`serverId` = NULL) → eigener Akten-Bereich dieses Servers; Einträge mit `guildId` = leer → dieser Server
 *  - zentrale Einstellungen → Einstellungen dieses Servers; zentrale Rollen, Rechte, Zuweisungen und persönliche Ausnahmen →
 *    Rollen dieses Servers (alte, im Ein-Server-Betrieb überholte Server-Rollen/-Ausnahmen werden exakt angeglichen, damit
 *    niemand entzogene Rechte zurückbekommt); zentral bleiben nur Vorlagen für neue Server und „System Administrator“
 *  - zentral abgeschaltete Module → auf diesem Server abgeschaltet
 *  - geteilte Akten zwischen Servern (Server-Verbund) werden aufgehoben: Server teilen keine Akten.
 * Vorher wird ein Backup angelegt (schlägt es fehl, wird nichts verändert). Gesperrt gegen parallele Instanzen; läuft nach dem
 * Einspielen eines Backups aus dem Ein-Server-Betrieb erneut.
 */
@Injectable()
export class MultiServerRestoreService implements OnModuleInit {
  private readonly log = new Logger('MultiServer');
  constructor(private readonly prisma: PrismaService, private readonly backup: BackupService, private readonly links: ServerLinksService) {}

  async onModuleInit() {
    setAfterRestore(() => this.run());
    if (process.env.NODE_ENV === 'test') return;
    await this.run().catch((e) => this.log.error(`Rück-Umstellung auf getrennte Server fehlgeschlagen (wird beim nächsten Start wiederholt): ${e instanceof Error ? e.stack ?? e.message : e}`));
  }

  /** Steht die Rück-Umstellung noch aus? (Ein-Server-Betrieb lief, Rück-Umstellung noch nicht.) */
  async pending() {
    const [single, multi] = await Promise.all([
      this.prisma.systemSetting.findUnique({ where: { key: SINGLE_SERVER_FLAG } }),
      this.prisma.systemSetting.findUnique({ where: { key: MULTI_RESTORE_FLAG } }),
    ]);
    return !!single && !multi;
  }

  /** Server, dem die Daten gehören: der, für den zusammengeführt wurde – sonst der eingerichtete. */
  private async home(): Promise<string | null> {
    const flag = (await this.prisma.systemSetting.findUnique({ where: { key: SINGLE_SERVER_FLAG } }))?.value as { guildId?: string | null } | null;
    const channels = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | null;
    return [flag?.guildId, process.env.DISCORD_GUILD_ID, channels?.guildId].join(',').split(/[\s,;]+/).find((g) => /^\d{15,25}$/.test(g)) ?? null;
  }

  async run(): Promise<RestoreResult> {
    if (!(await this.pending())) return { status: 'nothing', guildId: null };
    const guildId = await this.home();
    if (!guildId) {
      const reason = 'Daten aus dem Ein-Server-Betrieb, aber kein Discord-Server bekannt. Bitte DISCORD_GUILD_ID setzen – bis dahin bleibt alles, wie es ist.';
      this.log.warn(reason);
      return { status: 'postponed', guildId: null, reason };
    }
    // Sicherheitskopie ZUERST – schlägt sie fehl, wird nichts verändert
    const backup = await this.backup.createData(null, 'vor-mehrserver');
    this.log.log(`Backup vor der Rück-Umstellung angelegt: ${backup.name} (${backup.rows} Einträge)`);
    const summary = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${MULTI_RESTORE_FLAG}))`;
      if (await tx.systemSetting.findUnique({ where: { key: MULTI_RESTORE_FLAG } })) return null; // andere Instanz war schneller
      const links = await this.unlinkRecords(tx);
      const server = await this.ensureServer(tx, guildId);
      const data = await this.moveData(tx, guildId);
      const settings = await this.moveSettings(tx, guildId);
      const roles = await this.moveRoles(tx, guildId, server.id);
      const overrides = await this.moveOverrides(tx, guildId);
      const modules = await this.moveModules(tx, server.id);
      const members = await this.manualMembers(tx, guildId, server.id);
      const s = { at: new Date().toISOString(), guildId, backup: backup.name, ...data, settings, roles, overrides, modules, manualMembers: members, unlinked: links };
      await tx.systemSetting.create({ data: { key: MULTI_RESTORE_FLAG, value: s as unknown as Prisma.InputJsonValue } });
      await tx.auditLog.create({ data: { action: 'system.multi_server_restore', module: 'settings', entityType: 'SystemSetting', entityId: MULTI_RESTORE_FLAG, serverId: guildId, after: s as unknown as Prisma.InputJsonValue, result: 'SUCCESS' } });
      return s;
    }, { timeout: 10 * 60_000, maxWait: 60_000 });
    await this.links.reload();
    await this.links.assignLegacyRecords().catch((e) => this.log.warn(`Zuordnung alter Einträge: ${e instanceof Error ? e.message : e}`));
    if (!summary) return { status: 'nothing', guildId };
    this.log.log(`Getrennte Discord-Server wiederhergestellt: alle bisherigen Daten gehören jetzt ${summary.guildId} (${JSON.stringify({ records: summary.records, guildRecords: summary.guildRecords, settings: summary.settings, roles: summary.roles })}).`);
    return { status: 'done', guildId, backup: backup.name, summary };
  }

  /** Server teilen keine Akten mehr: Gruppen mit „Akten teilen“ und der gemeinsame Bestand werden aufgehoben. */
  private async unlinkRecords(tx: Prisma.TransactionClient) {
    const row = await tx.systemSetting.findUnique({ where: { key: 'servers.links' } });
    if (!row) return null;
    const v = row.value as { groups?: unknown[]; sharedRecords?: unknown[] } | null;
    if (!v?.groups?.length && !v?.sharedRecords?.length) return null;
    await tx.systemSetting.update({ where: { key: 'servers.links' }, data: { value: { groups: [], sharedRecords: [] } } });
    return v as Prisma.InputJsonValue;
  }

  /** Server registriert und aktiv; Rollen werden hier selbst angeglichen (nicht von `initServerRoles`). */
  private async ensureServer(tx: Prisma.TransactionClient, guildId: string) {
    const known = (await tx.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
    const name = (Array.isArray(known) ? (known as { id?: string; name?: string }[]).find((g) => g.id === guildId)?.name : undefined) ?? guildId;
    return tx.discordServer.upsert({
      where: { guildId },
      create: { guildId, name, status: 'ACTIVE', rolesInitializedAt: new Date() },
      update: { status: 'ACTIVE', archivedAt: null, rolesInitializedAt: new Date() },
    });
  }

  private async moveData(tx: Prisma.TransactionClient, guildId: string) {
    const space = ownSpace(guildId);
    let records = 0, keptApart = 0;
    for (const [table, uniques] of DATA_TABLES) {
      // Eindeutigkeit je Bereich: was im Ziel schon vergeben ist (Altstand aus der Zeit vor dem Ein-Server-Betrieb), bleibt stehen
      const guard = uniques.map((u) => `AND NOT EXISTS (SELECT 1 FROM "${table}" o WHERE o."serverId" = $1::uuid AND o."${u}" IS NOT NULL AND o."${u}" = t."${u}")`).join(' ');
      records += await tx.$executeRawUnsafe(`UPDATE "${table}" t SET "serverId" = $1::uuid WHERE t."serverId" IS NULL ${guard}`, space);
      if (uniques.length) {
        // übrig gebliebene Doppel nicht für alle sichtbar lassen: eigener Bereich (wie „separat belassen“ bei der Umstellung)
        keptApart += await tx.$executeRawUnsafe(`UPDATE "${table}" SET "serverId" = md5('kept-apart:' || "id"::text)::uuid WHERE "serverId" IS NULL`);
      }
    }
    // Funk-Codes: eigene Codes des Servers hatten Vorrang vor gleichnamigen zentralen – die verdeckten zentralen entfallen
    const shadowed = await tx.$executeRawUnsafe(`DELETE FROM "RadioCode" c WHERE c."guildId" IS NULL AND EXISTS (SELECT 1 FROM "RadioCode" o WHERE o."guildId" = $1 AND lower(o."code") = lower(c."code"))`, guildId);
    let guildRecords = await tx.$executeRawUnsafe(`UPDATE "RadioCode" SET "guildId" = $1 WHERE "guildId" IS NULL`, guildId);
    for (const table of GUILD_TABLES) guildRecords += await tx.$executeRawUnsafe(`UPDATE "${table}" SET "guildId" = $1 WHERE "guildId" IS NULL`, guildId);
    // Wochenarchive des Ein-Server-Betriebs auch als Archive dieses Servers (Archive sind unveränderlich – nur anhängen;
    // vorhandene derselben Woche bleiben, die zentralen Originale ebenfalls)
    const scope = scopeOfSpace(space);
    const archives = await tx.$executeRawUnsafe(`INSERT INTO "DutyWeekArchive" ("id", "scope", "weekStart", "weekEnd", "weekKey", "label", "timezone", "totalMinutes", "activeUsers", "shiftCount", "ranking", "sessions", "discordChannelId", "catchUp", "createdAt")
      SELECT gen_random_uuid(), $1, a."weekStart", a."weekEnd", a."weekKey", a."label", a."timezone", a."totalMinutes", a."activeUsers", a."shiftCount", a."ranking", a."sessions", a."discordChannelId", a."catchUp", a."createdAt"
      FROM "DutyWeekArchive" a WHERE a."scope" = 'global' AND NOT EXISTS (SELECT 1 FROM "DutyWeekArchive" o WHERE o."scope" = $1 AND o."weekStart" = a."weekStart")`, scope);
    return { records, keptApart, shadowedRadioCodes: shadowed, guildRecords, archives };
  }

  /** Zentrale Werte sind der aktuelle Stand → Einstellungen des Servers (überholte Server-Werte von früher werden ersetzt). */
  private async moveSettings(tx: Prisma.TransactionClient, guildId: string) {
    let n = 0;
    for (const key of PER_SERVER_SETTING_KEYS) {
      const central = await tx.systemSetting.findUnique({ where: { key } });
      if (!central) continue;
      const own = `${key}@${guildId}`;
      await tx.systemSetting.upsert({ where: { key: own }, create: { key: own, value: central.value as Prisma.InputJsonValue }, update: { value: central.value as Prisma.InputJsonValue } });
      n++;
      // Werte mit Rückgriff auf den zentralen Wert (Name, Teamstruktur, Farben …): zentral entfernen, sonst sähen neue Server sie
      if ((SERVER_SCOPED_SETTINGS as readonly string[]).includes(key)) await tx.systemSetting.delete({ where: { key } });
    }
    return n;
  }

  /**
   * Zentrale Rollen (= aktueller Stand) → Rollen des Servers: Rechte, Discord-Verknüpfung und Zuweisungen exakt übernehmen.
   * Server-Rollen ohne zentrales Gegenstück wurden im Ein-Server-Betrieb gelöscht → entfernt. Zentral bleiben Vorlagen ohne
   * Zuweisungen. „System Administrator“ bleibt global (manuell vergeben); wer ihn über eine Discord-Rolle hatte, wird
   * Administrator dieses Servers.
   */
  private async moveRoles(tx: Prisma.TransactionClient, guildId: string, serverId: string) {
    const templates = await tx.role.findMany({ where: { guildId: null }, include: { permissions: true, users: true } });
    let synced = 0;
    const keep = new Set<string>();
    for (const t of templates) {
      const isAdmin = t.name === ADMIN_ROLE_NAME;
      const holders = isAdmin ? t.users.filter((u) => u.guildIds.length) : t.users;
      if (isAdmin && !holders.length) continue;
      const name = isAdmin ? 'Server-Administrator' : t.name;
      const data = { description: t.description, system: isAdmin ? false : t.system, priority: t.priority, color: t.color, icon: t.icon, active: t.active, discordRoleIds: t.discordRoleIds };
      const existing = await tx.role.findFirst({ where: { guildId, name } });
      const role = existing ? await tx.role.update({ where: { id: existing.id }, data }) : await tx.role.create({ data: { guildId, name, ...data } });
      keep.add(role.id);
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (t.permissions.length) await tx.rolePermission.createMany({ data: t.permissions.map((p) => ({ roleId: role.id, permissionKey: p.permissionKey, effect: p.effect })) });
      await tx.userRole.deleteMany({ where: { roleId: role.id } });
      if (holders.length) await tx.userRole.createMany({ data: holders.map((h) => ({ userId: h.userId, roleId: role.id, guildIds: h.guildIds.length ? [guildId] : [] })), skipDuplicates: true });
      // Vorlage ohne Zuweisungen (globaler Administrator: nur Discord-Zuweisungen entfernen, manuelle bleiben)
      if (isAdmin) await tx.userRole.deleteMany({ where: { roleId: t.id, NOT: { guildIds: { isEmpty: true } } } });
      else await tx.userRole.deleteMany({ where: { roleId: t.id } });
      synced++;
    }
    // überholte Server-Rollen (im Ein-Server-Betrieb gelöscht) samt Zuweisungen entfernen; Zuordnungstabelle ist überholt
    const stale = await tx.role.deleteMany({ where: { guildId, id: { notIn: [...keep] } } });
    await tx.discordRoleMapping.deleteMany({ where: { serverId } });
    return { synced, removedStale: stale.count };
  }

  /** Persönliche Ausnahmen: zentrale (= aktueller Stand) gelten jetzt auf diesem Server; überholte Server-Ausnahmen entfallen. */
  private async moveOverrides(tx: Prisma.TransactionClient, guildId: string) {
    await tx.userPermissionOverride.deleteMany({ where: { guildId } });
    const central = await tx.userPermissionOverride.findMany({ where: { guildId: null } });
    if (central.length) await tx.userPermissionOverride.createMany({ data: central.map((o) => ({ userId: o.userId, guildId, permissionKey: o.permissionKey, effect: o.effect, reason: o.reason, createdById: o.createdById, createdAt: o.createdAt })) });
    await tx.userPermissionOverride.deleteMany({ where: { guildId: null } });
    return central.length;
  }

  /** Zentral abgeschaltete Module → auf diesem Server abgeschaltet, alle anderen an. */
  private async moveModules(tx: Prisma.TransactionClient, serverId: string) {
    const cfg = (await tx.systemSetting.findUnique({ where: { key: 'modules.config' } }))?.value as { disabled?: string[] } | null;
    const disabled = new Set(cfg?.disabled ?? []);
    const known = new Set((await tx.appModule.findMany({ select: { key: true } })).map((m) => m.key));
    let n = 0;
    for (const m of MODULES) {
      if (!known.has(m.key)) continue;
      const enabled = !disabled.has(m.key);
      const row = await tx.serverModuleSetting.findUnique({ where: { serverId_moduleKey: { serverId, moduleKey: m.key } } });
      if (row?.enabled === enabled) continue;
      await tx.serverModuleSetting.upsert({ where: { serverId_moduleKey: { serverId, moduleKey: m.key } }, create: { serverId, moduleKey: m.key, enabled }, update: { enabled, version: { increment: 1 } } });
      n++;
    }
    return { disabled: [...disabled], changed: n };
  }

  /** Konten ohne Discord (Passwort-Anmeldung) mit Rollen auf diesem Server: manuelle Mitgliedschaft, damit sie Zugang behalten. */
  private async manualMembers(tx: Prisma.TransactionClient, guildId: string, serverId: string) {
    const holders = await tx.userRole.findMany({ where: { role: { guildId } }, select: { userId: true }, distinct: ['userId'] });
    const linked = new Set((await tx.discordLink.findMany({ where: { userId: { in: holders.map((h) => h.userId) } }, select: { userId: true } })).map((l) => l.userId));
    const manual = holders.filter((h) => !linked.has(h.userId));
    for (const h of manual) {
      await tx.serverMembership.upsert({
        where: { serverId_userId: { serverId, userId: h.userId } },
        create: { serverId, userId: h.userId, status: 'MEMBER', source: 'MANUAL', lastVerifiedAt: new Date() },
        update: {},
      });
    }
    return manual.length;
  }
}
