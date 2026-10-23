/**
 * Persönliche Erinnerungen (`/remind-me in what dm`): Zeitangabe prüfen, DM-Option als Wahrheitswert auswerten,
 * Verschieben um 10 Minuten, 30 Minuten, 1 Stunde oder 1 Tag. Gemeinsam für Bot und API.
 */
export const REMINDER_MIN_MS = 60_000;
export const REMINDER_MAX_MS = 365 * 86_400_000;
export const REMINDER_TEXT_MAX = 1000;
/** offene Erinnerungen je Person */
export const REMINDER_MAX_PENDING = 25;
/** Buttons unter einer ausgelösten Erinnerung (Minuten) */
export const REMINDER_SNOOZE = [
  { minutes: 10, label: '10 Minuten' },
  { minutes: 30, label: '30 Minuten' },
  { minutes: 60, label: '1 Stunde' },
  { minutes: 1440, label: '1 Tag' },
] as const;
export const REMINDER_SNOOZE_MINUTES: readonly number[] = REMINDER_SNOOZE.map((s) => s.minutes);

const UNITS: [RegExp, number][] = [
  [/^(d|t|tag|tage|tagen|day|days)$/, 86_400_000],
  [/^(w|wo|woche|wochen|week|weeks)$/, 7 * 86_400_000],
  [/^(h|std|stde|stdn|stunde|stunden|hr|hrs|hour|hours)$/, 3_600_000],
  [/^(m|min|mins|minute|minuten|minutes)$/, 60_000],
];

/**
 * Zeitangabe wie „10m“, „30 min“, „1h“, „1 Stunde 30 Minuten“, „1h30m“, „1,5 h“, „2 Tage“ oder nur „45“ (= Minuten).
 * Mindestens 1 Minute, höchstens 365 Tage. Unbekannte Teile werden abgelehnt statt still ignoriert.
 */
export function parseReminderDuration(input: unknown): { ok: true; ms: number } | { ok: false; error: string } {
  const raw = String(input ?? '').trim().toLowerCase();
  const hint = 'Beispiele: `10m`, `30 min`, `1h`, `1h30m`, `2 Tage`.';
  if (!raw) return { ok: false, error: `Bitte angeben, in wie viel Zeit ich dich erinnern soll. ${hint}` };
  const cleaned = raw.replace(/\b(und|and|in)\b/g, ' ').replace(/[+,](?!\d)/g, ' ');
  // bloße Zahl = Minuten
  if (/^\d+$/.test(cleaned.trim())) return check(Number(cleaned.trim()) * 60_000, hint);
  const re = /(\d+(?:[.,]\d+)?)\s*([a-zäöü]+)/g;
  let total = 0, matched = false, rest = cleaned, m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) {
    const n = Number(m[1]!.replace(',', '.'));
    const unit = UNITS.find(([u]) => u.test(m![2]!));
    if (!unit || !Number.isFinite(n)) return { ok: false, error: `„${m[2]}“ verstehe ich nicht als Zeiteinheit. ${hint}` };
    total += n * unit[1];
    matched = true;
    rest = rest.replace(m[0], ' ');
  }
  if (rest.trim() || !matched) return { ok: false, error: `„${String(input).slice(0, 30)}“ ist keine gültige Zeitangabe. ${hint}` };
  return check(Math.round(total), hint);
}
function check(ms: number, hint: string): { ok: true; ms: number } | { ok: false; error: string } {
  if (ms < REMINDER_MIN_MS) return { ok: false, error: `Die Zeit muss mindestens 1 Minute betragen. ${hint}` };
  if (ms > REMINDER_MAX_MS) return { ok: false, error: 'Höchstens 365 Tage im Voraus.' };
  return { ok: true, ms };
}

/**
 * DM-Option als Wahrheitswert: Discord liefert `true`/`false`; zusätzlich werden Texte wie „True“, „False“, „ja“, „nein“,
 * „1“, „0“ akzeptiert (z. B. aus älteren Befehlsversionen oder Weiterleitungen). Leer/unbekannt → Standard.
 */
export function parseBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v ?? '').trim().toLowerCase();
  if (['true', 'ja', 'yes', 'y', 'j', '1', 'an', 'on', 'wahr'].includes(s)) return true;
  if (['false', 'nein', 'no', 'n', '0', 'aus', 'off', 'falsch'].includes(s)) return false;
  return fallback;
}

/** „1 Tag 2 Stunden“, „30 Minuten“ – für Bestätigungen. */
export function formatReminderDuration(ms: number): string {
  let m = Math.round(ms / 60_000);
  const d = Math.floor(m / 1440); m -= d * 1440;
  const h = Math.floor(m / 60); m -= h * 60;
  const parts = [d && `${d} ${d === 1 ? 'Tag' : 'Tage'}`, h && `${h} ${h === 1 ? 'Stunde' : 'Stunden'}`, m && `${m} ${m === 1 ? 'Minute' : 'Minuten'}`].filter(Boolean);
  return parts.join(' ') || '0 Minuten';
}
