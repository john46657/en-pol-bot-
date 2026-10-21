/**
 * Personalbedarfs- und Aktivitätsprognose: einfache, nachvollziehbare Statistik auf den gespeicherten Daten.
 * Alle Ergebnisse sind Schätzungen. Fehlende Daten werden nie aufgefüllt, kleine Stichproben werden ausdrücklich gekennzeichnet.
 */
import { WEEK_TIMEZONE } from './duty-week';

export interface Span { start: Date; end: Date }
export type Confidence = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export const CONFIDENCE_LABEL: Record<Confidence, string> = { NONE: 'keine Daten', LOW: 'gering (kleine Stichprobe)', MEDIUM: 'mittel', HIGH: 'hoch' };

/** Aussagekraft nach Anzahl Wochen mit Daten und Anzahl Einzelwerte. */
export function confidenceFor(weeksWithData: number, samples: number): { level: Confidence; reason: string } {
  if (weeksWithData === 0 || samples === 0) return { level: 'NONE', reason: 'Im gewählten Zeitraum liegen keine Daten vor.' };
  if (weeksWithData < 3 || samples < 20) return { level: 'LOW', reason: `Nur ${weeksWithData} Woche(n) bzw. ${samples} Datensätze – Ergebnisse sind sehr unsicher.` };
  if (weeksWithData < 6 || samples < 100) return { level: 'MEDIUM', reason: `${weeksWithData} Wochen bzw. ${samples} Datensätze – Tendenzen erkennbar, Einzelwerte unsicher.` };
  return { level: 'HIGH', reason: `${weeksWithData} Wochen bzw. ${samples} Datensätze.` };
}

const parts = (d: Date, timeZone: string) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.find((x) => x.type === 'weekday')!.value);
  return { weekday: wd, hour: Number(p.find((x) => x.type === 'hour')!.value) };
};

/**
 * Durchschnittliche Besetzung je Wochentag (0 = Montag) und Stunde (lokale Zeit): Summe der Dienstminuten in diesem
 * Zeitfenster ÷ (60 × Anzahl dieser Wochentag-Stunden im Zeitraum). `samples` = Anzahl der Stunden-Fenster im Zeitraum.
 */
export function staffingHeatmap(spans: Span[], from: Date, to: Date, timeZone = WEEK_TIMEZONE) {
  const minutes = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const slots = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const H = 3_600_000;
  const first = Math.ceil(from.getTime() / H) * H;
  for (let t = first; t + H <= to.getTime(); t += H) { const { weekday, hour } = parts(new Date(t), timeZone); slots[weekday]![hour]!++; }
  for (const s of spans) {
    const a = Math.max(s.start.getTime(), from.getTime()), b = Math.min(s.end.getTime(), to.getTime());
    for (let t = Math.floor(a / H) * H; t < b; t += H) {
      const overlap = Math.min(b, t + H) - Math.max(a, t);
      if (overlap <= 0) continue;
      const { weekday, hour } = parts(new Date(t), timeZone);
      minutes[weekday]![hour]! += overlap / 60_000;
    }
  }
  const avg = minutes.map((row, d) => row.map((m, h) => (slots[d]![h]! ? Math.round((m / 60 / slots[d]![h]!) * 100) / 100 : null)));
  return { avg, slots };
}

/** Lineare Regression über gleichmäßig verteilte Werte (Index = Zeit). */
export function linearTrend(values: number[]): { slope: number; intercept: number; r2: number } | null {
  const n = values.length;
  if (n < 2) return null;
  const mx = (n - 1) / 2, my = values.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  values.forEach((y, x) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; });
  const slope = sxx ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const r2 = syy ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, intercept, r2 };
}

/**
 * Schätzung der nächsten `steps` Werte: Mittel der letzten Werte plus Trend (nie negativ). Ohne mindestens 3 Werte keine Schätzung.
 * `range` = einfache Unsicherheit (± Standardabweichung der letzten Werte).
 */
export function estimateNext(values: number[], steps = 1) {
  if (values.length < 3) return null;
  const t = linearTrend(values)!;
  const recent = values.slice(-4);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length);
  return Array.from({ length: steps }, (_, i) => {
    const v = Math.max(0, mean + t.slope * (i + 1 + (recent.length - 1) / 2));
    return { value: Math.round(v * 10) / 10, low: Math.max(0, Math.round((v - sd) * 10) / 10), high: Math.round((v + sd) * 10) / 10 };
  });
}

/** Auffällige Veränderungen: Werte, die mehr als `z` Standardabweichungen vom Mittel der vorherigen Werte abweichen (mind. 4 Vorwerte). */
export function anomalies(series: { label: string; value: number }[], z = 2) {
  const out: { label: string; value: number; expected: number; direction: 'up' | 'down' }[] = [];
  for (let i = 4; i < series.length; i++) {
    const prev = series.slice(0, i).map((s) => s.value);
    const mean = prev.reduce((a, b) => a + b, 0) / prev.length;
    const sd = Math.sqrt(prev.reduce((a, b) => a + (b - mean) ** 2, 0) / prev.length);
    const v = series[i]!.value;
    // Vorwerte völlig gleich (Streuung 0): deutlicher Sprung (mind. 1 und mind. 50 % des Mittels) gilt als auffällig
    const unusual = sd > 0 ? Math.abs(v - mean) > z * sd : Math.abs(v - mean) >= Math.max(1, mean * 0.5);
    if (unusual) out.push({ label: series[i]!.label, value: v, expected: Math.round(mean * 10) / 10, direction: v > mean ? 'up' : 'down' });
  }
  return out;
}

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
/**
 * Zeitfenster mit geringer Besetzung: Stunden, in denen im Mittel weniger als `minStaff` Beamte im Dienst waren,
 * zusammengefasst zu zusammenhängenden Blöcken je Wochentag. Fenster ohne Messung (kein Zeitraum) werden nicht gemeldet.
 */
export function lowStaffingWindows(avg: (number | null)[][], minStaff: number) {
  const out: { weekday: number; day: string; from: number; to: number; avg: number }[] = [];
  avg.forEach((row, d) => {
    let start = -1; let sum = 0;
    for (let h = 0; h <= 24; h++) {
      const v = h < 24 ? row[h] : null;
      const low = v !== null && v !== undefined && v < minStaff;
      if (low && start < 0) { start = h; sum = 0; }
      if (low) sum += v!;
      if (!low && start >= 0) { out.push({ weekday: d, day: DAYS[d]!, from: start, to: h, avg: Math.round((sum / (h - start)) * 100) / 100 }); start = -1; }
    }
  });
  return out;
}
