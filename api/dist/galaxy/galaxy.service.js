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
exports.GalaxyService = exports.PROPOSABLE = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const reports_service_1 = require("../reports/reports.service");
const dispatch_service_1 = require("../dispatch/dispatch.service");
const complaints_service_1 = require("../complaints/complaints.service");
const investigations_service_1 = require("../investigations/investigations.service");
const wanted_service_1 = require("../wanted/wanted.service");
const errors_1 = require("../common/errors");
const galaxy_client_1 = require("./galaxy.client");
const galaxy_sanitize_1 = require("./galaxy.sanitize");
const VIEW = { incident: 'incidents.view', report: 'reports.view', complaint: 'complaints.view', investigation: 'investigations.view' };
/** Einzige Aktionen, die die KI vorschlagen darf – jeweils mit Pflicht-Permission des BESTÄTIGENDEN Menschen. */
exports.PROPOSABLE = {
    'complaint.close': { permission: 'complaints.close', schema: zod_1.z.object({ complaintId: zod_1.z.string().uuid() }) },
    'wanted.clear': { permission: 'wanted.clear', schema: zod_1.z.object({ wantedId: zod_1.z.string().uuid(), reason: zod_1.z.string().min(3).max(500) }) },
};
let GalaxyService = class GalaxyService {
    prisma;
    client;
    audit;
    perms;
    reports;
    dispatch;
    complaints;
    investigations;
    wanted;
    constructor(prisma, client, audit, perms, reports, dispatch, complaints, investigations, wanted) {
        this.prisma = prisma;
        this.client = client;
        this.audit = audit;
        this.perms = perms;
        this.reports = reports;
        this.dispatch = dispatch;
        this.complaints = complaints;
        this.investigations = investigations;
        this.wanted = wanted;
    }
    status() { return { enabled: this.client.enabled, capability: this.client.enabled ? 'AVAILABLE' : 'UNAVAILABLE' }; }
    /** Lädt den Datensatz über dieselben Services wie die normale API → die KI sieht exakt das, was der Benutzer sehen darf. */
    async load(actor, kind, id) {
        await this.perms.assert(actor.userId, VIEW[kind]);
        if (kind === 'incident') {
            const { incident: i, timeline } = await this.dispatch.get(id);
            return (0, galaxy_sanitize_1.sanitize)({ number: i.number, title: i.title, description: i.description, priority: i.priority, status: i.status, location: i.location, timeline: timeline.map((t) => t.summary).slice(0, 30) }, 6000);
        }
        if (kind === 'report') {
            const { report: r } = await this.reports.get(actor, id); // wirft 404 für nicht sichtbare Berichte
            const latest = r.versions[0];
            return (0, galaxy_sanitize_1.sanitize)({ number: r.number, type: r.type, title: r.title, status: r.status, content: latest?.content }, 6000);
        }
        if (kind === 'complaint') {
            const { complaint: c } = await this.complaints.get(actor, id); // interne Notizen sind bereits ausgeblendet, wenn nicht erlaubt
            return (0, galaxy_sanitize_1.sanitize)({ number: c.number, category: c.category, description: c.description, status: c.status, findings: c.findings, resolution: c.resolution }, 6000);
        }
        const { investigation: v, timeline } = await this.investigations.get(id);
        return (0, galaxy_sanitize_1.sanitize)({ caseNumber: v.caseNumber, title: v.title, description: v.description, status: v.status, timeline: timeline.map((t) => t.summary).slice(0, 30) }, 6000);
    }
    async run(actor, task, label, data, audit) {
        const raw = await this.client.complete(galaxy_sanitize_1.SYSTEM_PROMPT, `${task}\n\n${(0, galaxy_sanitize_1.wrapData)(label, data)}`);
        const { text, proposal } = this.splitProposal(raw);
        // Audit enthält bewusst KEINEN Prompt-/Antwortinhalt, nur Metadaten.
        await this.audit.record(actor, { action: audit.action, module: 'galaxy', entityType: audit.entityType, entityId: audit.entityId, after: { promptChars: data.length, answerChars: text.length } });
        const proposals = proposal ? [await this.propose(actor, proposal)].filter(Boolean) : [];
        return { aiGenerated: true, label: 'AI-generated — verify before use', text, proposals };
    }
    async summarize(actor, kind, id) {
        const data = await this.load(actor, kind, id);
        return this.run(actor, `Summarize this ${kind} in at most 6 bullet points.`, kind, data, { action: `galaxy.summarize.${kind}`, entityType: kind, entityId: id });
    }
    async draftReport(actor, notes) {
        await this.perms.assert(actor.userId, 'reports.create');
        return this.run(actor, 'Draft a police report (sections: Summary, Details, Outcome) from these officer notes. Mark unknowns as [unknown].', 'officer-notes', (0, galaxy_sanitize_1.sanitize)(notes, 4000), { action: 'galaxy.draft_report' });
    }
    async shiftSummary(actor) {
        await this.perms.assert(actor.userId, 'incidents.view');
        const since = new Date(Date.now() - 12 * 3_600_000);
        const inc = await this.prisma.incident.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: 'asc' }, take: 40, select: { number: true, title: true, priority: true, status: true } });
        return this.run(actor, 'Write a short shift summary of these incidents.', 'incidents', (0, galaxy_sanitize_1.sanitize)(inc, 6000), { action: 'galaxy.shift_summary' });
    }
    splitProposal(raw) {
        const m = raw.match(/\n?PROPOSAL:\s*(\{.*\})\s*$/s);
        if (!m)
            return { text: raw };
        try {
            return { text: raw.slice(0, m.index).trim(), proposal: JSON.parse(m[1]) };
        }
        catch {
            return { text: raw.slice(0, m.index).trim() };
        }
    }
    async propose(actor, p) {
        const parsed = zod_1.z.object({ action: zod_1.z.string(), params: zod_1.z.unknown(), rationale: zod_1.z.string().max(500).optional() }).safeParse(p);
        if (!parsed.success || !(parsed.data.action in exports.PROPOSABLE))
            return null; // Allowlist
        const def = exports.PROPOSABLE[parsed.data.action];
        // Deckel gegen Spam durch manipulierte Datensätze (Prompt Injection)
        if ((await this.prisma.aIProposal.count({ where: { requesterId: actor.userId, status: 'PENDING' } })) >= 10)
            return null;
        const params = def.schema.safeParse(parsed.data.params);
        if (!params.success)
            return null;
        const row = await this.prisma.aIProposal.create({ data: { requesterId: actor.userId, action: parsed.data.action, params: params.data, rationale: parsed.data.rationale } });
        await this.audit.record(actor, { action: 'galaxy.proposal.created', module: 'galaxy', entityType: 'AIProposal', entityId: row.id, after: { action: row.action } });
        return { id: row.id, action: row.action, params: row.params, rationale: row.rationale, status: row.status };
    }
    /** Offene Vorschläge, die der Benutzer selbst bestätigen dürfte. */
    async listProposals(actor) {
        const rows = await this.prisma.aIProposal.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 50 });
        const ctx = await this.perms.contextFor(actor.userId);
        return rows.filter((r) => r.requesterId === actor.userId || (0, shared_1.can)(ctx, exports.PROPOSABLE[r.action]?.permission ?? '!'));
    }
    /** Menschliche Bestätigung: Es zählt die Permission des Bestätigenden; Ausführung läuft über die normalen Services (inkl. Audit/Timeline). */
    async confirm(actor, id) {
        const row = await this.prisma.aIProposal.findUnique({ where: { id } });
        if (!row || row.status !== 'PENDING')
            throw new errors_1.AppError('NOT_FOUND', 'Proposal not found.');
        const def = exports.PROPOSABLE[row.action];
        if (!def)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Unsupported action.');
        await this.perms.assert(actor.userId, def.permission);
        const claimed = await this.prisma.aIProposal.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CONFIRMED', decidedById: actor.userId, decidedAt: new Date() } });
        if (claimed.count === 0)
            throw new errors_1.AppError('CONFLICT', 'Proposal was already decided.');
        try {
            const p = def.schema.parse(row.params);
            if (row.action === 'complaint.close')
                await this.complaints.transition(actor, p.complaintId, 'CLOSED');
            else
                await this.wanted.setStatus(actor, p.wantedId, 'CLEARED', p.reason);
        }
        catch (e) {
            await this.prisma.aIProposal.update({ where: { id }, data: { status: 'FAILED' } });
            throw e;
        }
        await this.audit.record(actor, { action: 'galaxy.proposal.confirmed', module: 'galaxy', entityType: 'AIProposal', entityId: id, after: { action: row.action } });
        return { status: 'CONFIRMED' };
    }
    async reject(actor, id) {
        const r = await this.prisma.aIProposal.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', decidedById: actor.userId, decidedAt: new Date() } });
        if (r.count === 0)
            throw new errors_1.AppError('NOT_FOUND', 'Proposal not found.');
        await this.audit.record(actor, { action: 'galaxy.proposal.rejected', module: 'galaxy', entityType: 'AIProposal', entityId: id });
        return { status: 'REJECTED' };
    }
};
exports.GalaxyService = GalaxyService;
exports.GalaxyService = GalaxyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, galaxy_client_1.GalaxyClient, audit_service_1.AuditService, permission_service_1.PermissionService,
        reports_service_1.ReportsService, dispatch_service_1.DispatchService, complaints_service_1.ComplaintsService,
        investigations_service_1.InvestigationsService, wanted_service_1.WantedService])
], GalaxyService);
//# sourceMappingURL=galaxy.service.js.map