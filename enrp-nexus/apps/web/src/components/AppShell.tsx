import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { LogOut, Menu, Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ACCENTS, useStudio } from '../lib/studio';
import { GROUPS, NAV } from '../nav';
import { DiscordLink } from './DiscordLink';
import { GlobalSearch } from './GlobalSearch';
import { NotificationCenter } from './NotificationCenter';
import { Button } from './ui';

export function AppShell() {
  const { user, can, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const studio = useStudio();
  const orgName = studio.data?.org?.name ?? 'ENRP NEXUS';
  useEffect(() => { // Akzentfarbe aus der Studio-Konfiguration; nur Werte aus der festen Palette
    document.documentElement.style.setProperty('--color-primary', ACCENTS[studio.data?.theme?.accent ?? 'blue'] ?? ACCENTS.blue!);
    document.title = orgName;
  }, [studio.data, orgName]);
  const items = NAV.filter((n) => !n.perm || can(n.perm));
  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      {GROUPS.map((g) => {
        const gi = items.filter((i) => i.group === g);
        return gi.length ? (
          <div key={g}>
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</p>
            {gi.map((i) => (
              <NavLink key={i.path} to={i.path} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${isActive ? 'bg-primary/15 text-fg' : 'text-muted hover:bg-panel-2 hover:text-fg'}`}>
                <i.icon size={16} aria-hidden />{i.label}
              </NavLink>
            ))}
          </div>
        ) : null;
      })}
    </nav>
  );
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-primary focus:p-2">Skip to content</a>
      <aside className="hidden w-60 shrink-0 border-r border-line bg-panel lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-line px-4 font-semibold"><Shield size={18} className="text-primary" aria-hidden /><span className="truncate">{orgName}</span></div>
        {sidebar}
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)}><aside className="h-full w-64 bg-panel" onClick={(e) => e.stopPropagation()}>{sidebar}</aside></div>}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-line bg-panel px-4">
          <Button variant="ghost" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={18} /></Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <DiscordLink />
            <NotificationCenter />
            <div className="hidden text-right text-xs sm:block"><p className="font-medium">{user?.displayName}</p><p className="text-muted">{user?.roles.join(', ') || 'No role'}</p></div>
            <Button variant="ghost" aria-label="Log out" onClick={() => void logout()}><LogOut size={16} /></Button>
          </div>
        </header>
        <main id="main" className="flex-1 overflow-y-auto p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
