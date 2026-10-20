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
exports.AuthorizationService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("./permission.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const MESSAGES = {
    UNKNOWN_SERVER: 'Dieser Discord-Server ist nicht registriert.',
    SERVER_DISABLED: 'Dieser Server ist deaktiviert.',
    NOT_MEMBER: 'Du bist auf diesem Discord-Server kein (bestätigtes) Mitglied.',
    MODULE_DISABLED: 'Dieses Modul ist auf diesem Server deaktiviert.',
    PERMISSION: 'Dafür fehlt dir die Berechtigung.',
    FOREIGN_RECORD: 'Dieser Datensatz gehört zu einem anderen Server.',
};
const deny = (reason, message = MESSAGES[reason]) => ({ allowed: false, reason, message });
const TTL = 5_000;
/**
 * Zentrale Zugriffsentscheidung für ALLE geschützten Aktionen (PermissionGuard, Server-/Verbindungs-APIs, Bot-Aufrufe):
 * authentifizierter Benutzer → Server registriert und aktiv → bestätigte Mitgliedschaft → Modul an → Berechtigung (höchste Rolle entscheidet, in einer Rolle DENY vor ALLOW)
 * → Datensatz im erlaubten Bereich → ggf. aktive Datenfreigabe. Standard ist „verweigert“.
 * Globale Systemadministratoren überspringen NUR die Mitgliedschaftsprüfung (Notfall-/Verwaltungszugang); Module und
 * Mandantengrenzen gelten auch für sie. Server-Administratoren haben Rechte nur auf ihrem Server (Rollen mit `guildId`).
 */
