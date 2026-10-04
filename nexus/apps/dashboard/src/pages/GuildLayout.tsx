import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { api, guildIcon, type GuildOverview } from '../api';
import { HealthBadge } from '../components/HealthBadge';
import { UserMenu } from '../components/UserMenu';
import { useLive } from '../live';
import { DesignBackground, useDesign } from '../design/useDesign';

type Needs = 'any' | 'view' | 'admin' | 'panels' | 'submissions' | 'personnel' | 'structure' | 'shifts' | 'duty' | 'radio' | 'operations' | 'danger' | 'wanted' | 'fleet' | 'penalties' | 'training' | 'qualifications' | 'promotions' | 'sek' | 'tickets' | 'absences' | 'reports' | 'automation' | 'design';
const NAV: { to: string; label: string; icon: string; end?: boolean; needs: Needs }[] = [
  { to: '', label: 'Übersicht', icon: '🏠', end: true, needs: 'any' },
  { to: 'settings', label: 'Rollen & Kanäle wählen', icon: '⚙️', needs: 'view' },
  { to: 'roles', label: 'Rollen', icon: '🎭', needs: 'view' },
  { to: 'channels', label: 'Kanäle', icon: '#️⃣', needs: 'view' },
  { to: 'applications', label: 'Bewerbungen', icon: '📋', needs: 'view' },
  { to: 'submissions', label: 'Einreichungen', icon: '📥', needs: 'submissions' },
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
  { to: 'training', label: 'Ausbildung', icon: '🎓', needs: 'training' },
  { to: 'qualifications', label: 'Qualifikationen', icon: '🏅', needs: 'qualifications' },
  { to: 'promotions', label: 'Beförderungen', icon: '📈', needs: 'promotions' },
  { to: 'sek', label: 'SEK', icon: '🛡️', needs: 'sek' },
  { to: 'tickets', label: 'Tickets', icon: '🎫', needs: 'tickets' },
  { to: 'absences', label: 'Abmeldungen', icon: '🏖️', needs: 'absences' },
  { to: 'reports', label: 'Berichte', icon: '📊', needs: 'reports' },
  { to: 'design', label: 'Design & Erscheinungsbild', icon: '🎨', needs: 'design' },
  { to: 'panels', label: 'Panels', icon: '🧩', needs: 'panels' },
  { to: 'users', label: 'Benutzer', icon: '👥', needs: 'admin' },
  { to: 'profiles', label: 'Profile', icon: '🧾', needs: 'admin' },
  { to: 'permissions', label: 'Berechtigungen', icon: '🔐', needs: 'admin' },
  { to: 'automation', label: 'Automatisierung', icon: '🤖', needs: 'admin' },
  { to: 'logs', label: 'Logs', icon: '📜', needs: 'admin' },
];

/** Rahmen für alle Server-Seiten: Sidebar (mobil einklappbar), Kopfzeile mit Serverwechsel. */
export function GuildLayout() {
  const { guildId = '' } = useParams();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const live = useLive(guildId);
  const { config: cfg } = useDesign(guildId);
  const page = pathname.split('/')[3] || 'overview';
  useEffect(() => setOpen(false), [pathname]);
  const g = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => api<GuildOverview>(`/guilds/${guildId}`),
  });
  // Nur Komfort: ausgeblendete Einträge sind serverseitig ohnehin gesperrt.
  const me = useQuery({
    queryKey: ['my-permissions', guildId],
    queryFn: () =>
      api<{ guildAdmin: boolean; permissions: string[]; dashboardAccess: boolean }>(
        `/auth/me/guilds/${guildId}/permissions`,
      ),
  });
  const allowed = (needs: Needs) =>
    !me.data ||
    me.data.guildAdmin ||
    needs === 'any' ||
    (needs === 'view' && me.data.permissions.includes('applications.view')) ||
    (needs === 'design' && me.data.permissions.includes('design.view')) ||
    (needs === 'panels' && me.data.permissions.includes('panels.view')) ||
    (needs === 'submissions' && me.data.permissions.includes('applications.submissions.view')) ||
    (needs === 'personnel' &&
      ['personnel.view', 'own.profile.view'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'reports' && me.data.permissions.includes('report.view')) ||
    (needs === 'absences' && ['absence.view', 'own.absence.create'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'tickets' && ['tickets.view', 'tickets.manage'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'sek' && ['sek.view', 'sek.manage'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'promotions' && me.data.permissions.includes('promotions.view')) ||
    (needs === 'qualifications' && me.data.permissions.includes('qualification.view')) ||
    (needs === 'training' && me.data.permissions.includes('training.view')) ||
    (needs === 'fleet' && me.data.permissions.includes('fleet.view')) ||
    (needs === 'penalties' && me.data.permissions.includes('penalties.view')) ||
    (needs === 'wanted' && me.data.permissions.includes('wanted.view')) ||
    (needs === 'danger' && me.data.permissions.includes('danger.view')) ||
    (needs === 'operations' && me.data.permissions.includes('operations.view')) ||
    (needs === 'radio' && me.data.permissions.includes('radio.view')) ||
    (needs === 'duty' && me.data.permissions.includes('duty.view')) ||
    (needs === 'shifts' &&
      ['shifts.view', 'shifts.manage'].some((k) => me.data.permissions.includes(k))) ||
    (needs === 'structure' && me.data.permissions.includes('personnel.structure.manage'));
  const discordIcon = g.data && guildIcon(g.data.id, g.data.icon);
  const logo = cfg.general.logo;
  const icon = logo.mode === 'none' ? null : logo.mode === 'upload' && logo.url ? logo.url : discordIcon;
  const serverName = cfg.general.nameMode === 'custom' && cfg.general.customName ? cfg.general.customName : (g.data?.name ?? 'Server');
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
        <div className="brand">NEXUS</div>
        <nav>
          {NAV.filter((n) => allowed(n.needs)).map((n) => (
            <NavLink
              key={n.to}
              to={`/guilds/${guildId}/${n.to}`}
              end={n.end ?? false}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span aria-hidden>{n.icon}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <HealthBadge />
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
              <img className="icon logo-img" src={icon} alt="" width={logo.width} height={logo.height} style={{ borderRadius: logo.radius, marginLeft: logo.position === 'right' ? 'auto' : undefined }} />
            )}
            {cfg.header.showName && <strong>{serverName}</strong>}
            <span className={`badge ${live === 'live' ? 'ok' : 'no'}`} title={live === 'live' ? 'Live-Aktualisierung aktiv' : live === 'connecting' ? 'Verbinde …' : 'Live-Aktualisierung getrennt – Daten werden beim Öffnen geladen'}>{live === 'live' ? '● Live' : live === 'connecting' ? '○ …' : '○ offline'}</span>
            <Link to="/servers" className="muted hide-sm">
              Server wechseln
            </Link>
          </span>
          <UserMenu />
        </header>
        <div className="content">
          {me.data && !me.data.dashboardAccess ? (
            <div className="alert error" role="alert">
              Du hast keinen Zugriff auf das Dashboard dieses Servers. Wende dich an einen
              Administrator.
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </div>
  );
}
