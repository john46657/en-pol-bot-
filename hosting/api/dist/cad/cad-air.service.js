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
exports.CadAirService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const realtime_service_1 = require("../realtime/realtime.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const cad_notify_service_1 = require("./cad-notify.service");
/** Welcher Statuswechsel erlaubt ist (Anforderer darf nur abbrechen). */
const NEXT = { OPEN: ['ACCEPTED', 'DONE', 'CANCELLED'], ACCEPTED: ['DONE', 'CANCELLED'], DONE: [], CANCELLED: [] };
/**
 * Luftunterstützung (Hubschrauber) und Gebäudekameras. ER:LC hat für beides keine API: der Hubschrauber wird im Spiel
 * gerufen, Kameras schaut man im Spiel an – die Leitstelle koordiniert hier Anforderung, Rückmeldung und Kamerapunkte.
 */
let CadAirService = class CadAirService {
    prisma;
    audit;
    perms;
    rt;
    notify;
    constructor(prisma, audit, perms, rt, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.rt = rt;
        this.notify = notify;
    }
    async name(actor) {
        if (!actor.userId)
            return null;
        const [u, m] = await Promise.all([
            this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }),
            this.prisma.cadMember.findFirst({ where: { OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] }, select: { callsign: true } }),
        ]);
        return [m?.callsign, u?.displayName].filter(Boolean).join(' · ') || null;
    }
    changed(id) { this.rt.publish('cad', 'cad.changed', { kind: 'air', id }); }
    /** Offene und die letzten erledigten Anforderungen (mit Einsatznummer). */
    async list() {
        const rows = await this.prisma.cadAirRequest.findMany({ where: { OR: [{ status: { in: ['OPEN', 'ACCEPTED'] } }, { updatedAt: { gt: new Date(Date.now() - 24 * 3_600_000) } }] }, orderBy: { createdAt: 'desc' }, take: 50 });
        const inc = await this.prisma.incident.findMany({ where: { id: { in: rows.map((r) => r.incidentId).filter((x) => !!x) } }, select: { id: true, number: true, title: true } });
        return rows.map((r) => ({ ...r, incident: inc.find((i) => i.id === r.incidentId) ?? null }));
    }
    async request(actor, d) {
        if (d.mode === 'SEARCH' && !d.target?.trim())
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte angeben, welcher Spieler gesucht werden soll.');
        let incident = null;
        if (d.incidentId)
            incident = await this.prisma.incident.findUnique({ where: { id: d.incidentId }, select: { id: true, number: true, guildId: true } });
        else if (d.incidentNumber?.trim())
            incident = await this.prisma.incident.findFirst({ where: { number: { equals: d.incidentNumber.trim(), mode: 'insensitive' } }, select: { id: true, number: true, guildId: true } });
        if ((d.incidentId || d.incidentNumber?.trim()) && !incident)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        const by = await this.name(actor);
        const what = d.mode === 'SEARCH' ? `🚁 Luftunterstützung angefordert – Spieler suchen: ${d.target.trim()}` : '🚁 Luftunterstützung angefordert – Patrouille';
        const row = await this.prisma.$transaction(async (tx) => {
            const r = await tx.cadAirRequest.create({ data: { mode: d.mode, target: d.mode === 'SEARCH' ? d.target.trim() : d.target?.trim() || null, note: d.note?.trim() || null, incidentId: incident?.id ?? null, requestedBy: by, authorId: actor.userId, discordId: actor.discordId ?? null, guildId: actor.guildId ?? null } });
            if (incident)
                await tx.cadIncidentLog.create({ data: { incidentId: incident.id, kind: 'NOTE', text: `${what}${d.note?.trim() ? ` (${d.note.trim()})` : ''}`.slice(0, 2000), authorId: actor.userId, guildId: actor.guildId ?? null } });
            await this.audit.record(actor, { action: 'cad.air.request', module: 'cad', entityType: 'CadAirRequest', entityId: r.id, after: { mode: r.mode, target: r.target, incidentId: r.incidentId } }, tx);
            return r;
        });
        this.changed(row.id);
        await this.notify.emit('air.requested', { id: row.id, number: row.number, mode: row.mode, modeLabel: shared_1.AIR_MODES[d.mode], target: row.target, note: row.note, by, incidentNumber: incident?.number ?? null, dashboardUrl: (0, web_url_1.webUrl)('/cad/air') }, incident?.guildId ?? actor.guildId ?? null);
        return { ...row, incident };
    }
    /** Rückmeldung: Leitstelle (cad.assign_unit) übernimmt/erledigt; der Anforderer darf seine eigene abbrechen. */
    async setStatus(actor, id, status) {
        const r = await this.prisma.cadAirRequest.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Anforderung nicht gefunden.');
        if (!NEXT[r.status]?.includes(status))
            throw new errors_1.AppError('CONFLICT', `Von „${shared_1.AIR_STATUS[r.status] ?? r.status}“ geht es nicht zu „${shared_1.AIR_STATUS[status]}“.`);
        const own = !!actor.userId && r.authorId === actor.userId;
        if (!(await this.perms.has(actor.userId, 'cad.assign_unit')) && !(own && status === 'CANCELLED'))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur die Leitstelle kann Anforderungen übernehmen oder erledigen.');
        const by = await this.name(actor);
        const row = await this.prisma.$transaction(async (tx) => {
            const u = await tx.cadAirRequest.update({ where: { id }, data: { status, handledBy: status === 'CANCELLED' && own ? r.handledBy : by } });
            if (r.incidentId)
                await tx.cadIncidentLog.create({ data: { incidentId: r.incidentId, kind: 'NOTE', text: `🚁 Luftunterstützung #${r.number}: ${shared_1.AIR_STATUS[status]}${by ? ` (${by})` : ''}`, authorId: actor.userId, guildId: actor.guildId ?? null } });
            await this.audit.record(actor, { action: 'cad.air.status', module: 'cad', entityType: 'CadAirRequest', entityId: id, before: { status: r.status }, after: { status } }, tx);
            return u;
        });
        this.changed(id);
        return row;
    }
    /** Gebäudekameras aus ER:LC als Kartenpunkte (Ebene „cameras“) anlegen – nur fehlende, ohne Position. */
    async addDefaultCameras(actor) {
        const have = new Set((await this.prisma.cadMapObject.findMany({ where: { layer: 'cameras' }, select: { name: true } })).map((c) => c.name.toLowerCase()));
        const missing = shared_1.ERLC_BUILDING_CAMERAS.filter((c) => !have.has(c.name.toLowerCase()));
        if (missing.length)
            await this.prisma.cadMapObject.createMany({ data: missing.map((c) => ({ kind: 'POI', name: c.name, category: c.area, layer: 'cameras', icon: '📹', color: '#64748b', createdById: actor.userId })) });
        await this.audit.record(actor, { action: 'cad.cameras.defaults', module: 'cad', after: { added: missing.length } });
        this.rt.publish('cad', 'cad.changed', { kind: 'map', id: null });
        return { added: missing.length };
    }
};
exports.CadAirService = CadAirService;
exports.CadAirService = CadAirService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, realtime_service_1.RealtimeService, cad_notify_service_1.CadNotifyService])
], CadAirService);
//# sourceMappingURL=cad-air.service.js.map