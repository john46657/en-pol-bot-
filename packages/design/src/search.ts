import { assertGuildId, prisma } from '@nexus/database';
import {
  ACTIONS_OF,
  NOTIFICATION_KEYS,
  NOTIFICATION_TYPES,
  notificationTypeOf,
  type NotificationType,
} from './notify.js';

export interface SearchItem {
  id: string;
  title: string;
  subtitle: string;
  /** Pfad im Dashboard, relativ zum Server (`/tickets`, `/personnel/<id>`) */
  path: string;
}
export interface SearchGroup {
  kind: 'tickets' | 'transcripts' | 'applications' | 'personnel';
  label: string;
  items: SearchItem[];
}
export const MIN_QUERY = 2;
export const MAX_QUERY = 60;
const PER_GROUP = 5;

/**
 * Globale Suche über Tickets, Transcripts (geschlossene Tickets), Bewerbungen und Teammitglieder (Personal).
 * Jede Gruppe wird **nur** durchsucht und geliefert, wenn `can(recht)` wahr ist – die Prüfung liegt auf dem Server.
 * Alle Abfragen sind auf den Server (Guild-ID) begrenzt; es gibt höchstens 5 Treffer je Gruppe.
 */
export async function searchAll(
  guildId: string,
  rawQuery: string,
  can: (permission: string) => Promise<boolean>,
): Promise<{ query: string; groups: SearchGroup[] }> {
  const gid = assertGuildId(guildId);
  // Steuerzeichen (Zeilenumbrüche, NUL …) werden zu Leerzeichen
  const q = [...rawQuery.normalize('NFC')]
    .map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c))
    .join('')
    .trim()
    .slice(0, MAX_QUERY);
  if ([...q].length < MIN_QUERY) return { query: q, groups: [] };
  const num = /^#?(\d{1,7})$/.exec(q)?.[1];
  const sub = /^sub-?(\d{1,7})$/i.exec(q)?.[1];
  const [canTickets, canApps, canPersonnel] = await Promise.all([
    can('tickets.view'),
    can('applications.submissions.view'),
    can('personnel.view'),
  ]);
  const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
  const groups: SearchGroup[] = [];

  if (canTickets) {
    const rows = await prisma.ticket.findMany({
      where: {
        guildId: gid,
        OR: [{ subject: contains(q) }, ...(num ? [{ number: Number(num) }] : [])],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_GROUP * 3,
      select: { id: true, number: true, subject: true, status: true },
    });
    const item = (t: (typeof rows)[number]): SearchItem => ({
      id: t.id,
      title: `#${t.number} ${t.subject}`.slice(0, 120),
      subtitle:
        t.status === 'CLOSED' ? 'geschlossen' : t.status === 'CLAIMED' ? 'übernommen' : 'offen',
      path: '/tickets',
    });
    groups.push({
      kind: 'tickets',
      label: 'Tickets',
      items: rows
        .filter((t) => t.status !== 'CLOSED')
        .slice(0, PER_GROUP)
        .map(item),
    });
    groups.push({
      kind: 'transcripts',
      label: 'Transcripts',
      items: rows
        .filter((t) => t.status === 'CLOSED')
        .slice(0, PER_GROUP)
        .map(item),
    });
  }
  if (canApps) {
    const rows = await prisma.applicationSubmission.findMany({
      where: {
        guildId: gid,
        isTest: false,
        OR: [
          { displayNameSnapshot: contains(q) },
          { usernameSnapshot: contains(q) },
          { submissionNumber: contains(sub ? `SUB-${sub.padStart(4, '0')}` : q) },
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: PER_GROUP,
      select: { id: true, submissionNumber: true, displayNameSnapshot: true, status: true },
    });
    groups.push({
      kind: 'applications',
      label: 'Bewerbungen',
      items: rows.map((s) => ({
        id: s.id,
        title: `${s.submissionNumber ?? '–'} ${s.displayNameSnapshot}`.slice(0, 120),
        subtitle: s.status.toLowerCase(),
        path: `/submissions/${s.id}`,
      })),
    });
  }
  if (canPersonnel) {
    const rows = await prisma.personnelRecord.findMany({
      where: {
        guildId: gid,
        OR: [
          { rpName: contains(q) },
          { serviceNumber: contains(q) },
          ...(/^\d{5,25}$/.test(q) ? [{ userId: q }] : []),
        ],
      },
      orderBy: { rpName: 'asc' },
      take: PER_GROUP,
      select: { id: true, rpName: true, serviceNumber: true, status: true },
    });
    groups.push({
      kind: 'personnel',
      label: 'Teammitglieder',
      items: rows.map((r) => ({
        id: r.id,
        title: r.rpName,
        subtitle: [r.serviceNumber, r.status === 'ACTIVE' ? 'aktiv' : r.status.toLowerCase()]
          .filter(Boolean)
          .join(' · '),
        path: `/personnel/${r.id}`,
      })),
    });
  }
  return { query: q, groups: groups.filter((g) => g.items.length > 0) };
}

// --- Benachrichtigungen ----------------------------------------------------------------------------
export interface NotificationItem {
  id: string;
  type: NotificationType;
  icon: string;
  title: string;
  text: string;
  at: Date;
  path: string;
}
export const NOTIFICATION_WINDOW_DAYS = 14;
export const NOTIFICATION_LIMIT = 30;

/**
 * Letzte Ereignisse für die Glocke, aus dem Audit-Log. Nur die vom Administrator gewählten Arten, nur solche, für die der
 * Benutzer das Recht hat; höchstens 30 aus den letzten 14 Tagen. Die Texte nennen Nummern und Betreff, keine internen Daten.
 */
export async function getNotifications(
  guildId: string,
  types: readonly string[],
  can: (permission: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<NotificationItem[]> {
  const gid = assertGuildId(guildId);
  const allowed: NotificationType[] = [];
  // Feste Liste statt `in`-Prüfung: nie Eigenschaften des Objekts (z. B. __proto__) als Art zulassen
  for (const t of NOTIFICATION_KEYS)
    if (types.includes(t) && (await can(NOTIFICATION_TYPES[t].permission))) allowed.push(t);
  if (allowed.length === 0) return [];
  const exact = allowed.flatMap((t) => ACTIONS_OF[t].exact);
  const prefix = allowed.flatMap((t) => ACTIONS_OF[t].prefix);
  const since = new Date(now.getTime() - NOTIFICATION_WINDOW_DAYS * 86_400_000);
  const rows = await prisma.auditLog.findMany({
    where: {
      guildId: gid,
      createdAt: { gte: since },
      OR: [
        ...(exact.length ? [{ action: { in: exact } }] : []),
        ...prefix.map((p) => ({ action: { startsWith: p } })),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: NOTIFICATION_LIMIT * 2,
    select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true },
  });
  // Nummern/Betreff der betroffenen Tickets und Bewerbungen nachladen (nur dieser Server)
  const ticketIds = rows
    .filter((r) => r.resourceType === 'Ticket' && r.resourceId)
    .map((r) => r.resourceId!);
  const subIds = rows
    .filter((r) => r.resourceType === 'ApplicationSubmission' && r.resourceId)
    .map((r) => r.resourceId!);
  const [tickets, subs] = await Promise.all([
    ticketIds.length
      ? prisma.ticket.findMany({
          where: { guildId: gid, id: { in: ticketIds } },
          select: { id: true, number: true, subject: true },
        })
      : [],
    subIds.length
      ? prisma.applicationSubmission.findMany({
          where: { guildId: gid, id: { in: subIds } },
          select: { id: true, submissionNumber: true, displayNameSnapshot: true },
        })
      : [],
  ]);
  const tMap = new Map(tickets.map((t) => [t.id, t]));
  const sMap = new Map(subs.map((s) => [s.id, s]));
  const out: NotificationItem[] = [];
  for (const r of rows) {
    const type = notificationTypeOf(r.action);
    if (!type || !allowed.includes(type)) continue;
    const meta = NOTIFICATION_TYPES[type];
    const t = r.resourceId ? tMap.get(r.resourceId) : undefined;
    const s = r.resourceId ? sMap.get(r.resourceId) : undefined;
    const text = t
      ? `#${t.number} ${t.subject}`
      : s
        ? `${s.submissionNumber ?? ''} ${s.displayNameSnapshot}`.trim()
        : type === 'settingsChanged'
          ? 'Einstellungen wurden geändert.'
          : type === 'teamChange'
            ? 'Die Personalakte oder Rolle eines Mitglieds wurde geändert.'
            : '';
    const path = t
      ? '/tickets'
      : s
        ? `/submissions/${s.id}`
        : type === 'teamChange'
          ? '/personnel'
          : type === 'settingsChanged'
            ? r.action.startsWith('design.')
              ? '/design'
              : '/logs'
            : '/';
    out.push({
      id: r.id,
      type,
      icon: meta.icon,
      title: meta.label,
      text: text.slice(0, 140),
      at: r.createdAt,
      path,
    });
    if (out.length >= NOTIFICATION_LIMIT) break;
  }
  return out;
}
