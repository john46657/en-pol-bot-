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
exports.NotifyService = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const realtime_service_1 = require("../realtime/realtime.service");
const web_url_1 = require("../common/web-url");
/** Ältere Benachrichtigungsarten → Ereignis im zentralen Katalog (für Filter, MDT/Leitstelle und Einstellungen). */
const LEGACY_EVENT = { APPLICATION: 'application.new', TICKET_CLAIMED: 'ticket.assigned' };
/** Wie viele Empfänger höchstens je Ereignis (Schutz vor Massen-Benachrichtigungen). */
const MAX_RECIPIENTS = 500;
/**
 * Persönliche Benachrichtigungen: speichern + sofort an offene Dashboards melden (Popup).
 * Welche Arten jemand sehen will, stellt jeder selbst ein (ausgeblendete Arten filtert die Liste).
 * Fehler beim Benachrichtigen dürfen den Fachprozess nie stören.
 */
let NotifyService = class NotifyService {
    prisma;
    rt;
    log = new common_1.Logger('Notify');
    constructor(prisma, rt) {
        this.prisma = prisma;
        this.rt = rt;
    }
    async notify(userIds, n) {
        const ids = [...new Set(userIds)].slice(0, MAX_RECIPIENTS);
        if (!ids.length)
            return;
        try {
            const event = LEGACY_EVENT[n.type] ?? null;
            await this.prisma.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, event, important: !!(event && (0, shared_1.notificationEvent)(event)?.important), title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), entityType: n.entityType, entityId: n.entityId })) });
            for (const id of ids)
                this.rt.publishToUser(id, 'notification.new', { type: n.type, title: n.title.slice(0, 200) });
        }
        catch (e) {
            this.log.warn(`notification failed: ${e instanceof Error ? e.message : e}`);
        }
    }
    /** Aktive Benutzer mit einem Recht (im angegebenen Server bzw. serverübergreifend), ohne `exceptUserId`. Gebündelt: 5 Abfragen insgesamt. */
    async usersWith(permission, opts = {}) {
        const users = await this.prisma.user.findMany({ where: { active: true, ...(opts.exceptUserId ? { id: { not: opts.exceptUserId } } : {}) }, select: { id: true }, take: 5000 });
        const ids = users.map((u) => u.id);
        // Server der Anfrage (Standard): dort gelten nur dessen Rollen und nur für bestätigte Mitglieder – wie im AuthorizationService
        const g = opts.guildId !== undefined ? opts.guildId : (0, guild_context_1.currentGuild)();
        const [direct, groups, overrides, roles, server] = await Promise.all([
            this.prisma.userRole.findMany({ where: { userId: { in: ids } } }),
            this.prisma.groupMember.findMany({ where: { userId: { in: ids } }, select: { userId: true, group: { select: { roles: { select: { roleId: true } } } } } }),
            this.prisma.userPermissionOverride.findMany({ where: { userId: { in: ids }, guildId: g } }),
            this.prisma.role.findMany({ where: { active: true, ...(g ? { OR: [{ guildId: g }, { guildId: null, name: 'System Administrator' }] } : { guildId: null }) }, select: { id: true, guildId: true, name: true, priority: true } }),
            g ? this.prisma.discordServer.findUnique({ where: { guildId: g }, select: { id: true, memberships: { where: { status: 'MEMBER' }, select: { userId: true } } } }) : null,
        ]);
        const valid = new Set(roles.map((r) => r.id));
        const adminRole = roles.find((r) => r.guildId === null && r.name === 'System Administrator')?.id;
        const members = server ? new Set(server.memberships.map((m) => m.userId)) : null;
        const grants = await this.prisma.rolePermission.findMany({ where: { roleId: { in: [...valid] } } });
        const byRole = new Map();
        const rankOf = new Map(roles.map((r) => [r.id, r.priority]));
        for (const x of grants)
            byRole.set(x.roleId, [...(byRole.get(x.roleId) ?? []), { permission: x.permissionKey, effect: x.effect === 'DENY' ? 'DENY' : 'ALLOW', rank: rankOf.get(x.roleId) }]);
        const rolesOf = new Map();
        const add = (u, r) => { if (valid.has(r))
            rolesOf.set(u, (rolesOf.get(u) ?? new Set()).add(r)); };
        for (const d of direct) {
            if (d.guildIds.length && !(g && d.guildIds.includes(g)))
                continue; // über Discord vergeben: nur auf diesen Servern
            if (g && d.roleId === adminRole && d.guildIds.length)
                continue; // globaler Admin nur manuell
            add(d.userId, d.roleId);
        }
        for (const m of groups)
            for (const r of m.group.roles)
                add(m.userId, r.roleId);
        const out = [];
        for (const id of ids) {
            if (members && !members.has(id) && !(adminRole && rolesOf.get(id)?.has(adminRole)))
                continue; // nur Mitglieder dieses Servers
            const ctx = { userOverrides: overrides.filter((o) => o.userId === id).map((o) => ({ permission: o.permissionKey, effect: (o.effect === 'DENY' ? 'DENY' : 'ALLOW') })), roleGrants: [...(rolesOf.get(id) ?? [])].flatMap((r) => byRole.get(r) ?? []) };
            if ((0, shared_1.can)(ctx, permission))
                out.push(id);
            if (out.length >= MAX_RECIPIENTS)
                break;
        }
        return out;
    }
    async notifyPermission(permission, n, opts = {}) {
        try {
            await this.notify(await this.usersWith(permission, opts), n);
        }
        catch (e) {
            this.log.warn(`notification failed: ${e instanceof Error ? e.message : e}`);
        }
    }
    /** Persönliche Benachrichtigungs-Einstellungen (UserSettings.preferences.notifications). */
    async prefsOf(userIds) {
        const rows = await this.prisma.userSettings.findMany({ where: { userId: { in: userIds } }, select: { userId: true, preferences: true } });
        return new Map(rows.map((r) => [r.userId, (r.preferences?.notifications ?? {})]));
    }
    /** Vom Administrator abgeschaltete Ereignisse (notifications.manage). */
    async disabledEvents() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'notifications.rules' } }))?.value;
        return Array.isArray(v?.disabled) ? v.disabled.filter((x) => typeof x === 'string') : [];
    }
    /**
     * Zentrale Zustellung für Dashboard, MDT, Leitstelle und Discord: speichert je Empfänger (außer stummgeschaltet),
     * meldet offene Dashboards sofort, schickt eine DM nur mit Zustimmung des Empfängers. Mit `dedupeKey` kommt dieselbe
     * Benachrichtigung nie doppelt (auch nicht als DM) – z. B. wenn Dashboard und Discord gleichzeitig dieselbe Aktion auslösen.
     * Fehler stören den Fachprozess nie. Liefert die Anzahl neu gespeicherter Benachrichtigungen.
     */
    async emit(event, userIds, n) {
        try {
            const def = (0, shared_1.notificationEvent)(event);
            if (!def) {
                this.log.warn(`unknown notification event ${event}`);
                return 0;
            }
            if ((await this.disabledEvents()).includes(event))
                return 0;
            const ids = [...new Set(userIds.filter(Boolean))].slice(0, MAX_RECIPIENTS);
            if (!ids.length)
                return 0;
            const prefs = await this.prefsOf(ids);
            const users = await this.prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
            const active = new Set(users.map((u) => u.id));
            const created = [], dms = [];
            for (const userId of ids) {
                if (!active.has(userId))
                    continue;
                const d = (0, shared_1.deliveryFor)(event, prefs.get(userId));
                if (!d.store && !d.dm)
                    continue;
                let fresh = true;
                if (d.store) {
                    try {
                        await this.prisma.notification.create({ data: { userId, type: def.group.toUpperCase().slice(0, 40), event, important: d.important, title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), link: n.link?.slice(0, 300), entityType: n.entityType, entityId: n.entityId, dedupeKey: n.dedupeKey ? `${event}:${n.dedupeKey}`.slice(0, 200) : null } });
                        created.push(userId);
                    }
                    catch (e) {
                        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                            fresh = false; // schon benachrichtigt
                        else
                            throw e;
                    }
                }
                if (d.dm && fresh && n.dm !== false)
                    dms.push(userId);
            }
            for (const id of created)
                this.rt.publishToUser(id, 'notification.new', { type: event, title: n.title.slice(0, 200), important: !!def.important });
            if (dms.length) {
                const links = await this.prisma.discordLink.findMany({ where: { userId: { in: dms } }, select: { discordId: true } });
                const text = (n.dmText ?? n.title).slice(0, 3500);
                const url = n.link ? (0, web_url_1.webUrl)(n.link) : null;
                if (links.length)
                    await this.prisma.discordOutbox.createMany({ data: links.map((l) => ({ type: 'bot.dm', channelKey: 'duty', payload: { discordId: l.discordId, message: { embeds: [{ title: def.label.slice(0, 256), description: `${text}${url ? `\n\n[Im Dashboard öffnen](${url})` : ''}`, color: def.important ? 0xf59e0b : 0x3b82f6, footer: 'Benachrichtigung · Einstellungen im Dashboard unter Persönlich' }] } } })) });
            }
            return created.length;
        }
        catch (e) {
            this.log.warn(`notification ${event} failed: ${e instanceof Error ? e.message : e}`);
            return 0;
        }
    }
    /** Wie `emit`, an alle mit einem Recht (im Server der Anfrage). */
    async emitPermission(event, permission, n, opts = {}) {
        try {
            return await this.emit(event, await this.usersWith(permission, opts), n);
        }
        catch (e) {
            this.log.warn(`notification failed: ${e instanceof Error ? e.message : e}`);
            return 0;
        }
    }
};
exports.NotifyService = NotifyService;
exports.NotifyService = NotifyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, realtime_service_1.RealtimeService])
], NotifyService);
//# sourceMappingURL=notify.service.js.map