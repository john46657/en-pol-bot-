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
exports.WorkspaceModule = exports.WorkspaceController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const shiftplan_service_1 = require("../shiftplan/shiftplan.service");
const shiftplan_module_1 = require("../shiftplan/shiftplan.module");
const calendar_service_1 = require("../calendar/calendar.service");
const calendar_module_1 = require("../calendar/calendar.module");
const documents_service_1 = require("../documents/documents.service");
const documents_module_1 = require("../documents/documents.module");
/**
 * Gemeinsame Sicht für MDT und Leitstelle auf die Verwaltungsdaten (keine eigenen Daten, nur Zusammenführung).
 * Jeder Teil erscheint nur mit dem passenden Recht; Abwesenheitsgründe erscheinen nie in der Leitstelle.
 */
let WorkspaceController = class WorkspaceController {
    prisma;
    perms;
    shifts;
    cal;
    docs;
    constructor(prisma, perms, shifts, cal, docs) {
        this.prisma = prisma;
        this.perms = perms;
        this.shifts = shifts;
        this.cal = cal;
        this.docs = docs;
    }
    feed(userId, scope, take = 8) {
        const events = shared_1.NOTIFICATION_EVENTS.filter((e) => e.channels.includes(scope)).map((e) => e.key);
        return this.prisma.notification.findMany({ where: { userId, readAt: null, archivedAt: null, OR: [{ event: { in: events } }, ...(scope === 'mdt' ? [{ important: true }] : [])] }, orderBy: [{ important: 'desc' }, { createdAt: 'desc' }], take, select: { id: true, title: true, link: true, event: true, important: true, createdAt: true } });
    }
    /** MDT „Mein Dienst“: Schicht, Abteilung/Rang/Einheit, eigene Abwesenheit, Termine, Benachrichtigungen, Dokumente. */
    async mdt(a) {
        const me = a.userId;
        const has = (p) => this.perms.has(me, p);
        const now = new Date();
        const [personnel, duty, leave] = await Promise.all([
            this.prisma.personnel.findFirst({ where: { userId: me }, select: { rank: true, team: true, callsign: true, serviceNumber: true, office: true } }),
            this.prisma.dutySession.findFirst({ where: { userId: me, endedAt: null }, select: { status: true, callsign: true, unitId: true, startedAt: true } }),
            this.prisma.leaveRequest.findFirst({ where: { userId: me, status: 'APPROVED', endsAt: { gt: now } }, orderBy: { startsAt: 'asc' }, select: { number: true, startsAt: true, endsAt: true } }),
        ]);
        const unit = duty?.unitId ? await this.prisma.unit.findUnique({ where: { id: duty.unitId }, select: { callsign: true } }).catch(() => null) : null;
        return {
            profile: { rank: personnel?.rank ?? null, department: personnel?.team ?? null, callsign: personnel?.callsign ?? null, serviceNumber: personnel?.serviceNumber ?? null, office: personnel?.office ?? null },
            duty: duty ? { status: duty.status, since: duty.startedAt, unit: unit?.callsign ?? duty.callsign ?? null } : null,
            shift: (await has('shiftplan.view')) ? await this.shifts.current(a) : null,
            leave: leave ? { ...leave, active: leave.startsAt <= now } : null,
            events: (await has('calendar.view')) ? (await this.cal.upcoming(a, 7, 'mine')).slice(0, 6) : null,
            notifications: await this.feed(me, 'mdt'),
            documents: (await has('documents.view')) ? (await this.docs.list(a, {})).items.slice(0, 8).map((d) => ({ id: d.id, title: d.title, categoryLabel: d.categoryLabel, currentVersion: d.currentVersion })) : null,
        };
    }
    /** Leitstelle: Schichtbesetzung (geplant vs. im Dienst), Abwesende jetzt (nur Namen), dienstliche Termine heute, Systemmeldungen. */
    async dispatch(a) {
        const me = a.userId;
        const now = new Date(), end = new Date(now.getTime() + 24 * 3_600_000);
        const canShifts = await this.perms.has(me, 'shiftplan.view');
        const staffing = canShifts ? await this.shifts.staffing(a, now) : null;
        let events = null;
        if (await this.perms.has(me, 'calendar.view'))
            events = (await this.cal.list(a, { from: now, to: end })).items.filter((e) => e.source === 'calendar' && e.status === 'SCHEDULED').slice(0, 10);
        return {
            staffing,
            absentNow: staffing ? staffing.shifts.flatMap((s) => s.plannedAbsent) : null,
            events,
            notifications: await this.feed(me, 'cad'),
        };
    }
};
exports.WorkspaceController = WorkspaceController;
__decorate([
    (0, common_1.Get)('mdt'),
    (0, decorators_1.RequirePermission)('dashboard.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorkspaceController.prototype, "mdt", null);
__decorate([
    (0, common_1.Get)('dispatch'),
    (0, decorators_1.RequirePermission)('cad.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], WorkspaceController.prototype, "dispatch", null);
exports.WorkspaceController = WorkspaceController = __decorate([
    (0, swagger_1.ApiTags)('workspace'),
    (0, common_1.Controller)('workspace'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, shiftplan_service_1.ShiftPlanService, calendar_service_1.CalendarService, documents_service_1.DocumentsService])
], WorkspaceController);
let WorkspaceModule = class WorkspaceModule {
};
exports.WorkspaceModule = WorkspaceModule;
exports.WorkspaceModule = WorkspaceModule = __decorate([
    (0, common_1.Module)({ imports: [shiftplan_module_1.ShiftPlanModule, calendar_module_1.CalendarModule, documents_module_1.DocumentsModule], controllers: [WorkspaceController] })
], WorkspaceModule);
//# sourceMappingURL=workspace.controller.js.map