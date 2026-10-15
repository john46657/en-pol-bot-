import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import { Clock, Plus, ShieldOff } from 'lucide-react';
import { api } from '../lib/api';
import { chooseAllServers, setServer } from '../lib/server';
import { ErrorState, SkeletonRows } from '../components/ui';

type State = 'open' | 'disabled' | 'invite' | 'pending';
interface Overview { name: string; globalAdmin: boolean; discordLinked: boolean; guildsSyncedAt: string | null; servers: { guildId: string; name: string; icon: string | null; state: State }[] }

const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'; };
const NOTICE: Record<string, [string, string]> = {
  installed: ['Der Bot ist auf dem Server. Er ist freigeschaltet und hat eigene, leere Akten.', 'text-success'],
  installed_pending: ['Der Bot ist auf dem Server. Ein Systemadministrator muss ihn noch freischalten.', 'text-warning'],
  install_failed: ['Der Bot konnte nicht hinzugefügt werden. Bitte erneut versuchen.', 'text-danger'],
  not_manager: ['Diesen Server darfst du laut Discord nicht verwalten.', 'text-danger'],
  disabled: ['„Mit Discord anmelden“ ist nicht eingerichtet.', 'text-danger'],
};

function ServerIcon({ icon, name, size = 'h-12 w-12 sm:h-14 sm:w-14' }: { icon: string | null; name: string; size?: string }) {
  return icon
    ? <img src={icon} alt="" className={`${size} rounded-full shadow-md ring-2 ring-white/40`} />
    : <span aria-hidden className={`${size} grid place-items-center rounded-full bg-panel-2 text-lg font-semibold text-muted ring-2 ring-white/40`}>{name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toLowerCase() || '?'}</span>;
}

/**
 * Server-Übersicht nach dem Login (wie bei Dyno/GalaxyBot): Kachel anklicken → Dashboard dieses Servers.
 * Jeder Server hat eigene Akten, Rollen und Einstellungen. Eigene Discord-Server ohne Bot lassen sich mit „+“ einladen.
 */
export function ServerOverview() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = useQuery({ queryKey: ['server-overview'], queryFn: () => api<Overview>('/auth/servers') });
  const notice = NOTICE[params.get('discord') ?? ''];
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data) return <SkeletonRows />;
  const d = q.data;
  const open = (id: string) => { setServer(id); nav('/dashboard'); };
  const count = d.servers.length;
  return (
    <div>
      <h1 className="text-2xl font-semibold">{greeting()}, {d.name}</h1>
      <p className="mt-1 text-sm text-muted">{count ? `Du verwaltest ${count} Server` : 'Noch kein Server verfügbar'}</p>
      {notice && <p role="status" className={`mt-3 text-sm ${notice[1]}`}>{notice[0]}{params.get('server') ? ` (${params.get('server')})` : ''}</p>}
      <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {d.servers.map((s) => {
          const usable = s.state === 'open';
          const inner = (
            <>
              {/* verschwommenes Server-Bild als Hintergrund */}
              {s.icon && <img src={s.icon} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-2xl" />}
              <span className="relative flex min-w-0 max-w-full flex-col items-center gap-2 sm:gap-3">
                <ServerIcon icon={s.icon} name={s.name} />
                <span className="max-w-full truncate rounded-md bg-panel/80 px-2 py-1 text-xs font-medium backdrop-blur sm:px-3 sm:text-sm">{s.name}</span>
                {s.state === 'pending' && <span className="inline-flex items-center gap-1 text-xs text-muted"><Clock size={12} aria-hidden />Wartet auf Freischaltung</span>}
                {s.state === 'disabled' && <span className="inline-flex items-center gap-1 text-xs text-muted"><ShieldOff size={12} aria-hidden />Deaktiviert{d.globalAdmin ? ' – unter Verwaltung freischalten' : ''}</span>}
              </span>
            </>
          );
          const cls = `relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl border border-line px-3 text-center transition sm:h-44 ${usable ? 'bg-panel hover:-translate-y-0.5 hover:border-primary hover:shadow-lg' : 'bg-panel-2/70'}`;
          return (
            <li key={s.guildId}>
              {usable ? (
                <button type="button" className={cls} onClick={() => open(s.guildId)} aria-label={`${s.name} öffnen`}>{inner}</button>
              ) : s.state === 'disabled' && d.globalAdmin ? (
                <button type="button" className={`${cls} opacity-80 grayscale hover:grayscale-0`} onClick={() => { chooseAllServers(); nav('/admin/multi-server'); }} aria-label={`${s.name} freischalten`}>{inner}</button>
              ) : (
                <div className={`${cls} opacity-80 grayscale`}>
                  {inner}
                  {s.state === 'invite' && (
                    <a href={`/api/v1/auth/discord/add-server?guild=${s.guildId}`} title="Bot zu diesem Server hinzufügen" aria-label={`Bot zu ${s.name} hinzufügen`}
                      className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md border border-line bg-panel text-fg shadow-sm hover:border-primary hover:text-primary">
                      <Plus size={16} aria-hidden />
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {d.discordLinked && !d.guildsSyncedAt && <p className="mt-4 text-xs text-muted">Deine eigenen Discord-Server zum Einladen erscheinen nach der nächsten Anmeldung mit Discord.</p>}
      {d.globalAdmin && <p className="mt-2 text-xs text-muted"><button type="button" className="underline hover:text-fg" onClick={() => { chooseAllServers(); nav('/dashboard'); }}>Alle Server</button> (nur Systemadministratoren: ohne Server-Auswahl, z. B. für Server-Verwaltung und Backups)</p>}
    </div>
  );
}
