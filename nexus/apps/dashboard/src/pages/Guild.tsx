import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api, type GuildOverview } from '../api';
import { QueryState } from '../components/QueryState';

/** Module, die in späteren Phasen entstehen: ehrlich als „noch nicht verfügbar“ statt mit Fake-Zahlen. */
const FUTURE = [
  'Beamte',
  'Aktive Shifts',
  'Offene Einsätze',
  'Aktive Fahndungen',
  'Tickets',
  'Gefahrenstufe',
];

export function Guild() {
  const { guildId = '' } = useParams();
  const q = useQuery({
    queryKey: ['guild', guildId],
    queryFn: () => api<GuildOverview>(`/guilds/${guildId}`),
  });
  return (
    <>
      <h1>Übersicht</h1>
      <QueryState query={q}>
        {(g) => (
          <>
            <div className="stats">
              <Stat value={g.memberCount} label="Mitglieder" />
              <Stat value={g.submissions.pending} label="Offene Bewerbungen" />
              <Stat value={g.applications} label="Bewerbungsformulare" />
              <Stat value={g.submissions.accepted} label="Angenommen" />
              <Stat value={g.submissions.denied} label="Abgelehnt" />
              {FUTURE.map((l) => (
                <Stat key={l} value={null} label={l} />
              ))}
            </div>
            <h2>Konfigurations-Check</h2>
            <ul className="list">
              {g.health.map((h, i) => (
                <li key={i} className={`row ${h.ok ? 'ok' : 'bad'}`}>
                  <span aria-hidden>{h.ok ? '✅' : '⚠️'}</span>
                  <span className="grow">{h.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </QueryState>
    </>
  );
}

function Stat({ value, label }: { value: number | null; label: string }) {
  return (
    <div className={`stat ${value === null ? 'future' : ''}`}>
      <b>{value ?? '–'}</b>
      <span>{label}</span>
      {value === null && <small>Modul noch nicht verfügbar</small>}
    </div>
  );
}
