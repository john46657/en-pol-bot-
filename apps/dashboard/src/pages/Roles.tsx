import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api, BLOCK_REASON, type DiscordRole } from '../api';
import { QueryState } from '../components/QueryState';

const hex = (c: number) => (c ? `#${c.toString(16).padStart(6, '0')}` : 'var(--muted)');

export function Roles() {
  const { guildId = '' } = useParams();
  const q = useQuery({
    queryKey: ['roles', guildId],
    queryFn: () => api<DiscordRole[]>(`/guilds/${guildId}/discord/roles`),
  });
  return (
    <>
      <h1>Rollen</h1>
      <p className="muted">
        Direkt aus Discord. 🟢 = der Bot kann die Rolle vergeben und entziehen, 🔴 = nicht
        (Rollen-Hierarchie oder fehlendes Recht).
      </p>
      <button className="btn" onClick={() => void q.refetch()}>
        Neu laden
      </button>
      <QueryState query={q}>
        {(roles) => (
          <ul className="list">
            {roles
              .filter((r) => r.blockedReason !== 'everyone')
              .map((r) => (
                <li key={r.id} className="row">
                  <span aria-hidden>{r.manageable ? '🟢' : '🔴'}</span>
                  <span className="grow">
                    <span style={{ color: hex(r.color) }}>●</span> <strong>@{r.name}</strong>
                    {r.blockedReason && (
                      <small className="muted"> – {BLOCK_REASON[r.blockedReason]}</small>
                    )}
                  </span>
                  <small className="muted">Position {r.position}</small>
                </li>
              ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
