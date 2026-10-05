import type { Duration, Requirements } from '@nexus/types';
import { durationToSeconds } from './cooldown.js';

/**
 * Voraussetzungen einer Bewerbungsart (Team-Chance) prüfen – reine Logik. Der Aufrufer liefert den Zustand (Rollen,
 * Beitritt, frühere Bewerbungen, Personalakte, Dienststunden); das Ergebnis nennt jede verfehlte Voraussetzung einzeln.
 * Geprüft wird jede gesetzte Angabe (das alte Feld `enabled` spielt keine Rolle mehr).
 */
export interface RequirementContext {
  now: Date;
  userId: string;
  memberRoleIds: readonly string[];
  /** Beitritt zum Server (unbekannt = Mitgliedsdauer nicht prüfbar → gilt als nicht erfüllt). */
  joinedAt?: Date | undefined;
  /** Letzte eingereichte Bewerbung dieser Art. */
  lastSubmittedAt?: Date | undefined;
  /** Letzte Ablehnung dieser Art. */
  lastDeniedAt?: Date | undefined;
  /** Eingereichte Bewerbungen dieser Art (alle Ergebnisse). */
  submittedCount: number;
  /** Offene Bewerbungen dieser Art insgesamt (alle Bewerber). */
  openCount: number;
  /** Bewerbungsarten, bei denen die Person angenommen wurde. */
  acceptedApplicationIds: ReadonlySet<string>;
  /** Personalakte (falls vorhanden und nicht archiviert). */
  personnel?: { rankId: string | null; teamId: string | null } | null | undefined;
  /** Dienststunden im Zeitraum `dutyWindowDays`. */
  dutyHours?: number | undefined;
  /** Namen für verständliche Meldungen. */
  names?: { roles?: Record<string, string>; applications?: Record<string, string>; ranks?: Record<string, string>; teams?: Record<string, string> } | undefined;
}

export interface RequirementResult {
  ok: boolean;
  /** Verständliche Gründe (je verfehlter Voraussetzung einer). */
  reasons: string[];
  /** Frühester Zeitpunkt, ab dem eine Wartezeit endet (falls eine Wartezeit der Grund ist). */
  waitUntil?: Date | undefined;
}

const DISCORD_EPOCH = 1_420_070_400_000n;
/** Erstellungszeitpunkt eines Discord-Kontos aus seiner ID (Snowflake). */
export function snowflakeDate(id: string): Date | null {
  if (!/^\d{5,25}$/.test(id)) return null;
  return new Date(Number((BigInt(id) >> 22n) + DISCORD_EPOCH));
}

const DAY = 86_400_000;
const fmt = (d: Date) => d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
const name = (map: Record<string, string> | undefined, id: string) => map?.[id] ?? id;
const until = (from: Date | undefined, d: Duration | undefined): Date | null => {
  const s = durationToSeconds(d);
  return from && s > 0 ? new Date(from.getTime() + s * 1000) : null;
};

