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
exports.SingleServerMigrationService = exports.FORMER_PER_SERVER_SETTINGS = exports.SINGLE_SERVER_FLAG = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const backup_service_1 = require("../backup/backup.service");
const guild_context_1 = require("../common/guild-context");
const home_server_service_1 = require("./home-server.service");
const modules_service_1 = require("./modules.service");
exports.SINGLE_SERVER_FLAG = 'migration.singleServer';
/** Einstellungen, die es früher je Discord-Server gab (`<Schlüssel>@<Server-ID>`); jetzt gibt es nur noch `<Schlüssel>`. */
exports.FORMER_PER_SERVER_SETTINGS = [
    'team.structure', 'team.rankOrder', 'dashboard.defaultLayout', 'theme.accent', 'theme.customAccents', 'org.name', 'teamchance',
    'org.serverName', 'studio.customFields', 'application.form', 'qualifications.config', 'discord.channels', 'discord.ghostPing',
    'cad.config', 'mdt.config', 'fleet.config', 'welcome.config', 'voice-support.rooms', 'verify.config', 'verify.panel', 'tickets.settings', 'shifts.config',
    'logging.config', 'leave.config', 'hr.config', 'embeds.messages', 'danger.current', 'danger.config', 'dienstnummer.settings', 'academy.config', 'radio.discord',
];
/**
 * Tabellen mit früherem Datenbereich je Server (`serverId`) und ihren Eindeutigkeiten. Nach der Umstellung gehört alles zum
 * einen Bestand (`serverId` = NULL); die Spalte bleibt (keine Strukturänderung, alte Backups bleiben einspielbar).
 */
