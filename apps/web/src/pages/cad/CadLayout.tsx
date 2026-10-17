import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BarChart3, BookOpen, Car, ClipboardList, FileText, Fingerprint, LayoutDashboard, Map as MapIcon, Menu, Monitor, Phone, Radio, RadioTower, RefreshCw, ScrollText, Settings, Siren, Smartphone, Tablet, Truck, Users, UsersRound, X, type LucideIcon } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCadConfig, useCadLive, useCadPrefs, type CadMapData, type CadOverview } from '../../lib/cad';
import { MiniMap } from './MiniMap';
import { onRealtime } from '../../lib/realtime';
import { ConfirmHost, Input, SkeletonRows } from '../../components/ui';
import { SaveStatus } from '../../components/SaveStatus';
import { NotificationCenter } from '../../components/NotificationCenter';
import { Toasts } from '../../components/Toasts';

interface CadNavItem { to: string; label: string; icon: LucideIcon; perm?: string; end?: boolean; external?: boolean }
/**
 * CAD-Navigation (Seitenleiste der Leitstelle). Personen/Fahrzeuge/Berichte verweisen auf die vorhandenen Akten
 * im Dashboard (gleiche Daten, gleiche Rechte) und sind deshalb als „external“ markiert.
 */
export const CAD_NAV: { group: string; items: CadNavItem[] }[] = [
  { group: 'Leitstelle', items: [
    { to: '/cad', label: 'Übersicht', icon: LayoutDashboard, end: true },
    { to: '/cad/tablet', label: 'Tablet', icon: Tablet },
    { to: '/cad/mdt', label: 'Meine Einheit', icon: Smartphone },
    { to: '/cad/incidents', label: 'Einsätze', icon: ClipboardList },
    { to: '/cad/map', label: 'Einsatzkarte', icon: MapIcon },
    { to: '/cad/units', label: 'Einheiten', icon: UsersRound },
    { to: '/cad/radio', label: 'Funk', icon: Radio },
    { to: '/cad/calls', label: 'Notrufe', icon: Phone },
  ] },
  { group: 'Abfragen', items: [
    { to: '/cad/fleet', label: 'Polizeifahrzeuge', icon: Truck, perm: 'fleet.view' },
    { to: '/cad/erlc', label: 'ER:LC Live', icon: RadioTower, perm: 'cad.view_erlc' },
    { to: '/persons', label: 'Personen', icon: Fingerprint, perm: 'cad.view_persons', external: true },
    { to: '/vehicles', label: 'Fahrzeuge', icon: Car, perm: 'cad.view_vehicles', external: true },
    { to: '/reports', label: 'Berichte', icon: FileText, perm: 'reports.view', external: true },
  ] },
  { group: 'Dienst', items: [
    { to: '/cad/team', label: 'Teamübersicht', icon: Users },
    { to: '/cad/handover', label: 'Schichtübergabe', icon: Activity },
    { to: '/cad/stats', label: 'Statistik', icon: BarChart3, perm: 'cad.view_stats' },
  ] },
  { group: 'Verwaltung', items: [
    { to: '/cad/logs', label: 'Protokolle', icon: ScrollText, perm: 'cad.view_logs' },
    { to: '/cad/settings', label: 'Einstellungen', icon: Settings, perm: 'cad.manage_settings' },
  ] },
];

function CadSidebar({ onPick }: { onPick?: () => void }) {
  const { can } = useAuth();
  const allowed = (i: CadNavItem) => !i.perm || can(i.perm) || (i.to === '/cad/settings' && (can('cad.manage_map') || can('cad.manage_erlc') || can('settings.manage')));
  return (
    <nav aria-label="CAD" className="flex-1 overflow-y-auto px-2 py-3">
      {CAD_NAV.map((g) => {
        const items = g.items.filter(allowed);
        if (!items.length) return null;
        return (
          <div key={g.group} className="mb-4">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</p>
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} onClick={onPick}
                className={({ isActive }) => `flex items-center gap-2.5 rounded-md border-l-2 px-3 py-1.5 text-sm ${isActive && !i.external ? 'border-primary bg-primary/15 text-fg' : 'border-transparent text-muted hover:bg-panel-2 hover:text-fg'}`}>
                <i.icon size={16} aria-hidden />{i.label}{i.external && <span className="ml-auto text-[10px]" aria-label="öffnet das Dashboard">↗</span>}
              </NavLink>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

const cadTitle = (path: string) => CAD_NAV.flatMap((g) => g.items).filter((i) => !i.external).sort((a, b) => b.to.length - a.to.length).find((i) => (i.end ? path === i.to : path.startsWith(i.to)))?.label ?? 'Leitstelle';

/**
 * CAD-Leitstelle als eigene Vollbild-Oberfläche (wie das MDT). Gleiche Anmeldung und Rechte wie das Dashboard –
 * „Zum Dashboard“ oben rechts führt zurück, im Dashboard öffnet „Leitstelle“ diese Ansicht.
 */
export function CadLayout() {
  const { user, can } = useAuth();
  const loc = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useCadLive();
  // Hinweis bei ER:LC-Ausfall – das CAD selbst läuft weiter
  const ov = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 5_000 });
  const down = (ov.data?.erlc ?? []).filter((s) => s.status !== 'CONNECTED' && s.status !== 'DISABLED');
  const initials = (user?.displayName ?? '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  const brand: ReactNode = (
    <div className="flex flex-col items-center gap-1 border-b border-line px-3 py-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-primary/60 bg-primary/10"><Siren size={28} className="text-primary" aria-hidden /></span>
      <span className="text-sm font-semibold">CAD-Leitstelle</span>
    </div>
  );
  const me = (
    <div className="flex items-center gap-2 border-t border-line p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/20 text-xs font-bold text-primary">{initials}</span>
      <div className="min-w-0 text-xs"><p className="truncate font-medium">{user?.displayName}</p><p className="truncate text-muted">{user?.roles[0] ?? '—'}</p></div>
    </div>
  );
  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">{brand}<CadSidebar />{me}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-64 max-w-[85vw] flex-col bg-panel" onClick={(e) => e.stopPropagation()}>{brand}<CadSidebar onPick={() => setOpen(false)} />{me}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:px-4">
          <button type="button" className="rounded-md p-2 hover:bg-panel-2 lg:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <h1 className="truncate text-base font-semibold">{cadTitle(loc.pathname)}</h1>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <SaveStatus />
            <NotificationCenter />
            <button type="button" className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-fg" aria-label="Aktualisieren" title="Aktualisieren" onClick={() => void qc.invalidateQueries()}><RefreshCw size={16} /></button>
            <Link to="/mdt" className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs hover:bg-panel-2" title="Polizei-MDT öffnen"><Monitor size={14} aria-hidden /><span className="hidden sm:inline">MDT</span></Link>
            {can('dashboard.view') && <Link to="/dashboard" className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs hover:bg-panel-2" title="Zurück zum Dashboard"><BookOpen size={14} aria-hidden /><span className="hidden sm:inline">Zum Dashboard</span><X size={14} className="sm:hidden" aria-hidden /></Link>}
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <CadQuickSearch />
          {down.length > 0 && (
            <div role="status" className="mb-3 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
              ⚠️ ER:LC-API momentan nicht erreichbar oder eingeschränkt ({down.map((s) => s.name).join(', ')}). Bereits vorhandene CAD-Daten bleiben sichtbar.
            </div>
          )}
          <Suspense fallback={<SkeletonRows />}><Outlet /></Suspense>
          <CallAlert />
          <ConfirmHost />
        </main>
        <Toasts />
      </div>
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
    <div className="relative mb-3 max-w-md">
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
