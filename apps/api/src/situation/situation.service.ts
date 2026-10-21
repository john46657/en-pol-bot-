import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { statusLabel } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { CadService } from '../cad/cad.service';
import { CadConfigService } from '../cad/cad-config.service';
import { QualityService } from '../quality/quality.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';
import { onePersonnel } from '../common/guild-context';

const OPEN_REPORTS = ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED'];
const OPEN_APPLICATIONS = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'];
const CRITICAL_PRIORITIES = ['CRITICAL', 'URGENT', 'HIGH'];
const minutesSince = (d: Date, now: number) => Math.max(0, Math.round((now - d.getTime()) / 60_000));
const de = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }) : '—');

/**
 * Automatischer Lageassistent: fasst ausschließlich vorhandene Daten zusammen (CAD, Dienst, Fahndungen, Berichte, ER:LC-Notrufe,
 * Störungen, offene Führungsaufgaben). Jeder Abschnitt nennt Quelle und Datenstand. Es wird nichts geschätzt oder ergänzt.
 */
@Injectable()
export class SituationService {
  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService,
    private readonly cad: CadService, private readonly cadCfg: CadConfigService, private readonly quality: QualityService,
  ) {}

  async overview(actor: Actor) {
    const now = Date.now();
    const generatedAt = new Date(now).toISOString();
    const uid = actor.userId!;
    const [cfg, incidents, units, canErlc] = await Promise.all([this.cadCfg.get(), this.cad.listIncidents({ active: true, take: 300 }, { userId: uid }), this.cad.listUnits(), this.perms.has(uid, 'cad.view_erlc')]);
    const label = (list: { key: string; label: string }[], key: string | null) => list.find((x) => x.key === key)?.label ?? key ?? '—';

    // ---- Einsätze ----
    const activeUnits = (i: (typeof incidents)[number]) => i.units.filter((u) => !u.clearedAt);
    const incidentRows = incidents.map((i) => ({
      id: i.id, number: i.number, title: i.title, priority: i.priority, priorityLabel: label(cfg.priorities, i.priority), status: i.status, statusLabel: label(cfg.incidentStatuses, i.status),
      type: i.type, location: i.location, units: activeUnits(i).map((u) => u.unit.callsign), ageMinutes: minutesSince(i.createdAt, now), updatedAt: i.updatedAt, hasPosition: i.mapX !== null && i.mapZ !== null,
    }));
    const issues = await this.quality.incidentIssues(incidents.map((i) => i.id));
    const issueOf = new Map(issues.map((x) => [x.id, x]));
    const count = <T>(xs: T[], key: (x: T) => string) => xs.reduce<Record<string, number>>((m, x) => { const k = key(x); m[k] = (m[k] ?? 0) + 1; return m; }, {});

    // ---- Einheiten & Beamte ----
    const unitRows = units.map((u) => ({ id: u.id, callsign: u.callsign, status: u.status, statusLabel: label(cfg.unitStatuses, u.status), type: u.type, current: u.current ? { id: u.current.id, number: u.current.number } : null, crew: u.memberNames }));
    const sessions = await this.prisma.dutySession.findMany({ where: { endedAt: null }, include: { user: { select: { id: true, displayName: true, personnel: { ...onePersonnel(), select: { rank: true, callsign: true, team: true } } } } }, orderBy: { startedAt: 'asc' } });
    const unitByUser = new Map<string, string>();
    for (const u of units) for (const m of u.members) unitByUser.set(m.userId, u.callsign);
    const officers = sessions.map((s) => ({ userId: s.userId, name: s.user.displayName, status: s.status, statusLabel: statusLabel(s.status), rank: s.user.personnel[0]?.rank ?? null, department: s.user.personnel[0]?.team ?? null, callsign: s.callsign ?? s.user.personnel[0]?.callsign ?? null, unit: unitByUser.get(s.userId) ?? null, sinceMinutes: minutesSince(s.startedAt, now) }));

    // ---- Fahndungen ----
    const wanted = await this.prisma.wantedRecord.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 300 });
    const hitsToReview = await this.prisma.erlcWantedHit.count({ where: { reviewStatus: { in: ['NEW', 'REVIEW_REQUIRED'] } } });

    // ---- Berichte ----
    const seeAllReports = (await this.perms.has(uid, 'reports.review')) || (await this.perms.has(uid, 'reports.approve'));
    const openReports = await this.prisma.report.findMany({ where: { status: { in: OPEN_REPORTS } }, select: { id: true }, orderBy: { updatedAt: 'desc' }, take: 300 });
    const reportChecks = await this.quality.incompleteReports(openReports.map((r) => r.id));
    const reportsByStatus = count(reportChecks, (r) => r.status);

    // ---- Notrufe (ER:LC, nur mit Recht und nur echte Daten) ----
    const servers = canErlc ? await this.prisma.erlcServer.findMany({ where: { active: true }, select: { id: true, name: true, status: true, lastSyncAt: true, lastError: true, features: true } }) : [];
    const calls = canErlc && servers.length ? await this.cad.listCalls({ status: 'OPEN', take: 100 }) : [];

    // ---- Technische Störungen ----
    const disruptions = await this.prisma.integrationEvent.findMany({ where: { status: 'OPEN' }, orderBy: { lastAt: 'desc' }, take: 20, select: { id: true, source: true, sourceName: true, step: true, message: true, count: true, firstAt: true, lastAt: true, alertedAt: true, acknowledgedAt: true } });

    // ---- Offene Führungsaufgaben ----
    const [hrRequests, examsToGrade, leavePending, applicationsOpen, handoverOpen] = await Promise.all([
      this.prisma.hrRequest.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      this.prisma.hrExamAttempt.count({ where: { status: 'SUBMITTED' } }),
      this.prisma.leaveRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.application.count({ where: { status: { in: OPEN_APPLICATIONS } } }),
      this.prisma.cadHandover.count({ where: { acknowledgedAt: null } }),
    ]);
    const tasks = [
      { key: 'reports_review', label: 'Berichte warten auf Prüfung', count: (reportsByStatus.SUBMITTED ?? 0) + (reportsByStatus.UNDER_REVIEW ?? 0), href: '/reports' },
      { key: 'reports_incomplete', label: 'Offene Berichte mit Fehlern (Qualitätsprüfer)', count: reportChecks.filter((r) => r.errors.length).length, href: '/quality' },
      { key: 'incidents_incomplete', label: 'Aktive Einsätze mit fehlenden Pflichtangaben', count: issues.filter((x) => x.errors.length).length, href: '/quality' },
      { key: 'incidents_unassigned', label: 'Aktive Einsätze ohne Einheit', count: incidentRows.filter((i) => !i.units.length).length, href: '/cad/incidents' },
      { key: 'wanted_hits', label: 'Fahndungstreffer zur Prüfung', count: hitsToReview, href: '/wanted?tab=hits' },
      { key: 'hr_requests', label: 'Offene Beförderungs-/Versetzungsanträge', count: hrRequests, href: '/promotions' },
      { key: 'exams_grade', label: 'Prüfungen warten auf Bewertung', count: examsToGrade, href: '/trainings' },
      { key: 'leave', label: 'Abmeldungen warten auf Entscheidung', count: leavePending, href: '/leave' },
      { key: 'applications', label: 'Offene Bewerbungen', count: applicationsOpen, href: '/applications' },
      { key: 'handover', label: 'Unbestätigte Schichtübergaben', count: handoverOpen, href: '/cad/handover' },
      { key: 'disruptions', label: 'Offene technische Störungen', count: disruptions.length, href: '/admin/system' },
    ];

    const critical = [
      ...incidentRows.filter((i) => CRITICAL_PRIORITIES.includes(i.priority) || i.status === 'CRITICAL').map((i) => ({ kind: 'INCIDENT', id: i.id, text: `${i.number} · ${i.title} (${i.priorityLabel}, ${i.statusLabel})${i.units.length ? '' : ' – keine Einheit'}` })),
      ...incidentRows.filter((i) => issueOf.get(i.id)?.errors.length).map((i) => ({ kind: 'MISSING', id: i.id, text: `${i.number}: ${issueOf.get(i.id)!.errors.map((e) => e.message).join(' ')}` })),
      ...calls.filter((c) => !c.incidentId).slice(0, 10).map((c) => ({ kind: 'CALL', id: c.id, text: `Notruf #${c.callNumber} ohne Einsatz${c.description ? `: ${c.description.slice(0, 80)}` : ''}` })),
      ...disruptions.filter((d) => d.alertedAt).map((d) => ({ kind: 'DISRUPTION', id: d.id, text: `Störung ${d.sourceName ?? d.source}${d.step ? ` (${d.step})` : ''}: ${d.message}` })),
    ];

    return {
      generatedAt,
      incidents: {
        asOf: generatedAt, source: 'CAD-Leitstelle (aktive Einsätze)', total: incidentRows.length,
        byPriority: count(incidentRows, (i) => i.priorityLabel), byStatus: count(incidentRows, (i) => i.statusLabel),
        unassigned: incidentRows.filter((i) => !i.units.length).length, items: incidentRows.slice(0, 50).map((i) => ({ ...i, errors: issueOf.get(i.id)?.errors ?? [], warnings: issueOf.get(i.id)?.warnings ?? [] })),
      },
      units: {
        asOf: generatedAt, source: 'CAD-Einheiten', total: unitRows.length, byStatus: count(unitRows, (u) => u.statusLabel),
        assigned: unitRows.filter((u) => u.current), unassigned: unitRows.filter((u) => !u.current && u.status !== 'OFF_DUTY'),
      },
      officers: {
        asOf: generatedAt, source: 'Dienststatus (laufende Schichten)', onDuty: officers.length, byStatus: count(officers, (o) => o.statusLabel),
        available: officers.filter((o) => o.status === 'ON_DUTY' && !o.unit).length, items: officers,
      },
      wanted: {
        asOf: generatedAt, source: 'Fahndungen (aktiv)', total: wanted.length, byPriority: count(wanted, (w) => w.priority), hitsToReview,
        expiringSoon: wanted.filter((w) => w.expiresAt && w.expiresAt.getTime() - now < 24 * 3_600_000).map((w) => ({ id: w.id, number: w.number, reason: w.reason, expiresAt: w.expiresAt })),
        newest: wanted.slice(0, 10).map((w) => ({ id: w.id, number: w.number, reason: w.reason, priority: w.priority, createdAt: w.createdAt })),
      },
      reports: {
        asOf: generatedAt, source: 'Einsatzberichte (offen)', visibleAll: seeAllReports, byStatus: reportsByStatus,
        incomplete: reportChecks.filter((r) => r.errors.length).slice(0, 30).map((r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, errors: r.errors.map((e) => e.message) })),
      },
      calls: canErlc ? {
        asOf: generatedAt, source: 'ER:LC-Notrufe', enabled: servers.length > 0,
        servers: servers.map((s) => ({ id: s.id, name: s.name, status: s.status, lastSyncAt: s.lastSyncAt, emergencyCalls: s.features.includes('emergencyCalls'), lastError: s.status === 'CONNECTED' ? null : s.lastError })),
        open: calls.length, withoutIncident: calls.filter((c) => !c.incidentId).length, withoutPosition: calls.filter((c) => c.mapX === null).length,
        items: calls.slice(0, 20).map((c) => ({ id: c.id, callNumber: c.callNumber, description: c.description, location: c.positionDescriptor, startedAt: c.startedAt, incident: c.incident?.number ?? null, hasPosition: c.mapX !== null })),
      } : null,
      disruptions: { asOf: generatedAt, source: 'Technische Überwachung', items: disruptions },
      tasks: { asOf: generatedAt, source: 'Personal, Berichte, CAD, Bewerbungen', items: tasks },
      critical,
    };
  }

  /** Lagebericht als lesbarer Text (nur vorhandene Daten). */
  render(o: Awaited<ReturnType<SituationService['overview']>>, note?: string | null) {
    const L: string[] = [];
    const line = (s = '') => L.push(s);
    line(`# Lagebericht – ${de(o.generatedAt)}`);
    line(`Datenstand: ${de(o.generatedAt)} · Quelle: Dashboard (CAD, Dienst, Fahndungen, Berichte${o.calls ? ', ER:LC' : ''}). Es sind ausschließlich erfasste Daten enthalten.`);
    if (note) { line(); line(`> ${note.replace(/\n/g, '\n> ')}`); }
    line(); line('## Personalsituation');
    line(`- Im Dienst: ${o.officers.onDuty} (${Object.entries(o.officers.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'})`);
    line(`- Verfügbar ohne Einheit: ${o.officers.available}`);
    line(`- Einheiten: ${o.units.total} gesamt, ${o.units.assigned.length} im Einsatz, ${o.units.unassigned.length} ohne Einsatz (nicht außer Dienst)`);
    for (const u of o.units.assigned) line(`  - ${u.callsign} → ${u.current!.number}${u.crew.length ? ` (${u.crew.join(', ')})` : ''}`);
    line(); line('## Offene Einsätze');
    if (!o.incidents.total) line('- Keine aktiven Einsätze.');
    for (const i of o.incidents.items) line(`- ${i.number} · ${i.title} – ${i.priorityLabel}, ${i.statusLabel}, ${i.location ?? 'ohne Ort'}, Einheiten: ${i.units.join(', ') || 'keine'}, seit ${i.ageMinutes} min${i.errors.length ? ` ⚠️ ${i.errors.map((e) => e.message).join(' ')}` : ''}`);
    if (o.incidents.total > o.incidents.items.length) line(`- … und ${o.incidents.total - o.incidents.items.length} weitere`);
    if (o.calls) {
      line(); line('## Notrufe (ER:LC)');
      for (const s of o.calls.servers) line(`- ${s.name}: ${s.status}, letzte Synchronisierung ${de(s.lastSyncAt)}${s.emergencyCalls ? '' : ' (Notrufe nicht freigegeben)'}`);
      line(`- Offen: ${o.calls.open}, ohne Einsatz: ${o.calls.withoutIncident}, ohne genaue Position: ${o.calls.withoutPosition}`);
    }
    line(); line('## Aktive Fahndungen');
    line(`- Aktiv: ${o.wanted.total}${Object.keys(o.wanted.byPriority).length ? ` (${Object.entries(o.wanted.byPriority).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''}, Treffer zur Prüfung: ${o.wanted.hitsToReview}`);
    for (const w of o.wanted.expiringSoon) line(`  - läuft bald ab: ${w.number ?? '—'} · ${w.reason} (${de(w.expiresAt)})`);
    line(); line('## Ausstehende Berichte');
    line(`- ${Object.entries(o.reports.byStatus).map(([k, v]) => `${statusLabel(k)}: ${v}`).join(', ') || 'keine offenen Berichte'}`);
    for (const r of o.reports.incomplete) line(`  - ${r.number} · ${r.title}: ${r.errors.join(' ')}`);
    line(); line('## Technische Störungen');
    if (!o.disruptions.items.length) line('- Keine offenen Störungen.');
    for (const d of o.disruptions.items) line(`- ${d.sourceName ?? d.source}${d.step ? ` (${d.step})` : ''}: ${d.message} – ${d.count}× seit ${de(d.firstAt)}${d.acknowledgedAt ? ' (quittiert)' : ''}`);
    line(); line('## Offene Aufgaben der Führungsebene');
    const open = o.tasks.items.filter((t) => t.count > 0);
    if (!open.length) line('- Keine offenen Aufgaben.');
    for (const t of open) line(`- ${t.label}: ${t.count}`);
    return L.join('\n');
  }

  async createReport(actor: Actor, note?: string | null) {
    const data = await this.overview(actor);
    const text = this.render(data, note);
    const row = await this.prisma.situationReport.create({ data: { number: makeNumber('L'), data: data as unknown as Prisma.InputJsonValue, text, note: note ?? null, createdById: actor.userId! } });
    await this.audit.record(actor, { action: 'situation.report.create', module: 'cad', entityType: 'SituationReport', entityId: row.id, after: { number: row.number } });
    return { id: row.id, number: row.number, createdAt: row.createdAt, text };
  }

  async listReports() {
    const rows = await this.prisma.situationReport.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, number: true, note: true, createdAt: true, createdById: true } });
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ ...r, createdBy: names.get(r.createdById) ?? '—' }));
  }
  async getReport(id: string) {
    const r = await this.prisma.situationReport.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Lagebericht nicht gefunden.');
    const by = await this.prisma.user.findUnique({ where: { id: r.createdById }, select: { displayName: true } });
    return { ...r, createdBy: by?.displayName ?? '—' };
  }
}
