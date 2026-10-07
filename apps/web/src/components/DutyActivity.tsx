import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ShiftsConfig } from '../pages/admin/Shifts';
import { EmptyState, ErrorState, SkeletonRows, StatusBadge } from './ui';

export interface ActivityRow { userId: string; name: string; callsign: string | null; dutyStatus: string; onDutySince: string | null; lastActivityAt?: string | null; reminded?: boolean; unit?: { callsign: string } | null }

/** Minuten seit `iso` (lebt mit, ohne neu zu laden). */
export function useMinutesSince() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  return (iso: string | null | undefined) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000)) : null);
}
export const idleText = (m: number | null) => (m === null ? '—' : m < 1 ? 'gerade aktiv' : m < 60 ? `seit ${m} Min.` : `seit ${Math.floor(m / 60)} Std. ${m % 60} Min.`);
/** Farbe nach Inaktivität: ab der Erinnerungsgrenze gelb, nach der Erinnerung ohne Reaktion rot. */
export const idleTone = (m: number | null, limit: number, reminded?: boolean) => (reminded ? 'text-danger font-semibold' : m !== null && m >= limit ? 'text-warning font-semibold' : m !== null && m >= limit / 2 ? 'text-fg' : 'text-muted');

/** Leitstelle: wer im Dienst ist und seit wann er nichts mehr gemacht hat (Dashboard/MDT, Discord) – Längste Inaktivität oben. */
export function DutyActivity({ limit: max = 12 }: { limit?: number }) {
  const q = useQuery({ queryKey: ['team-overview'], queryFn: () => api<ActivityRow[]>('/team/overview'), refetchInterval: 5_000 });
  const cfg = useQuery({ queryKey: ['shifts-config'], queryFn: () => api<ShiftsConfig>('/shifts/config') });
  const since = useMinutesSince();
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const limit = cfg.data?.reminder?.enabled ? cfg.data.reminder.afterMinutes : 30;
  const rows = (q.data ?? []).filter((r) => r.dutyStatus === 'ON_DUTY').map((r) => ({ ...r, idle: since(r.lastActivityAt ?? r.onDutySince) })).sort((a, b) => (b.idle ?? 0) - (a.idle ?? 0));
  if (!rows.length) return <EmptyState text="Niemand im Dienst." />;
  return (
    <>
      <ul className="divide-y divide-line text-sm">{rows.slice(0, max).map((r) => (
        <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
          <span><b>{r.callsign ?? r.name}</b>{r.callsign && <span className="ml-1 text-xs text-muted">{r.name}</span>}{r.unit && <span className="ml-1 text-xs text-muted">· {r.unit.callsign}</span>}</span>
          <span className={`text-xs ${idleTone(r.idle, limit, r.reminded)}`} title="Letzte Aktivität im Dashboard/MDT oder per Discord">{r.reminded ? '⏰ ' : ''}{idleText(r.idle)}</span>
        </li>
      ))}</ul>
      {rows.length > max && <p className="mt-1 text-xs text-muted">+ {rows.length - max} weitere</p>}
      <p className="mt-2 flex items-center gap-1 text-xs text-muted"><StatusBadge status="ON_DUTY" /> letzte Aktivität · gelb ab {limit} Min.{cfg.data?.reminder?.enabled ? ', rot = erinnert, keine Reaktion' : ''}</p>
    </>
  );
}
