import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCadConfig, useCadLive, useCadPrefs, type CadMapData, type CadOverview } from '../../lib/cad';
import { MiniMap } from './MiniMap';
import { onRealtime } from '../../lib/realtime';
import { Input } from '../../components/ui';

/** CAD-Navigation. Personen/Fahrzeuge/Reports verweisen auf die vorhandenen Akten (gleiche Daten, gleiche Rechte). */
export const CAD_NAV: { to: string; label: string; perm?: string; area?: string }[] = [
  { to: '/cad', label: 'Übersicht' },
  { to: '/cad/tablet', label: '📟 Tablet' },
  { to: '/cad/incidents', label: 'Einsätze' },
  { to: '/cad/map', label: 'Einsatzkarte' },
  { to: '/cad/units', label: 'Einheiten' },
  { to: '/cad/radio', label: 'Funk' },
  { to: '/cad/calls', label: 'Notrufe' },
  { to: '/persons', label: 'Personen', perm: 'cad.view_persons' },
  { to: '/vehicles', label: 'Fahrzeuge', perm: 'cad.view_vehicles' },
  { to: '/cad/erlc', label: 'ER:LC Live', perm: 'cad.view_erlc' },
  { to: '/cad/team', label: 'Teamübersicht' },
  { to: '/cad/cross-server', label: 'Cross-Server' },
  { to: '/reports', label: 'Berichte', perm: 'reports.view' },
  { to: '/cad/logs', label: 'Protokolle', perm: 'cad.view_logs' },
  { to: '/cad/settings', label: 'Einstellungen', perm: 'cad.manage_settings' },
];

export function CadLayout() {
  const { can } = useAuth();
  useCadLive();
  // Hinweis bei ER:LC-Ausfall – das CAD selbst läuft weiter
  const ov = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 5_000 });
  const down = (ov.data?.erlc ?? []).filter((s) => s.status !== 'CONNECTED' && s.status !== 'DISABLED');
  const items = CAD_NAV.filter((n) => !n.perm || can(n.perm) || (n.to === '/cad/settings' && (can('cad.manage_map') || can('cad.manage_erlc') || can('settings.manage'))));
  return (
    <div>
      <div className="mb-3">
        <CadQuickSearch />
        <nav aria-label="CAD" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/cad'} className={({ isActive }) => `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>{n.label}</NavLink>
          ))}
        </nav>
      </div>
      {down.length > 0 && (
        <div role="status" className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          ⚠️ ER:LC-API momentan nicht erreichbar oder eingeschränkt ({down.map((s) => s.name).join(', ')}). Bereits vorhandene CAD-Daten bleiben sichtbar.
        </div>
      )}
      <Outlet />
      <CallAlert />
    </div>
  );
}

interface SearchHit { type: string; id: string; label: string; sub?: string }
/** Schnellabfrage in der Leitstelle: Personen (Roblox-Name/-ID) und Fahrzeuge (Kennzeichen) direkt suchen. */
function CadQuickSearch() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(term.trim()), 250); return () => clearTimeout(t); }, [term]);
  const persons = can('persons.view'), vehicles = can('vehicles.view');
  const q = useQuery({ queryKey: ['cad-quicksearch', debounced], queryFn: () => api<{ results: SearchHit[] }>('/search', { query: { q: debounced } }).then((r) => r.results), enabled: debounced.length >= 2 && (persons || vehicles) });
  if (!persons && !vehicles) return null;
  const hits = (q.data ?? []).filter((h) => (h.type === 'person' && persons) || (h.type === 'vehicle' && vehicles));
  const go = (h: SearchHit) => { setOpen(false); setTerm(''); nav(h.type === 'person' ? `/persons/${h.id}` : `/vehicles/${h.id}`); };
  return (
    <div className="relative mb-2 max-w-md">
      <Input type="search" aria-label="Person oder Fahrzeug suchen" placeholder={`🔎 ${[persons && 'Person (Roblox-Name/-ID)', vehicles && 'Kennzeichen'].filter(Boolean).join(' oder ')} suchen…`} value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0]); if (e.key === 'Escape') setOpen(false); }} />
      {open && debounced.length >= 2 && (
        <ul role="listbox" aria-label="Treffer" className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-md border border-line bg-panel p-1 shadow-lg">
          {q.isLoading ? <li className="px-2 py-1.5 text-xs text-muted">Suche …</li> : !hits.length ? <li className="px-2 py-1.5 text-xs text-muted">Keine Person und kein Fahrzeug gefunden.</li> : hits.map((h) => (
            <li key={`${h.type}:${h.id}`}><button type="button" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => go(h)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-panel-2">
              <span aria-hidden>{h.type === 'person' ? '👤' : '🚗'}</span><span className="min-w-0 flex-1 truncate"><b>{h.label}</b>{h.sub && <span className="ml-1 text-xs text-muted">{h.sub}</span>}</span><span className="text-[11px] text-muted">{h.type === 'person' ? 'Person' : 'Fahrzeug'}</span>
            </button></li>))}
        </ul>
      )}
    </div>
  );
}

