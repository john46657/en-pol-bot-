import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SYNC_DATA_TYPES, policyAllowsFlow } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AuthorizationService } from '../authz/authorization.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { SyncService } from './sync.service';
import { ServersService } from './servers.service';

const conflict = () => new AppError('CONFLICT', 'Diese Verbindung/Freigabe wurde inzwischen geändert. Bitte neu laden – deine Änderung wurde NICHT gespeichert.', { reason: 'VERSION_CONFLICT' });
/** Lesen synchronisierter Kopien braucht das Lese-Recht des zugehörigen Moduls auf dem Zielserver. */
export const SYNC_VIEW_PERMISSION: Record<string, string> = { reports: 'reports.view', unit_status: 'team.view', team_overview: 'team.view', shift_statistics: 'team.view', incidents: 'cad.view', incident_status: 'cad.view', radio_messages: 'cad.view' };

/**
 * Serververbindungen und Datenfreigaben. Regeln:
 * - Verbindung verwalten = `connections.manage` auf JEDEM Mitgliedsserver (oder globaler Systemadministrator).
 * - Freigabe anlegen/ändern = `connections.manage` auf Quell- UND Zielserver; beide müssen Mitglied derselben Verbindung sein
 *   (zusätzlich per zusammengesetztem Fremdschlüssel in der Datenbank erzwungen).
 * - Eine Verbindung allein überträgt nichts; eine Freigabe überträgt nur lesende Kopien.
 */
