import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { api, guildIcon, type GuildOverview } from '../api';
import { HealthBadge } from '../components/HealthBadge';
import { UserMenu, useLogout } from '../components/UserMenu';
import { useLive } from '../live';
import { resolveNavigation, type ResolvedItem } from '@nexus/design/client';
import { DesignBackground, DesignCtx, useDesign } from '../design/useDesign';
import { assetUrl } from '../design/assetUrl';
import { BannerBar } from '../design/widgets/BannerBar';
import { HeaderSearch } from '../design/header/HeaderSearch';
import { NotificationBell } from '../design/header/NotificationBell';

type Needs =
  | 'any'
  | 'view'
  | 'admin'
  | 'panels'
  | 'submissions'
  | 'personnel'
  | 'team'
  | 'structure'
  | 'shifts'
  | 'duty'
  | 'radio'
  | 'operations'
  | 'danger'
  | 'wanted'
  | 'fleet'
  | 'penalties'
  | 'restrictions'
  | 'training'
  | 'qualifications'
  | 'promotions'
  | 'sek'
  | 'tickets'
  | 'absences'
  | 'reports'
  | 'automation'
  | 'rights'
  | 'audit'
  | 'design';
/** Was die Seiten vom Rahmen erhalten (Übersicht: Schnellzugriff, Servername, Symbol). */
export interface LayoutContext {
  nav: ResolvedItem[];
  serverName: string;
  icon: string | null | undefined;
}
export const NAV: { to: string; label: string; icon: string; end?: boolean; needs: Needs }[] = [
  { to: '', label: 'Übersicht', icon: '🏠', end: true, needs: 'any' },
  { to: 'settings', label: 'Rollen & Kanäle wählen', icon: '⚙️', needs: 'view' },
  { to: 'roles', label: 'Rollen', icon: '🎭', needs: 'view' },
  { to: 'channels', label: 'Kanäle', icon: '#️⃣', needs: 'view' },
  { to: 'applications', label: 'Bewerbungen', icon: '📋', needs: 'view' },
  { to: 'submissions', label: 'Einreichungen', icon: '📥', needs: 'submissions' },
  { to: 'team', label: 'Team', icon: '👥', needs: 'team' },
  { to: 'personnel', label: 'Personal', icon: '👮', needs: 'personnel' },
  { to: 'personnel-structure', label: 'Dienstgrade & Teams', icon: '🏷️', needs: 'structure' },
  { to: 'shifts', label: 'Schichten', icon: '🕒', needs: 'shifts' },
  { to: 'duty', label: 'Dienst & Streifen', icon: '🚓', needs: 'duty' },
  { to: 'radio', label: 'Funk', icon: '📻', needs: 'radio' },
  { to: 'operations', label: 'Einsätze', icon: '🚨', needs: 'operations' },
  { to: 'danger', label: 'Gefahrenstatus', icon: '⚠️', needs: 'danger' },
  { to: 'wanted', label: 'Fahndungen', icon: '📣', needs: 'wanted' },
  { to: 'fleet', label: 'Fuhrpark', icon: '🚓', needs: 'fleet' },
  { to: 'penalties', label: 'Strafen', icon: '⚖️', needs: 'penalties' },
  { to: 'restrictions', label: 'Sperren', icon: '⛔', needs: 'restrictions' },
  { to: 'training', label: 'Ausbildung', icon: '🎓', needs: 'training' },
  { to: 'qualifications', label: 'Qualifikationen', icon: '🏅', needs: 'qualifications' },
  { to: 'promotions', label: 'Beförderungen', icon: '📈', needs: 'promotions' },
  { to: 'sek', label: 'SEK', icon: '🛡️', needs: 'sek' },
  { to: 'tickets', label: 'Tickets', icon: '🎫', needs: 'tickets' },
  { to: 'absences', label: 'Abmeldungen', icon: '🏖️', needs: 'absences' },
  { to: 'reports', label: 'Berichte', icon: '📊', needs: 'reports' },
  { to: 'design', label: 'Design & Erscheinungsbild', icon: '🎨', needs: 'design' },
  { to: 'panels', label: 'Panels', icon: '🧩', needs: 'panels' },
  { to: 'users', label: 'Benutzer', icon: '👥', needs: 'rights' },
  { to: 'nexus-roles', label: 'Rollen & Rechte', icon: '🛂', needs: 'rights' },
  { to: 'profiles', label: 'Profile', icon: '🧾', needs: 'rights' },
  { to: 'permissions', label: 'Berechtigungen', icon: '🔐', needs: 'rights' },
  { to: 'automation', label: 'Automatisierung', icon: '🤖', needs: 'admin' },
  { to: 'logs', label: 'Logs', icon: '📜', needs: 'audit' },
];

