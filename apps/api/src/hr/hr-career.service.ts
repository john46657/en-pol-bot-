import { Injectable } from '@nestjs/common';
import { can } from '@enrp/shared';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { HrCoreService } from './hr-core.service';

export type CareerKind = 'JOINED' | 'PROMOTION' | 'TRANSFER' | 'TRAINING' | 'EXAM' | 'AWARD' | 'WARNING' | 'DISCIPLINE' | 'RECOMMENDATION' | 'NOTE' | 'SERVICE_NUMBER' | 'STATUS' | 'DECISION' | 'DUTY' | 'ACTIVITY' | 'ABSENCE';
export interface CareerEntry { at: Date; kind: CareerKind; title: string; description: string | null; actor: string | null; source: string; sensitive?: boolean }

const MONTH = (d: Date) => d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', month: 'long', year: 'numeric' });
const monthKey = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 7);
const hm = (min: number) => `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`;
const DECISION: Record<string, string> = { APPROVE: 'genehmigt', REJECT: 'abgelehnt', REVIEW: 'geprüft', DEFER: 'zurückgestellt', CANCEL: 'zurückgezogen' };
const RECORD_KIND: Record<string, CareerKind> = { PROMOTION: 'PROMOTION', TRANSFER: 'TRANSFER', TRAINING: 'TRAINING', EXAM: 'EXAM', AWARD: 'AWARD', WARNING: 'WARNING', DISCIPLINE: 'DISCIPLINE', RECOMMENDATION: 'RECOMMENDATION', NOTE: 'NOTE', SERVICE_NUMBER: 'SERVICE_NUMBER', STATUS: 'STATUS' };

/**
 * Digitale Beamtenlaufbahn: chronologische Übersicht aus den vorhandenen, unveränderten Quellen (Personalakten-Einträge, Anträge mit
 * Entscheidungen, Bewerbung, Dienstzeiten, Berichte, Abmeldungen). Nichts wird überschrieben – frühere Dienstgrade bleiben als
 * Einträge erhalten. Geschützte Einträge (Verwarnungen, Notizen) nur mit den jeweiligen Rechten.
 */
@Injectable()
export class HrCareerService {
  constructor(private readonly core: HrCoreService, private readonly perms: PermissionService) {}
  private get prisma() { return this.core.prisma; }

