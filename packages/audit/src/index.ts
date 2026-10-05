import { assertGuildId, prisma, type Prisma } from '@nexus/database';

/**
 * Logging & Audit (Phase 29): einheitliche Auswertung des zentralen Audit-Logs.
 *
 * Geschrieben wird von den Fachmodulen (jede Aktion: **wer · was · wann · Server · betroffener Datensatz ·
 * alte/neue Daten · Berechtigung · Automation · Ergebnis · Grund**); das Log ist append-only (es gibt kein
 * Ändern/Löschen). Dieses Paket ordnet Aktionen **Bereichen** zu (Bewerbungen, Rollenänderungen, Beförderungen …),
 * filtert/sucht/blättert und exportiert als CSV.
 */
export interface AuditArea {
  key: string;
  label: string;
  /** Aktions-Präfixe (`shift.` = alles, was mit `shift.` beginnt). Der spezifischste Präfix gewinnt. */
  prefixes: readonly string[];
}

export const AREAS: readonly AuditArea[] = [
  {
    key: 'applications',
    label: 'Bewerbungen',
    prefixes: [
      'application.',
      'submission.',
      'question.',
      'clarification.',
      'review.',
      'member.left',
      'note.',
    ],
  },
  { key: 'roles', label: 'Rollenänderungen', prefixes: ['role.'] },
  { key: 'personnel', label: 'Personal', prefixes: ['personnel.'] },
  { key: 'promotions', label: 'Beförderungen', prefixes: ['promotion.'] },
  {
    key: 'training',
    label: 'Ausbildungen & Qualifikationen',
    prefixes: ['training.', 'qualification.'],
  },
  { key: 'shifts', label: 'Shifts & Streifen', prefixes: ['shift.', 'unit.'] },
  { key: 'operations', label: 'Einsätze', prefixes: ['operation.'] },
  { key: 'wanted', label: 'Fahndungen', prefixes: ['wanted.'] },
  { key: 'penalties', label: 'Strafen & Fahrzeuge', prefixes: ['penalty.', 'vehicle.'] },
  { key: 'danger', label: 'Gefahrenstatus', prefixes: ['danger.'] },
  { key: 'tickets', label: 'Tickets', prefixes: ['ticket.'] },
  { key: 'moderation', label: 'Moderation', prefixes: ['moderation.'] },
  { key: 'restrictions', label: 'Sperren', prefixes: ['restriction.'] },
  { key: 'absences', label: 'Abmeldungen', prefixes: ['absence.'] },
  { key: 'sek', label: 'SEK', prefixes: ['sek.'] },
  { key: 'radio', label: 'Funk', prefixes: ['radio.'] },
  { key: 'reports', label: 'Berichte', prefixes: ['report.'] },
  // Konfigurationsänderungen: Einstellungen, Rechte, Panels, Ticket-Kategorien, Auswahlfelder, Seeds
  {
    key: 'config',
    label: 'Konfigurationsänderungen',
    prefixes: [
      'settings.',
      'permissions.',
      'panel.',
      'ticket.category.',
      'seed.',
      'profile.',
      'config.',
      'audit.',
      'design.',
      'backup.',
    ],
  },
];

/** Bereich einer Aktion (der spezifischste passende Präfix gewinnt); unbekannte Aktionen → `other`. */
export function areaOf(action: string): string {
  let best: { key: string; len: number } | null = null;
  for (const a of AREAS)
    for (const p of a.prefixes)
      if (action.startsWith(p) && (!best || p.length > best.len))
        best = { key: a.key, len: p.length };
  return best?.key ?? 'other';
}
export const areaLabel = (key: string) => AREAS.find((a) => a.key === key)?.label ?? 'Sonstiges';

