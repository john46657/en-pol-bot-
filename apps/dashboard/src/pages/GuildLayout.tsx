import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router';
import { api, guildIcon, type GuildOverview } from '../api';
import { UserMenu } from '../components/UserMenu';

const NAV = [
  { to: '', label: 'Übersicht', icon: '🏠', end: true },
  { to: 'settings', label: 'Rollen & Kanäle wählen', icon: '⚙️' },
  { to: 'roles', label: 'Rollen', icon: '🎭' },
  { to: 'channels', label: 'Kanäle', icon: '#️⃣' },
  { to: 'permissions', label: 'Berechtigungen', icon: '🔐' },
  { to: 'logs', label: 'Logs', icon: '📜' },
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
  const icon = g.data && guildIcon(g.data.id, g.data.icon);
  return (
    <div className={`shell ${open ? 'nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Navigation">
        <div className="brand">NEXUS</div>
        <nav>
          {NAV.map((n) => (
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
          <Outlet />
        </div>
      </div>
    </div>
  );
}
