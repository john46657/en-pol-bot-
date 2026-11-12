import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Menu, Search, Shield, Star } from 'lucide-react';
import { ServerSwitcher } from './ServerSwitcher';
import { useAuth } from '../lib/auth';
import { useMediaQuery } from '../lib/media';
import { useStudio } from '../lib/studio';
import { useAppearance, usePrefs } from '../lib/prefs';
import { flush } from '../lib/autosave';
import { ALARM_PATHS, badgeFor, useNavBadges } from '../lib/badges';
import { useActivityHeartbeat } from '../lib/activity';
import { GROUPS, href, isActive, NAV, navFor, searchNav, sectionFor, tr, visible, visibleTabs, type NavItem } from '../nav';
import { DiscordLink } from './DiscordLink';
import { GlobalSearch } from './GlobalSearch';
import { NotificationCenter } from './NotificationCenter';
import { SaveStatus } from './SaveStatus';
import { DangerPill, DutyButton } from './StatusBar';
import { Toasts } from './Toasts';
import { ConfirmHost } from './ui';

/** Leitstelle und MDT bringen eigene Reiter mit (siehe CadLayout/MdtShell) – dort keine zweite Reiterleiste. */
const ownTabs = (path: string) => /^\/(cad|mdt)(\/|$)/.test(path);
const initialsOf = (name?: string) => (name ?? '?').split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase();

/**
 * Rahmen des Dashboards (Design-System „Leitstelle & MDT“): eine Menüleiste für alle Bereiche – auch Leitstelle und MDT –,
 * Kopfzeile mit Gefahrenstatus, eigenem Dienst, Suche und Benachrichtigungen; Unterbereiche als Reiter über dem Inhalt.
 */
