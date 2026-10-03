import { useInfiniteQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '../api';
import { errorText } from '../components/QueryState';

interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}
interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
}

export function Logs() {
  const { guildId = '' } = useParams();
  const q = useInfiniteQuery({
    queryKey: ['audit', guildId],
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      api<AuditPage>(`/guilds/${guildId}/audit?limit=25${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <h1>Logs</h1>
      <p className="muted">Protokoll aller Konfigurationsänderungen, neueste zuerst.</p>
      {q.isLoading && <div className="skeleton">Lade …</div>}
      {q.error && (
        <div className="alert error" role="alert">
          <span>{errorText(q.error)}</span>
          <button className="btn" onClick={() => void q.refetch()}>
            Erneut versuchen
          </button>
        </div>
      )}
      {q.data && items.length === 0 && <p className="muted">Noch keine Einträge.</p>}
      <ul className="list">
        {items.map((e) => (
          <li key={e.id} className="card">
            <div className="row-head">
              <strong>{e.action}</strong>
              <small className="muted">{new Date(e.createdAt).toLocaleString('de-DE')}</small>
            </div>
            <small className="muted">
              {e.actorType}
              {e.actorId ? ` ${e.actorId}` : ''}
              {e.resourceType ? ` · ${e.resourceType} ${e.resourceId ?? ''}` : ''}
            </small>
            {(e.before != null || e.after != null) && (
              <details>
                <summary>Änderung</summary>
                <pre>{JSON.stringify({ vorher: e.before, nachher: e.after }, null, 2)}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <button
          className="btn"
          disabled={q.isFetchingNextPage}
          onClick={() => void q.fetchNextPage()}
        >
          {q.isFetchingNextPage ? 'Lade …' : 'Mehr laden'}
        </button>
      )}
    </>
  );
}
