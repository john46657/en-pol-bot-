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
exports.CadHandoverService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const realtime_service_1 = require("../realtime/realtime.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const cad_config_service_1 = require("./cad-config.service");
const cad_notify_service_1 = require("./cad-notify.service");
const lbl = (list, key) => { const o = list.find((x) => x.key === key); return o ? `${o.emoji ? `${o.emoji} ` : ''}${o.label}` : key; };
/**
 * Schichtübergabe der Leitstelle: Der abgebende Disponent hält den aktuellen Stand fest und schreibt Notizen;
 * die nächste Schicht bestätigt die Übernahme. Beides wird mit Benutzer und Zeit gespeichert (Audit + Discord, falls eingestellt).
 */
let CadHandoverService = class CadHandoverService {
    prisma;
    audit;
    rt;
    cfg;
    notify;
    constructor(prisma, audit, rt, cfg, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.cfg = cfg;
        this.notify = notify;
    }
    /** Aktueller Stand für eine neue Übergabe; „Letzte Statusänderungen“ seit der vorigen Übergabe (höchstens 12 Stunden zurück). */
    async snapshot() {
        const cfg = await this.cfg.get();
        const closed = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
        const last = await this.prisma.cadHandover.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        const since = new Date(Math.max(last?.createdAt.getTime() ?? 0, Date.now() - 12 * 3_600_000));
        const [open, units, calls, changes] = await Promise.all([
            this.prisma.incident.findMany({ where: { status: { notIn: closed } }, orderBy: { createdAt: 'asc' }, take: 100, include: { units: { where: { clearedAt: null }, include: { unit: { select: { callsign: true } } } } } }),
            this.prisma.unit.findMany({ where: { operational: true, status: { notIn: ['OFF_DUTY'] } }, orderBy: { callsign: 'asc' }, include: { incidents: { where: { clearedAt: null }, include: { incident: { select: { number: true, restrictRoleIds: true } } } } } }),
            this.prisma.erlcEmergencyCall.findMany({ where: { status: { in: ['OPEN', 'CLAIMED'] }, incidentId: null }, orderBy: { startedAt: 'asc' }, take: 50 }),
            this.prisma.cadIncidentLog.findMany({ where: { kind: { in: ['STATUS', 'FEEDBACK'] }, createdAt: { gte: since }, incident: { restrictRoleIds: { isEmpty: true } } }, orderBy: { createdAt: 'desc' }, take: 25, include: { incident: { select: { number: true } } } }),
        ]);
        // vertrauliche Einsätze stehen nur als Anzahl in der Übergabe – sie ist für alle mit cad.view sichtbar
        const visible = open.filter((i) => !i.restrictRoleIds.length);
        return {
            incidents: visible.map((i) => ({ id: i.id, number: i.number, title: i.title, status: lbl(cfg.incidentStatuses, i.status), priority: lbl(cfg.priorities, i.priority), location: i.location, units: i.units.map((u) => u.unit.callsign), createdAt: i.createdAt.toISOString() })),
            confidentialIncidents: open.length - visible.length,
            units: units.map((u) => {
                const cur = u.incidents.find((l) => !l.incident.restrictRoleIds.length);
                return { id: u.id, callsign: u.callsign, name: u.name, status: lbl(cfg.unitStatuses, u.status), incident: cur?.incident.number ?? (u.incidents.length ? 'vertraulich' : null) };
            }),
            calls: calls.map((c) => ({ id: c.id, callNumber: c.callNumber, description: c.description, location: c.positionDescriptor, status: c.status, startedAt: c.startedAt.toISOString() })),
            changes: changes.map((l) => ({ incident: l.incident.number, text: l.text, createdAt: l.createdAt.toISOString() })),
        };
    }
    async names(ids) {
        const list = [...new Set(ids.filter((x) => !!x))];
        if (!list.length)
            return {};
        const users = await this.prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } });
        return Object.fromEntries(users.map((u) => [u.id, u.displayName]));
    }
    async list(take = 20) {
        const rows = await this.prisma.cadHandover.findMany({ orderBy: { createdAt: 'desc' }, take });
        const names = await this.names(rows.flatMap((r) => [r.createdById, r.acknowledgedById]));
        return rows.map((r) => ({ ...r, snapshot: r.snapshot, createdByName: r.createdById ? names[r.createdById] ?? null : null, acknowledgedByName: r.acknowledgedById ? names[r.acknowledgedById] ?? null : null }));
    }
    /** Entwurf: aktueller Stand + die letzte Übergabe (Notizen des vorigen Disponenten). */
    async draft() {
        const [snapshot, [previous]] = await Promise.all([this.snapshot(), this.list(1)]);
        return { snapshot, previous: previous ?? null };
    }
    async create(actor, notes) {
        const cfg = await this.cfg.get();
        const snapshot = await this.snapshot();
        const guildId = actor.guildId ?? cfg.homeGuildId ?? null;
        const row = await this.prisma.$transaction(async (tx) => {
            const h = await tx.cadHandover.create({ data: { notes, snapshot: snapshot, createdById: actor.userId, guildId } });
            await this.audit.record(actor, { action: 'cad.handover.create', module: 'cad', entityType: 'CadHandover', entityId: h.id, after: { notes, incidents: snapshot.incidents.length, units: snapshot.units.length, calls: snapshot.calls.length } }, tx);
            return h;
        });
        this.rt.publish('cad', 'cad.changed', { kind: 'handover', id: row.id });
        const by = actor.userId ? (await this.names([actor.userId]))[actor.userId] ?? null : null;
        await this.notify.emit('handover', {
            id: row.id, by, notes: notes.slice(0, 1500), openIncidents: snapshot.incidents.length + snapshot.confidentialIncidents, activeUnits: snapshot.units.filter((u) => u.incident).length,
            openCalls: snapshot.calls.length, incidents: snapshot.incidents.slice(0, 10).map((i) => `${i.number} · ${i.title} (${i.status})`), dashboardUrl: (0, web_url_1.webUrl)('/cad/handover'),
        }, guildId);
        return row;
    }
    /** Übernahme bestätigen: einmal und nur von jemand anderem als dem abgebenden Disponenten. */
    async acknowledge(actor, id, note) {
        const h = await this.prisma.cadHandover.findUnique({ where: { id } });
        if (!h)
            throw new errors_1.AppError('NOT_FOUND', 'Übergabe nicht gefunden.');
        if (h.createdById && h.createdById === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Die eigene Übergabe bestätigt die nächste Schicht.');
        const after = await this.prisma.$transaction(async (tx) => {
            const r = await tx.cadHandover.updateMany({ where: { id, acknowledgedAt: null }, data: { acknowledgedAt: new Date(), acknowledgedById: actor.userId, ackNote: note?.trim() || null } });
            if (!r.count)
                throw new errors_1.AppError('CONFLICT', 'Diese Übergabe wurde schon bestätigt.');
            await this.audit.record(actor, { action: 'cad.handover.acknowledge', module: 'cad', entityType: 'CadHandover', entityId: id, after: { note: note ?? null } }, tx);
            return tx.cadHandover.findUniqueOrThrow({ where: { id } });
        });
        if (h.createdById)
            await this.prisma.notification.create({ data: { userId: h.createdById, type: 'CAD_HANDOVER', title: 'Deine Schichtübergabe wurde bestätigt', body: note?.trim() || null, entityType: 'CadHandover', entityId: id } });
        this.rt.publish('cad', 'cad.changed', { kind: 'handover', id });
        return after;
    }
};
exports.CadHandoverService = CadHandoverService;
exports.CadHandoverService = CadHandoverService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, cad_config_service_1.CadConfigService, cad_notify_service_1.CadNotifyService])
], CadHandoverService);
//# sourceMappingURL=cad-handover.service.js.map