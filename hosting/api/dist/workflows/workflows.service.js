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
exports.WorkflowsService = exports.workflowInput = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const notify_service_1 = require("../notifications/notify.service");
const errors_1 = require("../common/errors");
const snowflake = zod_1.z.string().regex(/^\d{15,25}$/);
const text = (max) => zod_1.z.string().trim().max(max);
const PERMS = new Set(shared_1.ALL_PERMISSIONS);
exports.workflowInput = zod_1.z.object({
    name: text(80).min(1),
    enabled: zod_1.z.boolean().default(true),
    /** Audit-Aktion, optional mit `*` am Ende (z. B. `report.*`). */
    trigger: zod_1.z.string().trim().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*)?$|^[a-z0-9_]+\*$/, 'Ereignis wie „incident.create“ oder „report.*“'),
    conditions: zod_1.z.array(zod_1.z.object({ field: zod_1.z.string().trim().regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/), op: zod_1.z.enum(shared_1.WORKFLOW_OPS), value: text(200).optional() })).max(10).default([]),
    actions: zod_1.z.array(zod_1.z.discriminatedUnion('type', [
        zod_1.z.object({ type: zod_1.z.literal('notify_permission'), permission: zod_1.z.string().refine((p) => PERMS.has(p), 'Unbekanntes Recht'), title: text(200).min(1), body: text(1000).optional() }),
        zod_1.z.object({ type: zod_1.z.literal('notify_role'), roleId: zod_1.z.string().uuid(), title: text(200).min(1), body: text(1000).optional() }),
        zod_1.z.object({ type: zod_1.z.literal('discord'), channelIds: zod_1.z.array(snowflake).min(1).max(5), pingRoleIds: zod_1.z.array(snowflake).max(5).optional(), title: text(200).min(1), text: text(1500).optional(), color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
    ])).min(1).max(5),
});
/** Höchstens so viele Ausführungen je Workflow und Minute (Schutz vor Benachrichtigungs-Fluten). */
const MAX_RUNS_PER_MINUTE = 30;
/** Nachlauf-Fenster: Einträge, deren Transaktion etwas später committet wurde, werden trotzdem erfasst (doppelte Läufe verhindert der eindeutige Schlüssel). */
const LOOKBACK_MS = 30_000;
const CURSOR_KEY = 'workflows.cursor';
/**
 * Studio-Workflows: liest neue Einträge des Audit-Protokolls (nur bestätigte Änderungen) und führt passende Regeln aus.
 * Aktionen erzeugen keine Audit-Einträge → keine Endlosschleifen.
 */
