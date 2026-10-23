/** Standard-Zeitzone, wenn nichts eingestellt ist (Berichte, Transkripte, Wochen-Reset). */
export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

/** Gültige IANA-Zeitzone (z. B. „Europe/Berlin“)? Ungültige Werte würden Datumsanzeigen abstürzen lassen. */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

/** Alle Zeitzonen der Laufzeit (für Auswahllisten); häufige zuerst, UTC immer enthalten. */
export function timeZones(): string[] {
  const common = ['Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/London', 'UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];
  let all: string[] = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch { /* ältere Laufzeit: nur die häufigen */ }
  return [...new Set([...common, ...all])];
}
