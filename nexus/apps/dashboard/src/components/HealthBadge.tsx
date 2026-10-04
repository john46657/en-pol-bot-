import { useQuery } from '@tanstack/react-query';
import { API_URL } from '../api';

type State = 'up' | 'degraded' | 'down';
interface Report {
  status: State;
  components: Record<string, { state: State; detail: string }>;
}
const ICON: Record<State, string> = { up: '🟢', degraded: '🟡', down: '🔴' };
const NAME: Record<string, string> = { api: 'API', database: 'Datenbank', redis: 'Redis', discord: 'Discord', bot: 'Bot', workers: 'Workers' };

/** Systemstatus (API, Datenbank, Redis, Discord, Bot, Workers) – fragt `/api/v1/health` alle 60 s ab. Nicht erreichbare API = 🔴. */
export function HealthBadge() {
  const q = useQuery({
    queryKey: ['health'],
    refetchInterval: 60_000,
    retry: false,
    queryFn: async (): Promise<Report> => {
      // 503 trägt ebenfalls einen Bericht (Datenbank down) – daher nicht über api() (das wirft bei !ok)
      const res = await fetch(`${API_URL}/api/v1/health`);
      return (await res.json()) as Report;
    },
  });
  const status: State = q.data?.status ?? (q.isError ? 'down' : 'degraded');
  const title = q.data
    ? Object.entries(q.data.components).map(([k, c]) => `${ICON[c.state]} ${NAME[k] ?? k}: ${c.detail}`).join('\n')
    : q.isError ? 'Die API ist nicht erreichbar.' : 'Prüfe …';
  return (
    <div className="health" title={title} aria-label={`Systemstatus: ${status === 'up' ? 'in Ordnung' : status === 'degraded' ? 'eingeschränkt' : 'Störung'}`}>
      {ICON[status]} {status === 'up' ? 'System in Ordnung' : status === 'degraded' ? 'System eingeschränkt' : 'System gestört'}
    </div>
  );
}