let WorkflowsService = class WorkflowsService {
    prisma;
    audit;
    notify;
    log = new common_1.Logger('Workflows');
    constructor(prisma, audit, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.notify = notify;
    }
    list() {
        return this.prisma.workflow.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { runs: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, ok: true, error: true } } } });
    }
    runs(id) {
        return this.prisma.workflowRun.findMany({ where: { workflowId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    }
    async checkRoles(d) {
        const ids = d.actions.flatMap((a) => (a.type === 'notify_role' ? [a.roleId] : []));
        if (ids.length && (await this.prisma.role.count({ where: { id: { in: ids } } })) !== new Set(ids).size)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Unbekannte Rolle in einer Aktion.');
    }
    async create(actor, d) {
        await this.checkRoles(d);
        return this.prisma.$transaction(async (tx) => {
            const w = await tx.workflow.create({ data: { ...d, conditions: d.conditions, actions: d.actions, createdById: actor.userId } });
            await this.audit.record(actor, { action: 'studio.workflow.create', module: 'studio', entityType: 'Workflow', entityId: w.id, after: w }, tx);
            return w;
        });
    }
    async update(actor, id, d) {
        await this.checkRoles(d);
        return this.prisma.$transaction(async (tx) => {
            const before = await tx.workflow.findUnique({ where: { id } });
            if (!before)
                throw new errors_1.AppError('NOT_FOUND', 'Workflow nicht gefunden.');
            // Geänderte Regel wirkt erst ab jetzt (kein Nachholen älterer Ereignisse mit den neuen Bedingungen)
            const w = await tx.workflow.update({ where: { id }, data: { ...d, conditions: d.conditions, actions: d.actions, activeSince: new Date() } });
            await this.audit.record(actor, { action: 'studio.workflow.update', module: 'studio', entityType: 'Workflow', entityId: id, before, after: w }, tx);
            return w;
        });
    }
    async remove(actor, id) {
        await this.prisma.$transaction(async (tx) => {
            const before = await tx.workflow.findUnique({ where: { id } });
            if (!before)
                throw new errors_1.AppError('NOT_FOUND', 'Workflow nicht gefunden.');
            await tx.workflow.delete({ where: { id } });
            await this.audit.record(actor, { action: 'studio.workflow.delete', module: 'studio', entityType: 'Workflow', entityId: id, before }, tx);
        });
    }
    /** Ein Durchlauf: neue Audit-Einträge holen, passende Workflows ausführen. */
    async tick(now = new Date()) {
        const flows = await this.prisma.workflow.findMany({ where: { enabled: true } });
        const stored = (await this.prisma.systemSetting.findUnique({ where: { key: CURSOR_KEY } }))?.value;
        const cursor = typeof stored === 'string' ? new Date(stored) : new Date(now.getTime() - LOOKBACK_MS);
        let upto = new Date(now.getTime() - 500);
        let processed = 0;
        if (flows.length) {
            const since = new Date(Math.min(cursor.getTime() - LOOKBACK_MS, upto.getTime()));
            const minActive = Math.min(...flows.map((f) => f.activeSince.getTime()));
            const entries = await this.prisma.auditLog.findMany({
                where: { createdAt: { gt: new Date(Math.max(since.getTime(), minActive - 1)), lte: upto }, NOT: { module: 'studio' } },
                orderBy: { createdAt: 'asc' }, take: 500,
            });
            const done = new Set((await this.prisma.workflowRun.findMany({ where: { auditId: { in: entries.map((e) => e.id) } }, select: { workflowId: true, auditId: true } })).map((r) => `${r.workflowId}:${r.auditId}`));
            for (const e of entries) {
                for (const f of flows) {
                    if (done.has(`${f.id}:${e.id}`) || e.createdAt < f.activeSince || !(0, shared_1.triggerMatches)(f.trigger, e.action) || !this.matches(f, e.after))
                        continue;
                    if (await this.run(f, e))
                        processed++;
                }
            }
            if (entries.length === 500)
                upto = entries[entries.length - 1].createdAt; // Rest im nächsten Durchlauf
        }
        await this.prisma.systemSetting.upsert({ where: { key: CURSOR_KEY }, create: { key: CURSOR_KEY, value: upto.toISOString() }, update: { value: upto.toISOString() } });
        return processed;
    }
    matches(f, after) {
        return f.conditions.every((c) => (0, shared_1.conditionMatches)(after, c));
    }
    async run(f, e) {
        // genau einmal je Workflow und Eintrag
        try {
            await this.prisma.workflowRun.create({ data: { workflowId: f.id, auditId: e.id, action: e.action, entityId: e.entityId } });
        }
        catch (x) {
            if (x instanceof client_1.Prisma.PrismaClientKnownRequestError && x.code === 'P2002')
                return false;
            throw x;
        }
        const recent = await this.prisma.workflowRun.count({ where: { workflowId: f.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
        const errors = [];
        if (recent > MAX_RUNS_PER_MINUTE)
            errors.push('Zu viele Ausführungen pro Minute – übersprungen.');
        else {
            const actor = e.actorUserId ? (await this.prisma.user.findUnique({ where: { id: e.actorUserId }, select: { displayName: true } }))?.displayName : null;
            const ctx = { action: e.action, entityType: e.entityType, entityId: e.entityId, actor, after: e.after };
            for (const a of f.actions) {
                try {
                    await this.act(a, ctx, f);
                }
                catch (x) {
                    errors.push(`${a.type}: ${x instanceof Error ? x.message : String(x)}`);
                }
            }
        }
        if (errors.length) {
            this.log.warn(`workflow ${f.name}: ${errors.join('; ')}`);
            await this.prisma.workflowRun.updateMany({ where: { workflowId: f.id, auditId: e.id }, data: { ok: false, error: errors.join('; ').slice(0, 500) } });
        }
        return true;
    }
    async act(a, ctx, f) {
        const t = (s) => (s ? (0, shared_1.renderTemplate)(s, ctx) : undefined);
        const n = { type: 'WORKFLOW', title: t(a.title), body: a.type === 'discord' ? undefined : t(a.body), entityType: ctx.entityType ?? undefined, entityId: ctx.entityId ?? undefined };
        if (a.type === 'notify_permission')
            return this.notify.notify(await this.notify.usersWith(a.permission), n);
        if (a.type === 'notify_role') {
            const users = await this.prisma.userRole.findMany({ where: { roleId: a.roleId, user: { active: true } }, select: { userId: true }, take: 500 });
            return this.notify.notify(users.map((u) => u.userId), n);
        }
        await this.prisma.discordOutbox.create({ data: { type: 'workflow.message', channelKey: 'workflow', payload: { channelIds: a.channelIds, pingRoleIds: a.pingRoleIds ?? [], title: t(a.title), text: t(a.text) ?? null, color: a.color ?? null, workflow: f.name } } });
    }
};
exports.WorkflowsService = WorkflowsService;
exports.WorkflowsService = WorkflowsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, notify_service_1.NotifyService])
], WorkflowsService);
//# sourceMappingURL=workflows.service.js.map