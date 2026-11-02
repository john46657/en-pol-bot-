/**
 * Verwaltungsmodule (Erweiterungspaket 3.0): Schichtplanung, Kalender, Besprechungen, Ankündigungen, Dokumente,
 * zentrale Benachrichtigungen und Statistiken. Hier liegen nur Konstanten und reine Funktionen (ohne Datenbank),
 * damit API, Bot und Dashboard dieselben Regeln verwenden und sie einzeln getestet werden können.
 */

export const ORG_TIME_ZONE = 'Europe/Berlin';

// ───────────── Zeit & Zeitzonen ─────────────

/** Lokale Bestandteile eines Zeitpunkts in einer Zeitzone (Monat 1–12, Wochentag 1 = Montag … 7 = Sonntag). */
export function localParts(at: Date, timeZone = ORG_TIME_ZONE) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), wd: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday!) + 1 };
}

/**
 * Lokale Wanduhrzeit (y, m, d, h, min) in `timeZone` → UTC-Zeitpunkt. Berücksichtigt Sommer-/Winterzeit; Tagesüberlauf (d = 32) ist erlaubt.
 * Bei der übersprungenen Stunde (Umstellung im Frühjahr) wird die Zeit eine Stunde später genommen.
 */
export function zonedTime(y: number, m: number, d: number, h: number, min: number, timeZone = ORG_TIME_ZONE): Date {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess;
  for (let i = 0; i < 3; i++) {
    const l = localParts(new Date(t), timeZone);
    const shown = Date.UTC(l.y, l.m - 1, l.d, l.h, l.min);
    const next = t + (guess - shown);
    if (next === t) break;
    t = next;
  }
  return new Date(t);
}

/** Lokales Datum `YYYY-MM-DD` eines Zeitpunkts. */
export const localDate = (at: Date, timeZone = ORG_TIME_ZONE) => { const l = localParts(at, timeZone); return `${l.y}-${String(l.m).padStart(2, '0')}-${String(l.d).padStart(2, '0')}`; };

/** Überschneiden sich zwei Zeiträume [aStart, aEnd) und [bStart, bEnd)? Berührung an der Grenze zählt nicht. */
export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) => aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();

// ───────────── Wiederholungen ─────────────

export const RECURRENCE_FREQS = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];
export interface RecurrenceRule { freq: RecurrenceFreq; /** Anzahl Termine inklusive des ersten (1–52) */ count: number }
/** Höchstzahl Wiederholungen je Serie – schützt vor versehentlich riesigen Serien. */
export const MAX_OCCURRENCES = 52;

/**
 * Termine einer Serie. Die lokale Uhrzeit bleibt gleich (18:00 bleibt 18:00, auch über die Zeitumstellung);
 * die Dauer bleibt in Minuten gleich. Monatlich: gleicher Tag im Monat, fehlt er (31.), wird der Monat übersprungen.
 */
export function expandRecurrence(startsAt: Date, endsAt: Date, rule: RecurrenceRule, timeZone = ORG_TIME_ZONE): { startsAt: Date; endsAt: Date }[] {
  const count = Math.max(1, Math.min(MAX_OCCURRENCES, Math.floor(rule.count)));
  const dur = endsAt.getTime() - startsAt.getTime();
  const s = localParts(startsAt, timeZone);
  const out: { startsAt: Date; endsAt: Date }[] = [];
  for (let i = 0, guard = 0; out.length < count && guard < count * 3; i++, guard++) {
    let start: Date;
    if (rule.freq === 'MONTHLY') {
      const probe = new Date(Date.UTC(s.y, s.m - 1 + i, 1));
      const y = probe.getUTCFullYear(), m = probe.getUTCMonth() + 1;
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
      if (s.d > days) continue;
      start = zonedTime(y, m, s.d, s.h, s.min, timeZone);
    } else {
      const step = rule.freq === 'DAILY' ? 1 : rule.freq === 'WEEKLY' ? 7 : 14;
      start = zonedTime(s.y, s.m, s.d + i * step, s.h, s.min, timeZone);
    }
    out.push({ startsAt: start, endsAt: new Date(start.getTime() + dur) });
  }
  return out;
}

