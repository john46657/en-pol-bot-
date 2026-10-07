import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Check, Globe, LogOut, Search, Shield } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useServer } from '../lib/guilds';
import { markServerChosen, serverChosen } from '../lib/server';
import { Button, ErrorState, Input, SkeletonRows } from '../components/ui';

export interface ServerOption { id: string; name: string; icon: string | null; banner: string | null; memberCount: number | null }
export interface ServerList { allServers: boolean; servers: ServerOption[] }
export const useServerList = (enabled = true) => useQuery({ queryKey: ['auth-servers'], queryFn: () => api<ServerList>('/auth/servers'), staleTime: 60_000, enabled });

const greeting = (h = new Date().getHours()) => (h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend');
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toLowerCase() || '?';

function ServerIcon({ icon, name, size = 'h-16 w-16' }: { icon: string | null; name: string; size?: string }) {
  return icon
    ? <img src={icon} alt="" className={`${size} rounded-full object-cover shadow-lg ring-2 ring-white/70`} />
    : <span aria-hidden className={`${size} grid place-items-center rounded-full border border-line bg-panel-2 text-2xl font-medium text-muted shadow`}>{initials(name)}</span>;
}

function ServerCard({ name, icon, banner, sub, active, onClick, children }: { name: string; icon?: string | null; banner?: string | null; sub?: string; active: boolean; onClick: () => void; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-current={active || undefined} aria-label={`${name} öffnen`}
      className={`group relative flex h-44 w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border bg-panel text-center transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'border-primary ring-2 ring-primary/50' : 'border-line'}`}>
      {banner && <>
        <span aria-hidden className="absolute inset-0 scale-110 bg-cover bg-center blur-[6px] transition group-hover:blur-[3px]" style={{ backgroundImage: `url("${banner}")` }} />
        <span aria-hidden className="absolute inset-0 bg-black/15" />
      </>}
      {active && <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-fg"><Check size={12} aria-hidden />Aktuell</span>}
      <span className="relative z-10">{children ?? <ServerIcon icon={icon ?? null} name={name} />}</span>
      <span className="relative z-10 flex max-w-[90%] flex-col items-center gap-1">
        <span className="max-w-full truncate rounded-lg bg-panel-2/90 px-3 py-1 text-base font-semibold text-fg backdrop-blur">{name}</span>
        {sub && <span className={`rounded px-1.5 text-xs ${banner ? 'bg-black/40 text-white' : 'text-muted'}`}>{sub}</span>}
      </span>
    </button>
  );
}

/** Server-Auswahl nach dem Login (und über das Server-Menü): große Karten mit Icon und Banner. */
export function ServerSelect() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [current, setServer] = useServer();
  const list = useServerList();
  const [q, setQ] = useState('');
  const servers = useMemo(() => (list.data?.servers ?? []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())), [list.data, q]);
  const back = (loc.state as { from?: string } | null)?.from;
  const pick = (id: string) => { setServer(id); markServerChosen(); nav(back && back !== '/servers' ? back : '/dashboard', { replace: true }); };
  if (!user) return <Navigate to="/login" replace />;
  const total = (list.data?.servers.length ?? 0);

  return (
    <div className="min-h-full bg-bg">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-panel/90 px-4 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold"><Shield className="text-primary" aria-hidden />EN Polizei</div>
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-primary/20 font-semibold text-primary">{user.displayName.slice(0, 2).toUpperCase()}</span>
          <span className="min-w-0 max-w-[45vw]"><span className="block truncate text-sm font-semibold">{user.displayName}</span><span className="block truncate text-xs text-muted">@{user.username}</span></span>
          <Button variant="ghost" aria-label="Abmelden" onClick={() => void logout()}><LogOut size={16} /></Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight">{greeting()}, {user.displayName}</h1>
        <p className="mt-1 text-muted">{list.isLoading ? 'Server werden geladen…' : total === 1 ? 'Du verwaltest 1 Server' : `Du verwaltest ${total} Server`}</p>
        {total > 6 && <div className="relative mt-5 max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden /><Input aria-label="Server suchen" placeholder="Server suchen…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" /></div>}
        <div className="mt-6">
          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.data!.allServers && !q && (
                <ServerCard name="Alle Server" sub="Gemeinsame Ansicht & Einstellungen" active={!current} onClick={() => pick('')}>
                  <span className="grid h-16 w-16 place-items-center rounded-full border border-line bg-panel-2 shadow"><Globe size={30} className="text-primary" aria-hidden /></span>
                </ServerCard>
              )}
              {servers.map((s) => <ServerCard key={s.id} name={s.name} icon={s.icon} banner={s.banner} sub={s.memberCount != null ? `${s.memberCount.toLocaleString('de-DE')} Mitglieder` : undefined} active={current === s.id} onClick={() => pick(s.id)} />)}
              {!servers.length && !list.data!.allServers && <p className="text-muted sm:col-span-2 lg:col-span-3">{q ? 'Kein Server gefunden.' : 'Du hast auf keinem Server Zugriff auf das Dashboard. Ist der Bot auf deinem Server und hast du die nötige Rolle?'}</p>}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/** Startseite `/`: Wer mehrere Server hat und in dieser Sitzung noch keinen gewählt hat, landet zuerst in der Server-Auswahl. */
export function StartRedirect() {
  const chosen = serverChosen();
  const list = useServerList(!chosen);
  if (chosen) return <Navigate to="/dashboard" replace />;
  if (list.isLoading) return <div className="p-6"><SkeletonRows /></div>;
  const options = (list.data?.servers.length ?? 0) + (list.data?.allServers ? 1 : 0);
  if (options < 2) { markServerChosen(); return <Navigate to="/dashboard" replace />; }
  return <Navigate to="/servers" replace />;
}