  async career(actor: Actor, personnelId: string) {
    const p = await this.prisma.personnel.findUnique({ where: { id: personnelId }, include: { user: { select: { id: true, displayName: true, robloxUserId: true } } } });
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    const c = await this.perms.contextFor(actor.userId!);
    const sensitive = can(c, 'personnel.view_sensitive');
    const warnings = sensitive || can(c, 'warning.view');
    const entries: CareerEntry[] = [];

    // Aufnahme: Eintrittsdatum der Akte, dazu (falls vorhanden) die angenommene Bewerbung mit Entscheider
    const discordId = await this.core.discordIdOf(p.userId);
    const app = await this.prisma.application.findFirst({
      where: { status: 'ACCEPTED', OR: [...(discordId ? [{ discordId }] : []), ...(p.user.robloxUserId ? [{ robloxUserId: p.user.robloxUserId }] : [])] },
      orderBy: { decidedAt: 'desc' },
    });
    entries.push({ at: p.joinDate, kind: 'JOINED', title: 'Aufnahme in die Polizei', description: app ? `Bewerbung ${app.number} angenommen` : 'Eintrittsdatum laut Personalakte', actor: null, source: app ? 'Bewerbung' : 'Personalakte' });

    const records = await this.prisma.personnelRecord.findMany({ where: { personnelId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const requests = await this.prisma.hrRequest.findMany({ where: { personnelId }, orderBy: { createdAt: 'asc' } });
    const leaves = await this.prisma.leaveRequest.findMany({ where: { userId: p.userId, decidedAt: { not: null } }, orderBy: { decidedAt: 'asc' }, take: 200 });
    const userIds = new Set<string>([...records.map((r) => r.createdById), ...requests.flatMap((r) => [r.requesterId, r.executedById ?? '']), ...leaves.map((l) => l.decidedById ?? ''), ...(app?.decidedById ? [app.decidedById] : [])]);
    for (const r of requests) for (const a of (r.approvals as { userId?: string }[] | null) ?? []) if (a.userId) userIds.add(a.userId);
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...userIds].filter(Boolean) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    if (app?.decidedById) entries[0]!.actor = names.get(app.decidedById) ?? null;

    for (const r of records) {
      const kind = RECORD_KIND[r.type] ?? 'NOTE';
      if ((kind === 'WARNING' || kind === 'DISCIPLINE') && !warnings) continue;
      if (kind === 'NOTE' && !sensitive) continue;
      const data = (r.data ?? {}) as Record<string, unknown>;
      const extra = [
        r.details,
        kind === 'PROMOTION' && Array.isArray(data.approvers) && data.approvers.length ? `Genehmigt von: ${(data.approvers as string[]).join(', ')}` : null,
        kind === 'EXAM' && Array.isArray(data.weakTopics) && data.weakTopics.length ? `Zu wiederholen: ${(data.weakTopics as string[]).join(', ')}` : null,
        (kind === 'WARNING' || kind === 'DISCIPLINE') && r.status ? `Status: ${r.status}` : null,
      ].filter(Boolean).join(' · ');
      entries.push({ at: r.createdAt, kind, title: r.summary, description: extra || null, actor: names.get(r.createdById) ?? '—', source: 'Personalakte', sensitive: kind === 'WARNING' || kind === 'DISCIPLINE' || kind === 'NOTE' });
    }

    // Entscheidungen der Führungskräfte zu Beförderungs-/Versetzungsanträgen (jede Stufe)
    for (const r of requests) {
      const what = r.kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung';
      entries.push({ at: r.createdAt, kind: 'DECISION', title: `${what} beantragt: ${r.fromValue ?? '—'} → ${r.toValue} (${r.number})`, description: r.reason || null, actor: names.get(r.requesterId) ?? '—', source: 'Antrag' });
      for (const a of (r.approvals as { userId?: string; name?: string; decision?: string; comment?: string; at?: string; stage?: number }[] | null) ?? []) {
        if (!a.at) continue;
        entries.push({ at: new Date(a.at), kind: 'DECISION', title: `${what} ${DECISION[a.decision ?? ''] ?? a.decision ?? ''}${a.stage ? ` (Stufe ${a.stage})` : ''} – ${r.number}`, description: a.comment || null, actor: a.name ?? (a.userId ? names.get(a.userId) ?? '—' : '—'), source: 'Antrag' });
      }
    }

    // Abmeldungen: Entscheidung der Leitung (Grund nur mit geschütztem Recht)
    for (const l of leaves) entries.push({ at: l.decidedAt!, kind: 'ABSENCE', title: `Abmeldung ${l.number} ${l.status === 'APPROVED' || l.status === 'ENDED' ? 'genehmigt' : l.status === 'DENIED' ? 'abgelehnt' : l.status.toLowerCase()}`, description: `${l.startsAt.toLocaleDateString('de-DE')} – ${l.endsAt.toLocaleDateString('de-DE')}${sensitive && l.reason ? ` · ${l.reason}` : ''}`, actor: l.decidedById ? names.get(l.decidedById) ?? '—' : null, source: 'Abmeldungen' });

    // Dienstzeiten je Monat (aus den erfassten Schichten)
    const sessions = await this.prisma.dutySession.findMany({ where: { userId: p.userId }, select: { startedAt: true, endedAt: true, status: true } });
    const duty = new Map<string, { minutes: number; shifts: number; at: Date }>();
    for (const s of sessions) {
      if (!['ON_DUTY', 'TRAINING', 'ADMINISTRATIVE'].includes(s.status)) continue;
      const k = monthKey(s.startedAt);
      const e = duty.get(k) ?? { minutes: 0, shifts: 0, at: s.startedAt };
      e.minutes += ((s.endedAt ?? new Date()).getTime() - s.startedAt.getTime()) / 60_000; e.shifts++; if (s.startedAt < e.at) e.at = s.startedAt;
      duty.set(k, e);
    }
    for (const [, e] of duty) entries.push({ at: e.at, kind: 'DUTY', title: `Dienstzeit ${MONTH(e.at)}: ${hm(e.minutes)}`, description: `${e.shifts} erfasste Schicht(en)`, actor: null, source: 'Dienstzeiten' });

    // Dokumentierte Einsätze und Berichte je Monat (Einsätze laut Protokoll: selbst angelegt)
    const [reports, created] = await Promise.all([
      this.prisma.report.findMany({ where: { authorId: p.userId }, select: { number: true, createdAt: true, status: true } }),
      this.prisma.auditLog.findMany({ where: { actorUserId: p.userId, action: { in: ['incident.create', 'incident.created', 'cad.incident.create'] } }, select: { createdAt: true } }),
    ]);
    const act = new Map<string, { reports: string[]; incidents: number; at: Date }>();
    for (const r of reports) { const k = monthKey(r.createdAt); const e = act.get(k) ?? { reports: [], incidents: 0, at: r.createdAt }; e.reports.push(r.number); if (r.createdAt < e.at) e.at = r.createdAt; act.set(k, e); }
    for (const x of created) { const k = monthKey(x.createdAt); const e = act.get(k) ?? { reports: [], incidents: 0, at: x.createdAt }; e.incidents++; if (x.createdAt < e.at) e.at = x.createdAt; act.set(k, e); }
    for (const [, e] of act) entries.push({ at: e.at, kind: 'ACTIVITY', title: `${MONTH(e.at)}: ${e.reports.length} Bericht(e), ${e.incidents} angelegte Einsätze`, description: e.reports.length ? `Berichte: ${e.reports.slice(0, 15).join(', ')}${e.reports.length > 15 ? ' …' : ''}` : null, actor: null, source: 'Berichte/CAD-Protokoll' });

    entries.sort((a, b) => a.at.getTime() - b.at.getTime());
    // Beförderungsvoraussetzungen für die möglichen nächsten Dienstgrade (Entscheidung trifft die Führungskraft im Antrag)
    const rank = await this.core.rankByName(p.rank);
    const next = await Promise.all((await this.core.nextRanks(rank)).map((r) => this.core.evaluate(personnelId, r)));
    await this.core.audit.record(actor, { action: 'career.read', module: 'personnel', entityType: 'Personnel', entityId: personnelId });
    return {
      personnelId, name: p.user.displayName, rank: p.rank, rankSince: p.rankSince, department: p.team, joinDate: p.joinDate, status: p.employmentStatus,
      totals: { dutyMinutes: Math.round([...duty.values()].reduce((n, e) => n + e.minutes, 0)), reports: reports.length, incidentsCreated: created.length, promotions: records.filter((r) => r.type === 'PROMOTION').length, trainings: records.filter((r) => r.type === 'TRAINING').length },
      next, entries,
    };
  }
}
