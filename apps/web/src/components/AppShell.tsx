import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, Shield, Star } from 'lucide-react';
import { ServerSwitcher } from './ServerSwitcher';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from '../lib/media';
import { accentHex, useStudio } from '../lib/studio';
import { useApplyPrefs, usePrefs } from '../lib/prefs';
import { flush } from '../lib/autosave';
import { GROUPS, NAV, tr, visible, type NavItem } from '../nav';
import { DiscordLink } from './DiscordLink';
import { GlobalSearch } from './GlobalSearch';
import { NotificationCenter } from './NotificationCenter';
import { SaveStatus } from './SaveStatus';
import { Toasts } from './Toasts';
import { Button } from './ui';

export function AppShell() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const studio = useStudio();
  const { prefs, update } = usePrefs();
  const loc = useLocation();
  const orgName = studio.data?.org?.name ?? 'EN Polizei';
  useApplyPrefs(prefs, accentHex(studio.data?.theme?.accent));
  useEffect(() => { document.title = orgName; }, [orgName]);
  // Seitenwechsel: offene Änderungen sofort senden (sie liegen ohnehin schon lokal vor)
  useEffect(() => { void flush(); }, [loc.pathname]);
  const items = NAV.filter((n) => visible(n, can));
  const L = (t: string) => tr(t, prefs.language);
  const favs = prefs.favorites.map((p) => items.find((i) => i.path === p)).filter((i): i is NavItem => !!i);
  const toggleFav = (path: string) => update({ favorites: prefs.favorites.includes(path) ? prefs.favorites.filter((p) => p !== path) : [...prefs.favorites, path].slice(0, 30) });
  const collapsed = prefs.sidebarCollapsed;
  const tablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const link = (i: NavItem, fav = false) => (
    <div key={(fav ? 'f' : '') + i.path} className="group relative">
      <NavLink to={i.path} onClick={() => setOpen(false)} title={collapsed ? L(i.label) : undefined} className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-primary/15 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
        <i.icon size={16} aria-hidden className="shrink-0" />{!collapsed && <span className="min-w-0 truncate">{L(i.label)}</span>}
      </NavLink>
      {!collapsed && <button type="button" aria-label={prefs.favorites.includes(i.path) ? `${L(i.label)} aus Favoriten entfernen` : `${L(i.label)} zu Favoriten`} onClick={() => toggleFav(i.path)}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 ${prefs.favorites.includes(i.path) ? 'text-warning' : 'text-muted opacity-0 group-hover:opacity-100 focus:opacity-100'}`}>
        <Star size={12} fill={prefs.favorites.includes(i.path) ? 'currentColor' : 'none'} aria-hidden />
      </button>}
    </div>
  );
  const sidebar = (
    <nav aria-label="Hauptmenü" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {favs.length > 0 && <div><p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{collapsed ? '★' : '⭐ Favoriten'}</p>{favs.map((i) => link(i, true))}</div>}
      {GROUPS.map((g) => {
        const gi = items.filter((i) => i.group === g);
        return gi.length ? <div key={g}>{!collapsed && <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{L(g)}</p>}{gi.map((i) => link(i))}</div> : null;
      })}
    </nav>
  );
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:p-2">Zum Inhalt springen</a>
      {/* Tablet hochkant: schmale Symbol-Leiste; ☰ öffnet das volle Menü mit Beschriftungen */}
      {tablet && <nav aria-label="Schnellnavigation" className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel py-2">
        <Shield size={20} className="mb-2 mt-2 text-primary" aria-hidden />
        {items.map((i) => (
          <NavLink key={i.path} to={i.path} title={L(i.label)} aria-label={L(i.label)} className={({ isActive }) => `grid h-11 w-11 shrink-0 place-items-center rounded-md ${isActive ? 'bg-primary/15 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
            <i.icon size={20} aria-hidden />
          </NavLink>
        ))}
      </nav>}
      <aside className={`hidden shrink-0 flex-col border-r border-line bg-panel lg:flex ${collapsed ? 'w-16' : 'sidebar'}`}>
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 font-semibold">{collapsed ? <Shield size={20} className="mx-auto text-primary" aria-hidden /> : <ServerSwitcher orgName={orgName} />}</div>
        <div className="min-h-0 flex-1">{sidebar}</div>
        <button type="button" onClick={() => update({ sidebarCollapsed: !collapsed })} aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'} className="flex items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted hover:text-fg">
          {collapsed ? <ChevronsRight size={16} aria-hidden /> : <><ChevronsLeft size={16} aria-hidden />Einklappen</>}
        </button>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-64 max-w-[85vw] flex-col bg-panel" onClick={(e) => e.stopPropagation()}><div className="flex h-14 shrink-0 items-center border-b border-line px-2 font-semibold"><ServerSwitcher orgName={orgName} onPicked={() => setOpen(false)} /></div><div className="min-h-0 flex-1 overflow-y-auto">{sidebar}</div></aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-line bg-panel px-2 sm:gap-3 sm:px-4">
          <Button variant="ghost" className="lg:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}><Menu size={18} /></Button>
          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <SaveStatus />
            <DiscordLink />
            <NotificationCenter />
            <div className="hidden text-right text-xs sm:block"><p className="font-medium">{user?.displayName}</p><p className="text-muted">{user?.roles.join(', ') || 'Keine Rolle'}</p></div>
            <Button variant="ghost" aria-label="Abmelden" onClick={() => void flush().finally(() => void logout())}><LogOut size={16} /></Button>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">{can('dashboard.view') ? <Outlet /> : <NoAccess />}</main>
        <Toasts />
      </div>
    </div>
  );
}

/** Angemeldet, aber im gewählten Server ohne freigeschaltete Rolle. */
function NoAccess() {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl" aria-hidden>🔒</p>
      <h1 className="mt-2 text-lg font-semibold">Kein Zugriff</h1>
      <p className="mt-1 text-sm text-muted">Du besitzt keine Discord-Rolle, die für den Zugriff auf dieses Dashboard freigeschaltet ist.</p>
      <p className="mt-3 text-xs text-muted">Hast du Rechte auf einem anderen Server? Wähle ihn oben links aus.</p>
    </div>
  );
}
