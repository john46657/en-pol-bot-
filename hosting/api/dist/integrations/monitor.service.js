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
exports.MonitorService = exports.monitorConfigSchema = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const notify_service_1 = require("../notifications/notify.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const KEY = 'integrations.config';
const SYSTEM = { userId: null };
exports.monitorConfigSchema = zod_1.z.object({
    /** Alarm, wenn eine Störung so lange ununterbrochen anhält (Minuten) … */
    alertAfterMinutes: zod_1.z.number().int().min(1).max(24 * 60).default(10),
    /** … oder so oft hintereinander aufgetreten ist */
    alertAfterFailures: zod_1.z.number().int().min(1).max(1000).default(5),
    /** Discord-Nachrichten gelten als hängend, wenn sie so lange nicht abgeholt wurden (Minuten) */
    outboxStaleMinutes: zod_1.z.number().int().min(1).max(24 * 60).default(10),
});
/** Fehlermeldungen kürzen; Zugangsdaten tauchen hier nie auf (ER:LC-Client entfernt den Key schon vorher). */
const clip = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 500);
/**
 * Technische Überwachung: offene Störungen je Quelle (ER:LC-Server, einzelne Verarbeitungsschritte, Backups, Discord-Ausgang)
 * dauerhaft protokollieren. Wiederholte Fehler derselben Quelle werden zusammengefasst; hält eine Störung an, werden die
 * Administratoren (Recht `integrations.view`) benachrichtigt und – falls eingerichtet – der Logging-Kanal in Discord.
 * Erholt sich die Quelle, wird die Störung als behoben markiert (bleibt im Protokoll).
 */
