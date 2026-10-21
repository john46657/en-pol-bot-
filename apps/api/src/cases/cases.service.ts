import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CASE_LINK_LABEL, CASE_LINK_VIEW_PERMISSION, CASE_STATUS_LABEL, titleSimilarity, type CaseLinkType, type CaseStatus } from '@enrp/shared';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { unscoped } from '../common/guild-context';

interface Resolved { label: string; status: string | null; occurredAt: Date | null; gone?: boolean }
type Can = (p: string) => Promise<boolean>;
const shortDate = (d: Date) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });

/**
 * Intelligente Vorgangsverknüpfung: Vorgänge mit eindeutiger Vorgangsnummer bündeln Datensätze aus den bestehenden Modulen.
 * Verknüpft wird ausschließlich ausdrücklich durch berechtigte Personen; Duplikate werden nur VORGESCHLAGEN (gleicher verknüpfter
 * Datensatz oder sehr ähnlicher Titel in kurzem Abstand) und nur nach manueller Prüfung zusammengeführt. Verknüpfungen werden
 * nie gelöscht, sondern mit Begründung gelöst.
 */
@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly timeline: TimelineService, private readonly perms: PermissionService) {}

  private can(userId: string): Can {
    const cache = new Map<string, Promise<boolean>>();
    return (p) => { if (!cache.has(p)) cache.set(p, this.perms.has(userId, p)); return cache.get(p)!; };
  }

  /** Fortlaufende Vorgangsnummer V-<Jahr>-00001 (global eindeutig, gezählt über alle Bereiche – nur die Nummer). */
  private async nextNumber(tx: Tx) {
    const head = `V-${new Date().getUTCFullYear()}-`;
    const last = await unscoped(() => tx.caseFile.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: 'desc' }, select: { number: true } }));
    return `${head}${String((last ? Number(last.number.slice(head.length)) || 0 : 0) + 1).padStart(5, '0')}`;
  }

  // ───────── Datensätze auflösen ─────────
  /** Vertrauliche CAD-Einsätze nur für Berechtigte (wie im CAD). */
  private async incidentVisible(userId: string, i: { restrictRoleIds: string[]; dispatcherId: string | null }, can: Can) {
    if (!i.restrictRoleIds.length || i.dispatcherId === userId || (await can('cad.manage_settings'))) return true;
    const roles = (await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } })).map((r) => r.roleId);
    return roles.some((r) => i.restrictRoleIds.includes(r));
  }

  /** Bezeichnung, Status und Zeitpunkt je Datensatz – nur, was die Person sehen darf (sonst `null` = nicht sichtbar/nicht vorhanden). */
  private async resolve(userId: string, type: CaseLinkType, ids: string[], can: Can): Promise<Map<string, Resolved | null>> {
    const out = new Map<string, Resolved | null>(ids.map((id) => [id, null]));
    const uuids = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
    if (!uuids.length || !(await can(CASE_LINK_VIEW_PERMISSION[type]))) return out;
    const set = (id: string, r: Resolved) => out.set(id, r);
    switch (type) {
      case 'INCIDENT': {
        const rows = await this.prisma.incident.findMany({ where: { id: { in: uuids } } });
        for (const i of rows) if (await this.incidentVisible(userId, i, can)) set(i.id, { label: `${i.number} · ${i.title}`, status: i.status, occurredAt: i.createdAt });
        // nach einem Tag gelöschte Einsätze leben in der Statistik weiter
        const missing = uuids.filter((id) => !rows.some((r) => r.id === id));
        if (missing.length) for (const st of await this.prisma.cadIncidentStat.findMany({ where: { incidentId: { in: missing } } })) set(st.incidentId, { label: `${st.number} (Einsatz gelöscht, Kennzahlen erhalten)`, status: st.status, occurredAt: st.createdAt, gone: true });
        break;
      }
      case 'CALL':
        for (const c of await this.prisma.erlcEmergencyCall.findMany({ where: { id: { in: uuids } }, include: { server: { select: { name: true } } } })) set(c.id, { label: `Notruf #${c.callNumber}${c.description ? ` · ${c.description.slice(0, 80)}` : ''} (${c.server.name})`, status: c.status, occurredAt: c.startedAt });
        break;
      case 'REPORT': {
        const seeAll = (await can('reports.review')) || (await can('reports.approve'));
        for (const r of await this.prisma.report.findMany({ where: { id: { in: uuids } } })) if (seeAll || r.authorId === userId || ['APPROVED', 'ARCHIVED'].includes(r.status)) set(r.id, { label: `${r.number} · ${r.title}`, status: r.status, occurredAt: r.createdAt });
        break;
      }
      case 'WANTED':
        for (const w of await this.prisma.wantedRecord.findMany({ where: { id: { in: uuids } } })) set(w.id, { label: `${w.number ?? 'Fahndung'} · ${w.reason}`, status: w.status, occurredAt: w.createdAt });
        break;
      case 'PERSON':
        for (const p of await this.prisma.person.findMany({ where: { id: { in: uuids } } })) set(p.id, { label: `${p.robloxUsername}${p.fullName ? ` (${p.fullName})` : ''}${p.robloxUserId ? ` · Roblox-ID ${p.robloxUserId}` : ''}`, status: p.status, occurredAt: null });
        break;
      case 'VEHICLE':
        for (const v of await this.prisma.vehicle.findMany({ where: { id: { in: uuids } } })) set(v.id, { label: `${v.plate}${v.model ? ` · ${v.model}` : ''}`, status: v.status, occurredAt: null });
        break;
      case 'TICKET':
        for (const t of await this.prisma.ticket.findMany({ where: { id: { in: uuids } } })) set(t.id, { label: `${t.number} · ${t.reason}`, status: t.status, occurredAt: t.issuedAt });
        break;
      case 'COMPLAINT':
        for (const c of await this.prisma.complaint.findMany({ where: { id: { in: uuids } } })) set(c.id, { label: `${c.number} · ${c.category}`, status: c.status, occurredAt: c.createdAt });
        break;
      case 'UNIT':
        for (const u of await this.prisma.unit.findMany({ where: { id: { in: uuids } } })) set(u.id, { label: `${u.callsign}${u.name ? ` · ${u.name}` : ''}`, status: u.status, occurredAt: null });
        break;
      case 'OFFICER':
        for (const p of await this.prisma.personnel.findMany({ where: { id: { in: uuids } }, include: { user: { select: { displayName: true } } } })) set(p.id, { label: `${p.user.displayName}${p.rank ? ` · ${p.rank}` : ''}${p.callsign ? ` · ${p.callsign}` : ''}`, status: p.employmentStatus, occurredAt: null });
        break;
      case 'HR_REQUEST':
        for (const r of await this.prisma.hrRequest.findMany({ where: { id: { in: uuids } } })) set(r.id, { label: `${r.number} · ${r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} → ${r.toValue}`, status: r.status, occurredAt: r.createdAt });
        break;
      case 'PERSONNEL_RECORD':
        for (const r of await this.prisma.personnelRecord.findMany({ where: { id: { in: uuids }, deletedAt: null } })) set(r.id, { label: `${r.type} · ${r.summary}`, status: r.status, occurredAt: r.createdAt });
        break;
    }
    return out;
  }

  // ───────── Lesen ─────────
  async list(actor: Actor, q: { q?: string; status?: string; from?: string; to?: string; incidentNumber?: string; entityType?: CaseLinkType; entityId?: string; page?: number; pageSize?: number }) {
    const and: Prisma.CaseFileWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.from) and.push({ createdAt: { gte: new Date(q.from) } });
    if (q.to) and.push({ createdAt: { lt: new Date(new Date(q.to).getTime() + 86_400_000) } });
    if (q.q) and.push({ OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { title: { contains: q.q, mode: 'insensitive' } }, { links: { some: { removedAt: null, label: { contains: q.q, mode: 'insensitive' } } } }] });
    if (q.incidentNumber) {
      const inc = await this.prisma.incident.findFirst({ where: { number: { equals: q.incidentNumber.trim(), mode: 'insensitive' } }, select: { id: true } })
        ?? await this.prisma.cadIncidentStat.findFirst({ where: { number: { equals: q.incidentNumber.trim(), mode: 'insensitive' } }, select: { incidentId: true } }).then((s) => (s ? { id: s.incidentId } : null));
      and.push(inc ? { links: { some: { removedAt: null, entityType: 'INCIDENT', entityId: inc.id } } } : { links: { some: { removedAt: null, entityType: 'INCIDENT', label: { startsWith: q.incidentNumber.trim(), mode: 'insensitive' } } } });
    }
    if (q.entityType && q.entityId) and.push({ links: { some: { removedAt: null, entityType: q.entityType, entityId: q.entityId } } });
    const where: Prisma.CaseFileWhereInput = and.length ? { AND: and } : {};
    const pageSize = Math.min(q.pageSize ?? 50, 200), page = Math.max(1, q.page ?? 1);
    const [items, total] = await Promise.all([
      this.prisma.caseFile.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { links: { where: { removedAt: null } } } } } }),
      this.prisma.caseFile.count({ where }),
    ]);
    return { items: items.map((c) => ({ id: c.id, number: c.number, title: c.title, status: c.status, statusLabel: CASE_STATUS_LABEL[c.status as CaseStatus] ?? c.status, createdAt: c.createdAt, updatedAt: c.updatedAt, links: c._count.links, mergedIntoId: c.mergedIntoId })), total, page, pageSize };
  }

  private async load(id: string) {
    const c = await this.prisma.caseFile.findUnique({ where: { id }, include: { links: { orderBy: { addedAt: 'asc' } } } });
    if (!c) throw new AppError('NOT_FOUND', 'Vorgang nicht gefunden.');
    return c;
  }

  /** Vorgang mit allen Verknüpfungen (aktuell und gelöst) und chronologischer Ereignisübersicht. */
  async get(actor: Actor, id: string) {
    const userId = actor.userId!;
    const c = await this.load(id);
    const can = this.can(userId);
    const byType = new Map<CaseLinkType, string[]>();
    for (const l of c.links) byType.set(l.entityType as CaseLinkType, [...(byType.get(l.entityType as CaseLinkType) ?? []), l.entityId]);
    const resolved = new Map<string, Resolved | null>();
    for (const [type, ids] of byType) for (const [eid, r] of await this.resolve(userId, type, ids, can)) resolved.set(`${type}:${eid}`, r);
    const userIds = [...new Set([c.createdById, ...c.links.flatMap((l) => [l.addedById, l.removedById])].filter((x): x is string => !!x))];
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const links = c.links.map((l) => {
      const r = resolved.get(`${l.entityType}:${l.entityId}`) ?? null;
      return {
        id: l.id, entityType: l.entityType, typeLabel: CASE_LINK_LABEL[l.entityType as CaseLinkType] ?? l.entityType, entityId: r ? l.entityId : null, role: l.role, note: l.note,
        // ohne Recht: nur, DASS es eine Verknüpfung gibt
        label: r ? r.label : 'Verknüpfter Datensatz (keine Berechtigung oder nicht mehr vorhanden)', visible: !!r, gone: r?.gone ?? false, status: r?.status ?? null,
        occurredAt: r?.occurredAt ?? l.occurredAt, addedAt: l.addedAt, addedBy: names.get(l.addedById) ?? '—', removedAt: l.removedAt, removedBy: l.removedById ? names.get(l.removedById) ?? '—' : null, removeReason: l.removeReason,
      };
    });
    const events: { at: Date; kind: string; text: string; actor: string | null; source: string }[] = [
      { at: c.createdAt, kind: 'CASE', text: `Vorgang ${c.number} angelegt`, actor: names.get(c.createdById) ?? '—', source: 'Vorgang' },
    ];
    for (const l of links) {
      events.push({ at: l.addedAt, kind: 'LINK', text: `${l.typeLabel} verknüpft: ${l.label}${l.role ? ` (${l.role})` : ''}`, actor: l.addedBy, source: 'Vorgang' });
      if (l.removedAt) events.push({ at: l.removedAt, kind: 'UNLINK', text: `${l.typeLabel} gelöst: ${l.label}${l.removeReason ? ` – ${l.removeReason}` : ''}`, actor: l.removedBy, source: 'Vorgang' });
      if (l.visible && l.occurredAt && !l.removedAt) events.push({ at: l.occurredAt, kind: 'RECORD', text: `${l.typeLabel}: ${l.label}`, actor: null, source: l.typeLabel });
    }
    // Verlauf der verknüpften Einsätze, Berichte und Fahndungen (nur sichtbare, aktive Verknüpfungen)
    const active = (t: string) => links.filter((l) => l.entityType === t && l.visible && !l.removedAt && l.entityId).map((l) => l.entityId!);
    const incIds = active('INCIDENT');
    if (incIds.length) {
      const logs = await this.prisma.cadIncidentLog.findMany({ where: { incidentId: { in: incIds }, kind: { in: ['STATUS', 'ASSIGN', 'CALL', 'CREATED'] } }, orderBy: { createdAt: 'asc' }, take: 300 });
      const nums = new Map((await this.prisma.incident.findMany({ where: { id: { in: incIds } }, select: { id: true, number: true } })).map((i) => [i.id, i.number]));
      for (const g of logs) events.push({ at: g.createdAt, kind: 'INCIDENT_LOG', text: `${nums.get(g.incidentId) ?? 'Einsatz'}: ${g.text}`, actor: null, source: 'CAD' });
    }
    for (const [type, entity, label] of [['REPORT', 'Report', 'Bericht'], ['WANTED', 'Wanted', 'Fahndung']] as const) {
      const ids = active(type);
      if (!ids.length) continue;
      for (const t of await this.prisma.timelineEvent.findMany({ where: { entityType: entity, entityId: { in: ids } }, orderBy: { createdAt: 'asc' }, take: 300 })) events.push({ at: t.createdAt, kind: `${type}_LOG`, text: t.summary, actor: null, source: label });
    }
    for (const t of await this.timeline.list('CaseFile', id, 200)) if (!['case.link', 'case.unlink', 'case.created'].includes(t.action)) events.push({ at: t.createdAt, kind: 'CASE', text: t.summary, actor: t.actorName, source: 'Vorgang' });
    events.sort((a, b) => a.at.getTime() - b.at.getTime());
    return {
      id: c.id, number: c.number, title: c.title, description: c.description, status: c.status, statusLabel: CASE_STATUS_LABEL[c.status as CaseStatus] ?? c.status, version: c.version,
      createdAt: c.createdAt, updatedAt: c.updatedAt, closedAt: c.closedAt, createdBy: names.get(c.createdById) ?? '—', mergedIntoId: c.mergedIntoId,
      links: links.filter((l) => !l.removedAt), removedLinks: links.filter((l) => l.removedAt), events,
    };
  }

  // ───────── Schreiben ─────────
  async create(actor: Actor, d: { title: string; description?: string | null; links?: { entityType: CaseLinkType; entityId: string; role?: string | null; note?: string | null }[] }) {
    const can = this.can(actor.userId!);
    const prepared: { entityType: CaseLinkType; entityId: string; role?: string | null; note?: string | null; label: string; occurredAt: Date | null }[] = [];
    for (const l of d.links ?? []) prepared.push({ ...l, ...(await this.assertLinkable(actor.userId!, l.entityType, l.entityId, can)) });
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const c = await tx.caseFile.create({ data: { number: await this.nextNumber(tx), title: d.title, description: d.description ?? null, createdById: actor.userId! } });
          for (const l of prepared) await tx.caseLink.create({ data: { caseId: c.id, entityType: l.entityType, entityId: l.entityId, role: l.role ?? null, note: l.note ?? null, label: l.label, occurredAt: l.occurredAt, addedById: actor.userId! } });
          await this.timeline.add(tx, { entityType: 'CaseFile', entityId: c.id, action: 'case.created', summary: `Vorgang ${c.number} angelegt`, actorId: actor.userId });
          await this.audit.record(actor, { action: 'case.create', module: 'reports', entityType: 'CaseFile', entityId: c.id, after: { number: c.number, title: c.title, links: prepared.map((l) => `${l.entityType}:${l.entityId}`) } }, tx);
          return c;
        });
      } catch (e) {
        // gleichzeitig vergebene Nummer → neu zählen
        if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
        throw e;
      }
    }
  }

  async update(actor: Actor, id: string, d: { version: number; title?: string; description?: string | null; status?: CaseStatus; reason?: string }) {
    const c = await this.load(id);
    if (c.mergedIntoId) throw new AppError('CONFLICT', 'Dieser Vorgang wurde in einen anderen Vorgang übernommen und ist schreibgeschützt.');
    const data: Prisma.CaseFileUpdateManyMutationInput = {
      ...(d.title !== undefined ? { title: d.title } : {}), ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.status !== undefined ? { status: d.status, closedAt: d.status === 'CLOSED' ? new Date() : null } : {}), version: { increment: 1 },
    };
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.caseFile.updateMany({ where: { id, version: d.version }, data });
      if (!upd.count) throw new AppError('CONFLICT', 'Der Vorgang wurde inzwischen geändert. Bitte neu laden und erneut versuchen.');
      const changes = [d.title !== undefined && d.title !== c.title ? 'Titel' : null, d.description !== undefined && d.description !== c.description ? 'Beschreibung' : null, d.status && d.status !== c.status ? `Status → ${CASE_STATUS_LABEL[d.status]}` : null].filter(Boolean);
      if (changes.length) await this.timeline.add(tx, { entityType: 'CaseFile', entityId: id, action: 'case.updated', summary: `Geändert: ${changes.join(', ')}${d.reason ? ` – ${d.reason}` : ''}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'case.update', module: 'reports', entityType: 'CaseFile', entityId: id, before: { title: c.title, description: c.description, status: c.status }, after: d, reason: d.reason }, tx);
      return tx.caseFile.findUniqueOrThrow({ where: { id } });
    });
  }

  /** Darf diese Person diesen Datensatz verknüpfen? Er muss existieren und für sie sichtbar sein. */
  private async assertLinkable(userId: string, type: CaseLinkType, entityId: string, can: Can) {
    const r = (await this.resolve(userId, type, [entityId], can)).get(entityId);
    if (!r || r.gone) throw new AppError('NOT_FOUND', `${CASE_LINK_LABEL[type]} nicht gefunden (oder keine Berechtigung).`);
    return { label: r.label.slice(0, 300), occurredAt: r.occurredAt };
  }

  async addLink(actor: Actor, id: string, d: { entityType: CaseLinkType; entityId: string; role?: string | null; note?: string | null }) {
    const c = await this.load(id);
    if (c.mergedIntoId) throw new AppError('CONFLICT', 'Dieser Vorgang wurde in einen anderen Vorgang übernommen und ist schreibgeschützt.');
    const r = await this.assertLinkable(actor.userId!, d.entityType, d.entityId, this.can(actor.userId!));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const link = await tx.caseLink.create({ data: { caseId: id, entityType: d.entityType, entityId: d.entityId, role: d.role ?? null, note: d.note ?? null, label: r.label, occurredAt: r.occurredAt, addedById: actor.userId! } });
        await tx.caseFile.update({ where: { id }, data: { version: { increment: 1 } } });
        await this.timeline.add(tx, { entityType: 'CaseFile', entityId: id, action: 'case.link', summary: `${CASE_LINK_LABEL[d.entityType]} verknüpft: ${r.label}`, actorId: actor.userId });
        await this.audit.record(actor, { action: 'case.link', module: 'reports', entityType: 'CaseFile', entityId: id, after: { entityType: d.entityType, entityId: d.entityId, role: d.role ?? null, label: r.label } }, tx);
        return link;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Dieser Datensatz ist mit dem Vorgang bereits verknüpft.');
      throw e;
    }
  }

  /** Verknüpfung lösen (mit Begründung) – sie bleibt als gelöste Verknüpfung im Vorgang sichtbar. */
  async removeLink(actor: Actor, id: string, linkId: string, reason: string) {
    const l = await this.prisma.caseLink.findUnique({ where: { id: linkId } });
    if (!l || l.caseId !== id || l.removedAt) throw new AppError('NOT_FOUND', 'Verknüpfung nicht gefunden.');
    await this.load(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.caseLink.update({ where: { id: linkId }, data: { removedAt: new Date(), removedById: actor.userId, removeReason: reason } });
      await tx.caseFile.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.timeline.add(tx, { entityType: 'CaseFile', entityId: id, action: 'case.unlink', summary: `${CASE_LINK_LABEL[l.entityType as CaseLinkType] ?? l.entityType} gelöst: ${l.label} – ${reason}`, actorId: actor.userId });
      await this.audit.record(actor, { action: 'case.unlink', module: 'reports', entityType: 'CaseFile', entityId: id, before: { entityType: l.entityType, entityId: l.entityId, label: l.label }, reason }, tx);
    });
  }

  // ───────── Duplikate ─────────
  /**
   * Mögliche Duplikate unter den offenen Vorgängen. Stark: beide verknüpfen denselben Datensatz (Einsatz, Notruf, Bericht, Fahndung).
   * Schwach (nur Hinweis): sehr ähnlicher Titel und innerhalb von 48 Stunden angelegt. Personen allein reichen nie (ähnliche Namen sind
   * kein Beleg). Bereits geprüfte Paare erscheinen nicht erneut.
   */
  async duplicates() {
    const open = await this.prisma.caseFile.findMany({ where: { status: { not: 'CLOSED' }, mergedIntoId: null }, include: { links: { where: { removedAt: null } } }, take: 500, orderBy: { createdAt: 'desc' } });
    const decided = new Set((await this.prisma.caseDuplicateDecision.findMany({ select: { caseAId: true, caseBId: true } })).map((d) => `${d.caseAId}:${d.caseBId}`));
    const out: { a: { id: string; number: string; title: string }; b: { id: string; number: string; title: string }; strength: 'STRONG' | 'WEAK'; reasons: string[] }[] = [];
    const strongTypes = new Set(['INCIDENT', 'CALL', 'REPORT', 'WANTED']);
    for (let i = 0; i < open.length; i++) for (let j = i + 1; j < open.length; j++) {
      const [a, b] = open[i]!.id < open[j]!.id ? [open[i]!, open[j]!] : [open[j]!, open[i]!];
      if (decided.has(`${a.id}:${b.id}`)) continue;
      const shared = a.links.filter((x) => strongTypes.has(x.entityType) && b.links.some((y) => y.entityType === x.entityType && y.entityId === x.entityId));
      const reasons = shared.map((x) => `Beide verknüpfen ${CASE_LINK_LABEL[x.entityType as CaseLinkType]} ${x.label}`);
      let strength: 'STRONG' | 'WEAK' | null = shared.length ? 'STRONG' : null;
      const sim = titleSimilarity(a.title, b.title);
      if (sim >= 0.5 && Math.abs(a.createdAt.getTime() - b.createdAt.getTime()) <= 48 * 3_600_000) { reasons.push(`Ähnlicher Titel (${Math.round(sim * 100)} %) und kurz nacheinander angelegt – bitte prüfen`); strength ??= 'WEAK'; }
      if (strength) out.push({ a: { id: a.id, number: a.number, title: a.title }, b: { id: b.id, number: b.number, title: b.title }, strength, reasons });
    }
    return out.sort((x, y) => (x.strength === y.strength ? 0 : x.strength === 'STRONG' ? -1 : 1)).slice(0, 100);
  }

  /**
   * Entscheidung über einen Vorschlag: „kein Duplikat“ (wird nicht mehr vorgeschlagen) oder „zusammenführen“: aktive Verknüpfungen
   * des zweiten Vorgangs werden in den ersten übernommen (vorhandene übersprungen), der zweite wird abgeschlossen und verweist auf den ersten.
   * Nichts wird gelöscht.
   */
  async decideDuplicate(actor: Actor, d: { keepId: string; otherId: string; decision: 'NOT_DUPLICATE' | 'MERGE'; note?: string }) {
    if (d.keepId === d.otherId) throw new AppError('VALIDATION_FAILED', 'Zwei verschiedene Vorgänge wählen.');
    const [keep, other] = await Promise.all([this.load(d.keepId), this.load(d.otherId)]);
    if (keep.mergedIntoId || other.mergedIntoId) throw new AppError('CONFLICT', 'Einer der Vorgänge wurde schon übernommen.');
    const [caseAId, caseBId] = keep.id < other.id ? [keep.id, other.id] : [other.id, keep.id];
    return this.prisma.$transaction(async (tx) => {
      await tx.caseDuplicateDecision.create({ data: { caseAId, caseBId, decision: d.decision === 'MERGE' ? 'MERGED' : 'NOT_DUPLICATE', note: d.note ?? null, decidedById: actor.userId! } }).catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Über dieses Paar wurde schon entschieden.');
        throw e;
      });
      let moved = 0;
      if (d.decision === 'MERGE') {
        for (const l of other.links.filter((x) => !x.removedAt)) {
          if (keep.links.some((k) => !k.removedAt && k.entityType === l.entityType && k.entityId === l.entityId)) continue;
          await tx.caseLink.create({ data: { caseId: keep.id, entityType: l.entityType, entityId: l.entityId, role: l.role, note: l.note, label: l.label, occurredAt: l.occurredAt, addedById: actor.userId! } });
          moved++;
        }
        await tx.caseFile.update({ where: { id: other.id }, data: { status: 'CLOSED', closedAt: new Date(), mergedIntoId: keep.id, version: { increment: 1 } } });
        await tx.caseFile.update({ where: { id: keep.id }, data: { version: { increment: 1 } } });
        await this.timeline.add(tx, { entityType: 'CaseFile', entityId: keep.id, action: 'case.merge', summary: `Vorgang ${other.number} übernommen (${moved} Verknüpfungen)${d.note ? ` – ${d.note}` : ''}`, actorId: actor.userId });
        await this.timeline.add(tx, { entityType: 'CaseFile', entityId: other.id, action: 'case.merged', summary: `In Vorgang ${keep.number} übernommen${d.note ? ` – ${d.note}` : ''}`, actorId: actor.userId });
      }
      await this.audit.record(actor, { action: d.decision === 'MERGE' ? 'case.merge' : 'case.not_duplicate', module: 'reports', entityType: 'CaseFile', entityId: keep.id, after: { other: other.number, moved, note: d.note ?? null } }, tx);
      return { decision: d.decision, moved };
    });
  }

  /** Vorgänge zu einem Datensatz (z. B. Einsatz-Detail, Karte). */
  async forEntity(entityType: CaseLinkType, entityId: string) {
    const links = await this.prisma.caseLink.findMany({ where: { entityType, entityId, removedAt: null }, include: { case: { select: { id: true, number: true, title: true, status: true, createdAt: true } } } });
    return links.map((l) => ({ ...l.case, statusLabel: CASE_STATUS_LABEL[l.case.status as CaseStatus] ?? l.case.status, linkedAt: l.addedAt, linkedAtLabel: shortDate(l.addedAt) }));
  }
}
