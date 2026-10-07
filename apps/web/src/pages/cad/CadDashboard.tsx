import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import { CAD_WIDGET_LABELS, CAD_WIDGETS } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ago, ERLC_STATUS_TONE, optLabel, useCadPrefs, type CadMapData, type CadOverview } from '../../lib/cad';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, SkeletonRows } from '../../components/ui';
import { MapView } from './MapView';

const STATUS_DE: Record<string, string> = { CONNECTED: '🟢 Verbunden', LIMITED: '🟡 Eingeschränkt', OFFLINE: '🔴 Offline', ERROR: '⚠️ Fehler', UNKNOWN: '⚪ Unbekannt', DISABLED: '⏸️ Deaktiviert' };

/** Leitstellen-Startseite. Welche Widgets in welcher Reihenfolge erscheinen, legt jeder Benutzer für sich fest. */
export function CadDashboard() {
  const { can } = useAuth();
  const nav = useNavigate();
  const { cad, set } = useCadPrefs();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 30_000 });
  const map = useQuery({ queryKey: ['cad-map'], queryFn: () => api<CadMapData>('/cad/map'), refetchInterval: 15_000 });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data, cfg = d.config;
  const widgets = (cad.widgets ?? cfg.widgets).filter((w) => (CAD_WIDGETS as readonly string[]).includes(w));
  const sum = (k: 'players' | 'queue' | 'staffOnline') => d.erlc.reduce((n, s) => n + (s[k] ?? 0), 0);
  const available = d.units.filter((u) => u.status === cfg.unitStatuses[0]?.key && u.operational);
  const wide = new Set(['map', 'activeIncidents', 'units']);
  const stat = (label: string, value: string | number, to?: string, hint?: string) => (
    <button type="button" onClick={() => to && nav(to)} className="w-full text-left"><p className="text-3xl font-bold">{value}</p><p className="text-xs text-muted">{label}{hint ? ` · ${hint}` : ''}</p></button>
  );
  const W: Record<string, () => React.ReactNode> = {
    activeIncidents: () => d.incidents.length ? <ul className="divide-y divide-line">{d.incidents.slice(0, 8).map((i) => (
      <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm"><Link to={`/cad/incidents?id=${i.id}`} className="hover:underline"><b>{i.number}</b> · {i.title}</Link><span className="flex gap-1 text-xs"><span>{optLabel(cfg.priorities, i.priority)}</span><span className="text-muted">{optLabel(cfg.incidentStatuses, i.status)}</span></span></li>))}</ul> : <EmptyState text="Keine aktiven Einsätze." />,
    availableUnits: () => stat('verfügbare Einheiten', available.length, '/cad/units', `${d.units.length} gesamt`),
    erlcPlayers: () => stat('ER:LC Spieler', d.erlc.length ? `${sum('players')}${d.erlc[0]?.maxPlayers ? ` / ${d.erlc.reduce((n, s) => n + (s.maxPlayers ?? 0), 0)}` : ''}` : '—', '/cad/erlc'),
    erlcQueue: () => stat('in der Queue', d.erlc.length ? sum('queue') : '—', '/cad/erlc'),
    activeCalls: () => d.calls.length ? <ul className="space-y-1 text-sm">{d.calls.slice(0, 6).map((c) => <li key={c.id}><Link to={`/cad/calls?id=${c.id}`} className="hover:underline">🚨 #{c.callNumber} · {c.description ?? 'ohne Beschreibung'}</Link><span className="block text-xs text-muted">{c.positionDescriptor ?? '—'} · {ago(c.startedAt)}</span></li>)}</ul> : <EmptyState text="Keine offenen Notrufe." />,
    staffOnline: () => stat('Staff online', d.erlc.length ? sum('staffOnline') : '—', '/cad/erlc'),
    erlcStatus: () => d.erlc.length ? <ul className="space-y-1.5 text-sm">{d.erlc.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2"><span>{s.name}</span><Badge tone={ERLC_STATUS_TONE[s.status] ?? 'neutral'}>{STATUS_DE[s.status] ?? s.status}</Badge><span className="w-full text-xs text-muted">Sync {ago(s.lastSyncAt)}{s.latencyMs ? ` · ${s.latencyMs} ms` : ''}{s.lastError && s.status !== 'CONNECTED' ? ` · ${s.lastError}` : ''}</span></li>)}</ul> : <EmptyState text="Kein ER:LC-Server verbunden." hint={can('cad.manage_erlc') ? 'CAD → Einstellungen → ER:LC Integration' : undefined} />,
    map: () => <MapView cfg={cfg} data={map.data} height="420px" compact />,
    units: () => d.units.length ? <ul className="grid gap-1 text-sm sm:grid-cols-2">{d.units.map((u) => <li key={u.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1"><span className="font-medium">{u.icon ?? cfg.unitTypes.find((t) => t.key === u.type)?.emoji ?? '🚔'} {u.callsign}</span><span className="text-xs">{optLabel(cfg.unitStatuses, u.status)}{u.current ? ` · ${u.current.number}` : ''}</span></li>)}</ul> : <EmptyState text="Keine Einheiten angelegt." />,
    radio: () => d.radio.length ? <ul className="space-y-1 text-sm">{d.radio.slice(0, 8).map((r) => <li key={r.id}><b>{r.callsign ?? r.authorName ?? 'Funk'}:</b> „{r.text}“<span className="block text-xs text-muted">{ago(r.createdAt)}{r.incidentNumber ? ` · ${r.incidentNumber}` : ''}</span></li>)}</ul> : <EmptyState text="Noch keine Funkmeldungen." />,
    persons: () => stat('Personen in den Akten', d.counts.persons ?? '—', d.counts.persons !== null ? '/persons' : undefined),
    vehicles: () => stat('Fahrzeuge in den Akten', d.counts.vehicles ?? '—', d.counts.vehicles !== null ? '/vehicles' : undefined),
  };
  const move = (i: number, dir: -1 | 1) => { const next = [...widgets]; const [x] = next.splice(i, 1); next.splice(i + dir, 0, x!); set({ widgets: next }); };
  return (
    <>
      <PageHeader title="Leitstelle" subtitle="CAD-Übersicht – aktualisiert sich live" actions={<Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Settings2 size={14} /> Ansicht anpassen</Button>} />
      <div className={`grid gap-3 ${cad.compact ? 'md:grid-cols-3 xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3'}`}>
        {widgets.map((w) => <Card key={w} title={CAD_WIDGET_LABELS[w]} className={wide.has(w) ? 'md:col-span-2 xl:col-span-2' : undefined}>{W[w]?.()}</Card>)}
      </div>
      <Modal open={editing} title="Meine CAD-Ansicht" onClose={() => setEditing(false)}>
        <p className="mb-2 text-xs text-muted">Gilt nur für dich. Reihenfolge mit den Pfeilen, Widgets an-/abwählen.</p>
        <ul className="space-y-1">{widgets.map((w, i) => (
          <li key={w} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked onChange={() => set({ widgets: widgets.filter((x) => x !== w) })} />{CAD_WIDGET_LABELS[w]}</label>
            <span className="flex gap-1"><Button size="sm" variant="ghost" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={12} /></Button><Button size="sm" variant="ghost" aria-label="nach unten" disabled={i === widgets.length - 1} onClick={() => move(i, 1)}><ArrowDown size={12} /></Button></span></li>))}</ul>
        <ul className="mt-2 space-y-1">{CAD_WIDGETS.filter((w) => !widgets.includes(w)).map((w) => <li key={w}><label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={false} onChange={() => set({ widgets: [...widgets, w] })} />{CAD_WIDGET_LABELS[w]}</label></li>)}</ul>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!cad.compact} onChange={(e) => set({ compact: e.target.checked })} />Kompakte Ansicht</label>
        <div className="mt-3 flex justify-between"><Button variant="ghost" size="sm" onClick={() => set({ widgets: undefined, compact: false })}>Standard wiederherstellen</Button><Button onClick={() => setEditing(false)}>Fertig</Button></div>
      </Modal>
    </>
  );
}
