import { prisma, type Prisma } from '@nexus/database';

/** Führt einen Job aus und protokolliert Lauf, Ergebnis und Fehler (`job_runs`); behält je Job die letzten 100 Läufe. */
export async function runJob<T>(name: string, fn: () => Promise<T>): Promise<{ ok: boolean; result?: T; error?: string }> {
  const run = await prisma.jobRun.create({ data: { name } });
  try {
    const result = await fn();
    await prisma.jobRun.update({ where: { id: run.id }, data: { ok: true, finishedAt: new Date(), summary: (result ?? {}) as Prisma.InputJsonValue } });
    return { ok: true, result };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 500) : 'Unbekannter Fehler';
    await prisma.jobRun.update({ where: { id: run.id }, data: { ok: false, finishedAt: new Date(), error } });
    return { ok: false, error };
  } finally {
    const old = await prisma.jobRun.findMany({ where: { name }, orderBy: { startedAt: 'desc' }, skip: 100, select: { id: true } });
    if (old.length) await prisma.jobRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

export interface JobDef {
  name: string;
  /** Millisekunden zwischen den Läufen. */
  everyMs: number;
  label: string;
}

/** Plan der Hintergrund-Jobs (Worker und Dashboard-Anzeige teilen sich diese Liste). */
export const JOBS: readonly JobDef[] = [
  { name: 'notifications', everyMs: 60_000, label: 'Benachrichtigungen senden' },
  { name: 'application-timeouts', everyMs: 10 * 60_000, label: 'Bewerbungs-Timeouts' },
  { name: 'reminders', everyMs: 15 * 60_000, label: 'Erinnerungen (Bewerbungen, Ausbildung, Abmeldung)' },
  { name: 'reports', everyMs: 10 * 60_000, label: 'Tages- und Wochenberichte' },
  { name: 'stat-snapshots', everyMs: 15 * 60_000, label: 'Statistiken und Leaderboards berechnen' },
  { name: 'discord-sync', everyMs: 30 * 60_000, label: 'Discord-Synchronisierung' },
  { name: 'ticket-cleanup', everyMs: 2 * 60_000, label: 'Geschlossene Ticket-Kanäle löschen, Panels aktualisieren' },
  { name: 'restriction-expiry', everyMs: 60_000, label: 'Abgelaufene Sperren beenden' },
  { name: 'wanted-expiry', everyMs: 60_000, label: 'Abgelaufene Fahndungen beenden' },
  { name: 'permission-expiry', everyMs: 5 * 60_000, label: 'Abgelaufene temporäre Rechte entfernen' },
  { name: 'moderation-expiry', everyMs: 5 * 60_000, label: 'Befristete Banns aufheben' },
  { name: 'scheduled-messages', everyMs: 60_000, label: 'Automatische Nachrichten senden' },
  { name: 'log-forward', everyMs: 30_000, label: 'Audit-Log in Discord-Kanäle weiterleiten' },
  { name: 'shift-watch', everyMs: 5 * 60_000, label: 'Zu lange Schichten melden' },
];
