import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago } from '../../lib/cad';
import { Button, ErrorState, PageHeader, SkeletonRows } from '../../components/ui';

type Availability = 'available' | 'busy' | 'unavailable';
interface Tablet {
  calls: { id: string; callNumber: number; description: string | null; location: string | null; status: string; startedAt: string }[];
  board: { key: string; name: string; callsign: string | null; rank: string | null; since: string | null; unitId: string | null; statusLabel: string | null; availability: Availability; inGame: boolean }[];
  available: number;
  me: { unitId: string; callsign: string; status: string; availability: Availability } | null;
  statuses: { available: string | null; unavailable: string | null };
  wanted: { id: string; name: string; reason: string; priority: string; since: string }[];
  bolos: { id: string; plate: string; model: string | null; color: string | null; reason: string; priority: string; since: string }[];
  inGameWanted: { name: string; stars: number; location: string | null }[];
  wantedAllowed: boolean;
}

const AV: Record<Availability, { label: string; row: string; dot: string }> = {
  available: { label: 'Verfügbar', row: 'border-success/60 bg-success/15', dot: 'bg-success' },
  busy: { label: 'Beschäftigt', row: 'border-warning/60 bg-warning/15', dot: 'bg-warning' },
  unavailable: { label: 'Nicht verfügbar', row: 'border-danger/60 bg-danger/15', dot: 'bg-danger' },
};

