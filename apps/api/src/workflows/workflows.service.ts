import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Workflow } from '@prisma/client';
import { z } from 'zod';
import { ALL_PERMISSIONS, conditionMatches, renderTemplate, triggerMatches, WORKFLOW_OPS, type WorkflowAction, type WorkflowCondition } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { NotifyService } from '../notifications/notify.service';
import { AppError } from '../common/errors';

const snowflake = z.string().regex(/^\d{15,25}$/);
const text = (max: number) => z.string().trim().max(max);
const PERMS = new Set<string>(ALL_PERMISSIONS);

export const workflowInput = z.object({
  name: text(80).min(1),
  enabled: z.boolean().default(true),
  /** Audit-Aktion, optional mit `*` am Ende (z. B. `report.*`). */
  trigger: z.string().trim().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*)?$|^[a-z0-9_]+\*$/, 'Ereignis wie „incident.create“ oder „report.*“'),
  conditions: z.array(z.object({ field: z.string().trim().regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/), op: z.enum(WORKFLOW_OPS), value: text(200).optional() })).max(10).default([]),
  actions: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('notify_permission'), permission: z.string().refine((p) => PERMS.has(p), 'Unbekanntes Recht'), title: text(200).min(1), body: text(1000).optional() }),
    z.object({ type: z.literal('notify_role'), roleId: z.string().uuid(), title: text(200).min(1), body: text(1000).optional() }),
    z.object({ type: z.literal('discord'), channelIds: z.array(snowflake).min(1).max(5), pingRoleIds: z.array(snowflake).max(5).optional(), title: text(200).min(1), text: text(1500).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }),
  ])).min(1).max(5),
});
export type WorkflowInput = z.infer<typeof workflowInput>;

/** Höchstens so viele Ausführungen je Workflow und Minute (Schutz vor Benachrichtigungs-Fluten). */
const MAX_RUNS_PER_MINUTE = 30;
/** Nachlauf-Fenster: Einträge, deren Transaktion etwas später committet wurde, werden trotzdem erfasst (doppelte Läufe verhindert der eindeutige Schlüssel). */
const LOOKBACK_MS = 30_000;
const CURSOR_KEY = 'workflows.cursor';

/**
 * Studio-Workflows: liest neue Einträge des Audit-Protokolls (nur bestätigte Änderungen) und führt passende Regeln aus.
 * Aktionen erzeugen keine Audit-Einträge → keine Endlosschleifen.
 */
