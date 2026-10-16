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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const q = zod_1.z.object({ days: zod_1.z.coerce.number().int().min(1).max(366).default(30) });
/** Jede Kennzahl wird nur ausgeliefert, wenn der Benutzer die zugehörige Fachpermission besitzt. */
let AnalyticsController = class AnalyticsController {
    prisma;
    perms;
    constructor(prisma, perms) {
        this.prisma = prisma;
        this.perms = perms;
    }
    async overview(u, f) {
        const ctx = await this.perms.contextFor(u.id);
        const since = new Date(Date.now() - f.days * 86_400_000);
        const out = { days: f.days };
        if ((0, shared_1.can)(ctx, 'incidents.view')) {
            const closed = await this.prisma.incident.findMany({ where: { closedAt: { gte: since }, status: 'CLOSED' }, select: { createdAt: true, closedAt: true } });
            const avg = closed.length ? closed.reduce((s, i) => s + (i.closedAt.getTime() - i.createdAt.getTime()), 0) / closed.length / 60000 : null;
            out.incidents = { created: await this.prisma.incident.count({ where: { createdAt: { gte: since } } }), open: await this.prisma.incident.count({ where: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }), closed: closed.length, avgHandlingMinutes: avg === null ? null : Math.round(avg) };
        }
        if ((0, shared_1.can)(ctx, 'reports.review'))
            out.reports = { created: await this.prisma.report.count({ where: { createdAt: { gte: since } } }), open: await this.prisma.report.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }) };
        if ((0, shared_1.can)(ctx, 'tickets.view'))
            out.tickets = { issued: await this.prisma.ticket.count({ where: { issuedAt: { gte: since }, status: { not: 'VOID' } } }), voided: await this.prisma.ticket.count({ where: { issuedAt: { gte: since }, status: 'VOID' } }) };
        if ((0, shared_1.can)(ctx, 'complaints.view'))
            out.complaints = { received: await this.prisma.complaint.count({ where: { createdAt: { gte: since } } }), open: await this.prisma.complaint.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }) };
        if ((0, shared_1.can)(ctx, 'applications.view'))
            out.applications = { submitted: await this.prisma.application.count({ where: { createdAt: { gte: since } } }), pending: await this.prisma.application.count({ where: { status: { in: ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'] } } }) };
        if ((0, shared_1.can)(ctx, 'wanted.view'))
            out.wanted = { active: await this.prisma.wantedRecord.count({ where: { status: 'ACTIVE' } }) };
        // Sensible Personalstatistiken nur mit personnel.view
        if ((0, shared_1.can)(ctx, 'personnel.view')) {
            const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { gte: since }, status: 'ON_DUTY' }, select: { startedAt: true, endedAt: true } });
            out.personnel = { totalDutyHours: Math.round(sessions.reduce((s, d) => s + ((d.endedAt ?? new Date()).getTime() - d.startedAt.getTime()), 0) / 3_600_000), academyResults: await this.prisma.academyResult.count({ where: { createdAt: { gte: since } } }) };
        }
        return out;
    }
    /**
     * Tagesverlauf für Diagramme (Tage in Europe/Berlin). Gleiche Rechte wie die Übersicht – je Reihe die Fachpermission.
     * Über Prisma-Abfragen (nicht SQL), damit die Server-Trennung automatisch greift.
     */
    async trend(u, f) {
        const ctx = await this.perms.contextFor(u.id);
        const key = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        const days = Array.from({ length: f.days }, (_, i) => key(new Date(Date.now() - (f.days - 1 - i) * 86_400_000)));
        const since = new Date(`${days[0]}T00:00:00Z`);
        since.setTime(since.getTime() - 2 * 3_600_000); // Berlin ist UTC+1/+2
        const count = (dates) => { const m = new Map(days.map((d) => [d, 0])); for (const d of dates) {
            const k = key(d);
            if (m.has(k))
                m.set(k, m.get(k) + 1);
        } return [...m.values()]; };
        const series = [];
        if ((0, shared_1.can)(ctx, 'incidents.view'))
            series.push({ key: 'incidents', label: 'Einsätze erstellt', unit: 'Einsätze', values: count((await this.prisma.incident.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
        if ((0, shared_1.can)(ctx, 'reports.review'))
            series.push({ key: 'reports', label: 'Berichte erstellt', unit: 'Berichte', values: count((await this.prisma.report.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
        if ((0, shared_1.can)(ctx, 'applications.view'))
            series.push({ key: 'applications', label: 'Bewerbungen eingegangen', unit: 'Bewerbungen', values: count((await this.prisma.application.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
        if ((0, shared_1.can)(ctx, 'wanted.view'))
            series.push({ key: 'wanted', label: 'Fahndungen angelegt', unit: 'Fahndungen', values: count((await this.prisma.wantedRecord.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })).map((x) => x.createdAt)) });
        if ((0, shared_1.can)(ctx, 'personnel.view')) {
            // Dienststunden je Tag nach Dienstbeginn (Schichten über Mitternacht zählen zum Starttag)
            const sessions = await this.prisma.dutySession.findMany({ where: { startedAt: { gte: since }, status: 'ON_DUTY' }, select: { startedAt: true, endedAt: true } });
            const m = new Map(days.map((d) => [d, 0]));
            for (const x of sessions) {
                const k = key(x.startedAt);
                if (m.has(k))
                    m.set(k, m.get(k) + ((x.endedAt ?? new Date()).getTime() - x.startedAt.getTime()) / 3_600_000);
            }
            series.push({ key: 'duty', label: 'Dienststunden', unit: 'Stunden', values: [...m.values()].map((h) => Math.round(h * 10) / 10) });
        }
        return { days, series };
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, decorators_1.RequirePermission)('analytics.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('trend'),
    (0, decorators_1.RequirePermission)('analytics.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "trend", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map