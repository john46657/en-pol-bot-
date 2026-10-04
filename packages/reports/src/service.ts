import type { DiscordPort } from '@nexus/automation';
import { assertGuildId, auditRepository, guildRepository, prisma, type Prisma } from '@nexus/database';
import { leaderboard, periodRange } from '@nexus/shifts';

/**
 * Tages- und Wochenberichte: führen Schichten, Dienstzeit, Einsätze, Fahndungen, Strafen, Tickets und Ausbildungen
 * zusammen (Woche zusätzlich: aktivste Beamte, Gesamtstunden, Beförderungen, Vergleich zur Vorwoche). Alle Zahlen
 * stammen direkt aus den gespeicherten Datensätzen; Zeiträume sind Berlin-Kalendertage bzw. Montag–Sonntag.
 * Ein Bericht je Server, Art und Zeitraum wird gespeichert (Neuberechnung überschreibt) und kann in den Kanal
 * „Berichte“ gepostet werden. Zeitplan (täglich/wöchentlich automatisch) folgt mit den Hintergrund-Jobs (Phase 31).
 */
type Json = Prisma.InputJsonValue;
export type ReportKind = 'DAY' | 'WEEK';

export class ReportError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found', message: string) {
    super(message);
    this.name = 'ReportError';
  }
}

export interface ReportData {
  kind: ReportKind;
  from: string;
  to: string;
  shifts: { started: number; ended: number; stillRunning: number; activeMembers: number; netSeconds: number; averageSeconds: number; byType: { name: string; count: number; netSeconds: number }[] };
  operations: { created: number; completed: number; cancelled: number; byPriority: Record<string, number>; open: number };
  wanted: { created: number; persons: number; vehicles: number; revoked: number; activeTotal: number };
  penalties: { total: number; byKind: Record<string, number>; finesTotal: number; points: number; revoked: number };
  tickets: { opened: number; closed: number; openTotal: number };
  trainings: { held: number; participants: number; passed: number; failed: number };
  /** Nur Wochenbericht */
  week?: {
    topMembers: { userId: string; netSeconds: number; shifts: number }[];
    totalHours: number;
    promotions: { userId: string; from: string | null; to: string }[];
    absencesStarted: number;
    previous: { netSeconds: number; shifts: number; operations: number };
  };
}

const inRange = (from: Date, to: Date) => ({ gte: from, lt: to });

/** Sammelt die Zahlen für `[from, to)`. */
export async function collect(guildId: string, from: Date, to: Date): Promise<Omit<ReportData, 'kind' | 'from' | 'to' | 'week'>> {
  const gid = assertGuildId(guildId);
  const range = inRange(from, to);
  const [shifts, running, ops, openOps, wanted, wantedRevoked, wantedActive, pens, penRevoked, tOpened, tClosed, tOpenTotal, trainings] = await Promise.all([
    prisma.shift.findMany({ where: { guildId: gid, startedAt: range }, include: { type: { select: { name: true } } } }),
    prisma.shift.count({ where: { guildId: gid, status: { in: ['ACTIVE', 'PAUSED'] }, startedAt: { lt: to } } }),
    prisma.operation.findMany({ where: { guildId: gid, createdAt: range }, select: { status: true, priority: true } }),
    prisma.operation.count({ where: { guildId: gid, status: { in: ['REQUESTED', 'EN_ROUTE', 'ACTIVE'] } } }),
    prisma.wantedNotice.findMany({ where: { guildId: gid, createdAt: range }, select: { kind: true } }),
    prisma.wantedNotice.count({ where: { guildId: gid, revokedAt: range } }),
    prisma.wantedNotice.count({ where: { guildId: gid, status: 'ACTIVE' } }),
    prisma.penalty.findMany({ where: { guildId: gid, createdAt: range }, select: { kind: true, status: true, amount: true, points: true } }),
    prisma.penalty.count({ where: { guildId: gid, revokedAt: range } }),
    prisma.ticket.count({ where: { guildId: gid, createdAt: range } }),
    prisma.ticket.count({ where: { guildId: gid, closedAt: range } }),
    prisma.ticket.count({ where: { guildId: gid, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } } }),
    prisma.training.findMany({ where: { guildId: gid, status: 'FINISHED', finishedAt: range }, include: { participants: true } }),
  ]);
  const ended = shifts.filter((s) => s.status === 'ENDED');
  const net = ended.reduce((a, s) => a + (s.durationSeconds ?? 0), 0);
  const byType = new Map<string, { count: number; netSeconds: number }>();
  for (const s of shifts) {
    const e = byType.get(s.type.name) ?? { count: 0, netSeconds: 0 };
    e.count += 1;
    e.netSeconds += s.status === 'ENDED' ? (s.durationSeconds ?? 0) : 0;
    byType.set(s.type.name, e);
  }
  const count = <T, K extends string>(rows: T[], key: (r: T) => K) => rows.reduce<Record<string, number>>((m, r) => ((m[key(r)] = (m[key(r)] ?? 0) + 1), m), {});
  const activePens = pens.filter((p) => p.status === 'ACTIVE');
  const parts = trainings.flatMap((t) => t.participants);
  return {
    shifts: { started: shifts.length, ended: ended.length, stillRunning: running, activeMembers: new Set(shifts.map((s) => s.userId)).size, netSeconds: net, averageSeconds: ended.length ? Math.round(net / ended.length) : 0, byType: [...byType].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.netSeconds - a.netSeconds) },
    operations: { created: ops.length, completed: ops.filter((o) => o.status === 'COMPLETED').length, cancelled: ops.filter((o) => o.status === 'CANCELLED').length, byPriority: count(ops, (o) => o.priority), open: openOps },
    wanted: { created: wanted.length, persons: wanted.filter((w) => w.kind === 'PERSON').length, vehicles: wanted.filter((w) => w.kind === 'VEHICLE').length, revoked: wantedRevoked, activeTotal: wantedActive },
    penalties: { total: pens.length, byKind: count(pens, (p) => p.kind), finesTotal: activePens.reduce((a, p) => a + (p.amount ?? 0), 0), points: activePens.reduce((a, p) => a + (p.points ?? 0), 0), revoked: penRevoked },
    tickets: { opened: tOpened, closed: tClosed, openTotal: tOpenTotal },
    trainings: { held: trainings.length, participants: parts.filter((p) => p.status === 'PASSED' || p.status === 'FAILED').length, passed: parts.filter((p) => p.status === 'PASSED').length, failed: parts.filter((p) => p.status === 'FAILED').length },
  };
}

