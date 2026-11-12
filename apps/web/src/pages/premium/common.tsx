import type { ReactNode } from 'react';
import { Badge } from '../../components/ui';

export const dt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
/** Alter eines Datenstands in Worten („vor 3 Min.“). */
export const age = (d: string | null | undefined, now = Date.now()) => {
  if (!d) return 'nie';
  const m = Math.round((now - new Date(d).getTime()) / 60_000);
  return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : m < 48 * 60 ? `vor ${Math.round(m / 60)} Std.` : `vor ${Math.round(m / 1440)} Tagen`;
};

/** Persönliche Komfort-Einstellung im Browser (fällt still auf den Standard zurück). */
export function readLocal<T>(key: string, fallback: T): T { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } }
export function writeLocal(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* privater Modus */ } }

/** Quelle und Datenstand eines Abschnitts. */
export function Source({ source, asOf }: { source: string; asOf: string }) {
  return <p className="mt-2 text-[11px] text-muted">Quelle: {source} · Stand {dt(asOf)}</p>;
}

export function Stat({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: 'danger' | 'warning' | 'success'; hint?: ReactNode }) {
  const c = tone ? { danger: 'text-danger', warning: 'text-warning', success: 'text-success' }[tone] : '';
  return <div className="rounded-lg border border-line bg-panel px-3 py-2"><div className="text-xs text-muted">{label}</div><div className={`text-2xl font-semibold tabular-nums ${c}`}>{value}</div>{hint && <div className="text-[11px] text-muted">{hint}</div>}</div>;
}

export function Counts({ data }: { data: Record<string, number> }) {
  const e = Object.entries(data);
  return e.length ? <span className="flex flex-wrap gap-1">{e.map(([k, v]) => <Badge key={k}>{k}: {v}</Badge>)}</span> : <span className="text-xs text-muted">—</span>;
}