export function checkRequirements(req: Requirements | undefined | null, ctx: RequirementContext): RequirementResult {
  const r = req ?? {};
  const reasons: string[] = [];
  let waitUntil: Date | undefined;
  const wait = (end: Date | null, text: (d: string) => string) => {
    if (end && end > ctx.now) {
      reasons.push(text(fmt(end)));
      if (!waitUntil || end > waitUntil) waitUntil = end;
    }
  };
  wait(until(ctx.lastSubmittedAt, r.cooldown), (d) => `Du kannst dich erst ab ${d} Uhr erneut bewerben (Wartezeit zwischen zwei Bewerbungen).`);
  wait(until(ctx.lastDeniedAt, r.denyCooldown), (d) => `Nach deiner letzten Ablehnung kannst du dich erst ab ${d} Uhr erneut bewerben.`);

  const missing = (r.requiredRoleIds ?? []).filter((id) => !ctx.memberRoleIds.includes(id));
  if (missing.length) reasons.push(`Dir fehlt die Rolle ${missing.map((id) => `„${name(ctx.names?.roles, id)}“`).join(', ')}.`);
  const forbidden = (r.restrictedRoleIds ?? []).filter((id) => ctx.memberRoleIds.includes(id));
  if (forbidden.length) reasons.push(`Mit der Rolle ${forbidden.map((id) => `„${name(ctx.names?.roles, id)}“`).join(', ')} ist diese Bewerbung nicht möglich.`);

  if (r.minAccountAgeDays) {
    const created = snowflakeDate(ctx.userId);
    if (!created || ctx.now.getTime() - created.getTime() < r.minAccountAgeDays * DAY) reasons.push(`Dein Discord-Konto muss mindestens ${r.minAccountAgeDays} Tage alt sein.`);
  }
  if (r.minGuildMembershipDays) {
    if (!ctx.joinedAt || ctx.now.getTime() - ctx.joinedAt.getTime() < r.minGuildMembershipDays * DAY) reasons.push(`Du musst mindestens ${r.minGuildMembershipDays} Tage auf dem Server sein.`);
  }

  const notYet = (r.requirePreviousApproval ?? []).filter((id) => !ctx.acceptedApplicationIds.has(id));
  if (notYet.length) reasons.push(`Zuerst muss deine Bewerbung ${notYet.map((id) => `„${name(ctx.names?.applications, id)}“`).join(', ')} angenommen sein.`);
  const already = (r.forbidPreviousApproval ?? []).filter((id) => ctx.acceptedApplicationIds.has(id));
  if (already.length) reasons.push(`Nach einer Annahme bei ${already.map((id) => `„${name(ctx.names?.applications, id)}“`).join(', ')} ist diese Bewerbung nicht möglich.`);

  if (r.maxSubmissionsPerUser && ctx.submittedCount >= r.maxSubmissionsPerUser)
    reasons.push(`Du hast die Höchstzahl von ${r.maxSubmissionsPerUser} Bewerbung${r.maxSubmissionsPerUser === 1 ? '' : 'en'} für diese Art erreicht.`);
  if (r.maxOpenSubmissions && ctx.openCount >= r.maxOpenSubmissions) reasons.push('Derzeit sind alle Plätze belegt – bitte versuche es später erneut.');

  const ranks = r.requiredRankIds ?? [];
  const teams = r.requiredTeamIds ?? [];
  if (ranks.length || teams.length) {
    const p = ctx.personnel;
    if (!p) reasons.push('Dafür brauchst du eine Personalakte.');
    else {
      if (ranks.length && !(p.rankId && ranks.includes(p.rankId))) reasons.push(`Nötig ist der Dienstgrad ${ranks.map((id) => `„${name(ctx.names?.ranks, id)}“`).join(' oder ')}.`);
      if (teams.length && !(p.teamId && teams.includes(p.teamId))) reasons.push(`Nötig ist die Zugehörigkeit zu ${teams.map((id) => `„${name(ctx.names?.teams, id)}“`).join(' oder ')}.`);
    }
  }
  if (r.minDutyHours && (ctx.dutyHours ?? 0) < r.minDutyHours) {
    const days = r.dutyWindowDays ?? 30;
    reasons.push(`Nötig sind mindestens ${r.minDutyHours} Dienststunden in den letzten ${days} Tagen (bisher ${Math.floor((ctx.dutyHours ?? 0) * 10) / 10}).`);
  }
  return { ok: reasons.length === 0, reasons, ...(waitUntil ? { waitUntil } : {}) };
}

/** Meldung an den Bewerber: eigener Hinweis (oder Standard) und darunter die Gründe. */
export function requirementMessage(result: RequirementResult, failMessage?: string | undefined): string {
  const head = failMessage?.trim() || '❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Bewerbung.';
  return [head, ...result.reasons.map((x) => `• ${x}`)].join('\n');
}