export function AppShell() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const studio = useStudio();
  const { prefs, update } = usePrefs();
  const loc = useLocation();
  const nav = useNavigate();
  const orgName = studio.data?.org?.name ?? 'EN Polizei';
  useAppearance();
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
  const badges = useNavBadges();
  const countFor = (i: NavItem) => badgeFor(badges, i.tabs ? visibleTabs(i, can).map((t) => t.path) : [i.path]);
  const alarmFor = (i: NavItem) => (i.tabs ? visibleTabs(i, can).map((t) => t.path) : [i.path]).some((p) => ALARM_PATHS.includes(p) && (badges[p] ?? 0) > 0);
  // ältere Einstellungen speichern Gruppen noch mit englischem Schlüssel – beide gelten
  const collapsedGroups = (prefs.collapsedGroups ?? []).map((g) => tr(g));
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
  const current = items.filter((n) => isActive(n, loc.pathname)).sort((x, y) => y.path.length - x.path.length)[0];

  const count = (i: NavItem, small = false) => {
    const n = countFor(i);
    if (!n) return null;
    const alarm = alarmFor(i);
    if (small) return <span className={`absolute -right-1.5 -top-1.5 size-2 rounded-full ${alarm ? 'bg-danger' : 'bg-warning'}`} aria-hidden />;
    return <span className={`ml-auto grid h-5 min-w-[22px] place-items-center rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums ${alarm ? 'bg-danger text-danger-fg' : 'bg-panel-2 text-fg'}`} title={alarm ? 'Offene Notrufe' : 'Offene Vorgänge'}>{n > 99 ? '99+' : n}<span className="sr-only"> offen</span></span>;
  };

  // Menü-Inhalt; `collapsed` nur in der Desktop-Leiste (die aufgeklappte Handy-/Tablet-Leiste zeigt immer Beschriftungen)
  const menu = (collapsed: boolean) => {
    const link = (i: NavItem, fav = false, to = href(i, can), via?: string) => {
      const on = isActive(i, loc.pathname);
      return (
        <div key={(fav ? 'f' : '') + i.path + (via ?? '')} className="group relative">
          <NavLink to={to} onClick={() => { setOpen(false); setFilter(''); }} title={collapsed ? L(i.label) : via ? `${L(i.label)} › ${via}` : undefined}
            aria-current={on ? 'page' : undefined}
            className={() => `flex min-h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors ${collapsed ? 'justify-center px-0' : ''} ${on ? 'bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] font-semibold text-fg shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'font-medium text-muted hover:bg-panel-2 hover:text-fg'}`}>
            <span className="relative shrink-0"><i.icon size={18} aria-hidden />{collapsed && count(i, true)}</span>
            {!collapsed && <span className="min-w-0 flex-1 truncate">{L(i.label)}{via && <span className="block truncate text-[11px] font-normal text-muted">› {via}</span>}</span>}
            {!collapsed && !via && <span className="flex items-center group-hover:mr-5 group-focus-within:mr-5">{count(i)}</span>}
          </NavLink>
          {!collapsed && !via && <button type="button" aria-label={isFav(i) ? `${L(i.label)} aus Favoriten entfernen` : `${L(i.label)} zu Favoriten`} onClick={() => toggleFav(i)}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 ${isFav(i) ? 'text-warning' : 'text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-60'}`}>
            <Star size={12} fill={isFav(i) ? 'currentColor' : 'none'} aria-hidden />
          </button>}
        </div>
      );
    };
    const heading = (text: string, g?: string) => {
      if (collapsed) return <div className="mx-auto mb-1 h-px w-6 bg-line" aria-hidden />;
      if (!g) return <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted">{text}</p>;
      const shut = collapsedGroups.includes(g);
      return (
        <button type="button" onClick={() => toggleGroup(g)} aria-expanded={!shut} className="mb-1 flex w-full items-center justify-between rounded px-3 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg">
          {text}<ChevronDown size={12} aria-hidden className={`transition-transform ${shut ? '-rotate-90' : ''}`} />
        </button>
      );
    };
    return (
      <nav aria-label="Hauptmenü" className={`flex h-full flex-col gap-4 overflow-y-auto py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input ref={filterRef} type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Menü durchsuchen" aria-label="Menü durchsuchen"
              onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) go(hits[0].to); if (e.key === 'Escape') setFilter(''); }}
              className="h-10 w-full rounded-md border border-line bg-transparent pl-9 pr-8 text-[13px] placeholder:text-muted focus:border-primary" />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 font-mono text-[11px] text-muted lg:block" aria-hidden>/</kbd>
          </div>
        )}
        {filter.trim() ? (
          <div>{heading('Treffer')}{hits.length ? hits.map((h) => link(h.item, false, h.to, h.via)) : <p className="px-3 py-3 text-sm text-muted">Kein Menüpunkt gefunden.</p>}</div>
        ) : <>
          {favs.length > 0 && <div className="grid gap-0.5">{heading(collapsed ? '★' : 'Favoriten')}{favs.map((i) => link(i, true))}</div>}
          {GROUPS.map((g) => {
            const gi = items.filter((i) => i.group === g);
            const shut = !collapsed && collapsedGroups.includes(g) && !gi.some((i) => isActive(i, loc.pathname));
            return gi.length ? <div key={g} className="grid gap-0.5">{heading(L(g), g)}{!shut && gi.map((i) => link(i))}</div> : null;
          })}
        </>}
      </nav>
    );
  };

  const brand = (onPicked?: () => void) => (
    <div className="flex h-16 shrink-0 items-center gap-2 border-b border-line px-3 font-semibold">
      <ServerSwitcher orgName={orgName} onPicked={onPicked} />
    </div>
  );
  const me = (
    <Link to="/me/settings" className="flex items-center gap-3 rounded-md p-2 hover:bg-panel-2" title="Persönliche Einstellungen">
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-panel-2 text-[13px] font-bold" aria-hidden>{initialsOf(user?.displayName)}</span>
      <span className="min-w-0 text-xs"><span className="block truncate text-sm font-semibold">{user?.displayName}</span><span className="block truncate text-muted">{user?.roles[0] ?? 'Keine Rolle'}</span></span>
    </Link>
  );

  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:p-2 focus:text-primary-fg">Zum Inhalt springen</a>
      {/* Tablet hochkant: schmale Symbol-Leiste; ☰ öffnet das volle Menü mit Beschriftungen */}
      {tablet && <nav aria-label="Schnellnavigation" className="flex w-16 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-line bg-panel py-2">
        <span className="mb-2 mt-1 grid size-9 place-items-center rounded-md bg-primary text-primary-fg" aria-hidden><Shield size={18} /></span>
        {GROUPS.map((g, gi) => {
          const its = items.filter((i) => i.group === g);
          return its.length ? <div key={g} className="flex flex-col items-center gap-1">
            {gi > 0 && <div className="my-1 h-px w-8 bg-line" aria-hidden />}
            {its.map((i) => (
              <NavLink key={i.path} to={href(i, can)} title={L(i.label)} aria-label={L(i.label)} className={() => `grid h-11 w-11 shrink-0 place-items-center rounded-md ${isActive(i, loc.pathname) ? 'bg-[color-mix(in_srgb,var(--color-primary)_16%,transparent)] text-fg shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
                <span className="relative"><i.icon size={20} aria-hidden />{count(i, true)}</span>
              </NavLink>
            ))}
          </div> : null;
        })}
        <button type="button" onClick={() => setOpen(true)} aria-label="Menü mit Beschriftungen öffnen" className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-fg"><Menu size={20} aria-hidden /></button>
      </nav>}
      <aside className={`hidden shrink-0 flex-col border-r border-line bg-panel lg:flex ${collapsed ? 'w-16' : 'sidebar'}`}>
        {collapsed ? <div className="grid h-16 shrink-0 place-items-center border-b border-line"><span className="grid size-9 place-items-center rounded-md bg-primary text-primary-fg" aria-hidden><Shield size={20} /></span></div> : brand()}
        <div className="min-h-0 flex-1">{menu(collapsed)}</div>
        <div className="border-t border-line p-2">
          {!collapsed && me}
          <button type="button" onClick={() => update({ sidebarCollapsed: !collapsed })} aria-label={collapsed ? 'Menü ausklappen' : 'Menü einklappen'} className={`mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs text-muted hover:bg-panel-2 hover:text-fg ${collapsed ? 'justify-center px-0' : ''}`}>
            {collapsed ? <ChevronsRight size={16} aria-hidden /> : <><ChevronsLeft size={16} aria-hidden />Einklappen</>}
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
        <aside className="flex h-full w-72 max-w-[85vw] flex-col bg-panel" onClick={(e) => e.stopPropagation()}>
          {brand(() => setOpen(false))}
          <div className="min-h-0 flex-1 overflow-y-auto">{menu(false)}</div>
          <div className="border-t border-line p-2">{me}</div>
        </aside>
      </div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel px-2 py-2 sm:px-4 lg:flex-nowrap lg:px-6">
          <button type="button" className="grid size-10 place-items-center rounded-md text-fg hover:bg-panel-2 lg:hidden" aria-label="Menü öffnen" onClick={() => setOpen(true)}><Menu size={18} /></button>
          {current && <div className="hidden min-w-0 md:block">
            <p className="text-xs leading-4 text-muted">{L(current.group)}</p>
            <p className="truncate text-[15px] font-semibold leading-5">{L(current.label)}</p>
          </div>}
          <div className="flex min-w-0 flex-1 lg:ml-4 lg:max-w-md"><GlobalSearch /></div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2 lg:shrink-0 lg:flex-nowrap">
            <DangerPill />
            <DutyButton />
            <SaveStatus />
            <DiscordLink />
            <NotificationCenter />
            <button type="button" className="grid size-10 place-items-center rounded-md text-muted hover:bg-panel-2 hover:text-fg" aria-label="Abmelden" title="Abmelden" onClick={() => void flush().finally(() => void logout())}><LogOut size={16} /></button>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {can('dashboard.view') || ownTabs(loc.pathname) ? <>{!ownTabs(loc.pathname) && <SectionTabs />}<Outlet /></> : <NoAccess />}
        </main>
        {/* Platzhalter: der Inhalt (auch fixierte Speichern-Leisten) endet über der Handy-Leiste */}
        {!tablet && <><div className="h-bottombar shrink-0 md:hidden" aria-hidden /><BottomBar items={items} favs={favs} onMenu={() => setOpen(true)} /></>}
        <Toasts />
        <ConfirmHost />
      </div>
    </div>
  );
}

/** Reiterleiste eines zusammengefassten Menüpunkts (z. B. Personal · Verwarnungen · Beförderungen) – nur mit mehr als einem erlaubten Reiter. */
function SectionTabs() {
  const { can } = useAuth();
  const loc = useLocation();
  const section = sectionFor(loc.pathname);
  const tabs = section ? visibleTabs(section, can) : [];
  if (tabs.length < 2) return null;
  return <TabBar label={section!.label} tabs={tabs.map((t) => ({ to: t.path, label: t.label }))} />;
}

/** Reiter unter der Kopfzeile – auch von Leitstelle und MDT genutzt. `end`: nur bei genau dieser Adresse aktiv. */
export function TabBar({ label, tabs }: { label: string; tabs: { to: string; label: string; end?: boolean }[] }) {
  const loc = useLocation();
  // der längste passende Pfad gewinnt (z. B. /cad/incidents vor /cad)
  const active = tabs.filter((t) => (t.end ? loc.pathname === t.to : loc.pathname === t.to || loc.pathname.startsWith(`${t.to}/`))).sort((a, b) => b.to.length - a.to.length)[0];
  return (
    <nav aria-label={label} className="-mx-3 mb-4 flex gap-1 overflow-x-auto border-b border-line px-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:-mt-2 lg:px-6">
      {tabs.map((t) => {
        const on = t === active;
        return <NavLink key={t.to} to={t.to} end={t.end} aria-current={on ? 'page' : undefined} className={`whitespace-nowrap border-b-2 px-2 py-2.5 text-sm ${on ? 'border-primary font-semibold text-fg' : 'border-transparent text-muted hover:text-fg'}`}>{t.label}</NavLink>;
      })}
    </nav>
  );
}

/** Handy: feste Leiste unten mit den wichtigsten Bereichen (Favoriten zuerst) und dem vollen Menü. */
function BottomBar({ items, favs, onMenu }: { items: NavItem[]; favs: NavItem[]; onMenu: () => void }) {
  const { can } = useAuth();
  const loc = useLocation();
  const defaults = ['/dashboard', '/cad', '/mdt', '/persons'].map((p) => navFor(items, p)).filter((i): i is NavItem => !!i);
  const pick = [...new Set([...favs, ...defaults])].slice(0, 4);
  if (!pick.length) return null;
  return (
    <nav aria-label="Schnellzugriff" className="fixed inset-x-0 bottom-0 z-30 grid h-bottombar border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${pick.length + 1}, minmax(0, 1fr))` }}>
      {pick.map((i) => {
        const on = isActive(i, loc.pathname);
        const Icon = i.icon;
        return <NavLink key={i.path} to={href(i, can)} aria-current={on ? 'page' : undefined} className={`flex min-w-0 flex-col items-center gap-0.5 px-1 py-2 text-[11px] ${on ? 'font-semibold text-primary' : 'text-muted'}`}><Icon size={20} aria-hidden /><span className="w-full truncate text-center">{i.label}</span></NavLink>;
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
