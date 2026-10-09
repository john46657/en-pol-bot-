import { Suspense, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Car, ClipboardList, Crosshair, FileText, Fingerprint, Flag, LayoutDashboard, Menu, RefreshCw, Search, Settings, Shield, Siren, Smartphone, Truck, UserCheck, Users, X, type LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { SkeletonRows } from '../../components/ui';
import { SaveStatus } from '../../components/SaveStatus';
import { NotificationCenter } from '../../components/NotificationCenter';

interface Item { to: string; label: string; icon: LucideIcon; perm?: string; end?: boolean; external?: boolean }
/** Menü des MDT (wie ein Streifen-Terminal). Jeder Punkt erscheint nur mit dem passenden Recht. */
export const MDT_NAV: { group: string; items: Item[] }[] = [
  { group: 'Einsatz', items: [
    { to: '/mdt', label: 'Übersicht', icon: LayoutDashboard, end: true },
    { to: '/mdt/unit', label: 'Meine Einheit', icon: Smartphone, perm: 'cad.view' },
    { to: '/cad', label: 'Leitstelle (CAD)', icon: Siren, perm: 'cad.view', external: true },
  ] },
  { group: 'Akten', items: [
    { to: '/mdt/citizens', label: 'Bürger', icon: Fingerprint, perm: 'persons.view' },
    { to: '/mdt/vehicles', label: 'Fahrzeuge', icon: Car, perm: 'vehicles.view' },
    { to: '/mdt/warrants', label: 'Haftbefehle', icon: Flag, perm: 'wanted.view' },
    { to: '/mdt/weapons', label: 'Waffen', icon: Crosshair, perm: 'weapons.view' },
    { to: '/mdt/fleet', label: 'Polizeifahrzeuge', icon: Truck, perm: 'fleet.view' },
  ] },
  { group: 'Vorgänge', items: [
    { to: '/mdt/reports', label: 'Berichte', icon: FileText, perm: 'reports.view' },
    { to: '/mdt/incidents', label: 'Einsätze', icon: ClipboardList, perm: 'incidents.view' },
    { to: '/mdt/investigations', label: 'Ermittlungen', icon: Search, perm: 'investigations.view' },
  ] },
  { group: 'Dienststelle', items: [
    { to: '/mdt/roster', label: 'Dienstliste', icon: Users, perm: 'team.view' },
    { to: '/mdt/officers', label: 'Beamte', icon: UserCheck, perm: 'personnel.view' },
    { to: '/mdt/settings', label: 'MDT-Einstellungen', icon: Settings, perm: 'settings.manage' },
  ] },
];

function Sidebar({ onPick }: { onPick?: () => void }) {
  const { can } = useAuth();
  return (
    <nav aria-label="MDT" className="flex-1 overflow-y-auto px-2 py-3">
      {MDT_NAV.map((g) => {
        const items = g.items.filter((i) => !i.perm || can(i.perm));
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

const title = (path: string) => MDT_NAV.flatMap((g) => g.items).filter((i) => !i.external).sort((a, b) => b.to.length - a.to.length).find((i) => (i.end ? path === i.to : path.startsWith(i.to)))?.label ?? 'MDT';

/**
 * Polizei-MDT als eigene Vollbild-Oberfläche. Gleiche Anmeldung und Rechte wie das Dashboard –
 * „Zum Dashboard“ oben rechts führt zurück, im Dashboard öffnet „MDT“ diese Ansicht.
 */
export function MdtShell() {
  const { user, can } = useAuth();
  const loc = useLocation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const initials = (user?.displayName ?? '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();
  const brand: ReactNode = (
    <div className="flex flex-col items-center gap-1 border-b border-line px-3 py-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-primary/60 bg-primary/10"><Shield size={28} className="text-primary" aria-hidden /></span>
      <span className="text-sm font-semibold">Police MDT</span>
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
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-panel lg:flex">{brand}<Sidebar />{me}</aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-64 max-w-[85vw] flex-col bg-panel" onClick={(e) => e.stopPropagation()}>{brand}<Sidebar onPick={() => setOpen(false)} />{me}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:px-4">
          <button type="button" className="rounded-md p-2 hover:bg-panel-2 lg:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <h1 className="truncate text-base font-semibold">{title(loc.pathname)}</h1>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <SaveStatus />
            <NotificationCenter />
            <button type="button" className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-fg" aria-label="Aktualisieren" title="Aktualisieren" onClick={() => void qc.invalidateQueries()}><RefreshCw size={16} /></button>
            {can('dashboard.view') && <Link to="/dashboard" className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs hover:bg-panel-2" title="Zurück zum Dashboard"><BookOpen size={14} aria-hidden /><span className="hidden sm:inline">Zum Dashboard</span><X size={14} className="sm:hidden" aria-hidden /></Link>}
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Suspense fallback={<SkeletonRows />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
