import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { api, guildIcon, type GuildOverview } from '../api';
import { UserMenu } from '../components/UserMenu';

type Needs = 'any' | 'view' | 'admin' | 'panels';
const NAV: { to: string; label: string; icon: string; end?: boolean; needs: Needs }[] = [
  { to: '', label: 'Übersicht', icon: '🏠', end: true, needs: 'any' },
  { to: 'settings', label: 'Rollen & Kanäle wählen', icon: '⚙️', needs: 'view' },
  { to: 'roles', label: 'Rollen', icon: '🎭', needs: 'view' },
  { to: 'channels', label: 'Kanäle', icon: '#️⃣', needs: 'view' },
  { to: 'applications', label: 'Bewerbungen', icon: '📋', needs: 'view' },
  { to: 'panels', label: 'Panels', icon: '🧩', needs: 'panels' },
  { to: 'users', label: 'Benutzer', icon: '👥', needs: 'admin' },
  { to: 'profiles', label: 'Profile', icon: '🧾', needs: 'admin' },
  { to: 'permissions', label: 'Berechtigungen', icon: '🔐', needs: 'admin' },
  { to: 'logs', label: 'Logs', icon: '📜', needs: 'admin' },
];

/** Rahmen für alle Server-Seiten: Sidebar (mobil einklappbar), Kopfzeile mit Serverwechsel. */
export function GuildLayout() {
  const { guildId = '' } = useParams();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
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
    (needs === 'panels' && me.data.permissions.includes('panels.view'));
  const icon = g.data && guildIcon(g.data.id, g.data.icon);
  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
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
      </aside>
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
            {icon && <img className="icon" src={icon} alt="" width={28} height={28} />}
            <strong>{g.data?.name ?? 'Server'}</strong>
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