// ───────────── Schichtplanung ─────────────

export const PLANNED_SHIFT_STATUSES = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'] as const;
export type PlannedShiftStatus = (typeof PLANNED_SHIFT_STATUSES)[number];
export const PLANNED_SHIFT_STATUS_LABEL: Record<PlannedShiftStatus, string> = { DRAFT: 'Entwurf', PUBLISHED: 'Veröffentlicht', CANCELLED: 'Abgesagt', COMPLETED: 'Abgeschlossen' };

/** Besetzungsstand einer Schicht. */
export function coverage(assigned: number, min: number, max: number | null) {
  const state = assigned < min ? 'UNDER' : max !== null && assigned >= max ? 'FULL' : 'OK';
  return { assigned, min, max, state: state as 'UNDER' | 'OK' | 'FULL', missing: Math.max(0, min - assigned), free: max === null ? null : Math.max(0, max - assigned) };
}

/**
 * Abgleich Leitstelle: geplante Besetzung ↔ tatsächlicher Dienststatus. Abwesende (genehmigte Abmeldung) erscheinen
 * getrennt – ohne Grund. Jede Person landet genau in einer Gruppe.
 */
export function compareStaffing(planned: readonly string[], onDuty: readonly string[], absent: readonly string[] = []) {
  const p = new Set(planned), d = new Set(onDuty), a = new Set(absent);
  return {
    plannedPresent: [...p].filter((u) => d.has(u)),
    plannedMissing: [...p].filter((u) => !d.has(u) && !a.has(u)),
    plannedAbsent: [...p].filter((u) => !d.has(u) && a.has(u)),
    unplannedPresent: [...d].filter((u) => !p.has(u)),
  };
}

// ───────────── Kalender & Besprechungen ─────────────

export const EVENT_CATEGORIES = ['MEETING', 'TRAINING', 'EXAM', 'SHIFT', 'EVENT', 'INTERNAL', 'DEADLINE'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = { MEETING: 'Dienstbesprechung', TRAINING: 'Ausbildung', EXAM: 'Prüfung', SHIFT: 'Schicht', EVENT: 'Veranstaltung', INTERNAL: 'Interner Termin', DEADLINE: 'Frist' };
export const EVENT_STATUSES = ['SCHEDULED', 'CANCELLED', 'DONE'] as const;
/** Teilnahme: INVITED (zugewiesen), ACCEPTED (zugesagt), DECLINED (abgesagt), EXCUSED (Abwesenheit gemeldet); nach dem Termin ATTENDED/ABSENT. */
export const PARTICIPANT_STATUSES = ['INVITED', 'ACCEPTED', 'DECLINED', 'EXCUSED', 'ATTENDED', 'ABSENT'] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export const PARTICIPANT_STATUS_LABEL: Record<ParticipantStatus, string> = { INVITED: 'Eingeladen', ACCEPTED: 'Zugesagt', DECLINED: 'Abgesagt', EXCUSED: 'Abwesenheit gemeldet', ATTENDED: 'Anwesend', ABSENT: 'Nicht erschienen' };
/** Erlaubte Erinnerungszeitpunkte in Minuten vor Beginn. */
export const REMINDER_CHOICES = [10, 15, 30, 60, 120, 1440, 2880, 10080] as const;
export const MEETING_TASK_STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;

/**
 * Welche Erinnerungen sind jetzt fällig? `sent` = bereits verschickte Vorlaufzeiten. Eine Erinnerung, die beim Neustart
 * verpasst wurde, kommt noch, solange der Termin nicht begonnen hat – aber nur die jeweils kürzeste (keine Flut).
 */
export function dueReminders(startsAt: Date, minutesBefore: readonly number[], sent: readonly number[], now = new Date()): number[] {
  if (startsAt.getTime() <= now.getTime()) return [];
  const due = [...new Set(minutesBefore)].filter((m) => !sent.includes(m) && startsAt.getTime() - m * 60_000 <= now.getTime()).sort((a, b) => a - b);
  return due.length ? [due[0]!] : [];
}
/** Alle fälligen (inkl. übersprungener längerer) – zum Markieren als erledigt, damit sie nicht später noch einzeln kommen. */
export const passedReminders = (startsAt: Date, minutesBefore: readonly number[], sent: readonly number[], now = new Date()) =>
  [...new Set(minutesBefore)].filter((m) => !sent.includes(m) && startsAt.getTime() - m * 60_000 <= now.getTime());

/** Darf sich jemand (noch) an-/abmelden? */
export function canRespond(e: { status: string; startsAt: Date; maxParticipants: number | null }, accepted: number, already: boolean, now = new Date()): string | null {
  if (e.status !== 'SCHEDULED') return 'Der Termin findet nicht (mehr) statt.';
  if (e.startsAt.getTime() <= now.getTime()) return 'Der Termin hat schon begonnen.';
  if (!already && e.maxParticipants !== null && accepted >= e.maxParticipants) return 'Alle Plätze sind vergeben.';
  return null;
}

// ───────────── Ankündigungen ─────────────

export const ANNOUNCEMENT_TYPES = ['GENERAL', 'DIRECTIVE', 'TRAINING', 'MEETING', 'MAINTENANCE', 'SYSTEM'] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];
export const ANNOUNCEMENT_TYPE_INFO: Record<AnnouncementType, { label: string; color: string; emoji: string }> = {
  GENERAL: { label: 'Allgemeine Information', color: '#3b82f6', emoji: 'ℹ️' },
  DIRECTIVE: { label: 'Dienstanweisung', color: '#f59e0b', emoji: '📜' },
  TRAINING: { label: 'Ausbildung', color: '#22c55e', emoji: '🎓' },
  MEETING: { label: 'Besprechung', color: '#8b5cf6', emoji: '🗓️' },
  MAINTENANCE: { label: 'Wartung', color: '#64748b', emoji: '🛠️' },
  SYSTEM: { label: 'Wichtige Systemmeldung', color: '#ef4444', emoji: '⚠️' },
};
export const ANNOUNCEMENT_STATUSES = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'RETRACTED', 'FAILED'] as const;
export const ANNOUNCEMENT_RECURRENCE = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'] as const;
/** Höchstens so viele Rollen dürfen in einer Ankündigung erwähnt (gepingt) werden. @everyone/@here sind nie möglich. */
export const MAX_MENTION_ROLES = 3;