/** Kurzer Ton (Web Audio) – ohne Audiodatei. Browser erlauben ihn erst nach einer Interaktion mit der Seite. */
function beep() {
  try {
    const ctx = new AudioContext();
    for (const [i, f] of [880, 660, 880].entries()) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; g.gain.value = 0.08; o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.14);
    }
    setTimeout(() => void ctx.close(), 1000);
  } catch { /* kein Audio verfügbar */ }
}

/** Neuer ER:LC-Notruf oder neuer Einsatz → Hinweis mit Kartenausschnitt (und Ton, abschaltbar) für alle, die gerade im CAD sind. */
function CallAlert() {
  const { cad, set } = useCadPrefs();
  const { cfg } = useCadConfig();
  const [alerts, setAlerts] = useState<{ kind: 'call' | 'incident'; id: string; at: number }[]>([]);
  const sound = cad.sound !== false;
  useEffect(() => {
    const add = (kind: 'call' | 'incident') => (p: unknown) => {
      const id = String((p as { id?: unknown })?.id ?? '');
      if (!id) return;
      if (sound) beep();
      setAlerts((a) => [...a.filter((x) => x.id !== id).slice(-2), { kind, id, at: Date.now() }]);
      setTimeout(() => setAlerts((a) => a.filter((x) => x.id !== id)), 30_000);
    };
    const offCall = onRealtime('cad.call.received', add('call'));
    const offInc = onRealtime('cad.incident.created', add('incident'));
    return () => { offCall(); offInc(); };
  }, [sound]);
  // Position und Ort der gemeldeten Notrufe/Einsätze (Kartendaten werden nur geladen, solange ein Hinweis offen ist)
  const map = useQuery({ queryKey: ['cad-map'], queryFn: () => api<CadMapData>('/cad/map'), enabled: alerts.length > 0, refetchInterval: alerts.length ? 3_000 : false });
  if (!alerts.length) return null;
  const close = (id: string) => setAlerts((x) => x.filter((y) => y.id !== id));
  return (
    <div className="fixed top-16 left-1/2 z-50 grid w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-2" role="alert">
      {alerts.map((a) => {
        const call = a.kind === 'call' ? map.data?.calls.find((c) => c.id === a.id) : undefined;
        const inc = a.kind === 'incident' ? map.data?.incidents.find((i) => i.id === a.id) : undefined;
        const pos = call && call.mapX !== null && call.mapZ !== null ? { x: call.mapX, z: call.mapZ } : inc && inc.mapX !== null && inc.mapZ !== null ? { x: inc.mapX, z: inc.mapZ } : null;
        const title = a.kind === 'call' ? `🚨 Notruf${call ? ` #${call.callNumber}` : ''}${call?.description ? ` · ${call.description}` : ''}` : `📋 Neuer Einsatz${inc ? ` ${inc.number} · ${inc.title}` : ''}`;
        const where = call?.positionDescriptor ?? inc?.location ?? null;
        const mapTo = `/cad/map?${a.kind === 'call' ? 'call' : 'incident'}=${a.id}`;
        return (
          <div key={a.id} className={`space-y-2 rounded-lg border p-3 text-sm text-white shadow-xl ${a.kind === 'call' ? 'border-danger/50 bg-danger/90' : 'border-warning/50 bg-[#7c2d12]/95'}`}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1"><b className="block truncate">{title}</b>{where && <span className="block truncate text-xs opacity-90">📍 {where}</span>}</span>
              <button type="button" aria-label={sound ? 'Ton aus' : 'Ton an'} title={sound ? 'Ton aus' : 'Ton an'} onClick={() => set({ sound: !sound })}>{sound ? '🔔' : '🔕'}</button>
              <button type="button" aria-label="Hinweis schließen" className="px-1" onClick={() => close(a.id)}>✕</button>
            </div>
            {pos ? <MiniMap cfg={cfg} x={pos.x} z={pos.z} to={mapTo} height={120} emoji={a.kind === 'call' ? '🚨' : '📋'} /> : map.isFetched && <p className="text-xs opacity-90">Keine Kartenposition gemeldet.</p>}
            <div className="flex gap-1">
              <Link className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30" to={a.kind === 'call' ? `/cad/calls?id=${a.id}` : `/cad/incidents?id=${a.id}`} onClick={() => close(a.id)}>Öffnen</Link>
              {pos && <Link className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30" to={mapTo} onClick={() => close(a.id)}>🗺️ Karte</Link>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
