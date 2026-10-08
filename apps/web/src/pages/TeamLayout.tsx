import { NavLink, Outlet } from 'react-router';

const TABS = [
  { to: '/team', label: 'Team' },
  { to: '/teamlist', label: 'Teamliste' },
  { to: '/staff-lists', label: 'Staff-Liste (Discord)' },
];

/** Team, Teamliste und Staff-Liste (Discord) als ein Menüpunkt mit Reitern. */
export function TeamLayout() {
  return (
    <div>
      <nav aria-label="Team" className="-mx-1 mb-3 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>{t.label}</NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
