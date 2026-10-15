"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiServerRestoreService = exports.GUILD_TABLES = exports.DATA_TABLES = exports.MULTI_RESTORE_FLAG = exports.SINGLE_SERVER_FLAG = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const backup_service_1 = require("../backup/backup.service");
const server_links_service_1 = require("../server-links/server-links.service");
const guild_context_1 = require("../common/guild-context");
const server_roles_1 = require("./server-roles");
const weekly_reset_1 = require("../duty/weekly-reset");
/** Gesetzt von der früheren Umstellung „ein fester Discord-Server“ (Wert: `guildId` des Servers, für den zusammengeführt wurde). */
exports.SINGLE_SERVER_FLAG = 'migration.singleServer';
/** Gesetzt, sobald die Daten aus dem Ein-Server-Betrieb wieder einem Server gehören. */
exports.MULTI_RESTORE_FLAG = 'migration.multiServerRestore';
/**
 * Tabellen mit Akten-Bereich (`serverId`) und ihren Eindeutigkeiten je Bereich. Im Ein-Server-Betrieb gehörte alles zum
 * Bestand `serverId` = NULL; jetzt gehört es dem Server, für den damals zusammengeführt wurde.
 */
exports.DATA_TABLES = [
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
exports.GUILD_TABLES = [
    'Unit', 'Incident', 'LeaveRequest', 'Application', 'ApplicationBan', 'QualificationApplication', 'TicketPanel', 'TicketCategory', 'ErlcServer',
    'CadIncidentLog', 'CadRadioMessage', 'PanelSubmission', 'DutyReport', 'HrTrainingSession', 'CadHandover', 'CadIncidentStat',
    'MessageBuilderCategory', 'MessageBuilderDocument', 'MessageBuilderSend', 'MessageBuilderAction', 'MessageBuilderWebhook',
];
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
let MultiServerRestoreService = class MultiServerRestoreService {
    prisma;
    backup;
    links;
    log = new common_1.Logger('MultiServer');
    constructor(prisma, backup, links) {
        this.prisma = prisma;
        this.backup = backup;
        this.links = links;
    }
    async onModuleInit() {
        (0, backup_service_1.setAfterRestore)(() => this.run());
        if (process.env.NODE_ENV === 'test')
            return;
        await this.run().catch((e) => this.log.error(`Rück-Umstellung auf getrennte Server fehlgeschlagen (wird beim nächsten Start wiederholt): ${e instanceof Error ? e.stack ?? e.message : e}`));
    }
    /** Steht die Rück-Umstellung noch aus? (Ein-Server-Betrieb lief, Rück-Umstellung noch nicht.) */
    async pending() {
        const [single, multi] = await Promise.all([
            this.prisma.systemSetting.findUnique({ where: { key: exports.SINGLE_SERVER_FLAG } }),
            this.prisma.systemSetting.findUnique({ where: { key: exports.MULTI_RESTORE_FLAG } }),
        ]);
        return !!single && !multi;
    }
    /** Server, dem die Daten gehören: der, für den zusammengeführt wurde – sonst der eingerichtete. */
    async home() {
        const flag = (await this.prisma.systemSetting.findUnique({ where: { key: exports.SINGLE_SERVER_FLAG } }))?.value;
        const channels = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value;
        return [flag?.guildId, process.env.DISCORD_GUILD_ID, channels?.guildId].join(',').split(/[\s,;]+/).find((g) => /^\d{15,25}$/.test(g)) ?? null;
    }
    async run() {
        if (!(await this.pending()))
            return { status: 'nothing', guildId: null };
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
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${exports.MULTI_RESTORE_FLAG}))`;
            if (await tx.systemSetting.findUnique({ where: { key: exports.MULTI_RESTORE_FLAG } }))
                return null; // andere Instanz war schneller
            const links = await this.unlinkRecords(tx);
            const server = await this.ensureServer(tx, guildId);
            const data = await this.moveData(tx, guildId);
            const settings = await this.moveSettings(tx, guildId);
            const roles = await this.moveRoles(tx, guildId, server.id);
            const overrides = await this.moveOverrides(tx, guildId);
            const modules = await this.moveModules(tx, server.id);
            const members = await this.manualMembers(tx, guildId, server.id);
            const s = { at: new Date().toISOString(), guildId, backup: backup.name, ...data, settings, roles, overrides, modules, manualMembers: members, unlinked: links };
            await tx.systemSetting.create({ data: { key: exports.MULTI_RESTORE_FLAG, value: s } });
            await tx.auditLog.create({ data: { action: 'system.multi_server_restore', module: 'settings', entityType: 'SystemSetting', entityId: exports.MULTI_RESTORE_FLAG, serverId: guildId, after: s, result: 'SUCCESS' } });
            return s;
        }, { timeout: 10 * 60_000, maxWait: 60_000 });
        await this.links.reload();
        await this.links.assignLegacyRecords().catch((e) => this.log.warn(`Zuordnung alter Einträge: ${e instanceof Error ? e.message : e}`));
        if (!summary)
            return { status: 'nothing', guildId };
        this.log.log(`Getrennte Discord-Server wiederhergestellt: alle bisherigen Daten gehören jetzt ${summary.guildId} (${JSON.stringify({ records: summary.records, guildRecords: summary.guildRecords, settings: summary.settings, roles: summary.roles })}).`);
        return { status: 'done', guildId, backup: backup.name, summary };
    }
    /** Server teilen keine Akten mehr: Gruppen mit „Akten teilen“ und der gemeinsame Bestand werden aufgehoben. */
    async unlinkRecords(tx) {
        const row = await tx.systemSetting.findUnique({ where: { key: 'servers.links' } });
        if (!row)
            return null;
        const v = row.value;
        if (!v?.groups?.length && !v?.sharedRecords?.length)
            return null;
        await tx.systemSetting.update({ where: { key: 'servers.links' }, data: { value: { groups: [], sharedRecords: [] } } });
        return v;
    }
    /** Server registriert und aktiv; Rollen werden hier selbst angeglichen (nicht von `initServerRoles`). */
    async ensureServer(tx, guildId) {
        const known = (await tx.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
        const name = (Array.isArray(known) ? known.find((g) => g.id === guildId)?.name : undefined) ?? guildId;
        return tx.discordServer.upsert({
            where: { guildId },
            create: { guildId, name, status: 'ACTIVE', rolesInitializedAt: new Date() },
            update: { status: 'ACTIVE', archivedAt: null, rolesInitializedAt: new Date() },
        });
    }
    async moveData(tx, guildId) {
        const space = (0, server_links_service_1.ownSpace)(guildId);
        let records = 0, keptApart = 0;
        for (const [table, uniques] of exports.DATA_TABLES) {
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
        for (const table of exports.GUILD_TABLES)
            guildRecords += await tx.$executeRawUnsafe(`UPDATE "${table}" SET "guildId" = $1 WHERE "guildId" IS NULL`, guildId);
        // Wochenarchive des Ein-Server-Betriebs auch als Archive dieses Servers (Archive sind unveränderlich – nur anhängen;
        // vorhandene derselben Woche bleiben, die zentralen Originale ebenfalls)
        const scope = (0, weekly_reset_1.scopeOfSpace)(space);
        const archives = await tx.$executeRawUnsafe(`INSERT INTO "DutyWeekArchive" ("id", "scope", "weekStart", "weekEnd", "weekKey", "label", "timezone", "totalMinutes", "activeUsers", "shiftCount", "ranking", "sessions", "discordChannelId", "catchUp", "createdAt")
      SELECT gen_random_uuid(), $1, a."weekStart", a."weekEnd", a."weekKey", a."label", a."timezone", a."totalMinutes", a."activeUsers", a."shiftCount", a."ranking", a."sessions", a."discordChannelId", a."catchUp", a."createdAt"
      FROM "DutyWeekArchive" a WHERE a."scope" = 'global' AND NOT EXISTS (SELECT 1 FROM "DutyWeekArchive" o WHERE o."scope" = $1 AND o."weekStart" = a."weekStart")`, scope);
        return { records, keptApart, shadowedRadioCodes: shadowed, guildRecords, archives };
    }
    /** Zentrale Werte sind der aktuelle Stand → Einstellungen des Servers (überholte Server-Werte von früher werden ersetzt). */
    async moveSettings(tx, guildId) {
        let n = 0;
        for (const key of guild_context_1.PER_SERVER_SETTING_KEYS) {
            const central = await tx.systemSetting.findUnique({ where: { key } });
            if (!central)
                continue;
            const own = `${key}@${guildId}`;
            await tx.systemSetting.upsert({ where: { key: own }, create: { key: own, value: central.value }, update: { value: central.value } });
            n++;
            // Werte mit Rückgriff auf den zentralen Wert (Name, Teamstruktur, Farben …): zentral entfernen, sonst sähen neue Server sie
            if (guild_context_1.SERVER_SCOPED_SETTINGS.includes(key))
                await tx.systemSetting.delete({ where: { key } });
        }
        return n;
    }
    /**
     * Zentrale Rollen (= aktueller Stand) → Rollen des Servers: Rechte, Discord-Verknüpfung und Zuweisungen exakt übernehmen.
     * Server-Rollen ohne zentrales Gegenstück wurden im Ein-Server-Betrieb gelöscht → entfernt. Zentral bleiben Vorlagen ohne
     * Zuweisungen. „System Administrator“ bleibt global (manuell vergeben); wer ihn über eine Discord-Rolle hatte, wird
     * Administrator dieses Servers.
     */
    async moveRoles(tx, guildId, serverId) {
        const templates = await tx.role.findMany({ where: { guildId: null }, include: { permissions: true, users: true } });
        let synced = 0;
        const keep = new Set();
        for (const t of templates) {
            const isAdmin = t.name === server_roles_1.ADMIN_ROLE_NAME;
            const holders = isAdmin ? t.users.filter((u) => u.guildIds.length) : t.users;
            if (isAdmin && !holders.length)
                continue;
            const name = isAdmin ? 'Server-Administrator' : t.name;
            const data = { description: t.description, system: isAdmin ? false : t.system, priority: t.priority, color: t.color, icon: t.icon, active: t.active, discordRoleIds: t.discordRoleIds };
            const existing = await tx.role.findFirst({ where: { guildId, name } });
            const role = existing ? await tx.role.update({ where: { id: existing.id }, data }) : await tx.role.create({ data: { guildId, name, ...data } });
            keep.add(role.id);
            await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
            if (t.permissions.length)
                await tx.rolePermission.createMany({ data: t.permissions.map((p) => ({ roleId: role.id, permissionKey: p.permissionKey, effect: p.effect })) });
            await tx.userRole.deleteMany({ where: { roleId: role.id } });
            if (holders.length)
                await tx.userRole.createMany({ data: holders.map((h) => ({ userId: h.userId, roleId: role.id, guildIds: h.guildIds.length ? [guildId] : [] })), skipDuplicates: true });
            // Vorlage ohne Zuweisungen (globaler Administrator: nur Discord-Zuweisungen entfernen, manuelle bleiben)
            if (isAdmin)
                await tx.userRole.deleteMany({ where: { roleId: t.id, NOT: { guildIds: { isEmpty: true } } } });
            else
                await tx.userRole.deleteMany({ where: { roleId: t.id } });
            synced++;
        }
        // überholte Server-Rollen (im Ein-Server-Betrieb gelöscht) samt Zuweisungen entfernen; Zuordnungstabelle ist überholt
        const stale = await tx.role.deleteMany({ where: { guildId, id: { notIn: [...keep] } } });
        await tx.discordRoleMapping.deleteMany({ where: { serverId } });
        return { synced, removedStale: stale.count };
    }
    /** Persönliche Ausnahmen: zentrale (= aktueller Stand) gelten jetzt auf diesem Server; überholte Server-Ausnahmen entfallen. */
    async moveOverrides(tx, guildId) {
        await tx.userPermissionOverride.deleteMany({ where: { guildId } });
        const central = await tx.userPermissionOverride.findMany({ where: { guildId: null } });
        if (central.length)
            await tx.userPermissionOverride.createMany({ data: central.map((o) => ({ userId: o.userId, guildId, permissionKey: o.permissionKey, effect: o.effect, reason: o.reason, createdById: o.createdById, createdAt: o.createdAt })) });
        await tx.userPermissionOverride.deleteMany({ where: { guildId: null } });
        return central.length;
    }
    /** Zentral abgeschaltete Module → auf diesem Server abgeschaltet, alle anderen an. */
    async moveModules(tx, serverId) {
        const cfg = (await tx.systemSetting.findUnique({ where: { key: 'modules.config' } }))?.value;
        const disabled = new Set(cfg?.disabled ?? []);
        const known = new Set((await tx.appModule.findMany({ select: { key: true } })).map((m) => m.key));
        let n = 0;
        for (const m of shared_1.MODULES) {
            if (!known.has(m.key))
                continue;
            const enabled = !disabled.has(m.key);
            const row = await tx.serverModuleSetting.findUnique({ where: { serverId_moduleKey: { serverId, moduleKey: m.key } } });
            if (row?.enabled === enabled)
                continue;
            await tx.serverModuleSetting.upsert({ where: { serverId_moduleKey: { serverId, moduleKey: m.key } }, create: { serverId, moduleKey: m.key, enabled }, update: { enabled, version: { increment: 1 } } });
            n++;
        }
        return { disabled: [...disabled], changed: n };
    }
    /** Konten ohne Discord (Passwort-Anmeldung) mit Rollen auf diesem Server: manuelle Mitgliedschaft, damit sie Zugang behalten. */
    async manualMembers(tx, guildId, serverId) {
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
};
exports.MultiServerRestoreService = MultiServerRestoreService;
exports.MultiServerRestoreService = MultiServerRestoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, backup_service_1.BackupService, server_links_service_1.ServerLinksService])
], MultiServerRestoreService);
//# sourceMappingURL=multi-server-restore.service.js.map