export interface AuditQuery {
  guildId: string;
  area?: string | undefined;
  action?: string | undefined;
  actorId?: string | undefined;
  resourceType?: string | undefined;
  resourceId?: string | undefined;
  result?: string | undefined;
  /** Freitext über Aktion, Grund, Datensatz- und Benutzer-ID. */
  search?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

function where(q: AuditQuery): Prisma.AuditLogWhereInput {
  const area = AREAS.find((a) => a.key === q.area);
  const specific = area
    ? AREAS.flatMap((o) => (o.key === area.key ? [] : o.prefixes)).filter((p) =>
        area.prefixes.some((own) => p.startsWith(own) && p.length > own.length),
      )
    : [];
  const s = q.search?.trim();
  return {
    guildId: assertGuildId(q.guildId),
    ...(area
      ? {
          OR: area.prefixes.map((p) => ({ action: { startsWith: p } })),
          ...(specific.length ? { NOT: specific.map((p) => ({ action: { startsWith: p } })) } : {}),
        }
      : {}),
    ...(q.action ? { action: q.action } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.resourceId ? { resourceId: q.resourceId } : {}),
    ...(q.result ? { result: q.result } : {}),
    ...(q.from || q.to
      ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } }
      : {}),
    ...(s
      ? {
          AND: [
            {
              OR: [
                { action: { contains: s, mode: 'insensitive' as const } },
                { reason: { contains: s, mode: 'insensitive' as const } },
                { resourceId: { contains: s } },
                { actorId: { contains: s } },
              ],
            },
          ],
        }
      : {}),
  };
}

export async function query(q: AuditQuery) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const rows = await prisma.auditLog.findMany({
    where: where(q),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, limit).map((r) => ({ ...r, area: areaOf(r.action) }));
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

/** Anzahl der Einträge je Bereich (optional im Zeitraum). */
export async function areaCounts(
  guildId: string,
  from?: Date,
  to?: Date,
): Promise<{ key: string; label: string; count: number }[]> {
  const groups = await prisma.auditLog.groupBy({
    by: ['action'],
    where: {
      guildId: assertGuildId(guildId),
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    },
    _count: { _all: true },
  });
  const sums = new Map<string, number>();
  for (const g of groups)
    sums.set(areaOf(g.action), (sums.get(areaOf(g.action)) ?? 0) + g._count._all);
  return [...AREAS.map((a) => a.key), 'other']
    .map((key) => ({ key, label: areaLabel(key), count: sums.get(key) ?? 0 }))
    .filter((x) => x.count > 0 || x.key !== 'other');
}

/** Welche der „möglichst enthaltenen“ Angaben fehlen einem Eintrag? (Benutzer, Aktion, Zeit, Server, Datensatz, Alt/Neu.) */
export function missingFields(e: {
  actorId: string | null;
  actorType: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  automation: string | null;
  guildId: string;
}): string[] {
  const miss: string[] = [];
  if (!e.actorId && !e.automation && e.actorType !== 'SYSTEM') miss.push('Benutzer/Automation');
  if (!e.action) miss.push('Aktion');
  if (!e.guildId) miss.push('Server');
  if (!e.resourceType || !e.resourceId) miss.push('Datensatz');
  if (e.before == null && e.after == null) miss.push('Daten');
  return miss;
}

// --- CSV-Export --------------------------------------------------------------------------------------------------

const cell = (v: unknown): string => {
  const s =
    v instanceof Date
      ? v.toISOString()
      : v === null || v === undefined
        ? ''
        : typeof v === 'object'
          ? JSON.stringify(v)
          : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // Formelinjektion in Tabellenkalkulationen verhindern
  return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportCsv(
  q: AuditQuery,
  max = 20_000,
): Promise<{ csv: string; rows: number; truncated: boolean }> {
  const rows = await prisma.auditLog.findMany({
    where: where(q),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: max + 1,
  });
  const truncated = rows.length > max;
  const head = [
    'zeit',
    'bereich',
    'aktion',
    'benutzerTyp',
    'benutzer',
    'datensatzArt',
    'datensatzId',
    'berechtigung',
    'automation',
    'ergebnis',
    'grund',
    'vorher',
    'nachher',
  ];
  const lines = rows
    .slice(0, max)
    .map((r) =>
      [
        r.createdAt,
        areaLabel(areaOf(r.action)),
        r.action,
        r.actorType,
        r.actorId,
        r.resourceType,
        r.resourceId,
        r.permission,
        r.automation,
        r.result,
        r.reason,
        r.before,
        r.after,
      ]
        .map(cell)
        .join(','),
    );
  return {
    csv: [head.join(','), ...lines].join('\n'),
    rows: Math.min(rows.length, max),
    truncated,
  };
}
