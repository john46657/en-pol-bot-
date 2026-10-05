import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { UserMenu } from '../components/UserMenu';
import { api, guildIcon, inviteUrl, type GuildSelectionEntry } from '../api';

function Icon({ g }: { g: GuildSelectionEntry }) {
  const src = guildIcon(g.id, g.icon);
  return src ? (
    <img className="icon" src={src} alt="" width={56} height={56} />
  ) : (
    <span className="icon fallback">{g.name.slice(0, 1).toUpperCase()}</span>
  );
}

/** Serverauswahl: nur Server, die der Benutzer verwalten darf. */
export function Servers() {
  const q = useQuery({
    queryKey: ['guilds'],
    queryFn: () => api<GuildSelectionEntry[]>('/auth/me/guilds'),
  });
  return (
    <>
      <header className="page-top">
        <span className="brand">
          <span className="brand-mark" aria-hidden>
            N
          </span>
          <span className="brand-text">
            <b>NEXUS</b>
            <small>Management</small>
          </span>
        </span>
        <UserMenu />
      </header>
      <main className="page" style={{ maxWidth: 1040 }}>
        <div className="servers-head">
          <h1>Server auswählen</h1>
          <p className="muted">Wähle den Server, den du verwalten möchtest.</p>
        </div>
        {q.isLoading && <p className="skeleton">Lade deine Server …</p>}
        {q.error && (
          <p className="alert" role="alert">
            <span>{q.error.message}</span>
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
        <ul className="server-grid">
          {q.data?.map((g) => (
            <li key={g.id} className="server-card">
              <div className="server-top">
                <Icon g={g} />
                <span style={{ minWidth: 0 }}>
                  <strong>{g.name}</strong>
                  <span className={`badge ${g.botPresent ? 'ok' : 'no'}`}>
                    {g.botPresent ? '● Bot aktiv' : '○ Bot fehlt'}
                  </span>
                </span>
              </div>
              {g.botPresent ? (
                <Link className="btn primary" to={`/guilds/${g.id}`}>
                  Dashboard öffnen
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