@Injectable()
export class WorkflowsService {
  private readonly log = new Logger('Workflows');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notify: NotifyService) {}

  list() {
    return this.prisma.workflow.findMany({ orderBy: { createdAt: 'asc' }, include: { _count: { select: { runs: true } }, runs: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true, ok: true, error: true } } } });
  }
  runs(id: string) {
    return this.prisma.workflowRun.findMany({ where: { workflowId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async checkRoles(d: WorkflowInput) {
    const ids = d.actions.flatMap((a) => (a.type === 'notify_role' ? [a.roleId] : []));
    if (ids.length && (await this.prisma.role.count({ where: { id: { in: ids } } })) !== new Set(ids).size) throw new AppError('VALIDATION_FAILED', 'Unbekannte Rolle in einer Aktion.');
  }

  async create(actor: Actor, d: WorkflowInput) {
    await this.checkRoles(d);
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.workflow.create({ data: { ...d, conditions: d.conditions as Prisma.InputJsonValue, actions: d.actions as Prisma.InputJsonValue, createdById: actor.userId } });
      await this.audit.record(actor, { action: 'studio.workflow.create', module: 'studio', entityType: 'Workflow', entityId: w.id, after: w }, tx);
      return w;
    });
  }

  async update(actor: Actor, id: string, d: WorkflowInput) {
    await this.checkRoles(d);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.workflow.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 'Workflow nicht gefunden.');
      // Geänderte Regel wirkt erst ab jetzt (kein Nachholen älterer Ereignisse mit den neuen Bedingungen)
      const w = await tx.workflow.update({ where: { id }, data: { ...d, conditions: d.conditions as Prisma.InputJsonValue, actions: d.actions as Prisma.InputJsonValue, activeSince: new Date() } });
      await this.audit.record(actor, { action: 'studio.workflow.update', module: 'studio', entityType: 'Workflow', entityId: id, before, after: w }, tx);
      return w;
    });
  }

  async remove(actor: Actor, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.workflow.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 'Workflow nicht gefunden.');
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
          if (done.has(`${f.id}:${e.id}`) || e.createdAt < f.activeSince || !triggerMatches(f.trigger, e.action) || !this.matches(f, e.after)) continue;
          if (await this.run(f, e)) processed++;
        }
      }
      if (entries.length === 500) upto = entries[entries.length - 1]!.createdAt; // Rest im nächsten Durchlauf
    }
    await this.prisma.systemSetting.upsert({ where: { key: CURSOR_KEY }, create: { key: CURSOR_KEY, value: upto.toISOString() }, update: { value: upto.toISOString() } });
    return processed;
  }

  private matches(f: Workflow, after: unknown) {
    return (f.conditions as unknown as WorkflowCondition[]).every((c) => conditionMatches(after, c));
  }

  private async run(f: Workflow, e: { id: string; action: string; entityType: string | null; entityId: string | null; actorUserId: string | null; after: unknown }) {
    // genau einmal je Workflow und Eintrag
    try { await this.prisma.workflowRun.create({ data: { workflowId: f.id, auditId: e.id, action: e.action, entityId: e.entityId } }); }
    catch (x) { if (x instanceof Prisma.PrismaClientKnownRequestError && x.code === 'P2002') return false; throw x; }
    const recent = await this.prisma.workflowRun.count({ where: { workflowId: f.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    const errors: string[] = [];
    if (recent > MAX_RUNS_PER_MINUTE) errors.push('Zu viele Ausführungen pro Minute – übersprungen.');
    else {
      const actor = e.actorUserId ? (await this.prisma.user.findUnique({ where: { id: e.actorUserId }, select: { displayName: true } }))?.displayName : null;
      const ctx = { action: e.action, entityType: e.entityType, entityId: e.entityId, actor, after: e.after };
      for (const a of f.actions as unknown as WorkflowAction[]) {
        try { await this.act(a, ctx, f); } catch (x) { errors.push(`${a.type}: ${x instanceof Error ? x.message : String(x)}`); }
      }
    }
    if (errors.length) {
      this.log.warn(`workflow ${f.name}: ${errors.join('; ')}`);
      await this.prisma.workflowRun.updateMany({ where: { workflowId: f.id, auditId: e.id }, data: { ok: false, error: errors.join('; ').slice(0, 500) } });
    }
    return true;
  }

  private async act(a: WorkflowAction, ctx: Parameters<typeof renderTemplate>[1], f: Workflow) {
    const t = (s?: string) => (s ? renderTemplate(s, ctx) : undefined);
    const n = { type: 'WORKFLOW', title: t(a.title)!, body: a.type === 'discord' ? undefined : t(a.body), entityType: ctx.entityType ?? undefined, entityId: ctx.entityId ?? undefined };
    if (a.type === 'notify_permission') return this.notify.notify(await this.notify.usersWith(a.permission), n);
    if (a.type === 'notify_role') {
      const users = await this.prisma.userRole.findMany({ where: { roleId: a.roleId, user: { active: true } }, select: { userId: true }, take: 500 });
      return this.notify.notify(users.map((u) => u.userId), n);
    }
    await this.prisma.discordOutbox.create({ data: { type: 'workflow.message', channelKey: 'workflow', payload: { channelIds: a.channelIds, pingRoleIds: a.pingRoleIds ?? [], title: t(a.title), text: t(a.text) ?? null, color: a.color ?? null, workflow: f.name } } });
  }
}
