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
exports.ServersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const authorization_service_1 = require("../authz/authorization.service");
const permission_service_1 = require("../authz/permission.service");
const discord_access_service_1 = require("../authz/discord-access.service");
const roles_service_1 = require("../users/roles.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const module_settings_1 = require("./module-settings");
const server_roles_1 = require("./server-roles");
const conflict = () => new errors_1.AppError('CONFLICT', 'Diese Einstellung wurde inzwischen von jemand anderem geändert. Bitte neu laden – deine Änderung wurde NICHT gespeichert.', { reason: 'VERSION_CONFLICT' });
/**
 * Server- und Mandantenverwaltung. Jede Methode autorisiert gegen den Server aus dem PFAD (nie gegen den Header):
 * Rechte eines Servers gelten nur dort. Registrieren, (De-)Aktivieren und Archivieren dürfen nur globale Systemadministratoren.
 */
let ServersService = class ServersService {
    prisma;
    audit;
    authz;
    perms;
    roles;
    access2;
    log = new common_1.Logger('Servers');
    constructor(prisma, audit, authz, perms, roles, access2) {
        this.prisma = prisma;
        this.audit = audit;
        this.authz = authz;
        this.perms = perms;
        this.roles = roles;
        this.access2 = access2;
    }
    /** Modul-Katalog aus dem Code in die Datenbank übernehmen (Fremdschlüssel der Server-Einstellungen). */
    async onModuleInit() {
        for (const m of shared_1.MODULES) {
            await this.prisma.appModule.upsert({ where: { key: m.key }, create: { key: m.key, name: m.name, description: m.description, isSystem: !!m.system, dependsOn: m.dependsOn ?? [] }, update: { name: m.name, description: m.description, isSystem: !!m.system, dependsOn: m.dependsOn ?? [] } }).catch((e) => this.log.warn(`Modul ${m.key}: ${e instanceof Error ? e.message : e}`));
        }
        if (process.env.NODE_ENV !== 'test') {
            await this.splitSettings().catch((e) => this.log.warn(`Einstellungen je Server: ${e instanceof Error ? e.message : e}`));
            await this.splitLaterSettings().catch((e) => this.log.warn(`Einstellungen je Server (Anmeldung/Zeitzone): ${e instanceof Error ? e.message : e}`));
        }
        // Server von vor der Trennung: einmalig bisherige Rollen samt Zuweisungen als eigene Server-Rollen übernehmen
        for (const s of await this.prisma.discordServer.findMany({ where: { rolesInitializedAt: null }, select: { id: true, name: true } })) {
            await (0, server_roles_1.initServerRoles)(this.prisma, s.id, true).then((n) => n && this.log.log(`${n} Rollen für ${s.name} übernommen`), (e) => this.log.warn(`Rollen für ${s.name}: ${e instanceof Error ? e.message : e}`));
        }
    }
    /**
     * Einmalig beim Übergang auf „Server von Grund auf getrennt“: bisher gemeinsame Einstellungen bekommt jeder bestehende
     * Server als EIGENE Kopie (danach unabhängig). Server, die später dazukommen, starten mit Standardwerten.
     */
    async splitSettings() {
        const FLAG = 'migration.serverSplit';
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${FLAG}))`;
            if (await tx.systemSetting.findUnique({ where: { key: FLAG } }))
                return;
            const servers = await tx.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true } });
            const base = await tx.systemSetting.findMany({ where: { key: { in: [...guild_context_1.PER_SERVER_SETTING_KEYS] } } });
            let copied = 0;
            for (const sv of servers) {
                const g = (0, guild_context_1.settingsGuild)(sv.guildId) ?? sv.guildId;
                for (const row of base) {
                    const r = await tx.systemSetting.createMany({ data: [{ key: `${row.key}@${g}`, value: row.value }], skipDuplicates: true });
                    copied += r.count;
                }
            }
            await tx.systemSetting.create({ data: { key: FLAG, value: { at: new Date().toISOString(), servers: servers.length, copied } } });
            if (copied)
                this.log.log(`${copied} Einstellungen auf ${servers.length} Server übertragen (je Server eigene Kopie)`);
        }, { timeout: 60_000 });
    }
    /**
     * Einmalig: Discord-Anmeldung (Teamrollen, Rollen-Zuordnung …), Zeitzone und Datumsformat gelten jetzt je Server. Jeder
     * bestehende Server bekommt den bisherigen gemeinsamen Wert als eigene Kopie – bei der Anmeldung nur mit Rollen, die zu
     * diesem Server gehören (soweit der Bot sie gemeldet hat).
     */
    async splitLaterSettings() {
        const FLAG = 'migration.serverSplit.v2';
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${FLAG}))`;
            if (await tx.systemSetting.findUnique({ where: { key: FLAG } }))
                return;
            const servers = await tx.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true } });
            const base = await tx.systemSetting.findMany({ where: { key: { in: [...guild_context_1.LATER_PER_SERVER_KEYS] } } });
            const reported = (await tx.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
            const rolesOf = new Map((Array.isArray(reported) ? reported : []).filter((g) => g.id && Array.isArray(g.roles)).map((g) => [g.id, new Set(g.roles.map((r) => r.id))]));
            let copied = 0;
            for (const sv of servers) {
                const g = (0, guild_context_1.settingsGuild)(sv.guildId) ?? sv.guildId;
                const own = rolesOf.get(g);
                for (const row of base) {
                    let value = row.value;
                    if (row.key === 'auth.discord' && own && value && typeof value === 'object' && !Array.isArray(value)) {
                        const v = value;
                        const team = (v.teamRoleIds ?? []).filter((id) => own.has(id));
                        // keine eigene Teamrolle dabei: Liste behalten – leer hieße „alle Mitglieder“ und gäbe mehr Zugang als vorher
                        value = { ...v, teamRoleIds: team.length ? team : v.teamRoleIds ?? [], roleMap: (v.roleMap ?? []).filter((m) => own.has(m.discordRoleId)) };
                    }
                    copied += (await tx.systemSetting.createMany({ data: [{ key: `${row.key}@${g}`, value }], skipDuplicates: true })).count;
                }
            }
            await tx.systemSetting.create({ data: { key: FLAG, value: { at: new Date().toISOString(), servers: servers.length, copied } } });
            if (copied)
                this.log.log(`${copied} Einstellungen (Anmeldung/Zeitzone) auf ${servers.length} Server übertragen`);
        }, { timeout: 60_000 });
    }
    // ───────── Zugriff ─────────
    async load(serverId) {
        const s = await this.prisma.discordServer.findUnique({ where: { id: serverId } });
        if (!s)
            throw new errors_1.AppError('NOT_FOUND', 'Server nicht gefunden.');
        return s;
    }
    /** Server laden und Recht auf GENAU diesem Server prüfen (fremde Server: 404 statt Hinweis auf Existenz). */
    async access(actor, serverId, permission) {
        const s = await this.load(serverId);
        try {
            await this.authz.assert(actor.userId, s.guildId, permission, {}, { requestId: actor.requestId });
        }
        catch (e) {
            if (e instanceof errors_1.AppError && e.details?.reason === 'NOT_MEMBER')
                throw new errors_1.AppError('NOT_FOUND', 'Server nicht gefunden.');
            throw e;
        }
        return s;
    }
    /** Nur Mitgliedschaft (bzw. globaler Systemadministrator) – für Auskünfte über sich selbst. */
    async accessAsMember(actor, serverId) {
        const s = await this.load(serverId);
        if (!(await this.perms.isOwner(actor.userId)) && !(await this.authz.isMember(actor.userId, s.id)))
            throw new errors_1.AppError('NOT_FOUND', 'Server nicht gefunden.');
        return s;
    }
    async requireGlobalAdmin(actor, what) {
        if (!(await this.perms.isOwner(actor.userId))) {
            await this.authz.recordDenied(actor.userId, null, `servers.${what}`, 'GLOBAL_ADMIN_REQUIRED', { requestId: actor.requestId });
            throw new errors_1.AppError('PERMISSION_DENIED', 'Das dürfen nur globale Systemadministratoren.');
        }
    }
    // ───────── Server ─────────
    /** Sichtbar: globale Systemadministratoren alle; sonst Server mit bestätigter Mitgliedschaft und `servers.view` dort. */
    async list(actor) {
        const owner = await this.perms.isOwner(actor.userId);
        const rows = await this.prisma.discordServer.findMany({ where: owner ? {} : { memberships: { some: { userId: actor.userId, status: 'MEMBER' } } }, orderBy: { name: 'asc' } });
        if (owner)
            return rows;
        const out = [];
        for (const r of rows)
            if ((await this.authz.authorize(actor.userId, r.guildId, 'servers.view')).allowed)
                out.push(r);
        return out;
    }
    async create(actor, d) {
        await this.requireGlobalAdmin(actor, 'register');
        if (await this.prisma.discordServer.findUnique({ where: { guildId: d.guildId } }))
            throw new errors_1.AppError('CONFLICT', 'Dieser Discord-Server ist bereits registriert.');
        const s = await this.prisma.$transaction(async (tx) => {
            const s = await tx.discordServer.create({ data: { guildId: d.guildId, name: d.name, status: 'ACTIVE' } });
            await (0, server_roles_1.initServerRoles)(tx, s.id, false); // neuer Server: eigene Startrollen, keine übernommenen Zuweisungen
            await this.audit.record(actor, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: s.id, serverId: s.guildId, after: { guildId: s.guildId, name: s.name } }, tx);
            return s;
        }).catch((e) => { if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new errors_1.AppError('CONFLICT', 'Dieser Discord-Server ist bereits registriert.'); throw e; });
        this.authz.invalidate();
        return s;
    }
    /** Name (servers.manage auf dem Server) bzw. Status (nur globale Systemadministratoren). Optimistisches Sperren über `version`. */
    async update(actor, serverId, d) {
        const before = d.status !== undefined ? await this.load(serverId) : await this.access(actor, serverId, 'servers.manage');
        if (d.status !== undefined)
            await this.requireGlobalAdmin(actor, 'status');
        if (before.archivedAt)
            throw new errors_1.AppError('CONFLICT', 'Archivierte Server können nicht geändert werden.');
        const r = await this.prisma.$transaction(async (tx) => {
            const u = await tx.discordServer.updateMany({ where: { id: serverId, version: d.version }, data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.status !== undefined ? { status: d.status } : {}), version: { increment: 1 } } });
            if (!u.count)
                throw conflict();
            const after = await tx.discordServer.findUniqueOrThrow({ where: { id: serverId } });
            await this.audit.record(actor, { action: d.status !== undefined && d.status !== before.status ? (d.status === 'DISABLED' ? 'server.disable' : 'server.enable') : 'server.update', module: 'servers', entityType: 'DiscordServer', entityId: serverId, serverId: before.guildId, before: { name: before.name, status: before.status }, after: { name: after.name, status: after.status } }, tx);
            return after;
        });
        this.authz.invalidate();
        return r;
    }
    /** „Löschen“ = archivieren: nicht mehr wählbar, aber ALLE Fachdaten und Archive bleiben erhalten. */
    async archive(actor, serverId) {
        await this.requireGlobalAdmin(actor, 'archive');
        const s = await this.load(serverId);
        if (s.archivedAt)
            return s;
        const r = await this.prisma.$transaction(async (tx) => {
            const after = await tx.discordServer.update({ where: { id: serverId }, data: { archivedAt: new Date(), status: 'DISABLED', version: { increment: 1 } } });
            await this.audit.record(actor, { action: 'server.archive', module: 'servers', entityType: 'DiscordServer', entityId: serverId, serverId: s.guildId, before: { status: s.status }, after: { archived: true } }, tx);
            return after;
        });
        this.authz.invalidate();
        return r;
    }
    /** Vom Bot gemeldete Server: bekannte aktualisieren (Name, Verbindungsfehler aufheben); neue werden DEAKTIVIERT angelegt und müssen freigeschaltet werden. */
    async syncFromBot(guilds) {
        for (const g of guilds) {
            if (!/^\d{15,25}$/.test(g.id))
                continue;
            const s = await this.prisma.discordServer.findUnique({ where: { guildId: g.id } });
            if (!s) {
                await this.prisma.discordServer.create({ data: { guildId: g.id, name: g.name || g.id, status: 'DISABLED' } }).then(async (c) => (await (0, server_roles_1.initServerRoles)(this.prisma, c.id, false), this.audit.record({ userId: null }, { action: 'server.discovered', module: 'servers', entityType: 'DiscordServer', entityId: c.id, serverId: g.id, after: { name: c.name, status: 'DISABLED' } })), () => undefined);
            }
            else if (s.name !== g.name || s.status === 'ERROR') {
                await this.prisma.discordServer.update({ where: { id: s.id }, data: { name: g.name || s.name, ...(s.status === 'ERROR' ? { status: 'ACTIVE' } : {}) } });
            }
        }
        this.authz.invalidate();
    }
    /** Für die Befehlsregistrierung des Bots. Nicht registriert/deaktiviert: nur Grundsystem-Befehle. */
    async botModules(guildId) {
        await this.access2.ensureConfiguredServers().catch(() => undefined);
        const s = await this.prisma.discordServer.findUnique({ where: { guildId } });
        const nonCore = shared_1.MODULES.filter((m) => !m.system).map((m) => m.key);
        if (!s || s.archivedAt || s.status === 'DISABLED')
            return { registered: !!s, status: s ? (s.archivedAt ? 'ARCHIVED' : s.status) : 'UNKNOWN', disabled: nonCore };
        return { registered: true, status: s.status, disabled: [...(await this.authz.disabledModules(s.id))] };
    }
    // ───────── Mitgliedschaften ─────────
    async members(actor, serverId) {
        await this.access(actor, serverId, 'servers.view');
        return this.prisma.serverMembership.findMany({ where: { serverId }, include: { user: { select: { id: true, displayName: true, username: true } } }, orderBy: { updatedAt: 'desc' }, take: 1000 });
    }
    /** Manuelle Mitgliedschaft für Konten ohne Discord (z. B. Passwort-Konten). Discord-geprüfte Mitgliedschaften überschreibt der Abgleich. */
    async setManualMember(actor, serverId, userId, member) {
        const s = await this.access(actor, serverId, 'servers.manage');
        if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
        const link = await this.prisma.discordLink.findUnique({ where: { userId } });
        if (link && member)
            throw new errors_1.AppError('CONFLICT', 'Dieses Konto ist mit Discord verknüpft – die Mitgliedschaft wird automatisch über Discord geprüft.');
        const status = member ? 'MEMBER' : 'LEFT';
        const r = await this.prisma.$transaction(async (tx) => {
            const m = await tx.serverMembership.upsert({ where: { serverId_userId: { serverId, userId } }, create: { serverId, userId, status, source: 'MANUAL', lastVerifiedAt: new Date() }, update: { status, source: link ? 'DISCORD' : 'MANUAL', lastVerifiedAt: new Date() } });
            await this.audit.record(actor, { action: member ? 'server.member.add' : 'server.member.remove', module: 'servers', entityType: 'ServerMembership', entityId: m.id, serverId: s.guildId, after: { userId, status } }, tx);
            return m;
        });
        return r;
    }
    // ───────── Module ─────────
    async modules(actor, serverId) {
        await this.access(actor, serverId, 'modules.view');
        const rows = await this.prisma.serverModuleSetting.findMany({ where: { serverId } });
        // global ausgeschaltete Module erscheinen nicht in der Verwaltung
        return shared_1.MODULES.filter((m) => !m.off).map((m) => {
            const r = rows.find((x) => x.moduleKey === m.key);
            return { key: m.key, name: m.name, description: m.description, system: !!m.system, dependsOn: m.dependsOn ?? [], enabled: m.system ? true : r?.enabled ?? true, settings: r ? parseSafe(m.key, r.settings) : parseSafe(m.key, {}), version: r?.version ?? 0, updatedAt: r?.updatedAt ?? null, updatedById: r?.updatedById ?? null };
        });
    }
    async module(actor, serverId, key) {
        const m = (await this.modules(actor, serverId)).find((x) => x.key === key);
        if (!m)
            throw new errors_1.AppError('NOT_FOUND', 'Unbekanntes Modul.');
        return m;
    }
    /**
     * Modul an/aus bzw. Einstellungen ändern. `version` = gelesener Stand (0 = noch nie gespeichert); ein veralteter Stand wird mit 409
     * abgelehnt – eine alte Dashboard-Ansicht überschreibt nie unbemerkt neuere Einstellungen. Abhängigkeiten werden geprüft.
     */
    async patchModule(actor, serverId, key, d) {
        const s = await this.access(actor, serverId, 'modules.manage');
        const def = (0, shared_1.moduleDef)(key);
        if (!def)
            throw new errors_1.AppError('NOT_FOUND', 'Unbekanntes Modul.');
        const settings = d.settings !== undefined ? (0, module_settings_1.parseModuleSettings)(key, d.settings) : undefined;
        const r = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${`modules:${serverId}`}))`;
            const rows = await tx.serverModuleSetting.findMany({ where: { serverId } });
            const row = rows.find((x) => x.moduleKey === key);
            if ((row?.version ?? 0) !== d.version)
                throw conflict();
            const state = Object.fromEntries(shared_1.MODULES.map((m) => [m.key, m.system ? true : rows.find((x) => x.moduleKey === m.key)?.enabled ?? true]));
            const enabled = d.enabled ?? row?.enabled ?? true;
            if (d.enabled !== undefined && d.enabled !== state[key]) {
                const err = (0, shared_1.moduleDependencyError)(key, enabled, state);
                if (err)
                    throw new errors_1.AppError('VALIDATION_FAILED', err);
            }
            const nextSettings = (settings ?? (row ? parseSafe(key, row.settings) : parseSafe(key, {})));
            const saved = row
                ? await tx.serverModuleSetting.update({ where: { id: row.id }, data: { enabled, settings: nextSettings, version: { increment: 1 }, updatedById: actor.userId } })
                : await tx.serverModuleSetting.create({ data: { serverId, moduleKey: key, enabled, settings: nextSettings, version: 1, updatedById: actor.userId } });
            const before = { enabled: row?.enabled ?? true, settings: row ? row.settings : null };
            const action = d.enabled !== undefined && d.enabled !== before.enabled ? (enabled ? 'module.enable' : 'module.disable') : 'module.settings';
            await this.audit.record(actor, { action, module: 'modules', entityType: 'ServerModuleSetting', entityId: `${s.guildId}:${key}`, serverId: s.guildId, before, after: { enabled: saved.enabled, settings: saved.settings, version: saved.version } }, tx);
            return saved;
        });
        this.authz.invalidate();
        return { key, enabled: r.enabled, settings: r.settings, version: r.version, updatedAt: r.updatedAt };
    }
    /** Einstellungen eines Moduls lesen (ohne Rechteprüfung – für interne Dienste wie den Wochen-Reset). */
    async moduleState(serverId, key) {
        const r = await this.prisma.serverModuleSetting.findUnique({ where: { serverId_moduleKey: { serverId, moduleKey: key } } });
        const def = (0, shared_1.moduleDef)(key);
        return { enabled: def?.system ? true : def?.off ? false : r?.enabled ?? true, settings: parseSafe(key, r?.settings ?? {}) };
    }
    // ───────── Rollen & Rechte je Server ─────────
    async serverRole(s, roleId) {
        const role = await this.prisma.role.findUnique({ where: { id: roleId } });
        // Rollen anderer Server (auch mit gleichem Namen) sind hier nicht vorhanden
        if (!role || role.guildId !== s.guildId)
            throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
        return role;
    }
    async listRoles(actor, serverId) {
        const s = await this.access(actor, serverId, 'roles.view');
        return this.prisma.role.findMany({ where: { guildId: s.guildId }, orderBy: [{ priority: 'asc' }, { name: 'asc' }], include: { permissions: { select: { permissionKey: true, effect: true } }, _count: { select: { users: true } } } });
    }
    async createRole(actor, serverId, d) {
        const s = await this.access(actor, serverId, 'roles.manage');
        return (0, guild_context_1.runInGuild)(s.guildId, () => this.roles.create(actor, { ...d, guildId: s.guildId }));
    }
    async updateRole(actor, serverId, roleId, d) {
        const s = await this.access(actor, serverId, 'roles.manage');
        await this.serverRole(s, roleId);
        return (0, guild_context_1.runInGuild)(s.guildId, () => this.roles.update(actor, roleId, d));
    }
    async deleteRole(actor, serverId, roleId) {
        const s = await this.access(actor, serverId, 'roles.manage');
        const role = await this.serverRole(s, roleId);
        if (role.system)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Systemrollen können nicht gelöscht werden.');
        await (0, guild_context_1.runInGuild)(s.guildId, () => this.roles.remove(actor, roleId));
    }
    async permissionCatalog(actor, serverId) {
        await this.access(actor, serverId, 'roles.view');
        const mods = await this.modules(actor, serverId);
        return shared_1.ALL_PERMISSIONS.map((p) => { const m = (0, shared_1.moduleOfPermission)(p); return { key: p, module: m, moduleEnabled: mods.find((x) => x.key === m)?.enabled ?? true }; });
    }
    async rolePermissions(actor, serverId, roleId) {
        const s = await this.access(actor, serverId, 'roles.view');
        const role = await this.serverRole(s, roleId);
        return (await this.prisma.rolePermission.findMany({ where: { roleId: role.id }, orderBy: { permissionKey: 'asc' } })).map((p) => ({ permission: p.permissionKey, effect: p.effect }));
    }
    /** Rechte einer Server-Rolle ersetzen. Delegationsregel (nur was man selbst auf DIESEM Server hat) und Rangfolge gelten. */
    async setRolePermissions(actor, serverId, roleId, grants) {
        const s = await this.access(actor, serverId, 'roles.manage');
        await this.serverRole(s, roleId);
        await (0, guild_context_1.runInGuild)(s.guildId, () => this.roles.setPermissions(actor, roleId, grants));
        return this.rolePermissions(actor, serverId, roleId);
    }
    /** Effektive Rechte eines Benutzers auf diesem Server – serverseitig berechnet. */
    async effective(actor, serverId, userId) {
        // eigene Rechte: bestätigte Mitgliedschaft genügt; fremde: roles.view auf diesem Server
        const s = userId === actor.userId ? await this.accessAsMember(actor, serverId) : await this.access(actor, serverId, 'roles.view');
        if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
        const [list, member, globalAdmin] = await Promise.all([this.authz.explain(userId, s.guildId), this.prisma.serverMembership.findUnique({ where: { serverId_userId: { serverId, userId } } }), this.perms.isOwner(userId)]);
        return { serverId, guildId: s.guildId, userId, globalAdmin, membership: member ? { status: member.status, source: member.source, lastVerifiedAt: member.lastVerifiedAt } : null, allowed: list.filter((x) => x.allowed).map((x) => x.permission), details: list };
    }
    // ───────── Discord-Rollen → interne Rollen ─────────
    async roleMappings(actor, serverId) {
        await this.access(actor, serverId, 'roles.view');
        return this.prisma.discordRoleMapping.findMany({ where: { serverId }, include: { role: { select: { id: true, name: true, guildId: true } } }, orderBy: { createdAt: 'asc' } });
    }
    /**
     * Zuordnungen dieses Servers ersetzen. Zulässig: Rollen dieses Servers oder serverübergreifende Rollen – die Zuweisung gilt
     * trotzdem nur auf diesem Server. Nur Rollen unterhalb des eigenen Rangs.
     */
    async setRoleMappings(actor, serverId, items) {
        const s = await this.access(actor, serverId, 'roles.manage');
        const roles = await this.prisma.role.findMany({ where: { id: { in: [...new Set(items.map((i) => i.roleId))] } } });
        for (const i of items) {
            const r = roles.find((x) => x.id === i.roleId);
            if (!r || (r.guildId && r.guildId !== s.guildId))
                throw new errors_1.AppError('NOT_FOUND', 'Rolle nicht gefunden.');
            if (r.name === 'System Administrator')
                throw new errors_1.AppError('PERMISSION_DENIED', 'Die Rolle „System Administrator“ kann nicht über Discord vergeben werden.');
            await (0, guild_context_1.runInGuild)(s.guildId, () => this.perms.assertOutranksRole(actor.userId, r.priority, r.name));
        }
        const before = await this.prisma.discordRoleMapping.findMany({ where: { serverId } });
        await this.prisma.$transaction(async (tx) => {
            await tx.discordRoleMapping.deleteMany({ where: { serverId } });
            if (items.length)
                await tx.discordRoleMapping.createMany({ data: items.map((i) => ({ serverId, discordRoleId: i.discordRoleId, roleId: i.roleId })), skipDuplicates: true });
            await this.audit.record(actor, { action: 'server.role_mappings', module: 'permissions', entityType: 'DiscordServer', entityId: serverId, serverId: s.guildId, before: before.map((m) => ({ discordRoleId: m.discordRoleId, roleId: m.roleId })), after: items }, tx);
        });
        return this.roleMappings(actor, serverId);
    }
    // ───────── Audit ─────────
    async auditLogs(actor, serverId, q) {
        const s = await this.access(actor, serverId, 'audit.view');
        const where = { serverId: s.guildId, ...(q.action ? { action: { startsWith: q.action } } : {}) };
        const [items, total] = await Promise.all([
            this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
            this.prisma.auditLog.count({ where }),
        ]);
        return { items, total, page: q.page, pageSize: q.pageSize };
    }
};
exports.ServersService = ServersService;
exports.ServersService = ServersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, authorization_service_1.AuthorizationService, permission_service_1.PermissionService, roles_service_1.RolesService, discord_access_service_1.DiscordAccessService])
], ServersService);
function parseSafe(key, v) {
    try {
        return (0, module_settings_1.parseModuleSettings)(key, v);
    }
    catch {
        return (0, module_settings_1.parseModuleSettings)(key, {});
    }
}
//# sourceMappingURL=servers.service.js.map