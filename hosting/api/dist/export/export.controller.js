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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportController = exports.toCsv = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const pdfkit_1 = __importDefault(require("pdfkit"));
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const audit_service_1 = require("../audit/audit.service");
const decorators_1 = require("../authz/decorators");
const errors_1 = require("../common/errors");
const zod_pipe_1 = require("../common/zod.pipe");
const q = zod_1.z.object({ format: zod_1.z.enum(['csv', 'json', 'pdf']).default('csv'), q: zod_1.z.string().max(100).optional() });
const MAX_ROWS = 1000;
/** Spaltenwhitelist je Entität – keine Roh-Dumps, keine internen Felder. */
const SOURCES = {
    persons: { permission: 'persons.view', load: async (p, t) => (await p.person.findMany({ where: { ...(0, guild_context_1.recordWhere)(), status: 'ACTIVE', ...(t ? { robloxUsername: { contains: t, mode: 'insensitive' } } : {}) }, take: MAX_ROWS, orderBy: { robloxUsername: 'asc' } })).map((x) => ({ id: x.id, robloxUsername: x.robloxUsername, robloxUserId: x.robloxUserId, createdAt: x.createdAt.toISOString() })) },
    vehicles: { permission: 'vehicles.view', load: async (p) => (await p.vehicle.findMany({ where: (0, guild_context_1.recordWhere)(), take: MAX_ROWS, orderBy: { plate: 'asc' } })).map((x) => ({ id: x.id, plate: x.plate, model: x.model, color: x.color, status: x.status })) },
    tickets: { permission: 'tickets.view', load: async (p) => (await p.ticket.findMany({ take: MAX_ROWS, orderBy: { issuedAt: 'desc' } })).map((x) => ({ number: x.number, personId: x.personId, reason: x.reason, amount: Number(x.amount), status: x.status, issuedAt: x.issuedAt.toISOString() })) },
    incidents: { permission: 'incidents.view', load: async (p) => (await p.incident.findMany({ take: MAX_ROWS, orderBy: { createdAt: 'desc' } })).map((x) => ({ number: x.number, title: x.title, priority: x.priority, status: x.status, location: x.location, createdAt: x.createdAt.toISOString() })) },
    audit: { permission: 'audit.export', load: async (p) => (await p.auditLog.findMany({ take: MAX_ROWS, orderBy: { createdAt: 'desc' } })).map((x) => ({ createdAt: x.createdAt.toISOString(), actorUserId: x.actorUserId, action: x.action, module: x.module, entityType: x.entityType, entityId: x.entityId, reason: x.reason, requestId: x.requestId })) },
};
/** CSV-Injection-Schutz: Zellen, die mit = + - @ beginnen, werden entschärft. */
const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s))
        s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => (rows.length ? [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).map(cell).join(','))].join('\n') : '');
exports.toCsv = toCsv;
let ExportController = class ExportController {
    prisma;
    perms;
    audit;
    constructor(prisma, perms, audit) {
        this.prisma = prisma;
        this.perms = perms;
        this.audit = audit;
    }
    async export(actor, entity, f, res) {
        const src = SOURCES[entity];
        if (!src)
            throw new errors_1.AppError('NOT_FOUND', 'Unbekannter Export.');
        const ctx = await this.perms.contextFor(actor.userId);
        if (!(0, shared_1.can)(ctx, src.permission))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
        const rows = await src.load(this.prisma, f.q);
        await this.audit.record(actor, { action: 'export', module: 'export', entityType: entity, after: { format: f.format, rows: rows.length } });
        const name = `${entity}-${new Date().toISOString().slice(0, 10)}.${f.format}`;
        res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
        if (f.format === 'json') {
            res.type('application/json').send(JSON.stringify(rows));
            return;
        }
        if (f.format === 'csv') {
            res.type('text/csv; charset=utf-8').send((0, exports.toCsv)(rows));
            return;
        }
        const doc = new pdfkit_1.default({ margin: 36, size: 'A4', layout: 'landscape' });
        res.type('application/pdf');
        doc.pipe(res);
        doc.fontSize(14).text(`EN Polizei — ${entity} export`, { underline: true }).moveDown(0.5);
        doc.fontSize(8).text(`Generated ${new Date().toISOString()} • ${rows.length} rows • exported by ${actor.userId}`).moveDown();
        for (const r of rows)
            doc.text(Object.values(r).map((v) => (v ?? '—')).join('  |  '), { lineGap: 1 });
        doc.end();
    }
};
exports.ExportController = ExportController;
__decorate([
    (0, common_1.Get)(':entity'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('entity')),
    __param(2, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0, Object]),
    __metadata("design:returntype", Promise)
], ExportController.prototype, "export", null);
exports.ExportController = ExportController = __decorate([
    (0, swagger_1.ApiTags)('export'),
    (0, common_1.Controller)('export'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, audit_service_1.AuditService])
], ExportController);
//# sourceMappingURL=export.controller.js.map