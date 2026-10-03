import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { UserMenu } from '../components/UserMenu';
import { api, guildIcon, inviteUrl, type GuildSelectionEntry } from '../api';

function Icon({ g }: { g: GuildSelectionEntry }) {
  const src = guildIcon(g.id, g.icon);
  return src ? (
    <img className="icon" src={src} alt="" width={40} height={40} />
  ) : (
    <span className="icon fallback">{g.name.slice(0, 1).toUpperCase()}</span>
  );
}

export function Servers() {
  const q = useQuery({
    queryKey: ['guilds'],
    queryFn: () => api<GuildSelectionEntry[]>('/auth/me/guilds'),
  });
  return (
    <>
      <header className="bar">
        <strong>NEXUS</strong>
        <UserMenu />
      </header>
      <main className="page">
        <h1>Server auswählen</h1>
        {q.isLoading && <p className="muted">Lade deine Server …</p>}
        {q.error && (
          <p className="error">
            {q.error.message}{' '}
            <button className="btn" onClick={() => void q.refetch()}>
              Erneut versuchen
            </button>
          </p>
        )}
        {q.data && q.data.length === 0 && (
          <p className="muted">
            Keine Server gefunden, auf denen du NEXUS verwalten darfst (benötigt „Server verwalten“
            oder eine NEXUS-Rolle).
          </p>
        )}
        <ul className="list">
          {q.data?.map((g) => (
            <li key={g.id} className="row">
              <Icon g={g} />
              <span className="grow">
                <strong>{g.name}</strong>
                <br />
                <small className="muted">
                  {g.botPresent ? 'Bot ist auf dem Server' : 'Bot noch nicht eingeladen'}
                </small>
              </span>
              {g.botPresent ? (
                <Link className="btn primary" to={`/guilds/${g.id}`}>
                  Öffnen
                </Link>
              ) : g.canManage ? (
                <a className="btn" href={inviteUrl(g.id)}>
                  Bot einladen
                </a>
              ) : (
                <span className="muted">Keine Berechtigung</span>
              )}
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
