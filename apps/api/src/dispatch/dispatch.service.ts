import { Injectable } from '@nestjs/common';
import { DISPATCH_TRANSITIONS, DispatchStatus, UnitStatus, statusLabel } from '@enrp/shared';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { AppError } from '../common/errors';
import { linkPerson, linkVehicle } from '../common/links';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { LocksService } from '../locks/locks.service';

const OPEN = ['CLOSED', 'CANCELLED'];

@Injectable()
export class DispatchService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly rt: RealtimeService, private readonly discord: DiscordService, private readonly locks: LocksService) {}

  // ---- Units ----
  listUnits() { return this.prisma.unit.findMany({ include: { members: true }, orderBy: { callsign: 'asc' } }); }

  async createUnit(actor: Actor, d: { callsign: string; vehicle?: string; notes?: string; memberIds?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.create({ data: { callsign: d.callsign.toUpperCase(), vehicle: d.vehicle, notes: d.notes, members: { create: (d.memberIds ?? []).map((userId) => ({ userId })) } } });
      await this.audit.record(actor, { action: 'unit.create', module: 'dispatch', entityType: 'Unit', entityId: u.id, after: u }, tx);
      return u;
    });
  }

  async setUnitStatus(actor: Actor, id: string, status: UnitStatus) {
    const before = await this.prisma.unit.findUnique({ where: { id } });
    if (!before) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.unit.update({ where: { id }, data: { status } });
      await this.audit.record(actor, { action: 'unit.status', module: 'dispatch', entityType: 'Unit', entityId: id, before: { status: before.status }, after: { status } }, tx);
      return u;
    }).then((u) => { this.rt.publish('dispatch', 'unit.status', { unitId: id, status }); this.rt.publish('team', 'unit.status', { unitId: id, status }); return u; });
  }

  /** Besetzung einer Einheit (Supervisor/Leitstelle). Nur aktive Benutzer; ersetzt die bisherige Besetzung vollständig. */
  async setUnitMembers(actor: Actor, id: string, userIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.findUnique({ where: { id }, include: { members: true } });
      if (!unit) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
      const unique = [...new Set(userIds)];
      if ((await tx.user.count({ where: { id: { in: unique }, active: true } })) !== unique.length) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
      await tx.unitMember.deleteMany({ where: { unitId: id, userId: { notIn: unique } } });
      await tx.unitMember.createMany({ data: unique.map((userId) => ({ unitId: id, userId })), skipDuplicates: true });
      await this.audit.record(actor, { action: 'unit.members', module: 'dispatch', entityType: 'Unit', entityId: id, before: unit.members.map((m) => m.userId), after: unique }, tx);
      return tx.unit.findUniqueOrThrow({ where: { id }, include: { members: true } });
    }).then((u) => { this.rt.publish('team', 'unit.status', { unitId: id }); return u; });
  }

  // ---- Incidents ----
  async list(p: PageQuery, status?: string, activeOnly = false) {
    const where = {
      ...(status ? { status } : {}),
      ...(activeOnly ? { status: { notIn: OPEN } } : {}),
      ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { title: { contains: p.q, mode: 'insensitive' as const } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({ where, include: { units: { include: { unit: { select: { callsign: true } } } } }, orderBy: { createdAt: 'desc' }, ...skipTake(p) }),
      this.prisma.incident.count({ where }),
    ]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id }, include: { units: { include: { unit: true } } } });
    if (!incident) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    const [links, timeline] = await Promise.all([this.prisma.recordLink.findMany({ where: { entityType: 'Incident', entityId: id } }), this.timeline.list('Incident', id)]);
    return { incident, links, timeline };
  }

  async create(actor: Actor, d: { title: string; description?: string; priority?: string; location?: string; personIds?: string[]; vehicleIds?: string[] }) {
    return this.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.create({ data: { number: makeNumber('I'), title: d.title, description: d.description, priority: d.priority ?? 'MEDIUM', location: d.location, dispatcherId: actor.userId } });
      await this.attach(tx, inc.id, d.personIds, d.vehicleIds, actor);
      await this.timeline.add(tx, { entityType: 'Incident', entityId: inc.id, action: 'incident.created', summary: `Einsatz ${inc.number} angelegt`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'incident.create', module: 'incidents', entityType: 'Incident', entityId: inc.id, after: inc }, tx);
      return inc;
    }).then(async (inc) => { this.rt.publish('incidents', 'incident.created', { id: inc.id, number: inc.number }); this.rt.publish('dispatch', 'queue.changed', { id: inc.id }); await this.discord.enqueue('dispatch', 'incident.created', { number: inc.number, title: inc.title, priority: inc.priority, location: inc.location }); return inc; });
  }

  async attach(tx: Tx, incidentId: string, personIds: string[] = [], vehicleIds: string[] = [], actor: Actor) {
    for (const pid of new Set(personIds)) {
      if (!(await tx.person.findUnique({ where: { id: pid } }))) throw new AppError('NOT_FOUND', 'Person nicht gefunden.');
      await linkPerson(tx, pid, 'Incident', incidentId, 'PARTICIPANT');
      await this.timeline.add(tx, { entityType: 'Person', entityId: pid, action: 'incident.linked', summary: 'Mit Einsatz verknüpft', actorId: actor.userId });
    }
    for (const vid of new Set(vehicleIds)) {
      if (!(await tx.vehicle.findUnique({ where: { id: vid } }))) throw new AppError('NOT_FOUND', 'Fahrzeug nicht gefunden.');
      await linkVehicle(tx, vid, 'Incident', incidentId, 'INVOLVED');
    }
  }

  async attachRecords(actor: Actor, id: string, d: { personIds?: string[]; vehicleIds?: string[] }) {
    await this.get(id);
    return this.prisma.$transaction(async (tx) => {
      await this.attach(tx, id, d.personIds, d.vehicleIds, actor);
      await this.audit.record(actor, { action: 'incident.attach', module: 'incidents', entityType: 'Incident', entityId: id, after: d }, tx);
    });
  }

  async update(actor: Actor, id: string, version: number, d: { title?: string; description?: string; priority?: string; location?: string; supervisorId?: string | null }) {
    await this.locks.assertFree('incident', id, actor.userId);
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.incident.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
      if ((await tx.incident.updateMany({ where: { id, version }, data: { ...d, version: { increment: 1 } } })).count === 0) throw new AppError('CONFLICT', 'Der Datensatz wurde inzwischen von jemand anderem geändert. Bitte neu laden und erneut versuchen.');
      const after = await tx.incident.findUniqueOrThrow({ where: { id } });
      await this.timeline.add(tx, { entityType: 'Incident', entityId: id, action: 'incident.updated', summary: 'Einsatz geändert', actorId: actor.userId });
      await this.audit.record(actor, { action: 'incident.update', module: 'incidents', entityType: 'Incident', entityId: id, before, after }, tx);
      return after;
    });
  }

  async setStatus(actor: Actor, id: string, to: DispatchStatus, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.findUnique({ where: { id } });
      if (!inc) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
      nextStatus(DISPATCH_TRANSITIONS, inc.status, to);
      const closing = to === 'CLOSED' || to === 'CANCELLED';
      const after = await tx.incident.update({ where: { id }, data: { status: to, closedAt: closing ? new Date() : null, version: { increment: 1 } } });
      if (closing) {
        await tx.incidentUnit.updateMany({ where: { incidentId: id, clearedAt: null }, data: { clearedAt: new Date() } });
        const unitIds = (await tx.incidentUnit.findMany({ where: { incidentId: id } })).map((x) => x.unitId);
        await tx.unit.updateMany({ where: { id: { in: unitIds }, status: { not: 'OFF_DUTY' } }, data: { status: 'AVAILABLE' } });
      }
      await this.timeline.add(tx, { entityType: 'Incident', entityId: id, action: 'incident.status', summary: `Status ${statusLabel(inc.status)} → ${statusLabel(to)}${note ? `: ${note}` : ''}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'incident.status', module: 'dispatch', entityType: 'Incident', entityId: id, before: { status: inc.status }, after: { status: to }, reason: note }, tx);
      return after;
    }).then((after) => { this.rt.publish('incidents', 'incident.status', { id, status: to }); this.rt.publish('dispatch', 'queue.changed', { id }); return after; });
  }

  async assignUnit(actor: Actor, id: string, unitId: string) {
    return this.prisma.$transaction(async (tx) => {
      const inc = await tx.incident.findUnique({ where: { id } });
      if (!inc) throw new AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
      if (OPEN.includes(inc.status)) throw new AppError('INVALID_TRANSITION', 'Der Einsatz ist abgeschlossen.');
      const unit = await tx.unit.findUnique({ where: { id: unitId }, include: { members: true } });
      if (!unit) throw new AppError('NOT_FOUND', 'Einheit nicht gefunden.');
      if (unit.status === 'OFF_DUTY' || unit.status === 'UNAVAILABLE') throw new AppError('CONFLICT', 'Die Einheit ist nicht verfügbar.');
      await tx.incidentUnit.upsert({ where: { incidentId_unitId: { incidentId: id, unitId } }, create: { incidentId: id, unitId }, update: { clearedAt: null } });
      await tx.unit.update({ where: { id: unitId }, data: { status: 'BUSY' } });
      if (['NEW', 'ACKNOWLEDGED'].includes(inc.status)) await tx.incident.update({ where: { id }, data: { status: 'ASSIGNED', version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'Incident', entityId: id, action: 'incident.unit_assigned', summary: `Einheit ${unit.callsign} zugewiesen`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'incident.assign', module: 'dispatch', entityType: 'Incident', entityId: id, after: { unitId, callsign: unit.callsign } }, tx);
      if (unit.members.length) await tx.notification.createMany({ data: unit.members.map((m) => ({ userId: m.userId, type: 'INCIDENT_ASSIGNMENT', title: `Dir zugewiesen: Einsatz ${inc.number}`, entityType: 'Incident', entityId: id })) });
      return tx.incident.findUniqueOrThrow({ where: { id }, include: { units: true } });
    }).then(async (r) => {
      this.rt.publish('dispatch', 'unit.assigned', { incidentId: id, unitId });
      const [inc, unit] = await Promise.all([this.prisma.incident.findUnique({ where: { id } }), this.prisma.unit.findUnique({ where: { id: unitId } })]);
      if (inc && unit) await this.discord.enqueue('dispatch', 'incident.assigned', { number: inc.number, title: inc.title, priority: inc.priority, callsign: unit.callsign, location: inc.location });
      return r;
    });
  }
}
