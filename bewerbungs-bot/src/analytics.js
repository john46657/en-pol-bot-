import { OPEN_STATUSES } from './service.js';

const DAY = 86_400_000;
const bucket = (s) => (s === 'ACCEPTED' ? 'APPROVED' : s === 'REJECTED' ? 'REJECTED' : OPEN_STATUSES.includes(s) ? 'PENDING' : 'OTHER');
const pct = (a, b) => (b ? (a / b) * 100 : 0);
/** Veränderung gegenüber der Vorperiode in Prozent. */
const change = (now, prev) => (prev ? ((now - prev) / prev) * 100 : now ? 100 : 0);

/**
 * Statistik: Kennzahlen (mit Vergleich zur Vorperiode), Verlauf je Tag + 7-Tage-Schnitt, Aufteilung, je Bewerbungsart,
 * Top-Prüfer und Einreichungen nach Wochentag × Stunde. Filter: Bewerbungsart, Status (APPROVED/PENDING/REJECTED), Prüfer.
 */
export function analytics(applications, { days = 30, type, status, reviewer, timeZone = 'Europe/Berlin', now = Date.now() } = {}) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = (d) => Object.fromEntries(fmt.formatToParts(d).map((q) => [q.type, q.value]));
  const start = now - days * DAY, prevStart = now - 2 * days * DAY;
  const all = applications.filter((a) => Date.parse(a.createdAt) >= prevStart).map((a) => ({
    type: a.typeName, bucket: bucket(a.status), createdAt: Date.parse(a.createdAt), decidedAt: a.decidedAt ? Date.parse(a.decidedAt) : null,
    reviewerId: a.decidedBy?.id ?? null, reviewerName: a.decidedBy?.name ?? null,
  }));
  const names = new Map(all.filter((r) => r.reviewerId).map((r) => [r.reviewerId, r.reviewerName ?? 'Unbekannt']));
  const filtered = all.filter((r) => (!type || r.type === type) && (!status || r.bucket === status) && (!reviewer || r.reviewerId === reviewer));
  const cur = filtered.filter((r) => r.createdAt >= start), prev = filtered.filter((r) => r.createdAt < start);
  const stats = (xs) => {
    const decided = xs.filter((r) => r.bucket === 'APPROVED' || r.bucket === 'REJECTED');
    const times = decided.filter((r) => r.decidedAt).map((r) => (r.decidedAt - r.createdAt) / 60_000);
    return { total: xs.length, approvalRate: pct(xs.filter((r) => r.bucket === 'APPROVED').length, decided.length), avgReviewMin: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      pending: xs.filter((r) => r.bucket === 'PENDING').length, completionRate: pct(decided.length, xs.length) };
  };
  const c = stats(cur), p = stats(prev);
  const kpis = Object.keys(c).map((k) => ({ key: k, value: c[k], change: change(c[k], p[k]) }));
  const dayKey = (t) => { const x = parts(new Date(t)); return `${x.year}-${x.month}-${x.day}`; };
  const counts = new Map();
  for (const r of cur) counts.set(dayKey(r.createdAt), (counts.get(dayKey(r.createdAt)) ?? 0) + 1);
  const dayList = Array.from({ length: days }, (_, i) => dayKey(now - (days - 1 - i) * DAY));
  const overTime = dayList.map((d, i) => {
    const win = dayList.slice(Math.max(0, i - 6), i + 1);
    return { date: d, count: counts.get(d) ?? 0, avg7: win.reduce((n, x) => n + (counts.get(x) ?? 0), 0) / win.length };
  });
  const breakdown = { APPROVED: cur.filter((r) => r.bucket === 'APPROVED').length, PENDING: cur.filter((r) => r.bucket === 'PENDING').length, REJECTED: cur.filter((r) => r.bucket === 'REJECTED').length };
  const byType = [...new Set(cur.map((r) => r.type))].map((t) => { const xs = cur.filter((r) => r.type === t), s = stats(xs); return { type: t, submitted: xs.length, approvalRate: s.approvalRate, avgReviewMin: s.avgReviewMin }; }).sort((a, b) => b.submitted - a.submitted);
  const reviewers = [...new Set(cur.map((r) => r.reviewerId).filter(Boolean))].map((id) => {
    const xs = cur.filter((r) => r.reviewerId === id && (r.bucket === 'APPROVED' || r.bucket === 'REJECTED')), s = stats(xs);
    return { id, name: names.get(id), reviewed: xs.length, approvalRate: s.approvalRate, avgReviewMin: s.avgReviewMin };
  }).sort((a, b) => b.reviewed - a.reviewed).slice(0, 10);
  const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of cur) { const x = parts(new Date(r.createdAt)); const d = WD.indexOf(x.weekday); if (d >= 0) heat[d][Number(x.hour) % 24]++; }
  return { days, kpis, overTime, breakdown, byType, reviewers, heat, filters: { types: [...new Set(all.map((r) => r.type))].sort(), reviewers: [...names].map(([id, name]) => ({ id, name })) } };
}
