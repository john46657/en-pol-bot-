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
exports.DutyService = void 0;
const common_1 = require("@nestjs/common");
const realtime_service_1 = require("../realtime/realtime.service");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
let DutyService = class DutyService {
    prisma;
    audit;
    rt;
    constructor(prisma, audit, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
    }
    async setStatus(actor, status, d, targetUserId) {
        const userId = targetUserId ?? actor.userId;
        return this.prisma.$transaction(async (tx) => {
            const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
            if ((open?.status ?? 'OFF_DUTY') === status && !d.unitId)
                throw new errors_1.AppError('CONFLICT', `Already ${status}.`);
            if (targetUserId && !(await tx.user.findUnique({ where: { id: targetUserId, active: true } })))
                throw new errors_1.AppError('NOT_FOUND', 'User not found.');
            if (open)
                await tx.dutySession.update({ where: { id: open.id }, data: { endedAt: new Date() } });
            if (d.unitId && !(await tx.unit.findUnique({ where: { id: d.unitId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Unit not found.');
            let created = null;
            if (status !== 'OFF_DUTY') {
                const pers = await tx.personnel.findUnique({ where: { userId } });
                created = await tx.dutySession.create({ data: { userId, status, unitId: d.unitId, callsign: (d.callsign ?? pers?.callsign ?? undefined)?.toUpperCase() } });
            }
            await this.audit.record(actor, { action: targetUserId && targetUserId !== actor.userId ? 'duty.status.set_by_supervisor' : 'duty.status', module: 'team', entityType: 'User', entityId: userId, before: { status: open?.status ?? 'OFF_DUTY' }, after: { status } }, tx);
            return created ?? { status: 'OFF_DUTY' };
        }).then((r) => { this.rt.publish('team', 'duty.changed', { userId, status }); return r; });
    }
    team() {
        return this.prisma.dutySession.findMany({
            where: { endedAt: null },
            include: { user: { select: { id: true, displayName: true, personnel: { select: { rank: true, callsign: true } } } } },
            orderBy: { startedAt: 'asc' },
        });
    }
    mine(userId) { return this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } }); }
    /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
    async overview() {
        const [people, open, units, assignments] = await Promise.all([
            this.prisma.personnel.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: { select: { id: true, displayName: true, active: true } } }, orderBy: { callsign: 'asc' } }),
            this.prisma.dutySession.findMany({ where: { endedAt: null } }),
            this.prisma.unit.findMany({ include: { members: true } }),
            this.prisma.incidentUnit.findMany({ where: { clearedAt: null, incident: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }, include: { incident: { select: { id: true, number: true, title: true, status: true, priority: true } } } }),
        ]);
        const ids = people.map((p) => p.userId);
        const lastEnded = await this.prisma.dutySession.groupBy({ by: ['userId'], where: { userId: { in: ids }, endedAt: { not: null } }, _max: { endedAt: true } });
        const ended = new Map(lastEnded.map((l) => [l.userId, l._max.endedAt]));
        return people.filter((p) => p.user.active).map((p) => {
            const session = open.find((o) => o.userId === p.userId);
            const unit = units.find((u) => u.members.some((m) => m.userId === p.userId));
            const inc = unit ? assignments.find((a) => a.unitId === unit.id)?.incident ?? null : null;
            return {
                userId: p.userId, personnelId: p.id, name: p.user.displayName, rank: p.rank, callsign: p.callsign, team: p.team,
                dutyStatus: session?.status ?? 'OFF_DUTY', onDutySince: session?.startedAt ?? null,
                lastStatusChange: session?.startedAt ?? ended.get(p.userId) ?? null,
                unit: unit ? { id: unit.id, callsign: unit.callsign, status: unit.status } : null,
                currentIncident: inc,
            };
        });
    }
};
exports.DutyService = DutyService;
exports.DutyService = DutyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService])
], DutyService);
//# sourceMappingURL=duty.service.js.map