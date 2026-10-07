import { NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useCadLive, type CadOverview } from '../../lib/cad';

/** CAD-Navigation. Personen/Fahrzeuge/Reports verweisen auf die vorhandenen Akten (gleiche Daten, gleiche Rechte). */
export const CAD_NAV: { to: string; label: string; perm?: string; area?: string }[] = [
  { to: '/cad', label: 'Dashboard' },
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
  { to: '/reports', label: 'Reports', perm: 'reports.view' },
  { to: '/cad/logs', label: 'Protokolle', perm: 'cad.view_logs' },
  { to: '/cad/settings', label: 'Einstellungen', perm: 'cad.manage_settings' },
];

export function CadLayout() {
  const { can } = useAuth();
  useCadLive();
  // Hinweis bei ER:LC-Ausfall – das CAD selbst läuft weiter
  const ov = useQuery({ queryKey: ['cad-overview'], queryFn: () => api<CadOverview>('/cad/overview'), refetchInterval: 30_000 });
  const down = (ov.data?.erlc ?? []).filter((s) => s.status !== 'CONNECTED' && s.status !== 'DISABLED');
  const items = CAD_NAV.filter((n) => !n.perm || can(n.perm) || (n.to === '/cad/settings' && (can('cad.manage_map') || can('cad.manage_erlc') || can('cad.manage_cross_server'))));
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
          ⚠️ ER:LC API momentan nicht erreichbar oder eingeschränkt ({down.map((s) => s.name).join(', ')}). Bereits vorhandene CAD-Daten bleiben sichtbar.
        </div>
      )}
      <Outlet />
    </div>
  );
}
