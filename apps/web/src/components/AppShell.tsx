import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Menu, Monitor, Search, Shield, Star } from 'lucide-react';
import { ServerSwitcher } from './ServerSwitcher';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from '../lib/media';
import { accentHex, useStudio } from '../lib/studio';
import { useApplyPrefs, usePrefs } from '../lib/prefs';
import { flush } from '../lib/autosave';
import { useActivityHeartbeat } from '../lib/activity';
import { GROUPS, href, isActive, NAV, navFor, searchNav, sectionFor, tr, visible, visibleTabs, type NavItem } from '../nav';
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
  const nav = useNavigate();
  const orgName = studio.data?.org?.name ?? 'EN Polizei';
  useApplyPrefs(prefs, accentHex(studio.data?.theme?.accent));
  useEffect(() => { document.title = orgName; }, [orgName]);
  // Seitenwechsel: offene Änderungen sofort senden (sie liegen ohnehin schon lokal vor)
  useEffect(() => { void flush(); }, [loc.pathname]);
  useActivityHeartbeat(!!user && can('team.view'));
  const items = NAV.filter((n) => visible(n, can));
  const L = (t: string) => tr(t, prefs.language);
  const favs = [...new Set(prefs.favorites.map((p) => navFor(items, p)).filter((i): i is NavItem => !!i))];
  // Favoriten können noch alte Pfade enthalten (z. B. /teamlist) – sie zählen für den zusammengefassten Menüpunkt
  const isFav = (i: NavItem) => favs.includes(i);
  const toggleFav = (i: NavItem) => update({ favorites: isFav(i) ? prefs.favorites.filter((p) => navFor([i], p) !== i) : [...prefs.favorites, i.path].slice(0, 30) });
  const collapsed = prefs.sidebarCollapsed;
  const tablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const collapsedGroups = prefs.collapsedGroups ?? [];
  const toggleGroup = (g: string) => update({ collapsedGroups: collapsedGroups.includes(g) ? collapsedGroups.filter((x) => x !== g) : [...collapsedGroups, g] });
  const [filter, setFilter] = useState('');
  const hits = searchNav(items, filter, can);
  const filterRef = useRef<HTMLInputElement>(null);
  // „/“ springt in die Menüsuche (nicht in Eingabefeldern)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.metaKey || t?.closest('input,textarea,select,[contenteditable=true]')) return;
      if (!filterRef.current?.offsetParent) return;
      e.preventDefault(); filterRef.current.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const go = (to: string) => { setFilter(''); setOpen(false); nav(to); };
  // Menü-Inhalt; `collapsed` nur in der Desktop-Leiste (die aufgeklappte Handy-/Tablet-Leiste zeigt immer Beschriftungen)
  const menu = (collapsed: boolean) => {
  const link = (i: NavItem, fav = false, to = href(i, can), via?: string) => (
    <div key={(fav ? 'f' : '') + i.path + (via ?? '')} className="group relative">
      <NavLink to={to} onClick={() => { setOpen(false); setFilter(''); }} title={collapsed ? L(i.label) : via ? `${L(i.label)} › ${via}` : undefined}
        aria-current={isActive(i, loc.pathname) ? 'page' : undefined}
        className={() => `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors ${collapsed ? 'justify-center' : ''} ${isActive(i, loc.pathname) ? 'bg-primary/15 font-medium text-fg shadow-[inset_2px_0_0_var(--color-primary)]' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
        <i.icon size={16} aria-hidden className="shrink-0" />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{L(i.label)}{via && <span className="block truncate text-[11px] text-muted">› {via}</span>}</span>}
      </NavLink>
      {!collapsed && !via && <button type="button" aria-label={isFav(i) ? `${L(i.label)} aus Favoriten entfernen` : `${L(i.label)} zu Favoriten`} onClick={() => toggleFav(i)}
        className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 ${isFav(i) ? 'text-warning' : 'text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-60'}`}>
        <Star size={12} fill={isFav(i) ? 'currentColor' : 'none'} aria-hidden />
      </button>}
    </div>
  );
  const heading = (text: string, g?: string) => {
    if (collapsed) return <div className="mx-auto mb-1 h-px w-6 bg-line" aria-hidden />;
    if (!g) return <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{text}</p>;
    const shut = collapsedGroups.includes(g);
    return (
      <button type="button" onClick={() => toggleGroup(g)} aria-expanded={!shut} className="mb-1 flex w-full items-center justify-between rounded px-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg">
        {text}<ChevronDown size={12} aria-hidden className={`transition-transform ${shut ? '-rotate-90' : ''}`} />
      </button>
    );
  };
  return (
    <nav aria-label="Hauptmenü" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {!collapsed && (
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input ref={filterRef} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Menü durchsuchen…" aria-label="Menü durchsuchen"
            onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].to); if (e.key === 'Escape') setFilter(''); }}
            className="w-full rounded-md border border-line bg-bg py-1.5 pl-8 pr-8 text-sm placeholder:text-muted/70 focus:border-primary" />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 text-[10px] text-muted lg:block" aria-hidden>/</kbd>
        </div>
      )}
      {filter.trim() ? (
        <div>{heading('Treffer')}{hits.length ? hits.map((h) => link(h.item, false, h.to, h.via)) : <p className="px-2 py-3 text-sm text-muted">Kein Menüpunkt gefunden.</p>}</div>
      ) : <>
        {favs.length > 0 && <div>{heading(collapsed ? '★' : 'Favoriten')}{favs.map((i) => link(i, true))}</div>}
        {GROUPS.map((g) => {
          const gi = items.filter((i) => i.group === g);
          const shut = !collapsed && collapsedGroups.includes(g) && !gi.some((i) => isActive(i, loc.pathname));
          return gi.length ? <div key={g}>{heading(L(g), g)}{!shut && gi.map((i) => link(i))}</div> : null;
        })}
      </>}
    </nav>
  );
  };
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:p-2">Zum Inhalt springen</a>
      {/* Tablet hochkant: schmale Symbol-Leiste; ☰ öffnet das volle Menü mit Beschriftungen */}
      {tablet && <nav aria-label="Schnellnavigation" className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel py-2">
        <Shield size={20} className="mb-2 mt-2 text-primary" aria-hidden />
        {GROUPS.map((g, gi) => {
          const its = items.filter((i) => i.group === g);
          return its.length ? <div key={g} className="flex flex-col items-center gap-1">
            {gi > 0 && <div className="my-1 h-px w-8 bg-line" aria-hidden />}
            {its.map((i) => (
              <NavLink key={i.path} to={href(i, can)} title={L(i.label)} aria-label={L(i.label)} className={() => `grid h-11 w-11 shrink-0 place-items-center rounded-md ${isActive(i, loc.pathname) ? 'bg-primary/15 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
                <i.icon size={20} aria-hidden />
              </NavLink>
            ))}
          </div> : null;
        })}
        <button type="button" onClick={() => setOpen(true)} aria-label="Menü mit Beschriftungen öffnen" className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-fg"><Menu size={20} aria-hidden /></button>
      </nav>}
      <aside className={`hidden shrink-0 flex-col border-r border-line bg-panel lg:flex ${collapsed ? 'w-16' : 'sidebar'}`}>
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 font-semibold">{collapsed ? <Shield size={20} className="mx-auto text-primary" aria-hidden /> : <ServerSwitcher orgName={orgName} />}</div>
        <div className="min-h-0 flex-1">{menu(collapsed)}</div>
        <button type="button" onClick={() => update({ sidebarCollapsed: !collapsed })} aria-label={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'} className="flex items-center gap-2 border-t border-line px-4 py-2 text-xs text-muted hover:text-fg">
          {collapsed ? <ChevronsRight size={16} aria-hidden /> : <><ChevronsLeft size={16} aria-hidden />Einklappen</>}
        </button>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}><aside className="flex h-full w-64 max-w-[85vw] flex-col bg-panel" onClick={(e) => e.stopPropagation()}><div className="flex h-14 shrink-0 items-center border-b border-line px-2 font-semibold"><ServerSwitcher orgName={orgName} onPicked={() => setOpen(false)} /></div><div className="min-h-0 flex-1 overflow-y-auto">{menu(false)}</div></aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b border-line bg-panel px-2 sm:gap-3 sm:px-4">
          <Button variant="ghost" className="lg:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}><Menu size={18} /></Button>
          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            {can('dashboard.view') && <Link to="/mdt" className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-fg hover:opacity-90" title="Polizei-MDT öffnen"><Monitor size={14} aria-hidden /><span className="hidden sm:inline">MDT öffnen</span></Link>}
            <SaveStatus />
            <DiscordLink />
            <NotificationCenter />
            <div className="hidden text-right text-xs sm:block"><p className="font-medium">{user?.displayName}</p><p className="text-muted">{user?.roles.join(', ') || 'Keine Rolle'}</p></div>
            <Button variant="ghost" aria-label="Abmelden" onClick={() => void flush().finally(() => void logout())}><LogOut size={16} /></Button>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-3 pb-20 sm:p-4 sm:pb-20 md:pb-4 lg:p-6">{can('dashboard.view') ? <><SectionTabs /><Outlet /></> : <NoAccess />}</main>
        {!tablet && <BottomBar items={items} favs={favs} onMenu={() => setOpen(true)} />}
        <Toasts />
      </div>
    </div>
  );
}

/** Reiterleiste eines zusammengefassten Menüpunkts (z. B. Leitstelle: CAD · klassisch · Einsätze) – nur mit mehr als einem erlaubten Reiter. */
function SectionTabs() {
  const { can } = useAuth();
  const loc = useLocation();
  const section = sectionFor(loc.pathname);
  const tabs = section ? visibleTabs(section, can) : [];
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={section!.label} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const on = loc.pathname === t.path || loc.pathname.startsWith(`${t.path}/`);
        return <NavLink key={t.path} to={t.path} aria-current={on ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${on ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg'}`}>{t.label}</NavLink>;
      })}
    </nav>
  );
}

/** Handy: feste Leiste unten mit den wichtigsten Bereichen (Favoriten zuerst) und dem vollen Menü. */
function BottomBar({ items, favs, onMenu }: { items: NavItem[]; favs: NavItem[]; onMenu: () => void }) {
  const { can } = useAuth();
  const loc = useLocation();
  const defaults = ['/dashboard', '/cad', '/persons', '/mdt'].map((p) => navFor(items, p)).filter((i): i is NavItem => !!i);
  const pick = [...new Set([...favs, ...defaults])].slice(0, 4);
  if (!pick.length) return null;
  return (
    <nav aria-label="Schnellzugriff" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${pick.length + 1}, minmax(0, 1fr))` }}>
      {pick.map((i) => {
        const on = isActive(i, loc.pathname);
        const Icon = i.icon;
        return <NavLink key={i.path} to={href(i, can)} aria-current={on ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${on ? 'text-primary' : 'text-muted'}`}><Icon size={20} aria-hidden /><span className="w-full truncate text-center">{i.label}</span></NavLink>;
      })}
      <button type="button" onClick={onMenu} className="flex flex-col items-center gap-0.5 px-1 py-2 text-[11px] text-muted"><Menu size={20} aria-hidden /><span>Menü</span></button>
    </nav>
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
