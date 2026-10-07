import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CadConfig, CadEvent } from '@enrp/shared';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { webUrl } from '../common/web-url';
import { CadConfigService } from './cad-config.service';
import { CadNotifyService } from './cad-notify.service';
import type { ErlcPlayer, ErlcSnapshot } from './erlc.service';

/** Wer handelt und von welchem Discord-Server (Bot) bzw. mit welchem gewählten Server (Dashboard). */
export type CadActor = Actor & { guildId?: string | null; discordId?: string | null };

const unitInclude = { members: true, incidents: { where: { clearedAt: null }, include: { incident: { select: { id: true, number: true, title: true, status: true } } } } } as const;
const incidentInclude = { units: { include: { unit: { select: { id: true, callsign: true, name: true, type: true, status: true } } } } } as const;

export interface IncidentInput {
  title: string; type?: string | null; keyword?: string | null; priority?: string; status?: string; location?: string | null; description?: string | null;
  involved?: string | null; requiredUnits?: string | null; internalNotes?: string | null; mapX?: number | null; mapZ?: number | null; dispatcherId?: string | null;
}
export interface UnitInput {
  callsign: string; name?: string | null; type?: string | null; color?: string | null; icon?: string | null; status?: string; discordRoleId?: string | null;
  guildId?: string | null; erlcTeam?: string | null; operational?: boolean; vehicle?: string | null; notes?: string | null; mapX?: number | null; mapZ?: number | null;
}
export interface MemberInput {
  userId?: string | null; discordId?: string | null; discordName?: string | null; robloxName?: string | null; robloxId?: string | null; erlcName?: string | null;
  team?: string | null; unitId?: string | null; zelloName?: string | null; callsign?: string | null; department?: string | null; rank?: string | null; extra?: Record<string, string | number> | null;
}
export interface MapObjectInput {
  kind: 'POI' | 'ZONE'; name: string; description?: string | null; category?: string | null; layer: string; icon?: string | null; color?: string | null;
  x?: number | null; z?: number | null; points?: [number, number][] | null; roleIds?: string[]; incidentType?: string | null; autoAction?: string | null;
}
export interface LinkInput {
  name: string; sourceGuildId: string; targetGuildId: string; active?: boolean; sendTypes?: string[]; allowActions?: string[]; roleIds?: string[]; channels?: Record<string, string[]>; notify?: boolean;
}