function Panel({ title, badge, actions, children }: { title: string; badge?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex min-h-[18rem] flex-col border border-line p-3" aria-label={title}>
      <header className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-dashed border-line pb-2">
        <span className="truncate text-sm text-warning">{badge}</span>
        <h2 className="text-center text-lg">{title}</h2>
        <span className="flex justify-end">{actions}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/** 📟 Tablet der Leitstelle – aufgebaut wie das Polizei-Tablet in ER:LC, live aus CAD, Fahndungen und ER:LC. */
export function CadTablet() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['cad-tablet'], queryFn: () => api<Tablet>('/cad/tablet'), refetchInterval: 5_000 });
  const [err, setErr] = useState<string>();
  const setStatus = useMutation({
    mutationFn: (v: { unitId: string; status: string }) => api(`/cad/units/${v.unitId}/status`, { body: { status: v.status } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['cad-tablet'] }); void qc.invalidateQueries({ queryKey: ['cad-units'] }); },
    onError: (e) => setErr(e instanceof ApiError ? e.message : 'Fehlgeschlagen'),
  });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const me = d.me;
  const toggle = me && (me.availability === 'unavailable' ? d.statuses.available : d.statuses.unavailable);
  const empty = (t: string) => <p className="py-6 text-center text-sm text-muted">{t}</p>;
  return (
    <>
      <PageHeader title="📟 Tablet" subtitle="Wie das Polizei-Tablet in ER:LC – live aus Leitstelle, Fahndungen und ER:LC" />
      {err && <p role="alert" className="mb-2 text-sm text-danger">{err}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Meldungen" badge={`${d.calls.length} Aktive ${d.calls.length === 1 ? 'Anruf' : 'Anrufe'}`}>
          {d.calls.length ? <ul className="space-y-1.5">{d.calls.map((c) => (
            <li key={c.id}><Link to={`/cad/calls?id=${c.id}`} className={`flex items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-panel-2 ${c.status === 'OPEN' ? 'border-danger/60' : 'border-warning/60'}`}>
              <b>🚨 #{c.callNumber}</b><span className="min-w-0 flex-1 truncate">{c.description ?? 'Notruf'}</span><span className="hidden truncate text-xs text-muted sm:inline">{c.location ?? ''}</span><span className="text-xs text-muted">{ago(c.startedAt)}</span>
            </Link></li>))}</ul> : empty('Keine aktiven Anrufe.')}
        </Panel>

        <Panel title="Aktivitätsbrett" badge={`${d.available} ${d.available === 1 ? 'Einheit' : 'Einheiten'} verfügbar`}
          actions={me && toggle ? <Button size="sm" variant={me.availability === 'unavailable' ? 'primary' : 'danger'} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ unitId: me.unitId, status: toggle })}>{me.availability === 'unavailable' ? 'Werde verfügbar' : 'Werde nicht verfügbar'}</Button> : undefined}>
          {d.board.length ? <ul className="space-y-1.5">{d.board.map((b) => (
            <li key={b.key} className={`grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,8rem)_5rem] items-center gap-2 rounded border px-2 py-1.5 text-sm ${AV[b.availability].row}`} title={b.statusLabel ?? AV[b.availability].label}>
              <span className="font-semibold"># {b.callsign ?? '—'}</span>
              <span className="truncate">@ {b.name}{!b.inGame && <span className="ml-1 text-[11px] text-muted">(nicht im Spiel)</span>}</span>
              <span className="truncate">{b.rank ? `⌃ ${b.rank}` : ''}</span>
              <span className="text-right text-xs">{b.since ? `🕒 ${ago(b.since)}` : ''}</span>
            </li>))}</ul> : empty('Niemand im Dienst.')}
          <p className="mt-2 flex flex-wrap justify-center gap-4 text-xs">{(Object.keys(AV) as Availability[]).map((k) => <span key={k} className="inline-flex items-center gap-1"><span aria-hidden className={`h-2.5 w-2.5 rounded-full ${AV[k].dot}`} />{AV[k].label}</span>)}</p>
          {!me && <p className="mt-1 text-center text-[11px] text-muted">Verfügbarkeit umschalten geht, sobald du einer Einheit zugeordnet bist (CAD → Teamübersicht).</p>}
        </Panel>

        <Panel title="Gesucht" actions={can('wanted.create') ? <Link to="/wanted" className="text-xs text-primary hover:underline">+ Fahndung</Link> : undefined}>
          {!d.wantedAllowed && !d.inGameWanted.length ? empty('Für Fahndungen fehlt dir das Recht.') : !d.wanted.length && !d.inGameWanted.length ? empty('Niemand gesucht.') : <ul className="space-y-1.5">
            {d.wanted.map((w) => <li key={w.id}><Link to={`/wanted/${w.id}`} className="flex items-center gap-2 rounded border border-danger/50 px-2 py-1.5 text-sm hover:bg-panel-2"><b>👤 {w.name}</b><span className="min-w-0 flex-1 truncate">{w.reason}</span><span className="text-xs text-muted">{ago(w.since)}</span></Link></li>)}
            {d.inGameWanted.map((w) => <li key={`g:${w.name}`} className="flex items-center gap-2 rounded border border-warning/50 px-2 py-1.5 text-sm"><b>🎮 {w.name}</b><span>{'⭐'.repeat(w.stars)}</span><span className="min-w-0 flex-1 truncate text-xs text-muted">{w.location ?? 'im Spiel gesucht'}</span></li>)}
          </ul>}
        </Panel>

        <Panel title="Auto BOLOs" actions={can('wanted.create') ? <Link to="/wanted" className="text-xs text-primary hover:underline">+ BOLO</Link> : undefined}>
          {!d.wantedAllowed ? empty('Für Fahndungen fehlt dir das Recht.') : d.bolos.length ? <ul className="space-y-1.5">{d.bolos.map((b) => (
            <li key={b.id}><Link to={`/wanted/${b.id}`} className="flex items-center gap-2 rounded border border-danger/50 px-2 py-1.5 text-sm hover:bg-panel-2"><b>🚗 {b.plate}</b><span className="truncate text-xs text-muted">{[b.model, b.color].filter(Boolean).join(' · ')}</span><span className="min-w-0 flex-1 truncate">{b.reason}</span><span className="text-xs text-muted">{ago(b.since)}</span></Link></li>))}</ul> : empty('Keine Fahrzeuge zur Fahndung.')}
        </Panel>
      </div>
    </>
  );
}
