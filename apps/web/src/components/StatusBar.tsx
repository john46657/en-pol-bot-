import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { statusLabel } from '@enrp/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import type { ShiftsConfig } from '../pages/admin/Shifts';

interface DangerNow { level: string; levels: { key: string; name: string; title: string; color: string }[] }
interface Session { status: string; callsign: string | null; shiftType: string | null; startedAt: string }

/** Aktueller Gefahrenstatus (Stufe + Titel in der eingestellten Farbe); mit Recht führt er zur Einstellung. */
export function DangerPill() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['danger-now'], queryFn: () => api<DangerNow>('/danger-level'), refetchInterval: 15_000, enabled: can('dashboard.view'), retry: false });
  const cur = q.data?.levels.find((l) => l.key === q.data?.level);
  if (!cur) return null;
  const c = /^#[0-9a-f]{6}$/i.test(cur.color) ? cur.color : 'var(--color-warning)';
  const body = (
    <>
      <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: c }} />
      <span className="truncate">{/status/i.test(cur.name) ? <span className="sr-only">Gefahrenstatus </span> : <span className="max-md:sr-only">Gefahrenstatus </span>}{cur.name}<span className="max-2xl:hidden">{cur.title && cur.title !== cur.name ? ` · ${cur.title}` : ''}</span></span>
    </>
  );
  const cls = 'inline-flex h-9 max-w-72 shrink-0 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold text-fg';
  const style = { borderColor: c, background: `color-mix(in srgb, ${c} 14%, transparent)` };
  return can('settings.manage') ? <Link to="/admin/danger-level" className={cls} style={style} title="Gefahrenstatus ändern">{body}</Link> : <span className={cls} style={style}>{body}</span>;
}

const hm = (iso: string) => { const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };

/**
 * Eigener Dienststatus mit Dauer. Ein Klick beginnt/beendet den Dienst; gibt es mehrere Schicht-Arten,
 * führt er zur Teamseite, wo die Schicht gewählt wird.
 */
export function DutyButton() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const allowed = can('team.view');
  useRealtime('team', ['duty.changed'], [['my-duty']]);
  const mine = useQuery({ queryKey: ['my-duty'], queryFn: async () => (await api<Session | null>('/team/me')) ?? null, enabled: allowed, retry: false });
  const shifts = useQuery({ queryKey: ['shifts-config'], queryFn: () => api<ShiftsConfig>('/shifts/config'), enabled: allowed, retry: false });
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(t); }, []);
  const set = useMutation({ mutationFn: (status: string) => api('/team/me/status', { method: 'PUT', body: { status } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-duty'] }) });
  if (!allowed || mine.isLoading || mine.error) return null;
  const s = mine.data;
  const on = !!s && s.status !== 'OFF_DUTY';
  const chooseShift = (shifts.data?.enabled && (shifts.data.types?.length ?? 0) > 1) ?? false;
  const click = () => (on ? set.mutate('OFF_DUTY') : chooseShift ? nav('/team') : set.mutate('ON_DUTY'));
  const tone = !on ? 'border-line-strong' : s.status === 'ON_DUTY' ? 'border-success bg-[color-mix(in_srgb,var(--color-success)_14%,transparent)]' : 'border-warning bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)]';
  return (
    <button type="button" onClick={click} disabled={set.isPending} title={on ? 'Dienst beenden' : 'Dienst beginnen'}
      className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-semibold text-fg disabled:opacity-60 ${tone}`}>
      <span aria-hidden className={`size-2 rounded-[2px] ${!on ? 'bg-offline' : s.status === 'ON_DUTY' ? 'bg-success' : 'bg-warning'}`} />
      {on ? <><span className="max-sm:sr-only">{statusLabel(s.status)}</span><span className="max-lg:hidden">{s.callsign ? ` · ${s.callsign}` : ''}</span><span className="max-sm:hidden"> · </span><span className="font-mono tabular-nums">{hm(s.startedAt)}</span></> : <>Außer Dienst<span className="max-lg:hidden"> · Dienst beginnen</span></>}
    </button>
  );
}