@Injectable()
export class CadService {
  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly rt: RealtimeService,
    private readonly timeline: TimelineService, private readonly cfg: CadConfigService, private readonly notify: CadNotifyService,
  ) {}

  // ───────── Hilfen ─────────
  private label(list: { key: string; label: string; emoji?: string }[], key: string | null | undefined) {
    const o = list.find((x) => x.key === key);
    return o ? `${o.emoji ? `${o.emoji} ` : ''}${o.label}` : (key ?? '—');
  }
  private changed(kind: string, id?: string) { this.rt.publish('cad', 'cad.changed', { kind, id: id ?? null }); this.rt.publish('dispatch', 'queue.changed', { id: id ?? null }); }

  /**
   * Server-übergreifende Aktionen: Vom Heimat-Server (Leitstelle) aus immer erlaubt; von einem anderen Discord-Server
   * nur, wenn eine aktive Server-Verbindung diese Aktion freigibt (und ggf. die Rolle passt).
   * Geprüft wird nur, was aus Discord kommt (Bot mit Discord-ID): im Dashboard ist der gewählte Server nur ein Filter.
   * Ohne eingestellten Heimat-Server ist nur ein Ein-Server-Betrieb (keine Server-Verbindungen) offen.
   */
  async assertCrossServer(actor: CadActor, action: 'status_report' | 'radio' | 'view_incidents' | 'dispatch', memberRoleIds: string[] = []) {
    const g = actor.discordId ? actor.guildId ?? null : null;
    const home = (await this.cfg.get()).homeGuildId ?? null;
    if (!g || g === home) return;
    if (!home) {
      if (!(await this.prisma.cadServerLink.count())) return;
      throw new AppError('PERMISSION_DENIED', 'Der Discord-Server der Leitstelle ist noch nicht eingestellt (CAD → Einstellungen → Allgemein).');
    }
    const link = await this.prisma.cadServerLink.findFirst({ where: { active: true, sourceGuildId: home, targetGuildId: g, allowActions: { has: action } } });
    if (!link) throw new AppError('PERMISSION_DENIED', 'Dieser Discord-Server ist für diese Aktion nicht mit der Leitstelle verbunden.');
    if (link.roleIds.length && !memberRoleIds.some((r) => link.roleIds.includes(r))) throw new AppError('PERMISSION_DENIED', 'Dir fehlt die freigegebene Rolle für diese Server-Verbindung.');
  }

  /** Fortlaufende Einsatznummer, z. B. E-2026-00421 (Präfix in den CAD-Einstellungen). */
  private async nextNumber(tx: Tx, prefix: string) {
    const head = `${prefix}-${new Date().getUTCFullYear()}-`;
    const last = await tx.incident.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: 'desc' }, select: { number: true } });
    const n = last ? Number(last.number.slice(head.length)) || 0 : 0;
    return `${head}${String(n + 1).padStart(5, '0')}`;
  }

  private async log(tx: Tx | PrismaService, incidentId: string, kind: string, text: string, actor: CadActor, unitId?: string | null) {
    await tx.cadIncidentLog.create({ data: { incidentId, kind, text: text.slice(0, 2000), unitId: unitId ?? null, authorId: actor.userId, guildId: actor.guildId ?? null } });
  }

  private incidentPayload(cfg: CadConfig, i: { id: string; number: string; title: string; type: string | null; keyword: string | null; priority: string; status: string; location: string | null; description: string | null }, extra: Record<string, unknown> = {}) {
    const prio = cfg.priorities.find((p) => p.key === i.priority);
    return {
      id: i.id, number: i.number, title: i.title, keyword: i.keyword, type: i.type ? this.label(cfg.incidentTypes, i.type) : null,
      priority: this.label(cfg.priorities, i.priority), priorityColor: prio?.color ?? null, status: this.label(cfg.incidentStatuses, i.status),
      location: i.location, description: i.description?.slice(0, 1000) ?? null, dashboardUrl: webUrl(`/cad/incidents?id=${i.id}`), ...extra,
    };
  }

  // ───────── Einsätze ─────────
  async listIncidents(f: { active?: boolean; q?: string; take?: number }) {
    const cfg = await this.cfg.get();
    const closed = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
    const where: Prisma.IncidentWhereInput = {
      ...(f.active ? { status: { notIn: closed } } : {}),
      ...(f.q ? { OR: [{ number: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }, { keyword: { contains: f.q, mode: 'insensitive' } }, { location: { contains: f.q, mode: 'insensitive' } }] } : {}),
    };
    const rows = await this.prisma.incident.findMany({ where, include: incidentInclude, orderBy: { createdAt: 'desc' }, take: Math.min(f.take ?? 100, 300) });
    const calls = await this.prisma.erlcEmergencyCall.findMany({ where: { incidentId: { in: rows.map((r) => r.id) } }, select: { id: true, callNumber: true, incidentId: true } });
    const order = new Map(cfg.priorities.map((p, i) => [p.key, p.order ?? i]));
    return rows
      .map((r) => ({ ...r, calls: calls.filter((c) => c.incidentId === r.id) }))
      .sort((a, b) => (f.active ? (order.get(a.priority) ?? 99) - (order.get(b.priority) ?? 99) : 0) || b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getIncident(id: string) {
    const i = await this.prisma.incident.findUnique({ where: { id }, include: { ...incidentInclude, log: { orderBy: { createdAt: 'asc' }, take: 500 } } });
    if (!i) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    const [calls, users] = await Promise.all([
      this.prisma.erlcEmergencyCall.findMany({ where: { incidentId: id } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set([i.dispatcherId, ...i.log.map((l) => l.authorId)].filter((x): x is string => !!x))] } }, select: { id: true, displayName: true } }),
    ]);
    const names = Object.fromEntries(users.map((u) => [u.id, u.displayName]));
    return { ...i, calls, names };
  }

  private async validateIncident(d: Partial<IncidentInput>) {
    const cfg = await this.cfg.get();
    if (d.priority && !cfg.priorities.some((p) => p.key === d.priority)) throw new AppError('VALIDATION_FAILED', `Unbekannte Priorität „${d.priority}“.`);
    if (d.status && !cfg.incidentStatuses.some((p) => p.key === d.status)) throw new AppError('VALIDATION_FAILED', `Unbekannter Status „${d.status}“.`);
    if (d.type && !cfg.incidentTypes.some((p) => p.key === d.type)) throw new AppError('VALIDATION_FAILED', `Unbekannte Einsatzart „${d.type}“.`);
    return cfg;
  }

  async createIncident(actor: CadActor, d: IncidentInput, opts: { callId?: string } = {}) {
    const cfg = await this.validateIncident(d);
    const status = d.status ?? cfg.incidentStatuses.find((s) => !s.closed)!.key;
    const priority = d.priority ?? cfg.priorities[Math.floor(cfg.priorities.length / 2)]!.key;
    const guildId = actor.guildId ?? cfg.homeGuildId ?? null;
    let inc;
    for (let attempt = 0; ; attempt++) {
      try {
        inc = await this.prisma.$transaction(async (tx) => {
          const row = await tx.incident.create({ data: {
            number: await this.nextNumber(tx, cfg.incidentNumberPrefix), title: d.title, type: d.type ?? null, keyword: d.keyword ?? null, priority, status, location: d.location ?? null,
            description: d.description ?? null, involved: d.involved ?? null, requiredUnits: d.requiredUnits ?? null, internalNotes: d.internalNotes ?? null, mapX: d.mapX ?? null, mapZ: d.mapZ ?? null,
            dispatcherId: d.dispatcherId ?? actor.userId, source: opts.callId ? 'ERLC_CALL' : 'CAD', guildId,
          } });
          await this.log(tx, row.id, 'CREATED', `Einsatz ${row.number} angelegt`, actor);
          if (opts.callId) {
            const call = await tx.erlcEmergencyCall.findUnique({ where: { id: opts.callId } });
            if (!call) throw new AppError('NOT_FOUND', 'Notruf nicht gefunden.');
            // nur verknüpfen, wenn noch kein Einsatz dran hängt (gleichzeitige Klicks in Discord und Dashboard)
            const linked = await tx.erlcEmergencyCall.updateMany({ where: { id: call.id, incidentId: null }, data: { incidentId: row.id, status: 'CLAIMED', claimedById: call.claimedById ?? actor.userId } });
            if (!linked.count) throw new AppError('CONFLICT', 'Aus diesem Notruf wurde schon ein Einsatz erstellt.', { incidentId: call.incidentId });
            await this.log(tx, row.id, 'CALL', `Verknüpft mit ER:LC-Notruf #${call.callNumber}${call.description ? `: ${call.description}` : ''}`, actor);
          }
          await this.timeline.add(tx, { entityType: 'Incident', entityId: row.id, action: 'incident.created', summary: `Einsatz ${row.number} im CAD angelegt`, actorId: actor.userId });
          await this.audit.record(actor, { action: 'cad.incident.create', module: 'cad', entityType: 'Incident', entityId: row.id, after: { ...row, callId: opts.callId ?? null } }, tx);
          return row;
        });
        break;
      } catch (e) {
        // gleichzeitige Nummernvergabe → neu versuchen
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 5) continue;
        throw e;
      }
    }
    await this.zoneActions(actor, inc);
    this.changed('incident', inc.id);
    this.rt.publish('incidents', 'incident.created', { id: inc.id, number: inc.number });
    await this.notify.emit('incident.created', this.incidentPayload(cfg, inc), inc.guildId);
    return inc;
  }

  /** Zonen mit automatischer Aktion: Einsatz liegt in der Zone → Hinweis in der Chronik („warn“) bzw. zusätzlich Leitstellenmeldung („notify“). */
  private async zoneActions(actor: CadActor, inc: { id: string; number: string; title: string; mapX: number | null; mapZ: number | null; guildId: string | null }) {
    if (inc.mapX === null || inc.mapZ === null) return;
    const zones = await this.prisma.cadMapObject.findMany({ where: { kind: 'ZONE', autoAction: { not: null } } });
    for (const z of zones) {
      const pts = (z.points ?? []) as [number, number][];
      if (pts.length < 3 || !inside(inc.mapX, inc.mapZ, pts)) continue;
      await this.log(this.prisma, inc.id, 'NOTE', `⚠️ Einsatzort liegt in Zone „${z.name}“${z.description ? ` – ${z.description}` : ''}`, actor);
      if (z.autoAction === 'notify') await this.notify.emit('announcement', { text: `Einsatz ${inc.number} (${inc.title}) liegt in der Zone „${z.name}“.`, from: 'CAD' }, inc.guildId);
    }
  }

  async updateIncident(actor: CadActor, id: string, d: Partial<IncidentInput>) {
    const cfg = await this.validateIncident(d);
    const before = await this.prisma.incident.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    const { status, ...rest } = d;
    if (status && status !== before.status) await this.assertStatusAllowed(actor, cfg, before.status, status);
    const after = await this.prisma.$transaction(async (tx) => {
      const row = await tx.incident.update({ where: { id }, data: { ...rest, version: { increment: 1 } } });
      const fields = Object.keys(rest);
      if (fields.length) await this.log(tx, id, 'NOTE', `Geändert: ${fields.join(', ')}`, actor);
      await this.audit.record(actor, { action: 'cad.incident.update', module: 'cad', entityType: 'Incident', entityId: id, before: Object.fromEntries(fields.map((k) => [k, (before as Record<string, unknown>)[k]])), after: rest }, tx);
      return row;
    });
    this.changed('incident', id);
    if (status && status !== before.status) return this.setStatus(actor, id, status);
    void cfg;
    return after;
  }

  /** Abschließen und Wiederöffnen eines abgeschlossenen Einsatzes brauchen cad.close_incident. */
  private async assertStatusAllowed(actor: CadActor, cfg: CadConfig, from: string, to: string) {
    const closed = (k: string) => !!cfg.incidentStatuses.find((s) => s.key === k)?.closed;
    if ((closed(to) || closed(from)) && !(await this.perms.has(actor.userId!, 'cad.close_incident'))) throw new AppError('PERMISSION_DENIED', 'Zum Abschließen oder Wiederöffnen eines Einsatzes fehlt dir das Recht (cad.close_incident).');
  }

  async setStatus(actor: CadActor, id: string, status: string, note?: string) {
    const cfg = await this.validateIncident({ status });
    const st = cfg.incidentStatuses.find((s) => s.key === status)!;
    const inc = await this.prisma.incident.findUnique({ where: { id } });
    if (!inc) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    if (inc.status === status) return inc;
    await this.assertStatusAllowed(actor, cfg, inc.status, status);
    const after = await this.prisma.$transaction(async (tx) => {
      const row = await tx.incident.update({ where: { id }, data: { status, closedAt: st.closed ? new Date() : null, version: { increment: 1 } } });
      if (st.closed) {
        const open = await tx.incidentUnit.findMany({ where: { incidentId: id, clearedAt: null } });
        await tx.incidentUnit.updateMany({ where: { incidentId: id, clearedAt: null }, data: { clearedAt: new Date() } });
        await tx.unit.updateMany({ where: { id: { in: open.map((u) => u.unitId) }, status: { notIn: ['OFF_DUTY', 'UNAVAILABLE'] } }, data: { status: cfg.unitStatuses[0]!.key } });
        await tx.erlcEmergencyCall.updateMany({ where: { incidentId: id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED' } });
      }
      await this.log(tx, id, 'STATUS', `Status: ${this.label(cfg.incidentStatuses, inc.status)} → ${this.label(cfg.incidentStatuses, status)}${note ? ` – ${note}` : ''}`, actor);
      await this.audit.record(actor, { action: st.closed ? 'cad.incident.close' : 'cad.incident.status', module: 'cad', entityType: 'Incident', entityId: id, before: { status: inc.status }, after: { status }, reason: note }, tx);
      return row;
    });
    this.changed('incident', id);
    this.rt.publish('incidents', 'incident.status', { id, status });
    const event: CadEvent = st.closed ? 'incident.closed' : 'incident.status';
    await this.notify.emit(event, this.incidentPayload(cfg, after, { previous: this.label(cfg.incidentStatuses, inc.status), note: note ?? null }), after.guildId);
    return after;
  }

  async addNote(actor: CadActor, id: string, text: string) {
    if (!(await this.prisma.incident.findUnique({ where: { id }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    await this.log(this.prisma, id, 'NOTE', text, actor);
    await this.audit.record(actor, { action: 'cad.incident.note', module: 'cad', entityType: 'Incident', entityId: id });
    this.changed('incident', id);
  }

  async assignUnit(actor: CadActor, id: string, unitId: string) {
    const cfg = await this.cfg.get();
    const closed = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
    const { inc, unit } = await this.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.findUnique({ where: { id } });
      if (!inc) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
      if (closed.includes(inc.status)) throw new AppError('INVALID_TRANSITION', 'Der Einsatz ist bereits abgeschlossen.');
      const unit = await tx.unit.findUnique({ where: { id: unitId }, include: { members: true } });
      if (!unit) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
      if (!unit.operational || ['OFF_DUTY', 'UNAVAILABLE'].includes(unit.status)) throw new AppError('CONFLICT', `${unit.callsign} ist nicht einsatzfähig/verfügbar.`);
      await tx.incidentUnit.upsert({ where: { incidentId_unitId: { incidentId: id, unitId } }, create: { incidentId: id, unitId }, update: { clearedAt: null, assignedAt: new Date() } });
      const busy = cfg.unitStatuses.find((s) => s.key === 'EN_ROUTE') ?? cfg.unitStatuses.find((s) => s.key === 'BUSY');
      if (busy) await tx.unit.update({ where: { id: unitId }, data: { status: busy.key } });
      await this.log(tx, id, 'ASSIGN', `${unit.callsign} zugewiesen`, actor, unitId);
      await this.audit.record(actor, { action: 'cad.unit.assign', module: 'cad', entityType: 'Incident', entityId: id, after: { unitId, callsign: unit.callsign } }, tx);
      if (unit.members.length) await tx.notification.createMany({ data: unit.members.map((m) => ({ userId: m.userId, type: 'INCIDENT_ASSIGNMENT', title: `Einsatz ${inc.number}: ${inc.title}`, entityType: 'Incident', entityId: id })) });
      return { inc, unit };
    });
    this.changed('incident', id);
    this.rt.publish('dispatch', 'unit.assigned', { incidentId: id, unitId });
    await this.notify.emit('incident.assigned', this.incidentPayload(cfg, inc, { callsign: unit.callsign, unitName: unit.name, unitType: unit.type ? this.label(cfg.unitTypes, unit.type) : null, unitRoleId: unit.discordRoleId }), inc.guildId);
    return { ok: true };
  }

  async clearUnit(actor: CadActor, id: string, unitId: string) {
    const cfg = await this.cfg.get();
    const link = await this.prisma.incidentUnit.findUnique({ where: { incidentId_unitId: { incidentId: id, unitId } }, include: { unit: true } });
    if (!link || link.clearedAt) throw new AppError('NOT_FOUND', 'Die Einheit ist diesem Einsatz nicht zugewiesen.');
    await this.prisma.$transaction(async (tx) => {
      await tx.incidentUnit.update({ where: { incidentId_unitId: { incidentId: id, unitId } }, data: { clearedAt: new Date() } });
      if (!['OFF_DUTY', 'UNAVAILABLE'].includes(link.unit.status)) await tx.unit.update({ where: { id: unitId }, data: { status: cfg.unitStatuses[0]!.key } });
      await this.log(tx, id, 'ASSIGN', `${link.unit.callsign} aus dem Einsatz gelöst`, actor, unitId);
      await this.audit.record(actor, { action: 'cad.unit.clear', module: 'cad', entityType: 'Incident', entityId: id, after: { unitId } }, tx);
    });
    this.changed('incident', id);
  }

  // ───────── Einheiten ─────────
  async listUnits() {
    const [units, members, servers] = await Promise.all([
      this.prisma.unit.findMany({ include: unitInclude, orderBy: { callsign: 'asc' } }),
      this.prisma.cadMember.findMany({ where: { unitId: { not: null } } }),
      this.prisma.erlcServer.findMany({ where: { active: true }, select: { snapshot: true } }),
    ]);
    const players = new Map<string, ErlcPlayer>();
    for (const s of servers) for (const p of ((s.snapshot as ErlcSnapshot | null)?.players ?? [])) players.set(p.name.toLowerCase(), p);
    const userIds = [...new Set(units.flatMap((u) => u.members.map((m) => m.userId)))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
    const uname = new Map(users.map((u) => [u.id, u.displayName]));
    return units.map((u) => {
      const crew = members.filter((m) => m.unitId === u.id);
      // Position: erster Spieler der Besatzung, der gerade in ER:LC ist – sonst manuell gesetzte Position
      const live = crew.map((m) => (m.erlcName ? players.get(m.erlcName.toLowerCase()) : undefined)).find((p) => p?.location);
      return {
        ...u, crew: crew.map((m) => ({ id: m.id, discordName: m.discordName, discordId: m.discordId, robloxName: m.robloxName, erlcName: m.erlcName, callsign: m.callsign, team: m.team, inGame: !!(m.erlcName && players.has(m.erlcName.toLowerCase())) })),
        memberNames: u.members.map((m) => uname.get(m.userId) ?? m.userId),
        current: u.incidents[0]?.incident ?? null,
        position: live?.location ? { x: live.location.x, z: live.location.z, source: 'erlc' as const, street: live.location.street, postal: live.location.postal } : u.mapX !== null && u.mapZ !== null ? { x: u.mapX, z: u.mapZ, source: 'manual' as const, street: null, postal: null } : null,
      };
    });
  }

  private async validateUnit(d: Partial<UnitInput>) {
    const cfg = await this.cfg.get();
    if (d.type && !cfg.unitTypes.some((t) => t.key === d.type)) throw new AppError('VALIDATION_FAILED', `Unbekannter Einheitentyp „${d.type}“.`);
    if (d.status && !cfg.unitStatuses.some((t) => t.key === d.status)) throw new AppError('VALIDATION_FAILED', `Unbekannter Einheitenstatus „${d.status}“.`);
    return cfg;
  }

  async createUnit(actor: CadActor, d: UnitInput) {
    const cfg = await this.validateUnit(d);
    try {
      const u = await this.prisma.$transaction(async (tx) => {
        const row = await tx.unit.create({ data: { ...d, callsign: d.callsign.toUpperCase(), status: d.status ?? cfg.unitStatuses[0]!.key } });
        await this.audit.record(actor, { action: 'cad.unit.create', module: 'cad', entityType: 'Unit', entityId: row.id, after: row }, tx);
        return row;
      });
      this.changed('unit', u.id);
      return u;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', `Es gibt schon eine Einheit „${d.callsign.toUpperCase()}“.`);
      throw e;
    }
  }

  async updateUnit(actor: CadActor, id: string, d: Partial<UnitInput>) {
    await this.validateUnit(d);
    const before = await this.prisma.unit.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
    const u = await this.prisma.$transaction(async (tx) => {
      const row = await tx.unit.update({ where: { id }, data: { ...d, ...(d.callsign ? { callsign: d.callsign.toUpperCase() } : {}) } });
      await this.audit.record(actor, { action: 'cad.unit.update', module: 'cad', entityType: 'Unit', entityId: id, before: Object.fromEntries(Object.keys(d).map((k) => [k, (before as Record<string, unknown>)[k]])), after: d }, tx);
      return row;
    });
    this.changed('unit', id);
    return u;
  }

  async deleteUnit(actor: CadActor, id: string) {
    const u = await this.prisma.unit.findUnique({ where: { id } });
    if (!u) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cadMember.updateMany({ where: { unitId: id }, data: { unitId: null } });
      await tx.unit.delete({ where: { id } });
      await this.audit.record(actor, { action: 'cad.unit.delete', module: 'cad', entityType: 'Unit', entityId: id, before: u }, tx);
    });
    this.changed('unit', id);
  }

  /** Status einer Einheit: Leitstelle (cad.assign_unit) oder ein Besatzungsmitglied selbst (auch vom verbundenen SEK/K9-Server). */
  async setUnitStatus(actor: CadActor, id: string, status: string, memberRoleIds: string[] = []) {
    const cfg = await this.validateUnit({ status });
    const u = await this.prisma.unit.findUnique({ where: { id }, include: { members: true, incidents: { where: { clearedAt: null } } } });
    if (!u) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
    const dispatcher = await this.perms.has(actor.userId!, 'cad.assign_unit');
    if (dispatcher) await this.assertCrossServer(actor, 'dispatch', memberRoleIds);
    else {
      const crew = u.members.some((m) => m.userId === actor.userId) || !!(await this.prisma.cadMember.findFirst({ where: { unitId: id, OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] } }));
      if (!crew) throw new AppError('PERMISSION_DENIED', 'Nur die Leitstelle oder die Besatzung darf den Status dieser Einheit ändern.');
      await this.assertCrossServer(actor, 'status_report', memberRoleIds);
    }
    if (u.status === status) return u;
    const after = await this.prisma.$transaction(async (tx) => {
      const row = await tx.unit.update({ where: { id }, data: { status } });
      for (const link of u.incidents) await this.log(tx, link.incidentId, 'STATUS', `${u.callsign}: ${this.label(cfg.unitStatuses, status)}`, actor, id);
      await this.audit.record(actor, { action: 'cad.unit.status', module: 'cad', entityType: 'Unit', entityId: id, before: { status: u.status }, after: { status } }, tx);
      return row;
    });
    this.changed('unit', id);
    this.rt.publish('dispatch', 'unit.status', { unitId: id, status });
    return after;
  }

  // ───────── Notrufe (ER:LC) ─────────
  async listCalls(f: { status?: string; take?: number }) {
    const rows = await this.prisma.erlcEmergencyCall.findMany({ where: f.status && f.status !== 'ALL' ? { status: f.status } : {}, include: { server: { select: { id: true, name: true } } }, orderBy: { startedAt: 'desc' }, take: Math.min(f.take ?? 100, 300) });
    const incs = await this.prisma.incident.findMany({ where: { id: { in: rows.map((r) => r.incidentId).filter((x): x is string => !!x) } }, select: { id: true, number: true, status: true } });
    const byId = new Map(incs.map((i) => [i.id, i]));
    return rows.map((r) => ({ ...r, incident: r.incidentId ? byId.get(r.incidentId) ?? null : null }));
  }

  async callAction(actor: CadActor, id: string, action: 'claim' | 'close' | 'reopen') {
    const c = await this.prisma.erlcEmergencyCall.findUnique({ where: { id } });
    if (!c) throw new AppError('NOT_FOUND', 'Notruf nicht gefunden.');
    const status = action === 'claim' ? 'CLAIMED' : action === 'close' ? 'CLOSED' : 'OPEN';
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.erlcEmergencyCall.update({ where: { id }, data: { status, ...(action === 'claim' ? { claimedById: actor.userId } : {}) } });
      if (c.incidentId) await this.log(tx, c.incidentId, 'CALL', `Notruf #${c.callNumber}: ${action === 'claim' ? 'übernommen' : action === 'close' ? 'geschlossen' : 'wieder geöffnet'}`, actor);
      await this.audit.record(actor, { action: `cad.call.${action}`, module: 'cad', entityType: 'ErlcEmergencyCall', entityId: id, before: { status: c.status }, after: { status } }, tx);
      return r;
    });
    this.changed('call', id);
    return row;
  }

  /** Notruf → Einsatz (Position, Ort und Beschreibung werden übernommen; die Verknüpfung bleibt gespeichert). */
  async incidentFromCall(actor: CadActor, callId: string, d: Partial<IncidentInput>) {
    const c = await this.prisma.erlcEmergencyCall.findUnique({ where: { id: callId }, include: { server: { select: { guildId: true } } } });
    if (!c) throw new AppError('NOT_FOUND', 'Notruf nicht gefunden.');
    return this.createIncident({ ...actor, guildId: actor.guildId ?? c.server.guildId }, {
      title: d.title ?? (c.description ? c.description.slice(0, 200) : `Notruf #${c.callNumber}`), type: d.type, keyword: d.keyword ?? (c.team ? `Notruf ${c.team}` : null), priority: d.priority, status: d.status,
      location: d.location ?? c.positionDescriptor, description: d.description ?? c.description, mapX: d.mapX ?? c.mapX, mapZ: d.mapZ ?? c.mapZ, involved: d.involved ?? (c.callerName ?? c.callerRobloxId ? `Anrufer: ${c.callerName ?? c.callerRobloxId}` : null),
    }, { callId });
  }

  /** Einheit direkt zu einem Notruf: legt bei Bedarf den Einsatz an. */
  async assignToCall(actor: CadActor, callId: string, unitId: string) {
    const c = await this.prisma.erlcEmergencyCall.findUnique({ where: { id: callId } });
    if (!c) throw new AppError('NOT_FOUND', 'Notruf nicht gefunden.');
    const incidentId = c.incidentId ?? (await this.incidentFromCall(actor, callId, {})).id;
    await this.assignUnit(actor, incidentId, unitId);
    return { incidentId };
  }

  // ───────── Funk ─────────
  async listRadio(f: { incidentId?: string; take?: number }) {
    const rows = await this.prisma.cadRadioMessage.findMany({ where: f.incidentId ? { incidentId: f.incidentId } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(f.take ?? 50, 200) });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    const n = new Map(users.map((u) => [u.id, u.displayName]));
    const incs = await this.prisma.incident.findMany({ where: { id: { in: rows.map((r) => r.incidentId).filter((x): x is string => !!x) } }, select: { id: true, number: true } });
    const inum = new Map(incs.map((i) => [i.id, i.number]));
    return rows.map((r) => ({ ...r, authorName: r.authorId ? n.get(r.authorId) ?? null : null, incidentNumber: r.incidentId ? inum.get(r.incidentId) ?? null : null }));
  }

  /** Funkmeldung (Dashboard oder Discord). Mit Einsatz → zusätzlich in der Einsatzchronik. */
  async sendRadio(actor: CadActor, d: { text: string; unitId?: string | null; incidentId?: string | null; incidentNumber?: string | null; callsign?: string | null }, memberRoleIds: string[] = []) {
    await this.assertCrossServer(actor, 'radio', memberRoleIds);
    // Leitstelle darf für jede Einheit/jeden Einsatz funken; alle anderen nur als eigene Einheit in deren Einsätze
    const dispatcher = await this.perms.has(actor.userId!, 'cad.assign_unit');
    const member = await this.prisma.cadMember.findFirst({ where: { OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] } });
    const unitId = dispatcher ? d.unitId ?? member?.unitId : member?.unitId;
    const unit = unitId ? await this.prisma.unit.findUnique({ where: { id: unitId } }) : null;
    let incidentId = d.incidentId ?? null;
    if (incidentId && !(await this.prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    if (!incidentId && d.incidentNumber) {
      const i = await this.prisma.incident.findFirst({ where: { number: { equals: d.incidentNumber.trim(), mode: 'insensitive' } }, select: { id: true } });
      if (!i) throw new AppError('NOT_FOUND', `Einsatz „${d.incidentNumber}“ nicht gefunden.`);
      incidentId = i.id;
    }
    if (incidentId && !dispatcher && !(unit && (await this.prisma.incidentUnit.findFirst({ where: { incidentId, unitId: unit.id, clearedAt: null } })))) throw new AppError('PERMISSION_DENIED', 'Funkmeldungen in einen Einsatz nur, wenn deine Einheit ihm zugewiesen ist.');
    if (!incidentId && unit) incidentId = (await this.prisma.incidentUnit.findFirst({ where: { unitId: unit.id, clearedAt: null }, orderBy: { assignedAt: 'desc' } }))?.incidentId ?? null;
    const callsign = (dispatcher ? d.callsign : null) ?? unit?.callsign ?? member?.callsign ?? null;
    const msg = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cadRadioMessage.create({ data: { text: d.text, callsign, unitId: unit?.id ?? null, incidentId, authorId: actor.userId, discordId: actor.discordId ?? null, guildId: actor.guildId ?? null } });
      if (incidentId) await this.log(tx, incidentId, 'RADIO', `${callsign ?? 'Funk'}: „${d.text}“`, actor, unit?.id);
      await this.audit.record(actor, { action: 'cad.radio', module: 'cad', entityType: 'CadRadioMessage', entityId: row.id, after: { callsign, incidentId, crossServer: !!actor.guildId } }, tx);
      return row;
    });
    this.changed('radio', msg.id);
    const inc = incidentId ? await this.prisma.incident.findUnique({ where: { id: incidentId }, select: { number: true, guildId: true } }) : null;
    await this.notify.emit('radio', { id: msg.id, callsign, text: d.text, incidentNumber: inc?.number ?? null }, inc?.guildId ?? null);
    return { ...msg, incidentNumber: inc?.number ?? null };
  }

  /** Wichtige Leitstellenmeldung an alle konfigurierten Kanäle (inkl. verbundener Server). */
  async announce(actor: CadActor, text: string) {
    await this.audit.record(actor, { action: 'cad.announcement', module: 'cad', after: { text } });
    const t = await this.notify.emit('announcement', { text, from: (await this.prisma.user.findUnique({ where: { id: actor.userId! }, select: { displayName: true } }))?.displayName ?? null }, actor.guildId ?? null);
    return { channels: t?.channelIds.length ?? 0 };
  }

  // ───────── Zuordnung Discord ↔ Roblox ↔ ER:LC ↔ Team ↔ Einheit ─────────
  async listMembers() {
    const [rows, servers] = await Promise.all([this.prisma.cadMember.findMany({ orderBy: [{ team: 'asc' }, { callsign: 'asc' }] }), this.prisma.erlcServer.findMany({ where: { active: true }, select: { snapshot: true } })]);
    const online = new Set(servers.flatMap((s) => ((s.snapshot as ErlcSnapshot | null)?.players ?? []).map((p) => p.name.toLowerCase())));
    return rows.map((m) => ({ ...m, inGame: !!(m.erlcName && online.has(m.erlcName.toLowerCase())) }));
  }

  async saveMember(actor: CadActor, id: string | null, d: MemberInput) {
    const cfg = await this.cfg.get();
    if (d.extra) for (const k of Object.keys(d.extra)) if (!cfg.memberFields.some((f) => f.key === k)) throw new AppError('VALIDATION_FAILED', `Unbekanntes Zusatzfeld „${k}“.`);
    if (d.unitId && !(await this.prisma.unit.findUnique({ where: { id: d.unitId }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
    if (!id && !d.userId && d.discordId) d.userId = (await this.prisma.discordLink.findUnique({ where: { discordId: d.discordId } }))?.userId ?? null;
    const data = { ...d, extra: (d.extra ?? undefined) as Prisma.InputJsonValue | undefined };
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const before = id ? await tx.cadMember.findUnique({ where: { id } }) : null;
        if (id && !before) throw new AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
        const r = id ? await tx.cadMember.update({ where: { id }, data }) : await tx.cadMember.create({ data });
        await this.audit.record(actor, { action: id ? 'cad.member.update' : 'cad.member.create', module: 'cad', entityType: 'CadMember', entityId: r.id, before, after: d }, tx);
        return r;
      });
      this.changed('member', row.id);
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Für diesen Discord-/Systembenutzer gibt es schon eine Zuordnung.');
      throw e;
    }
  }

  async deleteMember(actor: CadActor, id: string) {
    const m = await this.prisma.cadMember.findUnique({ where: { id } });
    if (!m) throw new AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cadMember.delete({ where: { id } });
      await this.audit.record(actor, { action: 'cad.member.delete', module: 'cad', entityType: 'CadMember', entityId: id, before: m }, tx);
    });
    this.changed('member', id);
  }

  // ───────── Karte: POIs & Zonen ─────────
  async listMapObjects(actor: CadActor) {
    const rows = await this.prisma.cadMapObject.findMany({ orderBy: [{ layer: 'asc' }, { name: 'asc' }] });
    if (await this.perms.has(actor.userId!, 'cad.manage_map')) return rows;
    const mine = new Set((await this.prisma.userRole.findMany({ where: { userId: actor.userId! }, select: { roleId: true } })).map((r) => r.roleId));
    return rows.filter((o) => !o.roleIds.length || o.roleIds.some((r) => mine.has(r)));
  }

  private checkGeometry(d: Partial<MapObjectInput>, kind: string) {
    if (kind === 'POI' && (d.x === undefined || d.x === null || d.z === undefined || d.z === null)) throw new AppError('VALIDATION_FAILED', 'Ein POI braucht eine Position.');
    if (kind === 'ZONE' && (!d.points || d.points.length < 3)) throw new AppError('VALIDATION_FAILED', 'Eine Zone braucht mindestens 3 Punkte.');
  }

  async saveMapObject(actor: CadActor, id: string | null, d: Partial<MapObjectInput>) {
    const cfg = await this.cfg.get();
    if (d.layer && !cfg.layers.some((l) => l.key === d.layer)) throw new AppError('VALIDATION_FAILED', `Unbekannter Layer „${d.layer}“.`);
    const before = id ? await this.prisma.cadMapObject.findUnique({ where: { id } }) : null;
    if (id && !before) throw new AppError('NOT_FOUND', 'Kartenobjekt nicht gefunden.');
    const kind = d.kind ?? before?.kind ?? 'POI';
    this.checkGeometry({ ...(before ? { x: before.x, z: before.z, points: before.points as [number, number][] } : {}), ...d }, kind);
    const data = { ...d, points: d.points === undefined ? undefined : d.points === null ? Prisma.DbNull : (d.points as unknown as Prisma.InputJsonValue) };
    const row = await this.prisma.$transaction(async (tx) => {
      const r = id ? await tx.cadMapObject.update({ where: { id }, data }) : await tx.cadMapObject.create({ data: { ...(data as Prisma.CadMapObjectUncheckedCreateInput), kind, createdById: actor.userId } });
      const what = kind === 'ZONE' ? 'zone' : 'poi';
      await this.audit.record(actor, { action: `cad.map.${what}.${id ? 'update' : 'create'}`, module: 'cad', entityType: 'CadMapObject', entityId: r.id, before, after: d }, tx);
      return r;
    });
    this.changed('map', row.id);
    return row;
  }

  async deleteMapObject(actor: CadActor, id: string) {
    const o = await this.prisma.cadMapObject.findUnique({ where: { id } });
    if (!o) throw new AppError('NOT_FOUND', 'Kartenobjekt nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cadMapObject.delete({ where: { id } });
      await this.audit.record(actor, { action: `cad.map.${o.kind === 'ZONE' ? 'zone' : 'poi'}.delete`, module: 'cad', entityType: 'CadMapObject', entityId: id, before: o }, tx);
    });
    this.changed('map', id);
  }

  // ───────── Server-Verbindungen ─────────
  listLinks() { return this.prisma.cadServerLink.findMany({ orderBy: { name: 'asc' } }); }

  async saveLink(actor: CadActor, id: string | null, d: Partial<LinkInput>) {
    const before = id ? await this.prisma.cadServerLink.findUnique({ where: { id } }) : null;
    if (id && !before) throw new AppError('NOT_FOUND', 'Server-Verbindung nicht gefunden.');
    const src = d.sourceGuildId ?? before?.sourceGuildId, dst = d.targetGuildId ?? before?.targetGuildId;
    if (src && src === dst) throw new AppError('VALIDATION_FAILED', 'Quelle und Ziel müssen verschiedene Server sein.');
    const data = { ...d, channels: d.channels === undefined ? undefined : (d.channels as Prisma.InputJsonValue) };
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const r = id ? await tx.cadServerLink.update({ where: { id }, data }) : await tx.cadServerLink.create({ data: data as Prisma.CadServerLinkCreateInput });
        await this.audit.record(actor, { action: id ? 'cad.link.update' : 'cad.link.create', module: 'cad', entityType: 'CadServerLink', entityId: r.id, before, after: d }, tx);
        return r;
      });
      this.changed('link', row.id);
      return row;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Diese Server-Verbindung gibt es schon (gleiche Richtung).');
      throw e;
    }
  }

  async deleteLink(actor: CadActor, id: string) {
    const l = await this.prisma.cadServerLink.findUnique({ where: { id } });
    if (!l) throw new AppError('NOT_FOUND', 'Server-Verbindung nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cadServerLink.delete({ where: { id } });
      await this.audit.record(actor, { action: 'cad.link.delete', module: 'cad', entityType: 'CadServerLink', entityId: id, before: l }, tx);
    });
    this.changed('link', id);
  }

  // ───────── Protokolle & Übersicht ─────────
  async logs(take = 200) {
    const rows = await this.prisma.auditLog.findMany({ where: { module: { in: ['cad', 'erlc'] } }, orderBy: { createdAt: 'desc' }, take: Math.min(take, 500) });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    const n = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ id: r.id, action: r.action, module: r.module, entityType: r.entityType, entityId: r.entityId, after: r.after, actor: r.actorUserId ? n.get(r.actorUserId) ?? null : null, createdAt: r.createdAt }));
  }

  /** Daten für die Leitstellen-Startseite in einem Abruf. ER:LC-Ausfall → letzter Stand + Hinweis, CAD läuft weiter. */
  async overview(actor: CadActor) {
    const [cfg, incidents, units, calls, radio, servers] = await Promise.all([
      this.cfg.get(), this.listIncidents({ active: true, take: 50 }), this.listUnits(), this.listCalls({ status: 'OPEN', take: 50 }), this.listRadio({ take: 15 }),
      this.prisma.erlcServer.findMany({ orderBy: { name: 'asc' } }),
    ]);
    const can = async (p: string) => this.perms.has(actor.userId!, p);
    const [persons, vehicles] = await Promise.all([
      (await can('cad.view_persons')) ? this.prisma.person.count() : Promise.resolve(null),
      (await can('cad.view_vehicles')) ? this.prisma.vehicle.count() : Promise.resolve(null),
    ]);
    const erlc = (await can('cad.view_erlc')) ? servers.map((s) => {
      const snap = s.snapshot as ErlcSnapshot | null;
      const staff = snap?.staff ? new Set([...snap.staff.admins, ...snap.staff.mods, ...snap.staff.helpers].map((x) => x.name.toLowerCase())) : null;
      return { id: s.id, name: s.name, logoUrl: s.logoUrl, status: s.active ? s.status : 'DISABLED', lastSyncAt: s.lastSyncAt, lastError: s.lastError, latencyMs: s.latencyMs,
        players: snap?.server.currentPlayers ?? null, maxPlayers: snap?.server.maxPlayers ?? null, queue: snap?.queue?.length ?? null,
        staffOnline: snap?.players ? snap.players.filter((p) => (p.permission && p.permission !== 'Normal') || staff?.has(p.name.toLowerCase())).length : null };
    }) : [];
    return { config: cfg, incidents, units, calls, radio, erlc, counts: { persons, vehicles } };
  }

  /** Kartendaten: Einsätze, Notrufe, Einheiten, Spieler/Staff/Fahrzeuge (live), eigene POIs/Zonen. */
  async mapData(actor: CadActor) {
    const [incidents, units, calls, objects, servers] = await Promise.all([
      this.listIncidents({ active: true, take: 200 }), this.listUnits(), this.listCalls({ status: 'OPEN', take: 200 }), this.listMapObjects(actor),
      this.prisma.erlcServer.findMany({ where: { active: true } }),
    ]);
    const erlcAllowed = await this.perms.has(actor.userId!, 'cad.view_erlc');
    const players: (ErlcPlayer & { serverId: string; staff: boolean })[] = [];
    const vehicles: { name: string; owner: string; plate: string | null; colorHex: string | null; x: number; z: number; serverId: string }[] = [];
    if (erlcAllowed) for (const s of servers) {
      const snap = s.snapshot as ErlcSnapshot | null;
      if (!snap?.players) continue;
      const staffNames = snap.staff ? new Set([...snap.staff.admins, ...snap.staff.mods, ...snap.staff.helpers].map((x) => x.name.toLowerCase())) : new Set<string>();
      for (const p of snap.players) players.push({ ...p, serverId: s.id, staff: (!!p.permission && p.permission !== 'Normal') || staffNames.has(p.name.toLowerCase()) });
      // Fahrzeuge haben keine eigene Position – sie stehen dort, wo ihr Besitzer gerade ist
      const byName = new Map(snap.players.map((p) => [p.name.toLowerCase(), p]));
      for (const v of snap.vehicles ?? []) { const o = byName.get(v.owner.toLowerCase()); if (o?.location) vehicles.push({ name: v.name, owner: v.owner, plate: v.plate, colorHex: v.colorHex, x: o.location.x, z: o.location.z, serverId: s.id }); }
    }
    return {
      incidents: incidents.filter((i) => i.mapX !== null && i.mapZ !== null),
      calls: calls.filter((c) => c.mapX !== null && c.mapZ !== null),
      units: units.filter((u) => u.position), objects, players, vehicles,
      stale: servers.some((s) => s.status !== 'CONNECTED'),
    };
  }
}

/** Punkt-in-Polygon (Strahlverfahren). */
function inside(x: number, z: number, pts: [number, number][]) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]!, [xj, zj] = pts[j]!;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}
