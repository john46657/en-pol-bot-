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
exports.ReportsService = exports.hashContent = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const links_1 = require("../common/links");
const numbering_1 = require("../common/numbering");
const transition_1 = require("../common/transition");
const pagination_1 = require("../common/pagination");
const locks_service_1 = require("../locks/locks.service");
const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
const hashContent = (c) => (0, node_crypto_1.createHash)('sha256').update(stable(c)).digest('hex');
exports.hashContent = hashContent;
let ReportsService = class ReportsService {
    prisma;
    audit;
    timeline;
    perms;
    locks;
    constructor(prisma, audit, timeline, perms, locks) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.perms = perms;
        this.locks = locks;
    }
    /** Autoren sehen eigene Berichte; reports.review/approve-Inhaber sehen alle. Verhindert, dass fremde Entwürfe auftauchen. */
    async canSeeAll(userId) { return (await this.perms.has(userId, 'reports.review')) || (await this.perms.has(userId, 'reports.approve')); }
    async list(actor, p, status) {
        const all = await this.canSeeAll(actor.userId);
        const where = {
            ...(status ? { status } : {}),
            ...(all ? {} : { OR: [{ authorId: actor.userId }, { status: { in: ['APPROVED', 'ARCHIVED'] } }] }),
            ...(p.q ? { AND: [{ OR: [{ number: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' } }] }] } : {}),
        };
        const [items, total] = await Promise.all([this.prisma.report.findMany({ where, orderBy: { updatedAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }), this.prisma.report.count({ where })]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(actor, id) {
        const r = await this.prisma.report.findUnique({ where: { id }, include: { versions: { orderBy: { version: 'desc' } } } });
        // Nicht sichtbare Berichte verhalten sich wie nicht existent (keine Existenz-Leaks).
        if (!r || !(await this.visible(actor.userId, r)))
            throw new errors_1.AppError('NOT_FOUND', 'Report not found.');
        return { report: r, timeline: await this.timeline.list('Report', id) };
    }
    async visible(userId, r) {
        return r.authorId === userId || ['APPROVED', 'ARCHIVED'].includes(r.status) || (await this.canSeeAll(userId));
    }
    async create(actor, d) {
        const userId = actor.userId;
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.report.create({ data: { number: (0, numbering_1.makeNumber)('R'), type: d.type, title: d.title, authorId: userId, incidentId: d.incidentId } });
            await tx.reportVersion.create({ data: { reportId: r.id, version: 1, authorId: userId, changeSummary: 'Initial draft', content: d.content, contentHash: (0, exports.hashContent)(d.content) } });
            for (const pid of new Set(d.personIds ?? [])) {
                if (!(await tx.person.findUnique({ where: { id: pid } })))
                    throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
                await (0, links_1.linkPerson)(tx, pid, 'Report', r.id, 'SUBJECT');
                await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'report.created', summary: `Report ${r.number} created`, actorId: userId });
            }
            await this.timeline.add(tx, { entityType: 'Report', entityId: r.id, action: 'report.created', summary: `Report ${r.number} created`, actorId: userId });
            await this.audit.record(actor, { action: 'report.create', module: 'reports', entityType: 'Report', entityId: r.id, after: { number: r.number, type: r.type } }, tx);
            return r;
        });
    }
    /** Jede Änderung erzeugt eine neue unveränderliche Version; ältere werden nie überschrieben. */
    async edit(actor, id, d) {
        const userId = actor.userId;
        await this.locks.assertFree('report', id, userId);
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.report.findUnique({ where: { id } });
            if (!r || !(await this.visible(userId, r)))
                throw new errors_1.AppError('NOT_FOUND', 'Report not found.');
            if (r.status !== 'DRAFT' && r.status !== 'REJECTED')
                throw new errors_1.AppError('CONFLICT', 'Only draft or rejected reports can be edited.');
            if (r.authorId !== userId && !(await this.perms.has(userId, 'reports.edit')))
                throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
            const upd = await tx.report.updateMany({ where: { id, version: d.version }, data: { currentVersion: { increment: 1 }, version: { increment: 1 }, ...(d.title ? { title: d.title } : {}) } });
            if (upd.count === 0)
                throw new errors_1.AppError('CONFLICT', 'The record was modified by someone else. Reload and retry.');
            const next = r.currentVersion + 1;
            await tx.reportVersion.create({ data: { reportId: id, version: next, authorId: userId, changeSummary: d.changeSummary, content: d.content, contentHash: (0, exports.hashContent)(d.content) } });
            await this.timeline.add(tx, { entityType: 'Report', entityId: id, action: 'report.edited', summary: `Version ${next}: ${d.changeSummary}`, actorId: userId });
            await this.audit.record(actor, { action: 'report.edit', module: 'reports', entityType: 'Report', entityId: id, after: { version: next } }, tx);
            return tx.report.findUniqueOrThrow({ where: { id } });
        });
    }
    async transition(actor, id, to, reason) {
        const userId = actor.userId;
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.report.findUnique({ where: { id } });
            if (!r || !(await this.visible(userId, r)))
                throw new errors_1.AppError('NOT_FOUND', 'Report not found.');
            (0, transition_1.nextStatus)(shared_1.REPORT_TRANSITIONS, r.status, to);
            if (to === 'REJECTED' && !reason)
                throw new errors_1.AppError('VALIDATION_FAILED', 'A reason is required to reject a report.');
            if ((to === 'APPROVED' || to === 'REJECTED') && r.authorId === userId)
                throw new errors_1.AppError('CONFLICT', 'Authors cannot review their own reports.');
            const after = await tx.report.update({ where: { id }, data: { status: to, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Report', entityId: id, action: `report.${to.toLowerCase()}`, summary: `Report ${r.number} ${to}`, actorId: userId });
            await this.audit.record(actor, { action: `report.${to.toLowerCase()}`, module: 'reports', entityType: 'Report', entityId: id, before: { status: r.status }, after: { status: to }, reason }, tx);
            if (to === 'APPROVED' || to === 'REJECTED' || to === 'UNDER_REVIEW') {
                await tx.notification.create({ data: { userId: r.authorId, type: 'REPORT_REVIEW', title: `Report ${r.number} ${to}`, body: reason, entityType: 'Report', entityId: id } });
            }
            return after;
        });
    }
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, permission_service_1.PermissionService, locks_service_1.LocksService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map