const DATA_TABLES = [
    ['Person', ['robloxUserId']], ['Vehicle', ['plate']], ['Weapon', ['serial']], ['Report', []], ['Complaint', []], ['Investigation', []], ['WantedRecord', []],
    ['Evidence', []], ['DutySession', []], ['Ticket', []], ['LegalCode', ['code']], ['Incident', []], ['Unit', ['callsign']], ['CadMapObject', []],
    ['CadMember', ['userId', 'discordId']], ['Personnel', ['userId', 'callsign', 'serviceNumber']], ['HrRank', ['name']], ['HrRequest', []], ['HrTraining', []],
    ['HrExam', []], ['HrAnnouncement', []], ['HrPoll', []], ['ServiceNumberRange', []], ['ServiceNumber', ['display']], ['HireQueue', []], ['AcademyCourse', []],
    ['SekMember', ['userId']], ['SekReport', []], ['RadioWhitelist', ['userId']], ['Workflow', []], ['Conversation', []],
];
/** Früherer eigener Datenbereich eines Servers (wie im alten Server-Verbund aus der Server-ID abgeleitet). */
function formerOwnSpace(guildId) {
    const h = (0, node_crypto_1.createHash)('sha256').update(`records:${guildId}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/**
 * Einmalige Umstellung von „mehrere Discord-Server“ auf EINEN Server mit zentraler Konfiguration. Läuft beim Start (und nach dem
 * Einspielen eines älteren Backups), bis sie erledigt ist; mehrere Instanzen sperren sich gegenseitig.
 *
 * Vorher wird ein vollständiges Daten-Backup angelegt (Administration → Backups, Art „vor Umstellung“) – ohne Backup keine Umstellung.
 * Gelöscht wird NICHTS: Werte je Server, Server-Rollen, Ausnahmen je Server und Server-Tabellen bleiben als Archiv in der Datenbank.
 *  - Einstellungen: Der jeweils zuletzt gespeicherte Wert (zentral oder der des Servers) wird der zentrale Wert. Ersetzte zentrale
 *    Werte stehen im Ergebnis (`migration.singleServer` → `replaced`).
 *  - Rollen: Rollen des Servers werden mit der gleichnamigen zentralen Rolle zusammengeführt (Zuweisungen vereinigt; Rechte und
 *    Eigenschaften der zuletzt geänderten Fassung; Discord-Rollen-Zuordnungen des Servers kommen dazu). Ohne zentrales Gegenstück
 *    wird die Server-Rolle selbst zentral.
 *  - Persönliche Ausnahmen des Servers werden zentral; widersprechen sie einer zentralen Ausnahme, gewinnt das Verbot.
 *  - Abgeschaltete Module des Servers bleiben abgeschaltet (jetzt zentral). Wochen-Reset des Servers → zentraler Wochen-Reset, falls dieser aus war.
 *  - Fachdaten aller früheren Bereiche gehören zum einen Bestand. Würde ein Eintrag dabei eine Eindeutigkeit verletzen (z. B. zwei
 *    Personalakten desselben Benutzers), bleibt der weniger aktuelle in seinem Bereich stehen (sichtbar, nur nicht eindeutig).
 */
let SingleServerMigrationService = class SingleServerMigrationService {
    prisma;
    backup;
    home;
    log = new common_1.Logger('SingleServer');
    constructor(prisma, backup, home) {
        this.prisma = prisma;
        this.backup = backup;
        this.home = home;
    }
    async onModuleInit() {
        (0, backup_service_1.setAfterRestore)(() => this.run());
        if (process.env.NODE_ENV === 'test')
            return;
        await this.run().catch((e) => this.log.error(`Umstellung auf einen Discord-Server fehlgeschlagen (wird beim nächsten Start wiederholt): ${e instanceof Error ? e.stack ?? e.message : e}`));
    }
    /** Gibt es noch Daten aus der Multi-Server-Zeit, die zusammengeführt werden müssen? */
    async pending() {
        const [settings, roles, overrides, modules] = await Promise.all([
            this.prisma.systemSetting.count({ where: { key: { contains: '@' } } }),
            this.prisma.role.count({ where: { guildId: { not: null } } }),
            this.prisma.userPermissionOverride.count({ where: { guildId: { not: null } } }),
            this.prisma.serverModuleSetting.count(),
        ]);
        if (settings || roles || overrides || modules)
            return true;
        for (const [table] of DATA_TABLES)
            if ((await this.prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}" WHERE "serverId" IS NOT NULL`))[0].n)
                return true;
        return false;
    }
    /** Server, dessen Werte zentral werden: der eingerichtete – sonst der einzige, der in den Daten vorkommt. */
    async target() {
        const configured = (await this.home.refresh()) ?? (0, guild_context_1.homeGuild)();
        if (configured)
            return configured;
        const ids = new Set();
        for (const s of await this.prisma.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true } }))
            ids.add(s.guildId);
        for (const r of await this.prisma.role.findMany({ where: { guildId: { not: null } }, select: { guildId: true }, distinct: ['guildId'] }))
            ids.add(r.guildId);
        for (const s of await this.prisma.systemSetting.findMany({ where: { key: { contains: '@' } }, select: { key: true } })) {
            const g = s.key.split('@')[1];
            if (g && /^\d{15,25}$/.test(g))
                ids.add(g);
        }
        return ids.size === 1 ? [...ids][0] : null;
    }
    async run() {
        if (await this.prisma.systemSetting.findUnique({ where: { key: exports.SINGLE_SERVER_FLAG } }))
            return { status: 'nothing', guildId: (0, guild_context_1.homeGuild)() };
        if (!(await this.pending())) {
            await this.prisma.systemSetting.upsert({ where: { key: exports.SINGLE_SERVER_FLAG }, create: { key: exports.SINGLE_SERVER_FLAG, value: { at: new Date().toISOString(), guildId: (0, guild_context_1.homeGuild)(), nothingToDo: true } }, update: {} });
            return { status: 'nothing', guildId: (0, guild_context_1.homeGuild)() };
        }
        const guildId = await this.target();
        if (!guildId) {
            const reason = 'Es gibt Daten mehrerer Discord-Server, aber keinen eingerichteten Server. Bitte DISCORD_GUILD_ID (oder Einstellungen → Discord-Server-ID) setzen – bis dahin bleibt alles, wie es ist.';
            this.log.warn(reason);
            return { status: 'postponed', guildId: null, reason };
        }
        // Sicherheitskopie ZUERST – schlägt sie fehl, wird nichts verändert
        const backup = await this.backup.createData(null, 'vor-umstellung');
        this.log.log(`Backup vor der Umstellung angelegt: ${backup.name} (${backup.rows} Einträge)`);
        const r = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${exports.SINGLE_SERVER_FLAG}))`;
            if (await tx.systemSetting.findUnique({ where: { key: exports.SINGLE_SERVER_FLAG } }))
                return null; // andere Instanz war schneller
            const links = ((await tx.systemSetting.findUnique({ where: { key: 'servers.links' } }))?.value ?? {});
            const settings = await this.mergeSettings(tx, guildId, links);
            const roles = await this.mergeRoles(tx, guildId);
            const overrides = await this.mergeOverrides(tx, guildId);
            const modules = await this.mergeModules(tx, guildId);
            const data = await this.mergeData(tx, guildId, links);
            const summary = { at: new Date().toISOString(), guildId, backup: backup.name, settings: settings.count, replaced: settings.replaced, roles, overrides, modules, records: data.moved, keptApart: data.keptApart };
            await tx.systemSetting.create({ data: { key: exports.SINGLE_SERVER_FLAG, value: summary } });
            await tx.auditLog.create({ data: { action: 'system.single_server', module: 'settings', entityType: 'SystemSetting', entityId: exports.SINGLE_SERVER_FLAG, after: { ...summary, replaced: Object.keys(settings.replaced) }, result: 'SUCCESS' } });
            return summary;
        }, { timeout: 10 * 60_000, maxWait: 60_000 });
        if (!r)
            return { status: 'nothing', guildId };
        this.log.log(`Auf einen Discord-Server umgestellt (${guildId}): ${r.settings} Einstellungen, ${r.roles} Rollen, ${r.overrides} Ausnahmen, ${r.records} Einträge zusammengeführt${r.keptApart ? `, ${r.keptApart} doppelte Einträge separat belassen` : ''}.`);
        return { status: 'done', guildId, backup: backup.name, settings: r.settings, roles: r.roles, overrides: r.overrides, modules: r.modules, records: r.records, keptApart: r.keptApart };
    }
    /** Jeweils der zuletzt gespeicherte Wert (zentral oder der des Servers bzw. seiner früheren Einstellungs-Gruppe) wird zentral. */
    async mergeSettings(tx, guildId, links) {
        const group = (links.groups ?? []).find((g) => g.shareSettings && g.guildIds?.includes(guildId));
        const source = group?.guildIds?.[0] ?? guildId;
        const replaced = {};
        let count = 0;
        for (const key of exports.FORMER_PER_SERVER_SETTINGS) {
            const own = await tx.systemSetting.findUnique({ where: { key: `${key}@${source}` } });
            if (!own)
                continue;
            const base = await tx.systemSetting.findUnique({ where: { key } });
            if (base && base.updatedAt >= own.updatedAt)
                continue;
            if (base)
                replaced[key] = base.value;
            await tx.systemSetting.upsert({ where: { key }, create: { key, value: own.value }, update: { value: own.value } });
            count++;
        }
        return { count, replaced };
    }
    /** Letzte Änderung einer Rolle laut Audit-Log (Rechte, Name, Discord-Rollen …). */
    async lastChange(tx, roleId) {
        return (await tx.auditLog.findFirst({ where: { entityType: 'Role', entityId: roleId, module: 'permissions' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }))?.createdAt ?? null;
    }
    async mergeRoles(tx, guildId) {
        const server = await tx.discordServer.findUnique({ where: { guildId }, select: { id: true } });
        const mappings = server ? await tx.discordRoleMapping.findMany({ where: { serverId: server.id } }) : [];
        const own = await tx.role.findMany({ where: { guildId }, include: { permissions: true, users: true } });
        let merged = 0;
        for (const h of own) {
            const mapped = mappings.filter((m) => m.roleId === h.id).map((m) => m.discordRoleId);
            const g = await tx.role.findFirst({ where: { guildId: null, name: h.name }, include: { permissions: true, users: true } });
            if (!g) {
                // kein zentrales Gegenstück: die Server-Rolle wird selbst zentral
                await tx.role.update({ where: { id: h.id }, data: { guildId: null, discordRoleIds: [...new Set([...h.discordRoleIds, ...mapped])] } });
                merged++;
                continue;
            }
            const [hAt, gAt] = await Promise.all([this.lastChange(tx, h.id), this.lastChange(tx, g.id)]);
            const serverNewer = !!hAt && (!gAt || hAt > gAt);
            if (serverNewer) {
                await tx.role.update({ where: { id: g.id }, data: { description: h.description, color: h.color, icon: h.icon, active: h.active, priority: h.priority, discordRoleIds: [...new Set([...h.discordRoleIds, ...mapped])] } });
                await tx.rolePermission.deleteMany({ where: { roleId: g.id } });
                if (h.permissions.length)
                    await tx.rolePermission.createMany({ data: h.permissions.map((p) => ({ roleId: g.id, permissionKey: p.permissionKey, effect: p.effect })) });
            }
            else if (mapped.some((d) => !g.discordRoleIds.includes(d))) {
                await tx.role.update({ where: { id: g.id }, data: { discordRoleIds: [...new Set([...g.discordRoleIds, ...mapped])] } });
            }
            // Zuweisungen vereinigen: manuell schlägt „über Discord“
            for (const u of h.users) {
                const have = g.users.find((x) => x.userId === u.userId);
                if (!have)
                    await tx.userRole.create({ data: { userId: u.userId, roleId: g.id, guildIds: u.guildIds.length ? [guildId] : [] } });
                else if (have.guildIds.length && !u.guildIds.length)
                    await tx.userRole.update({ where: { userId_roleId: { userId: u.userId, roleId: g.id } }, data: { guildIds: [] } });
            }
            merged++;
        }
        return merged;
    }
    /** Ausnahmen des Servers werden zentral; bei Widerspruch gewinnt das Verbot (niemand gewinnt durch die Umstellung Rechte). */
    async mergeOverrides(tx, guildId) {
        let n = 0;
        for (const o of await tx.userPermissionOverride.findMany({ where: { guildId } })) {
            const central = await tx.userPermissionOverride.findFirst({ where: { userId: o.userId, guildId: null, permissionKey: o.permissionKey } });
            if (!central) {
                await tx.userPermissionOverride.create({ data: { userId: o.userId, guildId: null, permissionKey: o.permissionKey, effect: o.effect, reason: o.reason, createdById: o.createdById, createdAt: o.createdAt } });
                n++;
            }
            else if (central.effect !== o.effect && o.effect === 'DENY') {
                await tx.userPermissionOverride.update({ where: { id: central.id }, data: { effect: 'DENY', reason: o.reason ?? central.reason } });
                n++;
            }
        }
        return n;
    }
    async mergeModules(tx, guildId) {
        const server = await tx.discordServer.findUnique({ where: { guildId }, select: { id: true } });
        if (!server)
            return [];
        const rows = await tx.serverModuleSetting.findMany({ where: { serverId: server.id } });
        const disabled = rows.filter((r) => !r.enabled).map((r) => r.moduleKey);
        if (disabled.length) {
            // abgeschaltet bleibt abgeschaltet (vereinigt mit einer schon vorhandenen zentralen Einstellung)
            const cur = (await tx.systemSetting.findUnique({ where: { key: modules_service_1.MODULES_KEY } }))?.value;
            const value = { disabled: [...new Set([...(cur?.disabled ?? []), ...disabled])], version: (cur?.version ?? 0) + 1 };
            await tx.systemSetting.upsert({ where: { key: modules_service_1.MODULES_KEY }, create: { key: modules_service_1.MODULES_KEY, value }, update: { value } });
        }
        // Wochen-Reset des Servers (Modul „Shift Logs“) → zentraler Wochen-Reset, falls dieser ausgeschaltet war
        const wr = rows.find((r) => r.moduleKey === 'shift_logs')?.settings?.weeklyReset;
        if (wr?.enabled) {
            const cur = (await tx.systemSetting.findUnique({ where: { key: 'duty.weeklyReset' } }))?.value;
            if (cur && cur.enabled === false)
                await tx.systemSetting.update({ where: { key: 'duty.weeklyReset' }, data: { value: { ...cur, enabled: true, channelId: wr.channelId ?? null, ...(wr.topN ? { topN: wr.topN } : {}), ...(wr.mention !== undefined ? { mention: wr.mention } : {}) } } });
        }
        return disabled;
    }
    /**
     * Alle früheren Datenbereiche → ein Bestand (`serverId` = NULL). Vorrang bei Eindeutigkeiten: Bereich des Servers, dann der
     * bisherige gemeinsame Bestand, dann andere frühere Server (jeweils neueste zuerst). Wer verliert, bleibt unverändert in seinem
     * Bereich bzw. bekommt einen eigenen (nur damit die Datenbank-Eindeutigkeit hält) – gelöscht wird nichts.
     */
    async mergeData(tx, guildId, links) {
        const group = (links.groups ?? []).find((g) => g.guildIds?.includes(guildId));
        const ownSpace = group ? (group.shareRecords !== false ? group.id ?? null : formerOwnSpace(guildId)) : (links.sharedRecords ?? []).includes(guildId) ? null : formerOwnSpace(guildId);
        let moved = 0, keptApart = 0;
        for (const [table, uniques] of DATA_TABLES) {
            if (!uniques.length) {
                moved += await tx.$executeRawUnsafe(`UPDATE "${table}" SET "serverId" = NULL WHERE "serverId" IS NOT NULL`);
                continue;
            }
            if (ownSpace) {
                // bisheriger gemeinsamer Bestand, der mit dem Bereich des Servers kollidiert: der Eintrag des Servers ist der aktuelle
                const clash = uniques.map((u) => `(o."${u}" IS NOT NULL AND o."${u}" = t."${u}")`).join(' OR ');
                keptApart += await tx.$executeRawUnsafe(`UPDATE "${table}" t SET "serverId" = md5('kept-apart:' || t."id"::text)::uuid WHERE t."serverId" IS NULL AND EXISTS (SELECT 1 FROM "${table}" o WHERE o."serverId" = $1::uuid AND (${clash}))`, ownSpace);
                moved += await tx.$executeRawUnsafe(`UPDATE "${table}" SET "serverId" = NULL WHERE "serverId" = $1::uuid`, ownSpace);
            }
            // übrige frühere Bereiche einzeln (neueste zuerst), damit auch untereinander nichts doppelt wird
            const cols = uniques.map((u) => `"${u}"`).join(', ');
            const order = (await this.hasColumn(tx, table, 'updatedAt')) ? '"updatedAt" DESC' : (await this.hasColumn(tx, table, 'createdAt')) ? '"createdAt" DESC' : '"id"';
            const rows = await tx.$queryRawUnsafe(`SELECT "id"::text AS id, ${cols} FROM "${table}" WHERE "serverId" IS NOT NULL AND "serverId" <> md5('kept-apart:' || "id"::text)::uuid ORDER BY ${order}`);
            for (const row of rows) {
                const conds = uniques.filter((u) => row[u] !== null && row[u] !== undefined);
                const clash = conds.length ? (await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}" WHERE "serverId" IS NULL AND (${conds.map((u, i) => `"${u}"::text = $${i + 1}`).join(' OR ')})`, ...conds.map((u) => String(row[u]))))[0].n : 0;
                if (clash) {
                    keptApart++;
                    continue;
                }
                moved += await tx.$executeRawUnsafe(`UPDATE "${table}" SET "serverId" = NULL WHERE "id"::text = $1`, String(row.id));
            }
        }
        return { moved, keptApart };
    }
    columns = new Map();
    async hasColumn(tx, table, column) {
        if (!this.columns.has(table))
            this.columns.set(table, new Set((await tx.$queryRawUnsafe(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = $1`, table)).map((r) => r.c)));
        return this.columns.get(table).has(column);
    }
};
exports.SingleServerMigrationService = SingleServerMigrationService;
exports.SingleServerMigrationService = SingleServerMigrationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, backup_service_1.BackupService, home_server_service_1.HomeServerService])
], SingleServerMigrationService);
//# sourceMappingURL=single-server-migration.service.js.map