export async function buildReport(guildId: string, kind: ReportKind, on: Date = new Date()): Promise<ReportData> {
  const gid = assertGuildId(guildId);
  const { from, to } = periodRange(kind === 'DAY' ? 'day' : 'week', on);
  if (!from || !to) throw new ReportError('invalid', 'Ungültiger Zeitraum.');
  const base = await collect(gid, from, to);
  const data: ReportData = { kind, from: from.toISOString(), to: to.toISOString(), ...base };
  if (kind === 'WEEK') {
    const top = await leaderboard({ guildId: gid, period: 'week', limit: 5, restrictToTeams: null, now: on });
    const prevRange = periodRange('week', new Date(on.getTime() - 7 * 86_400_000));
    const prev = await collect(gid, prevRange.from!, prevRange.to!);
    const promos = await prisma.promotionRequest.findMany({ where: { guildId: gid, status: 'APPROVED', decidedAt: inRange(from, to) }, orderBy: { decidedAt: 'asc' } });
    data.week = {
      topMembers: top.map((t) => ({ userId: t.userId, netSeconds: t.totalSeconds, shifts: t.count })),
      totalHours: Math.round((base.shifts.netSeconds / 3600) * 10) / 10,
      promotions: promos.map((p) => ({ userId: p.userId, from: p.fromRankName, to: p.toRankName })),
      absencesStarted: await prisma.absence.count({ where: { guildId: gid, startDate: { gte: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())), lt: new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())) }, status: { in: ['APPROVED', 'ENDED'] } } }),
      previous: { netSeconds: prev.shifts.netSeconds, shifts: prev.shifts.started, operations: prev.operations.created },
    };
  }
  return data;
}

/** Berechnet den Bericht neu und speichert ihn (überschreibt den bisherigen für denselben Zeitraum, behält die Veröffentlichung). */
export async function generate(guildId: string, kind: ReportKind, on: Date = new Date(), generatedBy: string | null = null) {
  const gid = assertGuildId(guildId);
  const data = await buildReport(gid, kind, on);
  const periodStart = new Date(data.from);
  await auditRepository.log({ guildId: gid, actorId: generatedBy, action: 'report.generated', resource: ['Report', `${kind}:${periodStart.toISOString()}`], after: { kind, from: data.from, to: data.to } as Json, ...(generatedBy ? { permission: 'report.manage' } : { automation: 'report-schedule' }) });
  return prisma.report.upsert({
    where: { guildId_kind_periodStart: { guildId: gid, kind, periodStart } },
    create: { guildId: gid, kind, periodStart, periodEnd: new Date(data.to), data: data as unknown as Json, generatedBy },
    update: { data: data as unknown as Json, periodEnd: new Date(data.to), generatedBy },
  });
}

export const listReports = (guildId: string, kind?: string, limit = 30) => prisma.report.findMany({ where: { guildId: assertGuildId(guildId), ...(kind === 'DAY' || kind === 'WEEK' ? { kind } : {}) }, orderBy: { periodStart: 'desc' }, take: Math.min(Math.max(limit, 1), 100) });

export async function getReport(guildId: string, id: string) {
  const r = await prisma.report.findFirst({ where: { id, guildId: assertGuildId(guildId) } });
  if (!r) throw new ReportError('not-found', 'Bericht nicht gefunden.');
  return r;
}

// --- Darstellung -------------------------------------------------------------------------------------------------------