export interface AnnouncementContent {
  title: string; description: string; color?: string | null; imageUrl?: string | null; thumbnailUrl?: string | null; footer?: string | null; timestamp?: boolean;
  fields?: { name: string; value: string; inline?: boolean }[]; links?: { label: string; url: string }[];
}

/**
 * Discord-Nachricht einer Ankündigung (gleiches Format wie der Embed Builder/`message.post`). Erwähnt werden nur
 * die ausdrücklich gewählten Rollen (höchstens `MAX_MENTION_ROLES`), nie @everyone/@here – Text wird entschärft.
 */
export function announcementMessage(type: AnnouncementType, c: AnnouncementContent, mentionRoleIds: readonly string[] = [], opts: { retracted?: boolean } = {}) {
  const info = ANNOUNCEMENT_TYPE_INFO[type];
  const safe = (t: string) => t.replace(/@(everyone|here)/gi, '@​$1');
  const roles = [...new Set(mentionRoleIds)].filter((r) => /^\d{15,25}$/.test(r)).slice(0, MAX_MENTION_ROLES);
  const color = parseInt((c.color && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : opts.retracted ? '#64748b' : info.color).slice(1), 16);
  const httpsOnly = (u?: string | null) => (u && /^https:\/\//i.test(u) ? u : undefined);
  return {
    ...(roles.length && !opts.retracted ? { content: roles.map((r) => `<@&${r}>`).join(' '), mentionRoles: roles } : {}),
    embeds: [{
      title: `${opts.retracted ? '↩️ Zurückgezogen: ' : `${info.emoji} `}${safe(c.title)}`.slice(0, 256),
      description: (opts.retracted ? '~~Diese Ankündigung wurde zurückgezogen.~~' : safe(c.description)).slice(0, 4000) || '​',
      color,
      ...(opts.retracted ? {} : {
        ...(httpsOnly(c.imageUrl) ? { image: httpsOnly(c.imageUrl) } : {}),
        ...(httpsOnly(c.thumbnailUrl) ? { thumbnail: httpsOnly(c.thumbnailUrl) } : {}),
        ...(c.fields?.length ? { fields: c.fields.slice(0, 25).map((f) => ({ name: safe(f.name).slice(0, 256) || '​', value: safe(f.value).slice(0, 1024) || '​', inline: !!f.inline })) } : {}),
      }),
      footer: (c.footer ? safe(c.footer) : info.label).slice(0, 2048),
      ...(c.timestamp !== false ? { timestamp: new Date().toISOString() } : {}),
    }],
    ...(!opts.retracted && c.links?.length ? { buttons: c.links.filter((l) => httpsOnly(l.url)).slice(0, 5).map((l, i) => ({ id: `link-${i}`, label: l.label.slice(0, 80), style: 'secondary' as const, url: l.url })) } : {}),
  };
}

/** Nächster Termin einer wiederkehrenden Ankündigung (gleiche lokale Uhrzeit). */
export function nextRecurrence(from: Date, recurrence: (typeof ANNOUNCEMENT_RECURRENCE)[number], timeZone = ORG_TIME_ZONE): Date | null {
  if (recurrence === 'NONE') return null;
  const freq = recurrence === 'DAILY' ? 'DAILY' : recurrence === 'WEEKLY' ? 'WEEKLY' : 'MONTHLY';
  return expandRecurrence(from, from, { freq, count: 2 }, timeZone)[1]?.startsAt ?? null;
}

// ───────────── Dokumente ─────────────

export const DOCUMENT_CATEGORIES = ['DIRECTIVE', 'RULES', 'TRAINING', 'EXAM', 'DISPATCH', 'POLICY', 'TEMPLATE', 'OTHER'] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = { DIRECTIVE: 'Dienstanweisung', RULES: 'Regelwerk', TRAINING: 'Ausbildungsunterlage', EXAM: 'Prüfungsunterlage', DISPATCH: 'Leitstelleninformation', POLICY: 'Interne Richtlinie', TEMPLATE: 'Vorlage', OTHER: 'Sonstiges' };
/** Zugriffsgruppe: ALL = alle mit documents.view, ROLES = nur bestimmte Rollen (+ Verwalter), CONFIDENTIAL = nur documents.confidential. */
export const DOCUMENT_ACCESS = ['ALL', 'ROLES', 'CONFIDENTIAL'] as const;
export type DocumentAccess = (typeof DOCUMENT_ACCESS)[number];
/** Erlaubte Dateitypen für Dokumente (Inhalt wird zusätzlich per Signatur geprüft und nie ausgeführt). */
export const DOCUMENT_MIME_TYPES = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp'] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Darf jemand ein Dokument sehen? `manage` = documents.manage, `confidential` = documents.confidential. */
export function canSeeDocument(d: { access: string; roleIds: readonly string[]; status: string }, u: { view: boolean; manage: boolean; confidential: boolean; roleIds: readonly string[] }) {
  if (!u.view && !u.manage) return false;
  if (d.status === 'ARCHIVED' && !u.manage) return false;
  if (d.access === 'CONFIDENTIAL') return u.confidential;
  if (d.access === 'ROLES') return u.manage || u.confidential || d.roleIds.some((r) => u.roleIds.includes(r));
  return true;
}

// ───────────── Zentrale Benachrichtigungen ─────────────

export type NotificationChannel = 'dashboard' | 'discord' | 'mdt' | 'cad';
export interface NotificationEventDef { key: string; label: string; group: string; /** Wichtig = auch im MDT/in der Leitstelle sichtbar */ important?: boolean; channels: NotificationChannel[]; /** Darf Discord-DM bekommen (sofern der Benutzer zustimmt) */ dm?: boolean }

/** Ereigniskatalog: einheitliche Schlüssel für alle vier Anwendungen. */
export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = [
  { key: 'application.new', label: 'Neue Bewerbung', group: 'Bewerbungen', channels: ['dashboard'] },
  { key: 'application.check.done', label: 'KI-Check abgeschlossen', group: 'Bewerbungen', channels: ['dashboard'] },
  { key: 'application.check.failed', label: 'KI-Check fehlgeschlagen', group: 'Bewerbungen', channels: ['dashboard'] },
  { key: 'ticket.new', label: 'Neues Ticket', group: 'Tickets', channels: ['dashboard'] },
  { key: 'ticket.assigned', label: 'Ticket zugewiesen', group: 'Tickets', channels: ['dashboard'], dm: true },
  { key: 'ticket.closed', label: 'Ticket geschlossen', group: 'Tickets', channels: ['dashboard'] },
  { key: 'shift.new', label: 'Neue Schicht', group: 'Schichtplanung', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'shift.changed', label: 'Schichtänderung', group: 'Schichtplanung', important: true, channels: ['dashboard', 'mdt', 'cad'], dm: true },
  { key: 'leave.requested', label: 'Urlaubsantrag', group: 'Abwesenheit', channels: ['dashboard'] },
  { key: 'leave.approved', label: 'Genehmigte Abwesenheit', group: 'Abwesenheit', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'leave.decided', label: 'Entscheidung über Abwesenheit', group: 'Abwesenheit', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'promotion.requested', label: 'Beförderungsantrag', group: 'Personal', channels: ['dashboard'] },
  { key: 'transfer.requested', label: 'Versetzungsantrag', group: 'Personal', channels: ['dashboard'] },
  { key: 'hr.request.query', label: 'Rückfrage zu deinem Antrag', group: 'Personal', important: true, channels: ['dashboard', 'mdt'], dm: true },
  { key: 'hr.request.decided', label: 'Entscheidung über deinen Antrag', group: 'Personal', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'calendar.new', label: 'Neuer Termin', group: 'Kalender', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'calendar.changed', label: 'Terminänderung', group: 'Kalender', important: true, channels: ['dashboard', 'mdt', 'cad'], dm: true },
  { key: 'calendar.reminder', label: 'Terminerinnerung', group: 'Kalender', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'meeting.reminder', label: 'Besprechungserinnerung', group: 'Besprechungen', important: true, channels: ['dashboard', 'mdt', 'cad'], dm: true },
  { key: 'meeting.task', label: 'Aufgabe aus Besprechung', group: 'Besprechungen', channels: ['dashboard', 'mdt'], dm: true },
  { key: 'announcement.new', label: 'Neue Ankündigung', group: 'Ankündigungen', channels: ['dashboard', 'mdt', 'cad'] },
  { key: 'document.new', label: 'Neues Dokument', group: 'Dokumente', channels: ['dashboard', 'mdt'] },
  { key: 'system.error', label: 'Systemfehler', group: 'System', important: true, channels: ['dashboard', 'cad'] },
  { key: 'backup.failed', label: 'Backup fehlgeschlagen', group: 'System', important: true, channels: ['dashboard'] },
  { key: 'connection.problem', label: 'Verbindungsproblem', group: 'System', important: true, channels: ['dashboard', 'cad'] },
];
export const notificationEvent = (key: string) => NOTIFICATION_EVENTS.find((e) => e.key === key);

/** Persönliche Einstellungen (UserSettings.preferences.notifications). Fehlende Werte = Standard. */
export interface NotificationPrefs { muted?: string[]; important?: string[]; dm?: boolean; dmEvents?: string[]; reminders?: boolean }

/**
 * Zustellung je Empfänger: Dashboard (gespeichert, außer stummgeschaltet), DM nur mit Zustimmung (`dm: true`) und nur
 * für DM-fähige Ereignisse; `dmEvents` schränkt weiter ein. Erinnerungen lassen sich insgesamt abschalten.
 */
export function deliveryFor(eventKey: string, prefs: NotificationPrefs | null | undefined) {
  const def = notificationEvent(eventKey);
  const p = prefs ?? {};
  const isReminder = eventKey.endsWith('.reminder');
  if (isReminder && p.reminders === false) return { store: false, dm: false, important: false };
  const muted = (p.muted ?? []).includes(eventKey);
  const important = !!def?.important || (p.important ?? []).includes(eventKey);
  const dm = !!def?.dm && p.dm === true && (!p.dmEvents?.length || p.dmEvents.includes(eventKey)) && !muted;
  return { store: !muted, dm, important };
}

// ───────────── Statistiken & Ranglisten ─────────────

export const STAT_PERIODS = ['today', 'week', 'month', 'year', 'custom'] as const;
export type StatPeriod = (typeof STAT_PERIODS)[number];

/** Zeitraum (lokale Tage) → [from, to). Woche beginnt Montag. `custom`: from/to als YYYY-MM-DD (to inklusive). */
export function periodRange(period: StatPeriod, now = new Date(), custom?: { from?: string; to?: string }, timeZone = ORG_TIME_ZONE): { from: Date; to: Date } {
  const l = localParts(now, timeZone);
  if (period === 'custom') {
    const parse = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').map(Number) as [number, number, number] : null);
    const f = parse(custom?.from), t = parse(custom?.to);
    if (!f || !t) throw new Error('Zeitraum: Beginn und Ende angeben (JJJJ-MM-TT).');
    const from = zonedTime(f[0], f[1], f[2], 0, 0, timeZone), to = zonedTime(t[0], t[1], t[2] + 1, 0, 0, timeZone);
    if (to.getTime() <= from.getTime()) throw new Error('Zeitraum: Das Ende muss nach dem Beginn liegen.');
    if (to.getTime() - from.getTime() > 400 * 86_400_000) throw new Error('Zeitraum: höchstens ein Jahr.');
    return { from, to };
  }
  if (period === 'today') return { from: zonedTime(l.y, l.m, l.d, 0, 0, timeZone), to: zonedTime(l.y, l.m, l.d + 1, 0, 0, timeZone) };
  if (period === 'week') return { from: zonedTime(l.y, l.m, l.d - (l.wd - 1), 0, 0, timeZone), to: zonedTime(l.y, l.m, l.d - (l.wd - 1) + 7, 0, 0, timeZone) };
  if (period === 'month') return { from: zonedTime(l.y, l.m, 1, 0, 0, timeZone), to: zonedTime(l.y, l.m + 1, 1, 0, 0, timeZone) };
  return { from: zonedTime(l.y, 1, 1, 0, 0, timeZone), to: zonedTime(l.y + 1, 1, 1, 0, 0, timeZone) };
}

/** Minuten einer Sitzung innerhalb [from, to) (laufende Sitzungen bis `now`). */
export function minutesWithin(startedAt: Date, endedAt: Date | null, from: Date, to: Date, now = new Date()) {
  const s = Math.max(startedAt.getTime(), from.getTime()), e = Math.min((endedAt ?? now).getTime(), to.getTime());
  return e > s ? (e - s) / 60_000 : 0;
}

/**
 * Ranglisten-Kennzahlen: nur Zählwerte aus gespeicherten Daten, keine Bewertung von Qualität oder Leistung.
 * `perm`: zusätzlich nötiges Fachrecht, damit sensible Bereiche nicht über die Rangliste sichtbar werden.
 */
export const LEADERBOARD_METRICS = [
  { key: 'dutyMinutes', label: 'Dienstzeit', unit: 'Minuten' },
  { key: 'trainings', label: 'Abgeschlossene Ausbildungen', unit: 'Ausbildungen' },
  { key: 'dutyReports', label: 'Dienstberichte', unit: 'Berichte' },
  { key: 'tickets', label: 'Ticketbearbeitungen', unit: 'Tickets' },
  { key: 'meetings', label: 'Besprechungsteilnahmen', unit: 'Teilnahmen' },
] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number]['key'];

/** Rangliste mit gleichen Plätzen bei Gleichstand (1, 2, 2, 4). Nullwerte erscheinen nicht. */
export function rankRows<T extends { value: number }>(rows: readonly T[], limit = 25): (T & { place: number })[] {
  const sorted = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const out: (T & { place: number })[] = [];
  sorted.forEach((r, i) => { out.push({ ...r, place: i > 0 && sorted[i - 1]!.value === r.value ? out[i - 1]!.place : i + 1 }); });
  return out.slice(0, limit);
}

/** CSV mit Semikolon (Excel, deutsch); Formeln werden entschärft (CSV-Injection). */
export function toCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const cell = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}
