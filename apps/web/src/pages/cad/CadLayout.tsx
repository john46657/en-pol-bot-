import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCadLive, useCadPrefs, type CadOverview } from '../../lib/cad';
import { onRealtime } from '../../lib/realtime';

/** CAD-Navigation. Personen/Fahrzeuge/Reports verweisen auf die vorhandenen Akten (gleiche Daten, gleiche Rechte). */
export const CAD_NAV: { to: string; label: string; perm?: string; area?: string }[] = [
  { to: '/cad', label: 'Übersicht' },
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
  const ov = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 30_000 });
  const down = (ov.data?.erlc ?? []).filter((s) => s.status !== 'CONNECTED' && s.status !== 'DISABLED');
  const items = CAD_NAV.filter((n) => !n.perm || can(n.perm) || (n.to === '/cad/settings' && (can('cad.manage_map') || can('cad.manage_erlc') || can('settings.manage'))));
  return (
    <div>
      <div className="mb-3">
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

/** Neuer ER:LC-Notruf → Hinweis (und Ton, abschaltbar) für alle, die gerade im CAD sind. */
function CallAlert() {
  const { cad, set } = useCadPrefs();
  const [alerts, setAlerts] = useState<{ id: string; at: number }[]>([]);
  const sound = cad.sound !== false;
  useEffect(() => onRealtime('cad.call.received', (p) => {
    const id = String((p as { id?: unknown })?.id ?? '');
    if (!id) return;
    if (sound) beep();
    setAlerts((a) => [...a.filter((x) => x.id !== id).slice(-2), { id, at: Date.now() }]);
    setTimeout(() => setAlerts((a) => a.filter((x) => x.id !== id)), 20_000);
  }), [sound]);
  if (!alerts.length) return null;
  return (
    <div className="fixed top-16 left-1/2 z-50 grid w-96 max-w-[calc(100vw-2rem)] -translate-x-1/2 gap-2" role="alert">
      {alerts.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-lg border border-danger/50 bg-danger/90 p-3 text-sm text-white shadow-xl">
          <span className="animate-pulse text-lg" aria-hidden>🚨</span>
          <span className="flex-1">Neuer ER:LC-Notruf eingegangen</span>
          <Link className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30" to={`/cad/calls?id=${a.id}`} onClick={() => setAlerts((x) => x.filter((y) => y.id !== a.id))}>Öffnen</Link>
          <Link className="rounded bg-white/20 px-2 py-0.5 hover:bg-white/30" to={`/cad/map?call=${a.id}`}>Karte</Link>
          <button type="button" aria-label={sound ? 'Ton aus' : 'Ton an'} title={sound ? 'Ton aus' : 'Ton an'} onClick={() => set({ sound: !sound })}>{sound ? '🔔' : '🔕'}</button>
        </div>
      ))}
    </div>
  );
}
