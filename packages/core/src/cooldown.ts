import type { Duration } from '@nexus/types';

/**
 * Cooldown-Logik (§51).
 *
 * Cooldowns werden serverseitig geprüft (§51) anhand der letzten relevanten
 * Submission des Users (Denial, Abbruch, Einreichung, Ablauf).
 */

export function durationToSeconds(duration: Duration | undefined): number {
  if (!duration) return 0;
  const days = duration.days ?? 0;
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;
  return days * 86400 + hours * 3600 + minutes * 60;
}

export function formatDuration(duration: Duration | undefined): string {
  const seconds = durationToSeconds(duration);
  if (seconds <= 0) return '0 Minuten';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} Tag${days === 1 ? '' : 'e'}`);
  if (hours > 0) parts.push(`${hours} Stunde${hours === 1 ? '' : 'n'}`);
  if (minutes > 0) parts.push(`${minutes} Minute${minutes === 1 ? '' : 'n'}`);
  return parts.join(' ');
}

export interface CooldownState {
  /** Verbleibende Sekunden (0 = abgelaufen). */
  remainingSeconds: number;
  /** Ende des Cooldowns als ISO-String. */
  endsAt: string;
  /** True, solange der User keine neue Bewerbung starten darf. */
  active: boolean;
}

export function checkCooldown(
  cooldown: Duration | undefined,
  lastEventAt: string | undefined,
  now: Date = new Date(),
): CooldownState {
  const totalSeconds = durationToSeconds(cooldown);
  if (totalSeconds <= 0 || !lastEventAt) {
    return { remainingSeconds: 0, endsAt: now.toISOString(), active: false };
  }

  const lastMs = Date.parse(lastEventAt);
  if (Number.isNaN(lastMs)) {
    return { remainingSeconds: 0, endsAt: now.toISOString(), active: false };
  }

  const endsAtMs = lastMs + totalSeconds * 1000;
  const remainingMs = endsAtMs - now.getTime();
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

  return {
    remainingSeconds,
    endsAt: new Date(endsAtMs).toISOString(),
    active: remainingMs > 0,
  };
}

/** Zeitlimit einer Bewerbung (§20): Ablaufzeitpunkt ab Start. */
export function computeExpiry(
  timeLimit: Duration | undefined,
  startedAt: string,
): string | undefined {
  const seconds = durationToSeconds(timeLimit);
  if (seconds <= 0) return undefined;
  return new Date(Date.parse(startedAt) + seconds * 1000).toISOString();
}