let MonitorService = class MonitorService {
    prisma;
    notify;
    audit;
    log = new common_1.Logger('Monitor');
    constructor(prisma, notify, audit) {
        this.prisma = prisma;
        this.notify = notify;
        this.audit = audit;
    }
    async config() {
        const p = exports.monitorConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value ?? {});
        return p.success ? p.data : exports.monitorConfigSchema.parse({});
    }
    async saveConfig(actor, c) {
        const v = exports.monitorConfigSchema.parse(c);
        await this.prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: v }, update: { value: v } });
        await this.audit.record(actor, { action: 'integrations.config', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: v });
        return v;
    }
    where(source, sourceId, step) {
        return { source, sourceId, step, status: 'OPEN' };
    }
    /**
     * Fehler melden: offene Störung derselben Quelle hochzählen oder neu anlegen. `immediate` = sofort alarmieren (z. B. fehlgeschlagenes Backup).
     * Fehler hier stören nie den Fachprozess.
     */
    async failure(source, sourceId, sourceName, step, message, details, immediate = false) {
        try {
            const now = new Date();
            const open = await this.prisma.integrationEvent.findFirst({ where: this.where(source, sourceId, step) });
            const data = { message: clip(message), lastAt: now, ...(details ? { details: details } : {}) };
            const ev = open
                ? await this.prisma.integrationEvent.update({ where: { id: open.id }, data: { ...data, count: { increment: 1 } } })
                : await this.prisma.integrationEvent.create({ data: { source, sourceId, sourceName, step, ...data, firstAt: now } }).catch(async (e) => {
                    // gleichzeitig angelegt (Teil-Index „eine offene Störung je Quelle“) → hochzählen
                    if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                        const o = await this.prisma.integrationEvent.findFirstOrThrow({ where: this.where(source, sourceId, step) });
                        return this.prisma.integrationEvent.update({ where: { id: o.id }, data: { ...data, count: { increment: 1 } } });
                    }
                    throw e;
                });
            if (immediate)
                await this.alert(ev.id);
            else
                await this.checkAlert(ev.id);
            return ev;
        }
        catch (e) {
            this.log.warn(`monitor failure record failed: ${e instanceof Error ? e.message : e}`);
            return null;
        }
    }
    /** Quelle wieder in Ordnung: offene Störung(en) als behoben markieren. Ohne `step` nur die Störung der Quelle selbst. */
    async recovered(source, sourceId, step = null) {
        try {
            const open = await this.prisma.integrationEvent.findMany({ where: this.where(source, sourceId, step) });
            if (!open.length)
                return 0;
            await this.prisma.integrationEvent.updateMany({ where: { id: { in: open.map((o) => o.id) } }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
            for (const o of open.filter((x) => x.alertedAt)) {
                await this.notify.notifyPermission('integrations.view', { type: 'SYSTEM', title: `✅ Behoben: ${o.sourceName ?? o.source}${o.step ? ` (${o.step})` : ''}`.slice(0, 200), body: `Die Störung seit ${o.firstAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} ist behoben.`, entityType: 'IntegrationEvent', entityId: o.id }, { guildId: null });
                await this.audit.record(SYSTEM, { action: 'integration.recovered', module: 'settings', entityType: 'IntegrationEvent', entityId: o.id, after: { source: o.source, sourceName: o.sourceName, step: o.step, count: o.count }, serverId: null });
            }
            return open.length;
        }
        catch (e) {
            this.log.warn(`monitor recovery record failed: ${e instanceof Error ? e.message : e}`);
            return 0;
        }
    }
    /** Alarmschwelle erreicht (Dauer oder Anzahl) und noch nicht alarmiert? */
    async checkAlert(id, now = new Date()) {
        const ev = await this.prisma.integrationEvent.findUnique({ where: { id } });
        if (!ev || ev.status !== 'OPEN' || ev.alertedAt)
            return false;
        const cfg = await this.config();
        if (now.getTime() - ev.firstAt.getTime() < cfg.alertAfterMinutes * 60_000 && ev.count < cfg.alertAfterFailures)
            return false;
        return this.alert(id);
    }
    /** Administratoren benachrichtigen (einmal je Störung) und im Audit-Log festhalten (→ Discord-Logging, falls eingerichtet). */
    async alert(id) {
        const claimed = await this.prisma.integrationEvent.updateMany({ where: { id, alertedAt: null, status: 'OPEN' }, data: { alertedAt: new Date() } });
        if (!claimed.count)
            return false; // schon alarmiert (z. B. parallel)
        const ev = await this.prisma.integrationEvent.findUniqueOrThrow({ where: { id } });
        const title = `⚠️ Anhaltende Störung: ${ev.sourceName ?? ev.source}${ev.step ? ` (${ev.step})` : ''}`;
        await this.notify.notifyPermission('integrations.view', { type: 'SYSTEM', title: title.slice(0, 200), body: `${ev.message} – ${ev.count}× seit ${ev.firstAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}`.slice(0, 1000), entityType: 'IntegrationEvent', entityId: ev.id }, { guildId: null });
        await this.audit.record(SYSTEM, { action: 'integration.alert', module: 'settings', entityType: 'IntegrationEvent', entityId: ev.id, after: { source: ev.source, sourceName: ev.sourceName, step: ev.step, message: ev.message, count: ev.count }, result: 'FAILED', serverId: null });
        return true;
    }
    /** Regelmäßig (aus dem Planer): Alarmschwellen nach Dauer prüfen und hängende Discord-Nachrichten erkennen. */
    async sweep(now = new Date()) {
        const open = await this.prisma.integrationEvent.findMany({ where: { status: 'OPEN', alertedAt: null }, select: { id: true } });
        for (const o of open)
            await this.checkAlert(o.id, now);
        const cfg = await this.config();
        const stale = await this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { lt: 5 }, createdAt: { lt: new Date(now.getTime() - cfg.outboxStaleMinutes * 60_000) } } });
        const failed = await this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { gte: 5 }, createdAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } } });
        if (stale)
            await this.failure('OUTBOX', null, 'Discord-Ausgang', 'pending', `${stale} Discord-Nachricht(en) seit über ${cfg.outboxStaleMinutes} Minuten nicht abgeholt – ist der Bot online?`, { stale });
        else
            await this.recovered('OUTBOX', null, 'pending');
        if (failed)
            await this.failure('OUTBOX', null, 'Discord-Ausgang', 'failed', `${failed} Discord-Nachricht(en) in den letzten 24 Stunden nach 5 Versuchen verworfen.`, { failed });
        else
            await this.recovered('OUTBOX', null, 'failed');
    }
    async events(q) {
        const rows = await this.prisma.integrationEvent.findMany({ where: { ...(q.status ? { status: q.status } : {}), ...(q.source ? { source: q.source } : {}) }, orderBy: { lastAt: 'desc' }, take: Math.min(q.take ?? 100, 500) });
        const ids = [...new Set(rows.map((r) => r.acknowledgedById).filter((x) => !!x))];
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return rows.map((r) => ({ ...r, acknowledgedByName: r.acknowledgedById ? names.get(r.acknowledgedById) ?? '—' : null }));
    }
    /** Störung zur Kenntnis genommen (bleibt offen, bis die Quelle sich erholt – quittiert heißt nicht behoben). */
    async acknowledge(actor, id) {
        const ev = await this.prisma.integrationEvent.findUnique({ where: { id } });
        if (!ev)
            throw new errors_1.AppError('NOT_FOUND', 'Störung nicht gefunden.');
        if (ev.acknowledgedAt)
            return ev;
        const row = await this.prisma.integrationEvent.update({ where: { id }, data: { acknowledgedById: actor.userId, acknowledgedAt: new Date() } });
        await this.audit.record(actor, { action: 'integration.acknowledge', module: 'settings', entityType: 'IntegrationEvent', entityId: id, serverId: null });
        return row;
    }
};
exports.MonitorService = MonitorService;
exports.MonitorService = MonitorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, notify_service_1.NotifyService, audit_service_1.AuditService])
], MonitorService);
//# sourceMappingURL=monitor.service.js.map