/** Schlüssel eines Menüpunkts (Übersicht = `overview`) – so heißt er auch in der Design-Konfiguration. */
export const navKey = (to: string) => to || 'overview';
/** Menüziel eines Schlüssels: Übersicht = Wurzel, eigene Seite = `p/<adresse>`, sonst der Schlüssel selbst. */
export const navPath = (key: string) =>
  key === 'overview' ? '' : key.startsWith('page-') ? `p/${key.slice(5)}` : key;
/** Eingebaute Menüpunkte in der Form, die das Design-Paket kennt. */
export const BUILTIN_NAV = NAV.map((n) => ({ key: navKey(n.to), label: n.label, icon: n.icon }));
/** Eingebaute Menüpunkte plus die eigenen Seiten (Page Builder). */
export const navWithPages = (custom: readonly { key: string; name: string; icon: string }[]) => [
  ...BUILTIN_NAV,
  ...custom.map((c) => ({ key: c.key, label: c.name, icon: c.icon || '📄' })),
];

/** Standard-Gruppierung des Menüs, solange der Server im Design-Editor keine eigenen Gruppen angelegt hat. */
const DEFAULT_GROUPS: { id: string; name: string; keys: string[] }[] = [
  { id: 'start', name: '', keys: ['overview'] },
  { id: 'apps', name: 'Bewerbungen', keys: ['applications', 'submissions', 'panels'] },
  {
    id: 'people',
    name: 'Personal',
    keys: [
      'team',
      'personnel',
      'personnel-structure',
      'promotions',
      'qualifications',
      'training',
      'absences',
      'shifts',
    ],
  },
  {
    id: 'ops',
    name: 'Einsatz',
    keys: [
      'duty',
      'radio',
      'operations',
      'danger',
      'wanted',
      'fleet',
      'penalties',
      'restrictions',
      'sek',
    ],
  },
  { id: 'service', name: 'Service', keys: ['tickets', 'reports'] },
  {
    id: 'admin',
    name: 'Verwaltung',
    keys: [
      'settings',
      'roles',
      'channels',
      'users',
      'nexus-roles',
      'profiles',
      'permissions',
      'automation',
      'logs',
    ],
  },
  { id: 'look', name: 'Darstellung', keys: ['design'] },
];
type NavSection = {
  group: { id: string; name: string; icon?: string } | null;
  items: ResolvedItem[];
};
/** Ungruppiertes Menü → sinnvolle Gruppen (Reihenfolge der Einträge bleibt je Gruppe erhalten); eigene Seiten/Links in „Weitere“. */
export function groupByDefault(sections: readonly NavSection[]): NavSection[] {
  const items = sections.flatMap((s) => s.items);
  const used = new Set<string>();
  const out: NavSection[] = [];
  for (const g of DEFAULT_GROUPS) {
    const mine = g.keys.flatMap((k) => items.filter((i) => i.key === k));
    mine.forEach((i) => used.add(i.key));
    if (mine.length) out.push({ group: g.name ? { id: g.id, name: g.name } : null, items: mine });
  }
  const rest = items.filter((i) => !used.has(i.key));
  if (rest.length) out.push({ group: { id: 'more', name: 'Weitere' }, items: rest });
  return out;
}

