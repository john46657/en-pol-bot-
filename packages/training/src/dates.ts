/** „TT.MM.JJJJ HH:MM“ (Europe/Berlin) → Zeitpunkt; `null` bei ungültiger Eingabe. */
export function parseBerlin(input: string): Date | null {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})\s*$/.exec(input);
  if (!m) return null;
  const [d, mo, y, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(guess);
  if (check.getUTCDate() !== d) return null; // z. B. 31.02.
  const offset = (at: number) => {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(at));
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(at / 1000) * 1000;
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}