@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly authz: AuthorizationService, private readonly perms: PermissionService, private readonly sync: SyncService, private readonly servers: ServersService) {}

  private async loadConn(id: string) {
    const c = await this.prisma.serverConnection.findUnique({ where: { id }, include: { members: { include: { server: { select: { id: true, guildId: true, name: true, status: true, archivedAt: true } } } } } });
    if (!c) throw new AppError('NOT_FOUND', 'Verbindung nicht gefunden.');
    return c;
  }
  private async allowedOn(actor: Actor, guildId: string, permission: string) { return (await this.authz.authorize(actor.userId!, guildId, permission)).allowed; }

  /** Recht auf allen (`every`) bzw. mindestens einem Mitgliedsserver. Globale Systemadministratoren immer. */
  private async assertOnConnection(actor: Actor, c: Awaited<ReturnType<ConnectionsService['loadConn']>>, permission: string, mode: 'every' | 'some') {
    if (await this.perms.isOwner(actor.userId!)) return;
    const results = await Promise.all(c.members.map((m) => this.allowedOn(actor, m.server.guildId, permission)));
    const ok = c.members.length > 0 && (mode === 'every' ? results.every(Boolean) : results.some(Boolean));
    if (!ok) {
      await this.authz.recordDenied(actor.userId!, null, permission, `CONNECTION_${mode.toUpperCase()}`, { requestId: actor.requestId });
      // ohne jedes Recht auf einem Mitglied: Verbindung gilt als nicht vorhanden
      if (mode === 'some' || !results.some(Boolean)) throw new AppError('NOT_FOUND', 'Verbindung nicht gefunden.');
      throw new AppError('PERMISSION_DENIED', `Dafür brauchst du „${permission}“ auf allen Servern dieser Verbindung.`);
    }
  }
  private async assertOnServerId(actor: Actor, serverId: string, permission: string) {
    const s = await this.servers.load(serverId);
    await this.authz.assert(actor.userId!, s.guildId, permission, {}, { requestId: actor.requestId });
    return s;
  }
  private record(actor: Actor, connectionId: string, action: string, after: unknown, before?: unknown, tx?: Prisma.TransactionClient) {
    return this.audit.record(actor, { action, module: 'connections', entityType: 'ServerConnection', entityId: connectionId, serverId: null, before, after }, tx);
  }

  // ───────── Verbindungen ─────────
  async list(actor: Actor) {
    const all = await this.prisma.serverConnection.findMany({ include: { members: { include: { server: { select: { id: true, guildId: true, name: true, status: true, archivedAt: true } } } }, _count: { select: { policies: true } } }, orderBy: { createdAt: 'asc' } });
    if (await this.perms.isOwner(actor.userId!)) return all;
    const out = [];
    for (const c of all) if ((await Promise.all(c.members.map((m) => this.allowedOn(actor, m.server.guildId, 'connections.view')))).some(Boolean)) out.push(c);
    return out;
  }
  async get(actor: Actor, id: string) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'connections.view', 'some');
    return c;
  }
  async create(actor: Actor, d: { name: string; serverIds: string[] }) {
    const ids = [...new Set(d.serverIds)];
    for (const id of ids) await this.assertOnServerId(actor, id, 'connections.manage');
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.serverConnection.create({ data: { name: d.name, createdById: actor.userId, members: { create: ids.map((serverId) => ({ serverId })) } } });
      await this.record(actor, c.id, 'connection.create', { name: c.name, serverIds: ids }, undefined, tx);
      return tx.serverConnection.findUniqueOrThrow({ where: { id: c.id }, include: { members: { include: { server: true } } } });
    });
  }
  async update(actor: Actor, id: string, d: { name?: string; status?: 'ACTIVE' | 'DISABLED'; version: number }) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'connections.manage', 'every');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.serverConnection.updateMany({ where: { id, version: d.version }, data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.status !== undefined ? { status: d.status } : {}), version: { increment: 1 } } });
      if (!u.count) throw conflict();
      // Regel bei Deaktivierung: offene Ereignisse werden verworfen (CANCELLED) und nie ausgeführt; Fachdaten/Kopien bleiben
      const cancelled = d.status === 'DISABLED' && c.status !== 'DISABLED' ? await this.sync.cancelPending(tx, { connectionId: id }, 'Verbindung deaktiviert') : 0;
      await this.record(actor, id, d.status && d.status !== c.status ? (d.status === 'DISABLED' ? 'connection.disable' : 'connection.enable') : 'connection.update', { name: d.name ?? c.name, status: d.status ?? c.status, cancelledEvents: cancelled }, { name: c.name, status: c.status }, tx);
      return tx.serverConnection.findUniqueOrThrow({ where: { id }, include: { members: { include: { server: true } } } });
    });
  }
  /** Nur deaktivierte Verbindungen können entfernt werden. Synchronisierte Kopien bleiben gespeichert, sind aber ohne Freigabe nicht mehr lesbar. */
  async remove(actor: Actor, id: string) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'connections.manage', 'every');
    if (c.status !== 'DISABLED') throw new AppError('CONFLICT', 'Bitte die Verbindung zuerst deaktivieren.');
    await this.prisma.$transaction(async (tx) => {
      await this.record(actor, id, 'connection.delete', null, { name: c.name, serverIds: c.members.map((m) => m.serverId) }, tx);
      await tx.serverConnection.delete({ where: { id } });
    });
  }
  async addMember(actor: Actor, id: string, serverId: string) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'connections.manage', 'every');
    await this.assertOnServerId(actor, serverId, 'connections.manage');
    if (c.members.some((m) => m.serverId === serverId)) throw new AppError('CONFLICT', 'Dieser Server ist bereits Mitglied der Verbindung.');
    await this.prisma.$transaction(async (tx) => {
      await tx.serverConnectionMember.create({ data: { connectionId: id, serverId } });
      await this.record(actor, id, 'connection.member.add', { serverId }, undefined, tx);
    });
    return this.loadConn(id);
  }
  /** Ein Server kann eine Verbindung mit `connections.manage` auf diesem Server verlassen; seine Freigaben enden (offene Ereignisse verworfen). */
  async removeMember(actor: Actor, id: string, serverId: string) {
    const c = await this.loadConn(id);
    const m = c.members.find((x) => x.serverId === serverId);
    if (!m) throw new AppError('NOT_FOUND', 'Dieser Server ist kein Mitglied der Verbindung.');
    if (!(await this.perms.isOwner(actor.userId!))) await this.assertOnServerId(actor, serverId, 'connections.manage');
    await this.prisma.$transaction(async (tx) => {
      const policies = await tx.connectionDataPolicy.findMany({ where: { connectionId: id, OR: [{ sourceServerId: serverId }, { targetServerId: serverId }] }, select: { id: true } });
      for (const p of policies) await this.sync.cancelPending(tx, { connectionId: id, policyId: p.id }, 'Server hat die Verbindung verlassen');
      await tx.serverConnectionMember.delete({ where: { id: m.id } }); // Freigaben des Servers entfallen per Fremdschlüssel
      await this.record(actor, id, 'connection.member.remove', { serverId, removedPolicies: policies.length }, undefined, tx);
    });
    return this.loadConn(id);
  }

  // ───────── Datenfreigaben ─────────
  async policies(actor: Actor, id: string) {
    await this.get(actor, id);
    return this.prisma.connectionDataPolicy.findMany({ where: { connectionId: id }, orderBy: { createdAt: 'asc' } });
  }
  async createPolicy(actor: Actor, id: string, d: { sourceServerId: string; targetServerId: string; dataType: string; direction: string; enabled: boolean; settings: Record<string, unknown> }) {
    const c = await this.loadConn(id);
    if (d.sourceServerId === d.targetServerId) throw new AppError('VALIDATION_FAILED', 'Quell- und Zielserver müssen verschieden sein.');
    if (!SYNC_DATA_TYPES.some((t) => t.key === d.dataType)) throw new AppError('VALIDATION_FAILED', 'Unbekannte Datenart.');
    // beide müssen Mitglied DIESER Verbindung sein – keine Freigabe zwischen nicht verbundenen Servern
    if (![d.sourceServerId, d.targetServerId].every((s) => c.members.some((m) => m.serverId === s))) throw new AppError('VALIDATION_FAILED', 'Quell- und Zielserver müssen Mitglieder dieser Verbindung sein.');
    await this.assertOnServerId(actor, d.sourceServerId, 'connections.manage');
    await this.assertOnServerId(actor, d.targetServerId, 'connections.manage');
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.connectionDataPolicy.create({ data: { connectionId: id, sourceServerId: d.sourceServerId, targetServerId: d.targetServerId, dataType: d.dataType, direction: d.direction, enabled: d.enabled, settings: d.settings as Prisma.InputJsonValue } });
      await this.record(actor, id, 'connection.policy.create', { policyId: p.id, sourceServerId: p.sourceServerId, targetServerId: p.targetServerId, dataType: p.dataType, direction: p.direction, enabled: p.enabled }, undefined, tx);
      return p;
    }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Für diese Server und Datenart gibt es schon eine Freigabe.');
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') throw new AppError('VALIDATION_FAILED', 'Quell- und Zielserver müssen Mitglieder dieser Verbindung sein.');
      throw e;
    });
  }
  private async loadPolicy(actor: Actor, id: string, policyId: string) {
    const p = await this.prisma.connectionDataPolicy.findUnique({ where: { id: policyId } });
    if (!p || p.connectionId !== id) throw new AppError('NOT_FOUND', 'Freigabe nicht gefunden.');
    await this.assertOnServerId(actor, p.sourceServerId, 'connections.manage');
    await this.assertOnServerId(actor, p.targetServerId, 'connections.manage');
    return p;
  }
  async updatePolicy(actor: Actor, id: string, policyId: string, d: { direction?: string; enabled?: boolean; settings?: Record<string, unknown>; version: number }) {
    const before = await this.loadPolicy(actor, id, policyId);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.connectionDataPolicy.updateMany({ where: { id: policyId, version: d.version }, data: { ...(d.direction !== undefined ? { direction: d.direction } : {}), ...(d.enabled !== undefined ? { enabled: d.enabled } : {}), ...(d.settings !== undefined ? { settings: d.settings as Prisma.InputJsonValue } : {}), version: { increment: 1 } } });
      if (!u.count) throw conflict();
      const after = await tx.connectionDataPolicy.findUniqueOrThrow({ where: { id: policyId } });
      // eingeschränkt oder abgeschaltet: offene Ereignisse, die nicht mehr erlaubt sind, verwerfen
      const narrowed = !after.enabled || after.direction !== before.direction;
      const cancelled = narrowed ? await this.sync.cancelPending(tx, { connectionId: id, policyId }, 'Freigabe geändert') : 0;
      await this.record(actor, id, 'connection.policy.update', { policyId, direction: after.direction, enabled: after.enabled, cancelledEvents: cancelled }, { direction: before.direction, enabled: before.enabled }, tx);
      return after;
    });
  }
  async removePolicy(actor: Actor, id: string, policyId: string) {
    const p = await this.loadPolicy(actor, id, policyId);
    await this.prisma.$transaction(async (tx) => {
      await this.sync.cancelPending(tx, { connectionId: id, policyId }, 'Freigabe entfernt');
      await tx.connectionDataPolicy.delete({ where: { id: policyId } });
      await this.record(actor, id, 'connection.policy.delete', null, { policyId, sourceServerId: p.sourceServerId, targetServerId: p.targetServerId, dataType: p.dataType, direction: p.direction }, tx);
    });
  }

  // ───────── Synchronisierung ─────────
  async syncStatus(actor: Actor, id: string) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'sync.view', 'some');
    const [byStatus, lastDone, oldestPending] = await Promise.all([
      this.prisma.syncEvent.groupBy({ by: ['status'], where: { connectionId: id }, _count: { _all: true } }),
      this.prisma.syncEvent.findFirst({ where: { connectionId: id, status: 'DONE' }, orderBy: { processedAt: 'desc' }, select: { processedAt: true } }),
      this.prisma.syncEvent.findFirst({ where: { connectionId: id, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return { connectionId: id, status: c.status, counts: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])), lastProcessedAt: lastDone?.processedAt ?? null, oldestPendingAt: oldestPending?.createdAt ?? null };
  }
  /** Ereignisliste ohne Inhalte (Payload wird nicht ausgeliefert – nur Metadaten). */
  async syncEvents(actor: Actor, id: string, q: { status?: string; page: number; pageSize: number }) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'sync.view', 'some');
    const where: Prisma.SyncEventWhereInput = { connectionId: id, ...(q.status ? { status: q.status } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.syncEvent.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize, select: { id: true, sourceServerId: true, targetServerId: true, dataType: true, eventType: true, sourceRecordId: true, sourceVersion: true, status: true, attemptCount: true, nextAttemptAt: true, lastError: true, createdAt: true, processedAt: true } }),
      this.prisma.syncEvent.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  async retryFailed(actor: Actor, id: string) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'sync.retry', 'every');
    if (c.status !== 'ACTIVE') throw new AppError('CONFLICT', 'Die Verbindung ist deaktiviert – es werden keine Ereignisse ausgeführt.');
    return this.sync.retryFailed(actor, id);
  }
  async auditLogs(actor: Actor, id: string, q: { page: number; pageSize: number }) {
    const c = await this.loadConn(id);
    await this.assertOnConnection(actor, c, 'audit.view', 'every');
    const where: Prisma.AuditLogWhereInput = { entityType: 'ServerConnection', entityId: id };
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }), this.prisma.auditLog.count({ where })]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  /**
   * Nur lesend synchronisierte Daten anderer Server auf DIESEM Server. Voraussetzungen je Kopie: Lese-Recht des Moduls hier
   * UND die Freigabe von der Quelle hierher ist jetzt noch aktiv (sonst unsichtbar, aber nicht gelöscht).
   */
  async synced(actor: Actor, serverId: string, dataType: string) {
    const perm = SYNC_VIEW_PERMISSION[dataType];
    if (!perm) throw new AppError('VALIDATION_FAILED', 'Unbekannte Datenart.');
    const s = await this.servers.access(actor, serverId, perm);
    const rows = await this.prisma.syncedRecord.findMany({ where: { targetServerId: serverId, dataType }, orderBy: { updatedAt: 'desc' }, take: 500 });
    const sources = await this.prisma.discordServer.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sourceServerId))] } }, select: { id: true, guildId: true, name: true } });
    const policies = await this.prisma.connectionDataPolicy.findMany({ where: { dataType, enabled: true, connection: { status: 'ACTIVE' }, OR: [{ targetServerId: serverId }, { sourceServerId: serverId }] } });
    const active = new Set(sources.filter((src) => policies.some((p) => policyAllowsFlow(p, src.id, serverId))).map((x) => x.id));
    return rows.filter((r) => active.has(r.sourceServerId)).map((r) => ({ id: r.id, dataType: r.dataType, readOnly: true, source: sources.find((x) => x.id === r.sourceServerId) ?? null, sourceRecordId: r.sourceRecordId, sourceVersion: r.sourceVersion, data: r.data, updatedAt: r.updatedAt, targetGuildId: s.guildId }));
  }
}
