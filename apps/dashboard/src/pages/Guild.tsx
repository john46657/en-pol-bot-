import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api, ApiError, guildIcon, type GuildOverview } from '../api';

export function Guild() {
  const { guildId = '' } = useParams();
  const q = useQuery({ queryKey: ['guild', guildId], queryFn: () => api<GuildOverview>(`/guilds/${guildId}`) });
  const g = q.data;
  const icon = g && guildIcon(g.id, g.icon);
  return (
    <main className="page">
      <Link to="/servers" className="muted">← Serverauswahl</Link>
      {q.isLoading && <p className="muted">Lade …</p>}
      {q.error && <p className="error">{q.error instanceof ApiError && q.error.status === 403 ? 'Dafür fehlt dir die Berechtigung auf diesem Server.' : q.error.message}</p>}
      {g && (
        <>
          <h1 className="title">{icon && <img className="icon" src={icon} alt="" width={40} height={40} />}{g.name}</h1>
          <div className="stats">
            <div className="stat"><b>{g.memberCount}</b><span>Mitglieder</span></div>
            <div className="stat"><b>{g.applications}</b><span>Applications</span></div>
            <div className="stat"><b>{g.submissions.pending}</b><span>Offene Einreichungen</span></div>
            <div className="stat"><b>{g.submissions.accepted}</b><span>Angenommen</span></div>
            <div className="stat"><b>{g.submissions.denied}</b><span>Abgelehnt</span></div>
          </div>
          <h2>Konfigurations-Check</h2>
          <ul className="list">
            {g.health.map((h, i) => <li key={i} className={`row ${h.ok ? 'ok' : 'bad'}`}><span aria-hidden>{h.ok ? '✅' : '⚠️'}</span><span className="grow">{h.message}</span></li>)}
          </ul>
        </>
      )}
    </main>
  );
}