let AuthorizationService = class AuthorizationService {
    prisma;
    perms;
    audit;
    servers = new Map();
    modules = new Map();
    deniedLog = new Map();
    constructor(prisma, perms, audit) {
        this.prisma = prisma;
        this.perms = perms;
        this.audit = audit;
    }
    /** Nach Änderungen an Servern/Modulen (diese Instanz sofort, andere spätestens nach 5 s). */
    invalidate() { this.servers.clear(); this.modules.clear(); }
    async server(guildId) {
        const c = this.servers.get(guildId);
        if (c && Date.now() - c.at < TTL)
            return c.row;
        const row = await this.prisma.discordServer.findUnique({ where: { guildId }, select: { id: true, guildId: true, name: true, status: true, archivedAt: true } });
        this.servers.set(guildId, { at: Date.now(), row });
        return row;
    }
    /** Abgeschaltete Module eines Servers (ohne Eintrag = an). */
    async disabledModules(serverId) {
        const c = this.modules.get(serverId);
        if (c && Date.now() - c.at < TTL)
            return c.disabled;
        const rows = await this.prisma.serverModuleSetting.findMany({ where: { serverId, enabled: false }, select: { moduleKey: true } });
        const disabled = new Set(rows.map((r) => r.moduleKey));
        this.modules.set(serverId, { at: Date.now(), disabled });
        return disabled;
    }
    async isMember(userId, serverId) {
        return !!(await this.prisma.serverMembership.findFirst({ where: { serverId, userId, status: 'MEMBER' }, select: { id: true } }));
    }
    /** Server-/Mitgliedschafts-/Modulprüfung ohne Berechtigung (für Listen effektiver Rechte und eigene Prüfungen). */
    async gate(userId, guildId, permission, owner) {
        const server = await this.server(guildId);
        if (!server)
            return deny('UNKNOWN_SERVER');
        const module = (0, shared_1.moduleOfPermission)(permission);
        if ((server.archivedAt || server.status === 'DISABLED') && module !== 'core')
            return deny('SERVER_DISABLED');
        if (!(owner ?? (await this.perms.isOwner(userId))) && !(await this.isMember(userId, server.id)))
            return deny('NOT_MEMBER');
        if (module !== 'core' && (await this.disabledModules(server.id)).has(module))
            return deny('MODULE_DISABLED');
        return { allowed: true };
    }
    /**
     * authorize(user, server, permission, resourceContext). `guildId` = Server der Aktion (Header X-Guild-Id bzw. Pfad-Server),
     * `null` = „Alle Server“: dann gelten nur serverübergreifende, manuell vergebene Rollen und keine Modulprüfung.
     */
    async authorize(userId, guildId, permission, resource = {}) {
        if (guildId) {
            const g = await this.gate(userId, guildId, permission);
            if (!g.allowed)
                return g;
        }
        if (!(0, shared_1.resolvePermission)(await this.perms.contextFor(userId, guildId), permission).allowed)
            return deny('PERMISSION');
        if (resource.space !== undefined && guildId) {
            const allowed = (0, guild_context_1.recordSpace)(guildId);
            if (allowed !== undefined && resource.space !== allowed)
                return deny('FOREIGN_RECORD');
        }
        return { allowed: true };
    }
    /** Wie `authorize`, wirft aber `PERMISSION_DENIED`/`NOT_FOUND` und protokolliert die Verweigerung (gedrosselt). */
    async assert(userId, guildId, permission, resource = {}, meta = {}) {
        const d = await this.authorize(userId, guildId, permission, resource);
        if (d.allowed)
            return;
        await this.recordDenied(userId, guildId, permission, d.reason, meta);
        // fremde Datensätze verraten nicht, dass es sie gibt
        if (d.reason === 'FOREIGN_RECORD')
            throw new errors_1.AppError('NOT_FOUND', 'Nicht gefunden.');
        throw new errors_1.AppError('PERMISSION_DENIED', d.message, { reason: d.reason, ...(d.reason === 'PERMISSION' ? { permission } : {}) });
    }
    /** Verweigerte sicherheitsrelevante Zugriffe: SecurityEvent + Audit (DENIED), je Benutzer/Recht/Server höchstens einmal pro Minute. */
    async recordDenied(userId, guildId, permission, reason, meta = {}) {
        const key = `${userId}|${guildId}|${permission}|${reason}`;
        const now = Date.now();
        if (now - (this.deniedLog.get(key) ?? 0) < 60_000)
            return;
        this.deniedLog.set(key, now);
        if (this.deniedLog.size > 10_000)
            this.deniedLog.clear();
        await this.prisma.securityEvent.create({ data: { type: 'PERMISSION_DENIED', userId, detail: `${permission} (${reason}${guildId ? ` @${guildId}` : ''})`.slice(0, 200), requestId: meta.requestId, ip: meta.ip } }).catch(() => undefined);
        await this.audit.record({ userId, requestId: meta.requestId }, { action: 'access.denied', module: 'permissions', entityType: 'Permission', entityId: permission, after: { reason }, serverId: guildId, result: 'DENIED' }).catch(() => undefined);
    }
    /** Effektive Rechte auf einem Server – serverseitig berechnet (Rollen dieses Servers, Mitgliedschaft, Module). */
    async effective(userId, guildId = (0, guild_context_1.currentGuild)()) {
        const all = await this.perms.effective(userId, guildId);
        if (!guildId)
            return all;
        const owner = await this.perms.isOwner(userId);
        const out = [];
        const cache = new Map();
        for (const p of all) {
            const m = (0, shared_1.moduleOfPermission)(p);
            if (!cache.has(m))
                cache.set(m, (await this.gate(userId, guildId, p, owner)).allowed);
            if (cache.get(m))
                out.push(p);
        }
        return out;
    }
    /** Effektive Rechte mit Begründung je Recht (für die Verwaltung). */
    async explain(userId, guildId) {
        const ctx = await this.perms.contextFor(userId, guildId);
        const owner = await this.perms.isOwner(userId);
        const gates = new Map();
        return Promise.all(shared_1.ALL_PERMISSIONS.map(async (p) => {
            const m = (0, shared_1.moduleOfPermission)(p);
            if (!gates.has(m))
                gates.set(m, await this.gate(userId, guildId, p, owner));
            const g = gates.get(m);
            const r = (0, shared_1.resolvePermission)(ctx, p);
            return { permission: p, module: m, allowed: g.allowed && r.allowed, source: r.source, blockedBy: g.allowed ? null : g.reason };
        }));
    }
};
exports.AuthorizationService = AuthorizationService;
exports.AuthorizationService = AuthorizationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, audit_service_1.AuditService])
], AuthorizationService);
//# sourceMappingURL=authorization.service.js.map