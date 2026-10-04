import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { Link } from 'react-router';
import { api } from '../api';
import { QueryState } from '../components/QueryState';

interface Member {
  userId: string;
  rpName: string;
  serviceNumber: string | null;
  teamState: 'ACTIVE' | 'PAUSE' | 'OFF_DUTY' | 'SUSPENDED';
  rank: { name: string; icon: string | null; color: string | null; order: number } | null;
}
interface Group {
  teamId: string | null;
  name: string;
  members: Member[];
}
const STATE = { ACTIVE: '🟢', PAUSE: '🟡', OFF_DUTY: '🔴', SUSPENDED: '⚫' } as const;
const STATE_LABEL = { ACTIVE: 'Aktiv', PAUSE: 'Pause', OFF_DUTY: 'Außer Dienst', SUSPENDED: 'Suspendiert' } as const;

/** Teamliste: aktive Mitglieder je Team, nach Dienstgrad sortiert; Zustand als Ampel. */
export function Team() {
  const { guildId = '' } = useParams();
  const list = useQuery({
    queryKey: ['team-overview', guildId],
    queryFn: () => api<Group[]>(`/guilds/${guildId}/personnel/team-overview`),
    refetchInterval: 60_000, // regelmäßig aktualisieren
  });
  return (
    <>
      <h1>Team</h1>
      <p className="muted">Aktive Mitglieder je Team, höchster Dienstgrad zuerst. Geschlossene Akten erscheinen hier nicht.</p>
      <QueryState query={list}>
        {(groups) =>
          groups.length === 0 ? (
            <p className="muted">Noch keine Teams oder Mitglieder.</p>
          ) : (
            groups.map((g) => (
              <section key={g.teamId ?? 'none'} className="card comp" aria-label={g.name}>
                <h2>
                  {g.name} <small className="muted">({g.members.length})</small>
                </h2>
                {g.members.length === 0 ? (
                  <p className="muted">Keine aktiven Mitglieder.</p>
                ) : (
                  <ul className="plain">
                    {g.members.map((m) => (
                      <li key={m.userId}>
                        <span title={STATE_LABEL[m.teamState]}>{STATE[m.teamState]}</span>{' '}
                        <strong style={m.rank?.color ? { color: m.rank.color } : undefined}>
                          {m.rank?.icon ? `${m.rank.icon} ` : ''}
                          {m.rank?.name ?? 'ohne Dienstgrad'}
                        </strong>{' '}
                        <Link to={`/guilds/${guildId}/personnel`}>{m.rpName}</Link>
                        {m.serviceNumber && <code> {m.serviceNumber}</code>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))
          )
        }
      </QueryState>
    </>
  );
}
