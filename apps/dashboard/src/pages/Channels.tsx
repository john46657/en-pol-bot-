import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api, type DiscordChannel } from '../api';
import { QueryState } from '../components/QueryState';

const ICON = { text: '#️⃣', voice: '🔊', category: '📁' } as const;

export function Channels() {
  const { guildId = '' } = useParams();
  const q = useQuery({
    queryKey: ['channels', guildId],
    queryFn: () => api<DiscordChannel[]>(`/guilds/${guildId}/discord/channels`),
  });
  return (
    <>
      <h1>Kanäle</h1>
      <p className="muted">Kategorien mit ihren Text- und Voice-Kanälen, direkt aus Discord.</p>
      <button className="btn" onClick={() => void q.refetch()}>
        Neu laden
      </button>
      <QueryState query={q}>
        {(channels) => {
          const categories = channels.filter((c) => c.kind === 'category');
          const groups = [
            ...categories.map((cat) => ({
              cat,
              items: channels.filter((c) => c.parentId === cat.id && c.kind !== 'category'),
            })),
            {
              cat: null,
              items: channels.filter(
                (c) => c.kind !== 'category' && !categories.some((cat) => cat.id === c.parentId),
              ),
            },
          ].filter((g) => g.cat || g.items.length > 0);
          return (
            <div className="list">
              {groups.map((g) => (
                <section key={g.cat?.id ?? 'none'} className="card">
                  <h3>{g.cat ? `📁 ${g.cat.name}` : 'Ohne Kategorie'}</h3>
                  {g.items.length === 0 && <p className="muted">Keine Kanäle.</p>}
                  <ul className="plain">
                    {g.items.map((c) => (
                      <li key={c.id}>
                        {ICON[c.kind as 'text']} {c.name}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </QueryState>
    </>
  );
}
