import { assertGuildId, prisma } from '@nexus/database';
import {
  CHART_SOURCES,
  LIST_PERMISSION,
  METRICS,
  type ChartSource,
  type MetricKey,
} from './widgets.js';

export interface WidgetData {
  /** Kennzahlen; `null` = keine Berechtigung (die Oberfläche zeigt „Kein Zugriff“, nie eine erfundene Zahl) */
  metrics: Record<MetricKey, number | null>;
  charts: Record<ChartSource, { label: string; count: number }[] | null>;
  tickets:
    { number: number; subject: string; status: string; priority: string; createdAt: Date }[] | null;
  applications:
    { number: string | null; name: string; status: string; submittedAt: Date | null }[] | null;
  team: { userId: string; name: string; since: Date }[] | null;
  activity: { action: string; actorId: string | null; createdAt: Date }[] | null;
}

const OPEN_TICKET = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;
const PENDING_SUB = ['SUBMITTED', 'UNDER_REVIEW', 'ON_HOLD'] as const;
const ON_DUTY = ['ACTIVE', 'PAUSED'] as const;
const RUNNING_OP = ['REQUESTED', 'EN_ROUTE', 'ACTIVE'] as const;
const LIMIT = 10;

/**
 * Daten für die Widgets einer Seite. Jede Gruppe wird nur geladen, wenn `can(recht)` wahr ist – die Rechte-Prüfung
 * liegt hier auf dem Server, nicht in der Oberfläche. Alle Abfragen sind auf den Server (Guild-ID) begrenzt.
 */
export async function getWidgetData(
  guildId: string,
  can: (permission: string) => Promise<boolean>,
): Promise<WidgetData> {
  const gid = assertGuildId(guildId);
  const allowed = new Map<string, Promise<boolean>>();
  const ok = (p: string) => {
    if (!allowed.has(p)) allowed.set(p, can(p)); // die Anfrage merken, damit gleichzeitige Aufrufe nicht doppelt prüfen
    return allowed.get(p)!;
  };
  const gated = async <T>(permission: string, load: () => Promise<T>): Promise<T | null> =>
    (await ok(permission)) ? load() : null;

  const m = (k: MetricKey, load: () => Promise<number>) => gated(METRICS[k].permission, load);
  const [
    openTickets,
    pendingSubmissions,
    acceptedSubmissions,
    deniedSubmissions,
    onDuty,
    activeOperations,
    activeWanted,
    personnel,
    pendingAbsences,
  ] = await Promise.all([
    m('openTickets', () =>
      prisma.ticket.count({ where: { guildId: gid, status: { in: [...OPEN_TICKET] } } }),
    ),
    m('pendingSubmissions', () =>
      prisma.applicationSubmission.count({
        where: { guildId: gid, isTest: false, status: { in: [...PENDING_SUB] } },
      }),
    ),
    m('acceptedSubmissions', () =>
      prisma.applicationSubmission.count({
        where: { guildId: gid, isTest: false, status: 'ACCEPTED' },
      }),
    ),
    m('deniedSubmissions', () =>
      prisma.applicationSubmission.count({
        where: { guildId: gid, isTest: false, status: 'DENIED' },
      }),
    ),
    m('onDuty', () =>
      prisma.shift.count({ where: { guildId: gid, status: { in: [...ON_DUTY] } } }),
    ),
    m('activeOperations', () =>
      prisma.operation.count({ where: { guildId: gid, status: { in: [...RUNNING_OP] } } }),
    ),
    m('activeWanted', () =>
      prisma.wantedNotice.count({ where: { guildId: gid, status: 'ACTIVE' } }),
    ),
    m('personnel', () =>
      prisma.personnelRecord.count({ where: { guildId: gid, status: 'ACTIVE' } }),
    ),
    m('pendingAbsences', () =>
      prisma.absence.count({ where: { guildId: gid, status: 'PENDING' } }),
    ),
  ]);

  const chart = (rows: { status: string; _count: { _all: number } }[]) =>
    rows.map((r) => ({ label: r.status, count: r._count._all })).sort((a, b) => b.count - a.count);
  const [cTickets, cSubmissions, cOperations] = await Promise.all([
    gated(CHART_SOURCES.tickets.permission, async () => {
      const rows = await prisma.ticket.groupBy({
        by: ['status'],
        where: { guildId: gid },
        _count: { _all: true },
      });
      return chart(rows);
    }),
    gated(CHART_SOURCES.submissions.permission, async () => {
      const rows = await prisma.applicationSubmission.groupBy({
        by: ['status'],
        where: { guildId: gid, isTest: false },
        _count: { _all: true },
      });
      return chart(rows);
    }),
    gated(CHART_SOURCES.operations.permission, async () => {
      const rows = await prisma.operation.groupBy({
        by: ['status'],
        where: { guildId: gid },
        _count: { _all: true },
      });
      return chart(rows);
    }),
  ]);

  const [tickets, applications, team, activity] = await Promise.all([
    gated(LIST_PERMISSION.tickets, async () =>
      (
        await prisma.ticket.findMany({
          where: { guildId: gid, status: { in: [...OPEN_TICKET] } },
          orderBy: { createdAt: 'desc' },
          take: LIMIT,
          select: { number: true, subject: true, status: true, priority: true, createdAt: true },
        })
      ).map((t) => ({ ...t, subject: t.subject.slice(0, 120) })),
    ),
    gated(LIST_PERMISSION.applications, async () =>
      (
        await prisma.applicationSubmission.findMany({
          where: { guildId: gid, isTest: false, status: { in: [...PENDING_SUB] } },
          orderBy: { submittedAt: 'desc' },
          take: LIMIT,
          select: {
            submissionNumber: true,
            displayNameSnapshot: true,
            status: true,
            submittedAt: true,
          },
        })
      ).map((s) => ({
        number: s.submissionNumber,
        name: s.displayNameSnapshot,
        status: s.status,
        submittedAt: s.submittedAt,
      })),
    ),
    gated(LIST_PERMISSION.team, async () => {
      const shifts = await prisma.shift.findMany({
        where: { guildId: gid, status: { in: [...ON_DUTY] } },
        orderBy: { startedAt: 'asc' },
        take: LIMIT,
        select: { userId: true, startedAt: true },
      });
      const records = await prisma.personnelRecord.findMany({
        where: { guildId: gid, userId: { in: shifts.map((s) => s.userId) } },
        select: { userId: true, rpName: true },
      });
      const names = new Map(records.map((r) => [r.userId, r.rpName]));
      return shifts.map((s) => ({
        userId: s.userId,
        name: names.get(s.userId) ?? 'Unbekannt',
        since: s.startedAt,
      }));
    }),
    gated(LIST_PERMISSION.activity, async () =>
      prisma.auditLog.findMany({
        where: { guildId: gid },
        orderBy: { createdAt: 'desc' },
        take: LIMIT,
        select: { action: true, actorId: true, createdAt: true },
      }),
    ),
  ]);

  return {
    metrics: {
      openTickets,
      pendingSubmissions,
      acceptedSubmissions,
      deniedSubmissions,
      onDuty,
      activeOperations,
      activeWanted,
      personnel,
      pendingAbsences,
    },
    charts: { tickets: cTickets, submissions: cSubmissions, operations: cOperations },
    tickets,
    applications,
    team,
    activity,
  };
}
