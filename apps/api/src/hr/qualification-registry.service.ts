import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { effectiveQualificationStatus, QUALIFICATION_SOURCE_LABEL, type QualificationDefInput, type QualificationSource } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { AppError } from '../common/errors';
import { HrCoreService } from './hr-core.service';

type Tx = Prisma.TransactionClient;

/**
 * Qualifikationsregister: Qualifikationen mit Person, Abschlussdatum, ausstellender Person, Status und Herkunft.
 * Vergabe nur durch berechtigte Personen (`qualification.grant`) oder durch eine bestätigte Leistung (bestandene Ausbildung,
 * bewertete Prüfung, abgeschlossene praktische Prüfung) – und auch dann standardmäßig erst nach Bestätigung (autoGrant aus).
 * `Personnel.qualifications` (Namen) wird mit den aktiven Qualifikationen mitgeführt, damit bestehende Anzeigen weiter stimmen.
 */
@Injectable()
export class QualificationRegistryService {
  constructor(private readonly core: HrCoreService, private readonly perms: PermissionService, private readonly notify: NotifyService) {}
  private get prisma() { return this.core.prisma; }

  // ───── Katalog ─────
  definitions(all = false) {
    return this.prisma.qualificationDefinition.findMany({ where: all ? {} : { active: true }, orderBy: { name: 'asc' }, include: { _count: { select: { records: { where: { status: 'ACTIVE' } } } } } });
  }
  async saveDefinition(actor: Actor, d: QualificationDefInput & { trainingIds?: string[]; examIds?: string[] }, id?: string) {
    const data = { name: d.name, description: d.description ?? null, color: d.color ?? null, operational: d.operational, validDays: d.validDays ?? null, autoGrant: d.autoGrant, active: d.active, trainingIds: d.trainingIds ?? [], examIds: d.examIds ?? [] };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const before = id ? await tx.qualificationDefinition.findUnique({ where: { id } }) : null;
        if (id && !before) throw new AppError('NOT_FOUND', 'Qualifikation nicht gefunden.');
        const row = id ? await tx.qualificationDefinition.update({ where: { id }, data }) : await tx.qualificationDefinition.create({ data });
        // Umbenennen: Namen in Register und Personalakten nachziehen
        if (before && before.name !== row.name) {
          await tx.personnelQualification.updateMany({ where: { definitionId: row.id }, data: { name: row.name } });
          for (const p of await tx.personnel.findMany({ where: { qualifications: { has: before.name } }, select: { id: true, qualifications: true } })) await tx.personnel.update({ where: { id: p.id }, data: { qualifications: p.qualifications.map((q) => (q === before.name ? row.name : q)) } });
        }
        await this.core.audit.record(actor, { action: id ? 'qualification.definition.update' : 'qualification.definition.create', module: 'qualification', entityType: 'QualificationDefinition', entityId: row.id, before, after: row }, tx);
        return row;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Eine Qualifikation mit diesem Namen gibt es schon.');
      throw e;
    }
  }

  // ───── Register ─────
  async list(q: { personnelId?: string; definitionId?: string; status?: string; operational?: boolean; q?: string; page?: number; pageSize?: number }) {
    const where: Prisma.PersonnelQualificationWhereInput = {
      ...(q.personnelId ? { personnelId: q.personnelId } : {}), ...(q.definitionId ? { definitionId: q.definitionId } : {}),
      ...(q.status === 'EXPIRED' ? { status: 'ACTIVE', expiresAt: { lt: new Date() } } : q.status === 'ACTIVE' ? { status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] } : q.status ? { status: q.status } : {}),
      ...(q.operational ? { OR: [{ definitionId: null }, { definition: { operational: true } }] } : {}),
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { personnel: { user: { displayName: { contains: q.q, mode: 'insensitive' } } } }] } : {}),
    };
    const pageSize = Math.min(q.pageSize ?? 50, 200); const page = Math.max(1, q.page ?? 1);
    const [total, rows] = await Promise.all([
      this.prisma.personnelQualification.count({ where }),
      this.prisma.personnelQualification.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, include: { personnel: { select: { id: true, rank: true, team: true, user: { select: { displayName: true } } } }, definition: { select: { color: true, operational: true } } } }),
    ]);
    const names = await this.userNames(rows.flatMap((r) => [r.issuedById, r.statusChangedById]));
    return { total, page, pageSize, rows: rows.map((r) => this.view(r, names)) };
  }

  private async userNames(ids: (string | null)[]) {
    const list = ids.filter((x): x is string => !!x);
    return new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(list)] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  }
  private view(r: Prisma.PersonnelQualificationGetPayload<{ include: { personnel: { select: { id: true; rank: true; team: true; user: { select: { displayName: true } } } }; definition: { select: { color: true; operational: true } } } }>, names: Map<string, string>) {
    return {
      id: r.id, personnelId: r.personnelId, personName: r.personnel.user.displayName, rank: r.personnel.rank, department: r.personnel.team,
      definitionId: r.definitionId, name: r.name, color: r.definition?.color ?? null, operational: r.definition?.operational ?? true,
      status: effectiveQualificationStatus(r), storedStatus: r.status, source: r.source, sourceLabel: QUALIFICATION_SOURCE_LABEL[r.source as QualificationSource] ?? r.source, sourceId: r.sourceId,
      issuedAt: r.issuedAt, issuedBy: r.issuedById ? names.get(r.issuedById) ?? '—' : null, expiresAt: r.expiresAt, note: r.note,
      statusReason: r.statusReason, statusChangedAt: r.statusChangedAt, statusChangedBy: r.statusChangedById ? names.get(r.statusChangedById) ?? '—' : null, createdAt: r.createdAt,
    };
  }

  /** Qualifikationen einer Person (Personalakte, MDT, Leitstelle). `operationalOnly`: nur einsatzrelevante, nur aktive. */
  async ofPersonnel(personnelId: string, operationalOnly = false) {
    const rows = await this.prisma.personnelQualification.findMany({ where: { personnelId, ...(operationalOnly ? { status: 'ACTIVE', OR: [{ definitionId: null }, { definition: { operational: true } }] } : {}) }, orderBy: { name: 'asc' }, include: { personnel: { select: { id: true, rank: true, team: true, user: { select: { displayName: true } } } }, definition: { select: { color: true, operational: true } } } });
    const names = await this.userNames(rows.flatMap((r) => [r.issuedById, r.statusChangedById]));
    const out = rows.map((r) => this.view(r, names));
    return operationalOnly ? out.filter((r) => r.status === 'ACTIVE') : out;
  }

  /** Personalakte zum Benutzer (für /mine). */
  async mine(userId: string) {
    const p = await this.prisma.personnel.findFirst({ where: { userId }, select: { id: true } });
    return p ? this.ofPersonnel(p.id) : [];
  }

  private async syncNames(tx: Tx, personnelId: string) {
    const active = await tx.personnelQualification.findMany({ where: { personnelId, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }, select: { name: true } });
    const p = await tx.personnel.findUniqueOrThrow({ where: { id: personnelId }, select: { qualifications: true } });
    // Namen, die nicht aus dem Register stammen (z. B. Academy-Kurse), bleiben erhalten; Register-Namen spiegeln den Status
    const registered = new Set((await tx.personnelQualification.findMany({ where: { personnelId }, select: { name: true } })).map((x) => x.name));
    const names = [...new Set([...p.qualifications.filter((q) => !registered.has(q)), ...active.map((a) => a.name)])];
    await tx.personnel.update({ where: { id: personnelId }, data: { qualifications: names } });
  }

  /** Manuelle Vergabe (qualification.grant). Niemand vergibt sich selbst eine Qualifikation. */
  async grant(actor: Actor, d: { personnelId: string; definitionId: string; issuedAt?: string; expiresAt?: string | null; note?: string }) {
    const [p, def] = await Promise.all([
      this.prisma.personnel.findUnique({ where: { id: d.personnelId }, select: { id: true, userId: true } }),
      this.prisma.qualificationDefinition.findUnique({ where: { id: d.definitionId } }),
    ]);
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    if (!def || !def.active) throw new AppError('VALIDATION_FAILED', 'Qualifikation nicht gefunden oder deaktiviert.');
    if (p.userId === actor.userId) throw new AppError('CONFLICT', 'Eigene Qualifikationen kannst du nicht selbst vergeben.');
    const issuedAt = d.issuedAt ? new Date(d.issuedAt) : new Date();
    const expiresAt = d.expiresAt !== undefined ? (d.expiresAt ? new Date(d.expiresAt) : null) : def.validDays ? new Date(issuedAt.getTime() + def.validDays * 86_400_000) : null;
    const row = await this.prisma.$transaction(async (tx) => {
      if (await tx.personnelQualification.findFirst({ where: { personnelId: p.id, definitionId: def.id, status: { in: ['ACTIVE', 'PENDING', 'SUSPENDED'] } } })) throw new AppError('CONFLICT', 'Diese Qualifikation ist bereits eingetragen.');
      const r = await tx.personnelQualification.create({ data: { personnelId: p.id, definitionId: def.id, name: def.name, status: 'ACTIVE', source: 'MANUAL', issuedAt, issuedById: actor.userId, expiresAt, note: d.note?.trim() || null } });
      await this.syncNames(tx, p.id);
      await tx.personnelRecord.create({ data: { personnelId: p.id, type: 'TRAINING', summary: `Qualifikation vergeben: ${def.name}`, data: { qualificationId: r.id, kind: 'QUALIFICATION' }, createdById: actor.userId! } });
      await this.core.audit.record(actor, { action: 'qualification.grant', module: 'qualification', entityType: 'Personnel', entityId: p.id, after: r }, tx);
      return r;
    });
    await this.announce(p.userId, `🎖️ Neue Qualifikation: ${def.name}`, p.id);
    return row;
  }

  /** Bestätigen (PENDING → ACTIVE), ruhen lassen, reaktivieren, entziehen – jeweils mit Grund, protokolliert. */
  async setStatus(actor: Actor, id: string, d: { status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED'; reason?: string }) {
    const q = await this.prisma.personnelQualification.findUnique({ where: { id }, include: { personnel: { select: { userId: true } } } });
    if (!q) throw new AppError('NOT_FOUND', 'Qualifikation nicht gefunden.');
    const need = d.status === 'ACTIVE' ? 'qualification.grant' : 'qualification.revoke';
    await this.perms.assert(actor.userId!, need);
    if (q.personnel.userId === actor.userId) throw new AppError('CONFLICT', 'Eigene Qualifikationen kannst du nicht ändern.');
    if (q.status === 'REVOKED') throw new AppError('CONFLICT', 'Entzogene Qualifikationen bleiben entzogen – bei Bedarf neu vergeben.');
    if (d.status !== 'ACTIVE' && !d.reason?.trim()) throw new AppError('VALIDATION_FAILED', 'Bitte einen Grund angeben.');
    const confirming = q.status === 'PENDING' && d.status === 'ACTIVE';
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.personnelQualification.update({ where: { id }, data: { status: d.status, statusReason: d.reason?.trim() || null, statusChangedAt: new Date(), statusChangedById: actor.userId, ...(confirming ? { issuedAt: q.issuedAt ?? new Date(), issuedById: actor.userId } : {}) } });
      await this.syncNames(tx, q.personnelId);
      await this.core.audit.record(actor, { action: confirming ? 'qualification.confirm' : `qualification.status.${d.status.toLowerCase()}`, module: 'qualification', entityType: 'Personnel', entityId: q.personnelId, before: { id, status: q.status }, after: { id, status: d.status }, reason: d.reason }, tx);
      return r;
    });
    const label = { ACTIVE: confirming ? 'bestätigt' : 'wieder aktiv', SUSPENDED: 'ruht', REVOKED: 'entzogen' }[d.status];
    await this.announce(q.personnel.userId, `🎖️ Qualifikation ${q.name}: ${label}`, q.personnelId);
    return row;
  }

  /**
   * Bestätigte Leistung (Ausbildung bestanden, Prüfung bestanden, praktische Prüfung bestanden) → Qualifikation.
   * Nur für Qualifikationen, die mit dieser Leistung verknüpft sind; ohne `autoGrant` als „Zur Bestätigung“ (PENDING).
   */
  async fromAchievement(source: Exclude<QualificationSource, 'MANUAL' | 'LEGACY'>, ref: { trainingId?: string | null; examId?: string | null; definitionId?: string | null }, personnelId: string, sourceId: string, examinerId: string | null) {
    const defs = await this.prisma.qualificationDefinition.findMany({ where: { active: true, OR: [
      ...(ref.definitionId ? [{ id: ref.definitionId }] : []), ...(ref.trainingId ? [{ trainingIds: { has: ref.trainingId } }] : []), ...(ref.examId ? [{ examIds: { has: ref.examId } }] : []),
    ] } });
    if (!defs.length) return [];
    const p = await this.prisma.personnel.findUnique({ where: { id: personnelId }, select: { userId: true } });
    if (!p) return [];
    const created: string[] = [];
    for (const def of defs) {
      const done = await this.prisma.$transaction(async (tx) => {
        if (await tx.personnelQualification.findFirst({ where: { personnelId, definitionId: def.id, status: { in: ['ACTIVE', 'PENDING', 'SUSPENDED'] } } })) return false;
        const now = new Date();
        const r = await tx.personnelQualification.create({ data: { personnelId, definitionId: def.id, name: def.name, status: def.autoGrant ? 'ACTIVE' : 'PENDING', source, sourceId, issuedAt: def.autoGrant ? now : null, issuedById: def.autoGrant ? examinerId : null, expiresAt: def.validDays ? new Date(now.getTime() + def.validDays * 86_400_000) : null } });
        if (def.autoGrant) await this.syncNames(tx, personnelId);
        await this.core.audit.record({ userId: examinerId }, { action: def.autoGrant ? 'qualification.achieved' : 'qualification.pending', module: 'qualification', entityType: 'Personnel', entityId: personnelId, after: r }, tx);
        return true;
      });
      if (!done) continue;
      created.push(def.name);
      if (def.autoGrant) await this.announce(p.userId, `🎖️ Neue Qualifikation: ${def.name}`, personnelId);
      else await this.notify.notifyPermission('qualification.grant', { type: 'PERSONNEL', title: `🎖️ Qualifikation zur Bestätigung: ${def.name}`, body: QUALIFICATION_SOURCE_LABEL[source], entityType: 'Personnel', entityId: personnelId }, { exceptUserId: p.userId });
    }
    return created;
  }

  /** Person: Dashboard-Benachrichtigung + DM (neutraler Text, keine vertraulichen Inhalte). */
  private async announce(userId: string, title: string, personnelId: string) {
    await this.notify.notify([userId], { type: 'PERSONNEL', title, entityType: 'Personnel', entityId: personnelId });
    await this.core.dm(userId, { embeds: [{ title: title.slice(0, 256), description: 'Details siehst du in deiner Personalakte im Dashboard.', color: 0x1e40af }] }).catch(() => false);
  }
}
