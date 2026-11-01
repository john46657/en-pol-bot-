import { Link, useLocation } from 'react-router';
import { LayoutDashboard, LogOut, MapPinned, Monitor, type LucideIcon } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { flush } from '../lib/autosave';

export type AppKey = 'dashboard' | 'mdt' | 'cad';
interface AppDef { key: AppKey; label: string; short: string; to: string; icon: LucideIcon; can: (c: (p: string) => boolean) => boolean }
/**
 * Die drei Anwendungen der EN-Polizei-Plattform. Sie teilen Anmeldung (ein Sitzungs-Cookie), Benutzer, Rechte und Daten;
 * angezeigt wird nur, wofür der Benutzer berechtigt ist (die API prüft unabhängig davon selbst).
 */
export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard', short: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, can: (c) => c('dashboard.view') },
  { key: 'mdt', label: 'MDT', short: 'MDT', to: '/mdt', icon: Monitor, can: (c) => c('dashboard.view') },
  { key: 'cad', label: 'Leitstelle', short: 'Leitstelle', to: '/cad', icon: MapPinned, can: (c) => c('cad.view') && c('dashboard.cad.view') },
];
export const appOf = (path: string): AppKey => (path === '/mdt' || path.startsWith('/mdt/') ? 'mdt' : path === '/cad' || path.startsWith('/cad/') ? 'cad' : 'dashboard');

/** Einheitlicher Umschalter zwischen Dashboard, MDT und Leitstelle – gleich in allen drei Oberflächen. */
export function AppSwitcher() {
  const { can } = useAuth();
  const loc = useLocation();
  const current = appOf(loc.pathname);
  const apps = APPS.filter((a) => a.can(can));
  if (apps.length < 2) return null;
  return (
    <nav aria-label="Anwendung wechseln" className="flex shrink-0 items-center rounded-md border border-line bg-bg p-0.5">
      {apps.map((a) => {
        const on = a.key === current;
        return (
          <Link key={a.key} to={a.to} aria-current={on ? 'page' : undefined} title={a.label}
            className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${on ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
            <a.icon size={14} aria-hidden /><span className="hidden md:inline">{a.short}</span><span className="sr-only md:hidden">{a.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Abmelden – beendet die gemeinsame Sitzung für alle drei Anwendungen (serverseitig widerrufen). */
export function LogoutButton() {
  const { logout } = useAuth();
  return (
    <button type="button" aria-label="Abmelden" title="Abmelden (gilt für Dashboard, MDT und Leitstelle)" onClick={() => void flush().finally(() => void logout())}
      className="rounded-md p-2 text-muted hover:bg-panel-2 hover:text-fg"><LogOut size={16} aria-hidden /></button>
  );
}

/** Markenkopf der Plattform (Name aus dem Studio, Wappen) mit Kennzeichnung der Anwendung. */
export function AppBrand({ app, icon: Icon, name }: { app: string; icon: LucideIcon; name?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 border-b border-line px-3 py-4 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-primary/60 bg-primary/10"><Icon size={28} className="text-primary" aria-hidden /></span>
      <span className="text-sm font-semibold">{name ?? 'EN Polizei'}</span>
      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">{app}</span>
    </div>
  );
}