/** Rahmen für alle Server-Seiten: Sidebar (mobil einklappbar), Kopfzeile mit Seitentitel. */
export function GuildLayout() {
  const { guildId = '' } = useParams();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const live = useLive(guildId);
  const logout = useLogout();
  const { config: cfg } = useDesign(guildId);
  const seg = pathname.split('/');
  const page = seg[3] === 'p' ? `page-${seg[4] ?? ''}` : seg[3] || 'overview'; // Schlüssel für Hintergründe und Banner
  useEffect(() => setOpen(false), [pathname]);
  const g = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => api<GuildOverview>(`/guilds/${guildId}`),
  });
  // Nur Komfort: ausgeblendete Einträge sind serverseitig ohnehin gesperrt.
  const me = useQuery({
    queryKey: ['my-permissions', guildId],
    queryFn: () =>
      api<{
        guildAdmin: boolean;
        roleIds?: string[];
        permissions: string[];
        dashboardAccess: boolean;
      }>(`/auth/me/guilds/${guildId}/permissions`),
  });
  const allowed = (needs: Needs) =>
    !me.data ||
    me.data.guildAdmin ||
    needs === 'any' ||
    (needs === 'view' && me.data.permissions.includes('applications.view')) ||
    (needs === 'rights' && me.data.permissions.includes('permissions.view')) ||
    (needs === 'audit' && me.data.permissions.includes('audit.view')) ||
    (needs === 'design' && me.data.permissions.includes('design.view')) ||
    (needs === 'panels' && me.data.permissions.includes('panels.view')) ||
    (needs === 'submissions' && me.data.permissions.includes('applications.submissions.view')) ||
    (needs === 'personnel' &&
      ['personnel.view', 'own.profile.view'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'team' && me.data.permissions.includes('personnel.view')) ||
    (needs === 'reports' && me.data.permissions.includes('report.view')) ||
    (needs === 'absences' &&
      ['absence.view', 'own.absence.create'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'tickets' &&
      ['tickets.view', 'tickets.manage'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'sek' && ['sek.view', 'sek.manage'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'promotions' && me.data.permissions.includes('promotions.view')) ||
    (needs === 'qualifications' && me.data.permissions.includes('qualification.view')) ||
    (needs === 'training' && me.data.permissions.includes('training.view')) ||
    (needs === 'fleet' && me.data.permissions.includes('fleet.view')) ||
    (needs === 'penalties' && me.data.permissions.includes('penalties.view')) ||
    (needs === 'restrictions' && me.data.permissions.includes('restrictions.view')) ||
    (needs === 'wanted' && me.data.permissions.includes('wanted.view')) ||
    (needs === 'danger' && me.data.permissions.includes('danger.view')) ||
    (needs === 'operations' && me.data.permissions.includes('operations.view')) ||
    (needs === 'radio' && me.data.permissions.includes('radio.view')) ||
    (needs === 'duty' && me.data.permissions.includes('duty.view')) ||
    (needs === 'shifts' &&
      ['shifts.view', 'shifts.manage'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'structure' && me.data.permissions.includes('personnel.structure.manage'));
  const needsByKey = useMemo(() => new Map(NAV.map((n) => [navKey(n.to), n.needs])), []);
  const sections: NavSection[] = useMemo(() => {
    const resolved = resolveNavigation(navWithPages(cfg.layout.custom), cfg.navigation, {
      isAdmin: me.data?.guildAdmin ?? false,
      roleIds: me.data?.roleIds ?? [],
      allowed: (key) => (key.startsWith('page-') ? true : allowed(needsByKey.get(key) ?? 'admin')),
      pinned: ['design'], // wer das Design bearbeiten darf, kann sich nicht aus dem Menü aussperren
    });
    // Hat der Server keine eigenen Gruppen angelegt, gilt die Standard-Gruppierung
    return cfg.navigation.groups.length === 0 ? groupByDefault(resolved) : resolved;
  }, [cfg.navigation, cfg.layout.custom, me.data, needsByKey]);
  const pageTitle = sections.flatMap((sec) => sec.items).find((i) => i.key === page)?.title ?? '';
  const discordIcon = g.data && guildIcon(g.data.id, g.data.icon);
  const logo = cfg.general.logo;
  const icon =
    logo.mode === 'none'
      ? null
      : logo.mode === 'upload' && logo.url
        ? assetUrl(logo.url)
        : discordIcon;
  const serverName =
    cfg.general.nameMode === 'custom' && cfg.general.customName
      ? cfg.general.customName
      : (g.data?.name ?? 'Server');
  const shellClass = [
    'shell',
    open ? 'nav-open' : '',
    !cfg.sidebar.enabled ? 'no-sidebar' : '',
    cfg.sidebar.position === 'right' ? 'sb-right' : '',
    cfg.responsive.mobileNav === 'bottom' ? 'mob-bottom' : '',
    cfg.responsive.mobileNav === 'hidden' ? 'mob-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={shellClass}>
      <DesignBackground config={cfg} page={page} />
      {cfg.sidebar.enabled && (
        <aside className="sidebar" aria-label="Navigation">
          <div className="brand">
            <span className="brand-mark" aria-hidden>
              N
            </span>
            <span className="brand-text">
              <b>NEXUS</b>
              <small>{serverName}</small>
            </span>
          </div>
          <nav>
            {sections.map((sec) => (
              <div key={sec.group?.id ?? 'loose'} className="nav-section">
                {sec.group && (
                  <div className="nav-group">
                    {sec.group.icon && <span aria-hidden>{sec.group.icon} </span>}
                    {sec.group.name}
                  </div>
                )}
                {sec.items.map((n) => {
                  const style = {
                    ...(n.color ? { '--nav-color': n.color } : {}),
                    ...(n.hoverColor ? { '--nav-hover': n.hoverColor } : {}),
                  } as CSSProperties;
                  const body = (
                    <>
                      <span className="nav-ic" aria-hidden>
                        {n.icon}
                      </span>{' '}
                      <span className="nav-label">{n.title}</span>
                      {n.badge && <span className="nav-badge">{n.badge}</span>}
                    </>
                  );
                  return n.href ? (
                    <a
                      key={n.key}
                      href={n.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={style}
                    >
                      {body}
                    </a>
                  ) : (
                    <NavLink
                      key={n.key}
                      to={`/guilds/${guildId}/${navPath(n.key)}`}
                      end={n.key === 'overview'}
                      className={({ isActive }) => (isActive ? 'active' : '')}
                      style={style}
                    >
                      {body}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="side-foot">
            <Link to="/servers">
              <span aria-hidden>⇄</span> Server wechseln
            </Link>
            <button type="button" className="side-link only-sm" onClick={() => void logout()}>
              <span aria-hidden>⎋</span> Abmelden
            </button>
            <HealthBadge />
          </div>
        </aside>
      )}
      {open && (
        <button className="scrim" aria-label="Menü schließen" onClick={() => setOpen(false)} />
      )}
      <div className="main">
        <header className="bar">
          <span className="who">
            <button
              className="btn icon-btn menu-btn"
              aria-label="Menü"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              ☰
            </button>
            {cfg.header.showLogo && icon && (
              <img
                className="icon logo-img"
                src={icon}
                alt=""
                width={logo.width}
                height={logo.height}
                style={{
                  borderRadius: logo.radius,
                  marginLeft: logo.position === 'right' ? 'auto' : undefined,
                }}
              />
            )}
            <span className="crumbs">
              {cfg.header.showName && <span className="muted hide-sm">{serverName}</span>}
              {cfg.header.showName && pageTitle && (
                <span className="sep hide-sm" aria-hidden>
                  /
                </span>
              )}
              {pageTitle && <strong className="page-title">{pageTitle}</strong>}
            </span>
            <span
              className={`badge ${live === 'live' ? 'ok' : 'no'}`}
              title={
                live === 'live'
                  ? 'Live-Aktualisierung aktiv'
                  : live === 'connecting'
                    ? 'Verbinde …'
                    : 'Live-Aktualisierung getrennt – Daten werden beim Öffnen geladen'
              }
            >
              {live === 'live' ? '● Live' : live === 'connecting' ? '○ …' : '○ offline'}
            </span>
          </span>
          <span className="who">
            {cfg.header.showSearch && (
              <HeaderSearch
                guildId={guildId}
                pages={sections.flatMap((sec) =>
                  sec.items
                    .filter((i) => !i.href)
                    .map((i) => ({
                      key: i.key,
                      title: i.title,
                      icon: i.icon,
                      path: `/${navPath(i.key)}`,
                    })),
                )}
              />
            )}
            {cfg.header.showNotifications && <NotificationBell guildId={guildId} />}
            {cfg.header.showProfile && <UserMenu />}
          </span>
        </header>
        <div className="content">
          {me.data && !me.data.dashboardAccess ? (
            <div className="alert error" role="alert">
              Du hast keinen Zugriff auf das Dashboard dieses Servers. Wende dich an einen
              Administrator.
            </div>
          ) : (
            <DesignCtx.Provider value={cfg}>
              <BannerBar config={cfg} page={page} guildId={guildId} />
              <Outlet
                context={
                  {
                    nav: sections.flatMap((sec) => sec.items),
                    serverName,
                    icon,
                  } satisfies LayoutContext
                }
              />
            </DesignCtx.Provider>
          )}
        </div>
      </div>
    </div>
  );
}