const hm = (s: number) => `${Math.floor(s / 3600)} Std ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} Min`;
const de = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
const delta = (now: number, prev: number) => (prev === 0 ? (now === 0 ? '±0' : 'neu') : `${now >= prev ? '+' : ''}${Math.round(((now - prev) / prev) * 100)} %`);
const KIND_LABEL: Record<string, string> = { FINE: 'Bußgeld', WARNING: 'Verwarnung', POINTS: 'Punkte', LICENSE_REVOCATION: 'Führerscheinentzug', VEHICLE_SEIZURE: 'Beschlagnahmung' };

export function renderEmbed(d: ReportData) {
  const title = d.kind === 'DAY' ? `📊 Tagesbericht ${de(d.from)}` : `📈 Wochenbericht ${de(d.from)} – ${de(new Date(new Date(d.to).getTime() - 1).toISOString())}`;
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: '🕒 Dienst', value: `${d.shifts.started} Schichten (${d.shifts.ended} beendet, ${d.shifts.stillRunning} laufen)\n${d.shifts.activeMembers} Beamte · ${hm(d.shifts.netSeconds)} netto · Ø ${hm(d.shifts.averageSeconds)}${d.shifts.byType.length ? `\n${d.shifts.byType.map((t) => `${t.name}: ${t.count}×, ${hm(t.netSeconds)}`).join('\n')}` : ''}` },
    { name: '🚨 Einsätze', value: `${d.operations.created} neu · ${d.operations.completed} abgeschlossen · ${d.operations.cancelled} abgebrochen · ${d.operations.open} offen`, inline: true },
    { name: '📣 Fahndungen', value: `${d.wanted.created} neu (${d.wanted.persons} Personen, ${d.wanted.vehicles} Fahrzeuge) · ${d.wanted.revoked} aufgehoben · ${d.wanted.activeTotal} aktiv`, inline: true },
    { name: '⚖️ Strafen', value: `${d.penalties.total} (${Object.entries(d.penalties.byKind).map(([k, v]) => `${KIND_LABEL[k] ?? k} ${v}`).join(', ') || '–'})\nBußgelder ${d.penalties.finesTotal} $ · ${d.penalties.points} Punkte`, inline: true },
    { name: '🎫 Tickets', value: `${d.tickets.opened} eröffnet · ${d.tickets.closed} geschlossen · ${d.tickets.openTotal} offen`, inline: true },
    { name: '🎓 Ausbildungen', value: `${d.trainings.held} Termine · ${d.trainings.passed} bestanden · ${d.trainings.failed} nicht bestanden`, inline: true },
  ];
  if (d.week) {
    fields.push(
      { name: '🏆 Aktivste Beamte', value: d.week.topMembers.map((t, i) => `${i + 1}. <@${t.userId}> – ${hm(t.netSeconds)} (${t.shifts})`).join('\n') || '–' },
      { name: '📊 Gesamt', value: `${d.week.totalHours} Std Dienstzeit (${delta(d.shifts.netSeconds, d.week.previous.netSeconds)} zur Vorwoche) · Schichten ${delta(d.shifts.started, d.week.previous.shifts)} · Einsätze ${delta(d.operations.created, d.week.previous.operations)}\n${d.week.absencesStarted} Abmeldungen begonnen` },
      { name: '📈 Beförderungen', value: d.week.promotions.map((p) => `<@${p.userId}>: ${p.from ?? '–'} → **${p.to}**`).join('\n') || 'keine' },
    );
  }
  return { title, color: d.kind === 'DAY' ? 0x3b82f6 : 0x8b5cf6, fields, timestamp: new Date().toISOString() };
}

export function renderText(d: ReportData): string {
  return [renderEmbed(d).title, ...renderEmbed(d).fields.map((f) => `\n${f.name}\n${f.value}`)].join('\n');
}

/** Veröffentlicht den Bericht im Kanal „report-channel“ (bearbeitet eine frühere Veröffentlichung statt zu doppeln). */
export async function publish(guildId: string, id: string, port: DiscordPort, override?: string): Promise<{ status: 'posted' | 'edited' | 'no-channel' | 'failed'; reason?: string }> {
  const gid = assertGuildId(guildId);
  const r = await getReport(gid, id);
  const channelId = override ?? (await guildRepository.getSelections(gid))['report-channel'];
  if (!channelId) return { status: 'no-channel', reason: 'Es ist kein Berichts-Kanal festgelegt (Einstellungen → Rollen & Kanäle wählen).' };
  const payload = { embeds: [renderEmbed(r.data as unknown as ReportData)], allowed_mentions: { parse: [] } } as never;
  try {
    if (r.channelId === channelId && r.messageId) {
      try {
        await port.editMessage(channelId, r.messageId, payload);
        return { status: 'edited' };
      } catch {
        /* Nachricht gelöscht → neu posten */
      }
    }
    const m = await port.postMessage(channelId, payload);
    await prisma.report.update({ where: { id: r.id }, data: { channelId, messageId: m.id } });
    return { status: 'posted' };
  } catch (e) {
    return { status: 'failed', reason: e instanceof Error ? e.message : 'Unbekannter Fehler' };
  }
}
