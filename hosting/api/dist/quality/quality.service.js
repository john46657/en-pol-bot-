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
exports.QualityService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const cad_config_service_1 = require("../cad/cad-config.service");
const KEY = 'quality.config';
const OPEN_REPORT = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED'];
const bodyOf = (content) => (content && typeof content === 'object' && typeof content.body === 'string' ? content.body : '');
/**
 * Qualitätsprüfer: lädt Berichte, Fahndungen und Einsätze, wendet die Regeln aus `@enrp/shared` an und verbindet das Ergebnis mit
 * dokumentierten Ausnahmen. Ändert nie einen Datensatz – Befunde sind Hinweise für Menschen. Optional (Einstellung) wird vor dem
 * Einreichen eines Berichts bzw. dem Abschluss eines Einsatzes geprüft.
 */
let QualityService = class QualityService {
    prisma;
    audit;
    perms;
    moduleRef;
    constructor(prisma, audit, perms, moduleRef) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.moduleRef = moduleRef;
    }
    async config() {
        const p = shared_1.qualityConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value ?? {});
        return p.success ? p.data : shared_1.qualityConfigSchema.parse({});
    }
    async saveConfig(actor, c) {
        const v = shared_1.qualityConfigSchema.parse(c);
        const before = await this.config();
        await this.prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: v }, update: { value: v } });
        await this.audit.record(actor, { action: 'quality.config', module: 'reports', entityType: 'SystemSetting', entityId: KEY, before, after: v });
        return v;
    }
    async cad() {
        // CAD-Konfiguration (abschließende Status, Nummern-Präfix) – ohne Modul-Zyklus über die ModuleRef
        const svc = this.moduleRef.get(cad_config_service_1.CadConfigService, { strict: false });
        return svc ? svc.get() : shared_1.DEFAULT_CAD_CONFIG;
    }
    async exceptionsFor(target, ids) {
        const rows = await this.prisma.qualityException.findMany({ where: { targetType: target, targetId: { in: ids }, revokedAt: null } });
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        const by = new Map();
        for (const r of rows)
            by.set(r.targetId, [...(by.get(r.targetId) ?? []), { id: r.id, code: r.code, reason: r.reason, createdAt: r.createdAt, createdByName: names.get(r.createdById) ?? '—' }]);
        return by;
    }
    result(target, id, number, title, findings, ex) {
        return { target, id, number, title, checkedAt: new Date().toISOString(), ...(0, shared_1.splitFindings)(findings, ex) };
    }
    // ───────── Einzelprüfungen ─────────
    async reportFindings(ids, cfg) {
        const reports = await this.prisma.report.findMany({ where: { id: { in: ids } }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
        const incidentIds = [...new Set(reports.map((r) => r.incidentId).filter((x) => !!x))];
        const incidents = new Map((await this.prisma.incident.findMany({ where: { id: { in: incidentIds } }, select: { id: true, number: true, createdAt: true, closedAt: true } })).map((i) => [i.id, i]));
        const prefix = (await this.cad()).incidentNumberPrefix;
        const mentioned = [...new Set(reports.flatMap((r) => (0, shared_1.incidentNumbersIn)(bodyOf(r.versions[0]?.content), prefix)))];
        // Einsatznummern sind global eindeutig; gelöschte Einsätze leben in der Statistik weiter (CadIncidentStat) – beide zählen als „existiert“
        const known = mentioned.length ? new Set([
            ...(await (0, guild_context_1.unscoped)(() => this.prisma.incident.findMany({ where: { number: { in: mentioned } }, select: { number: true } }))).map((x) => x.number),
            ...(await (0, guild_context_1.unscoped)(() => this.prisma.cadIncidentStat.findMany({ where: { number: { in: mentioned } }, select: { number: true } }))).map((x) => x.number),
        ]) : new Set();
        return reports.map((r) => {
            const body = bodyOf(r.versions[0]?.content);
            return { r, findings: (0, shared_1.checkReport)({ type: r.type, title: r.title, body, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, incidentId: r.incidentId, incident: r.incidentId ? incidents.get(r.incidentId) ?? null : null, unknownNumbers: (0, shared_1.incidentNumbersIn)(body, prefix).filter((n) => !known.has(n)) }, cfg) };
        });
    }
    async wantedFindings(ids, cfg) {
        const rows = await this.prisma.wantedRecord.findMany({ where: { id: { in: ids } } });
        const persons = new Map((await this.prisma.person.findMany({ where: { id: { in: rows.map((w) => w.personId).filter((x) => !!x) } }, select: { id: true, robloxUserId: true } })).map((p) => [p.id, p]));
        const vehicles = new Map((await this.prisma.vehicle.findMany({ where: { id: { in: rows.map((w) => w.vehicleId).filter((x) => !!x) } }, select: { id: true, plate: true } })).map((v) => [v.id, v]));
        return rows.map((w) => ({ w, findings: (0, shared_1.checkWanted)({ ...w, person: w.personId ? persons.get(w.personId) ?? null : null, vehicle: w.vehicleId ? vehicles.get(w.vehicleId) ?? null : null }, cfg) }));
    }
    async incidentFindings(ids, cfg, assumeClosed) {
        const cad = await this.cad();
        const closed = new Set(cad.incidentStatuses.filter((s) => s.closed).map((s) => s.key));
        const rows = await this.prisma.incident.findMany({ where: { id: { in: ids } }, include: { units: { select: { unitId: true } } } });
        const reports = await this.prisma.report.groupBy({ by: ['incidentId'], where: { incidentId: { in: ids } }, _count: { _all: true } });
        return rows.map((i) => {
            const isClosed = assumeClosed === i.id || closed.has(i.status);
            return { i, findings: (0, shared_1.checkIncident)({ ...i, closed: isClosed, closedAt: i.closedAt ?? (assumeClosed === i.id ? new Date() : null), unitsEver: i.units.length, reports: reports.find((r) => r.incidentId === i.id)?._count._all ?? 0 }, cfg) };
        });
    }
    /** Einen Datensatz prüfen. Sichtbarkeit: Berichte nur mit Leserecht auf den Bericht (wie im Berichtsmodul). */
    async check(actor, target, id) {
        const cfg = await this.config();
        const ex = await this.exceptionsFor(target, [id]);
        if (target === 'REPORT') {
            const [x] = await this.reportFindings([id], cfg);
            if (!x || !(await this.reportVisible(actor.userId, x.r)))
                throw new errors_1.AppError('NOT_FOUND', 'Bericht nicht gefunden.');
            return this.result(target, id, x.r.number, x.r.title, x.findings, ex.get(id) ?? []);
        }
        if (target === 'WANTED') {
            const [x] = await this.wantedFindings([id], cfg);
            if (!x)
                throw new errors_1.AppError('NOT_FOUND', 'Fahndung nicht gefunden.');
            return this.result(target, id, x.w.number, x.w.reason, x.findings, ex.get(id) ?? []);
        }
        const [x] = await this.incidentFindings([id], cfg);
        if (!x)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        return this.result(target, id, x.i.number, x.i.title, x.findings, ex.get(id) ?? []);
    }
    async reportVisible(userId, r) {
        return r.authorId === userId || ['APPROVED', 'ARCHIVED'].includes(r.status) || (await this.perms.has(userId, 'reports.review')) || (await this.perms.has(userId, 'reports.approve'));
    }
    /** Übersicht: offene Berichte, aktive Fahndungen, Einsätze (offen und noch vorhandene abgeschlossene) mit Befunden. */
    async overview(actor) {
        const cfg = await this.config();
        const seeAll = (await this.perms.has(actor.userId, 'reports.review')) || (await this.perms.has(actor.userId, 'reports.approve'));
        const [reportIds, wantedIds, incidentIds] = await Promise.all([
            this.prisma.report.findMany({ where: { status: { in: OPEN_REPORT }, ...(seeAll ? {} : { authorId: actor.userId }) }, select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 300 }),
            this.prisma.wantedRecord.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 300 }),
            this.prisma.incident.findMany({ where: { restrictRoleIds: { isEmpty: true } }, select: { id: true }, orderBy: { createdAt: 'desc' }, take: 300 }),
        ]);
        const [reports, wanted, incidents] = await Promise.all([
            this.reportFindings(reportIds.map((x) => x.id), cfg), this.wantedFindings(wantedIds.map((x) => x.id), cfg), this.incidentFindings(incidentIds.map((x) => x.id), cfg),
        ]);
        const [exR, exW, exI] = await Promise.all([this.exceptionsFor('REPORT', reportIds.map((x) => x.id)), this.exceptionsFor('WANTED', wantedIds.map((x) => x.id)), this.exceptionsFor('INCIDENT', incidentIds.map((x) => x.id))]);
        const rows = [
            ...reports.map(({ r, findings }) => this.result('REPORT', r.id, r.number, r.title, findings, exR.get(r.id) ?? [])),
            ...wanted.map(({ w, findings }) => this.result('WANTED', w.id, w.number, w.reason, findings, exW.get(w.id) ?? [])),
            ...incidents.map(({ i, findings }) => this.result('INCIDENT', i.id, i.number, i.title, findings, exI.get(i.id) ?? [])),
        ].filter((x) => x.errors.length || x.warnings.length || x.excepted.length);
        const sum = (t) => ({ checked: t === 'REPORT' ? reports.length : t === 'WANTED' ? wanted.length : incidents.length, withErrors: rows.filter((x) => x.target === t && x.errors.length).length, withWarnings: rows.filter((x) => x.target === t && !x.errors.length && x.warnings.length).length });
        return { checkedAt: new Date().toISOString(), config: cfg, summary: { REPORT: sum('REPORT'), WANTED: sum('WANTED'), INCIDENT: sum('INCIDENT') }, items: rows.sort((a, b) => b.errors.length - a.errors.length || b.warnings.length - a.warnings.length) };
    }
    /** Begründete Ausnahme dokumentieren – nur für einen tatsächlich bestehenden Befund dieses Datensatzes. */
    async addException(actor, d) {
        const r = await this.check(actor, d.targetType, d.targetId);
        if (![...r.errors, ...r.warnings].some((f) => f.code === d.code))
            throw new errors_1.AppError('VALIDATION_FAILED', r.excepted.some((f) => f.code === d.code) ? 'Für diesen Befund ist schon eine Ausnahme dokumentiert.' : 'Diesen Befund gibt es bei diesem Datensatz nicht (mehr).');
        try {
            const row = await this.prisma.$transaction(async (tx) => {
                const x = await tx.qualityException.create({ data: { targetType: d.targetType, targetId: d.targetId, code: d.code, reason: d.reason, createdById: actor.userId } });
                await this.audit.record(actor, { action: 'quality.exception.create', module: 'reports', entityType: d.targetType, entityId: d.targetId, after: { code: d.code, reason: d.reason } }, tx);
                return x;
            });
            return row;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', 'Für diesen Befund ist schon eine Ausnahme dokumentiert.');
            throw e;
        }
    }
    async revokeException(actor, id, reason) {
        const x = await this.prisma.qualityException.findUnique({ where: { id } });
        if (!x || x.revokedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Ausnahme nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.qualityException.update({ where: { id }, data: { revokedAt: new Date(), revokedById: actor.userId } });
            await this.audit.record(actor, { action: 'quality.exception.revoke', module: 'reports', entityType: x.targetType, entityId: x.targetId, before: { code: x.code, reason: x.reason }, reason }, tx);
        });
    }
    /** Vor dem Einreichen eines Berichts (falls eingestellt): offene Fehler → abgelehnt, mit den Befunden in den Details. */
    async assertReportSubmittable(actor, reportId) {
        const cfg = await this.config();
        if (!cfg.enforceReportSubmit)
            return;
        const r = await this.check(actor, 'REPORT', reportId);
        // „Abgelehnt/Entwurf liegt herum“ betrifft den Status, den das Einreichen gerade ändert
        const errors = r.errors.filter((e) => e.field !== 'status');
        if (errors.length)
            throw new errors_1.AppError('VALIDATION_FAILED', `Der Bericht kann noch nicht eingereicht werden: ${errors.map((e) => e.message).join(' ')}`, { quality: { ...r, errors } });
    }
    /** Vor dem Abschluss eines Einsatzes (falls eingestellt). */
    async assertIncidentClosable(incidentId) {
        const cfg = await this.config();
        if (!cfg.enforceIncidentClose)
            return;
        const [x] = await this.incidentFindings([incidentId], cfg, incidentId);
        if (!x)
            return;
        const ex = (await this.exceptionsFor('INCIDENT', [incidentId])).get(incidentId) ?? [];
        const r = this.result('INCIDENT', incidentId, x.i.number, x.i.title, x.findings, ex);
        if (r.errors.length)
            throw new errors_1.AppError('VALIDATION_FAILED', `Der Einsatz kann noch nicht abgeschlossen werden: ${r.errors.map((e) => e.message).join(' ')}`, { quality: r });
    }
    /** Für Lageassistent und Prognose: Berichte mit offenen Fehlern (ohne Ausnahme). */
    async incompleteReports(ids) {
        if (!ids.length)
            return [];
        const cfg = await this.config();
        const ex = await this.exceptionsFor('REPORT', ids);
        return (await this.reportFindings(ids, cfg)).map(({ r, findings }) => ({ id: r.id, number: r.number, title: r.title, status: r.status, createdAt: r.createdAt, ...(0, shared_1.splitFindings)(findings, ex.get(r.id) ?? []) }));
    }
    async incidentIssues(ids) {
        if (!ids.length)
            return [];
        const cfg = await this.config();
        const ex = await this.exceptionsFor('INCIDENT', ids);
        return (await this.incidentFindings(ids, cfg)).map(({ i, findings }) => ({ id: i.id, number: i.number, ...(0, shared_1.splitFindings)(findings, ex.get(i.id) ?? []) }));
    }
};
exports.QualityService = QualityService;
exports.QualityService = QualityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, core_1.ModuleRef])
], QualityService);
//# sourceMappingURL=quality.service.js.map