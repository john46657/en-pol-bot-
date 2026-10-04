import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api, API_URL } from '../api';
import { errorText } from '../components/QueryState';
import { useToast } from '../toast';

interface AuditEntry {
  id: string;
  area: string;
  actorType: string;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  before: unknown;
  after: unknown;
  permission: string | null;
  automation: string | null;
  result: string | null;
  reason: string | null;
  createdAt: string;
}
interface AuditPage {
  items: AuditEntry[];
  nextCursor: string | null;
}
interface Areas {
  areas: { key: string; label: string }[];
  counts: { key: string; label: string; count: number }[];
}

/** Audit-Log: nach Bereich, Benutzer, Datensatz, Ergebnis, Zeitraum und Text filtern; als CSV exportieren. */
export function Logs() {
  const { guildId = '' } = useParams();
  const toast = useToast();
  const [f, setF] = useState({ area: '', search: '', actorId: '', result: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const params = (extra: Record<string, string> = {}) =>
    new URLSearchParams({
      ...(applied.area ? { area: applied.area } : {}),
      ...(applied.search ? { search: applied.search } : {}),
      ...(/^\d{5,25}$/.test(applied.actorId.trim()) ? { actorId: applied.actorId.trim() } : {}),
      ...(applied.result ? { result: applied.result } : {}),
      ...(applied.from ? { from: new Date(applied.from).toISOString() } : {}),
      ...(applied.to ? { to: new Date(`${applied.to}T23:59:59`).toISOString() } : {}),
      ...extra,
    }).toString();
  const areas = useQuery({ queryKey: ['audit-areas', guildId], queryFn: () => api<Areas>(`/guilds/${guildId}/audit-log/areas`) });
  const q = useInfiniteQuery({
    queryKey: ['audit-log', guildId, applied],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<AuditPage>(`/guilds/${guildId}/audit-log?${params({ limit: '25', ...(pageParam ? { cursor: pageParam } : {}) })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const count = (key: string) => areas.data?.counts.find((c) => c.key === key)?.count;

  async function download() {
    try {
      const res = await fetch(`${API_URL}/api/v1/guilds/${guildId}/audit-log/export?${params()}`, { credentials: 'include', headers: { 'X-Requested-With': 'nexus' } });
      if (!res.ok) throw new Error(res.status === 403 ? 'Dafür fehlt dir die Berechtigung (Audit exportieren).' : `Export fehlgeschlagen (HTTP ${res.status}).`);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit-log.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <>
      <h1>Logs</h1>
      <p className="muted">Protokoll aller wichtigen Aktionen: wer · was · wann · welcher Datensatz · vorher/nachher. Einträge können nicht geändert oder gelöscht werden.</p>
      <form className="actions" onSubmit={(e) => { e.preventDefault(); setApplied(f); }}>
        <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} aria-label="Bereich">
          <option value="">Alle Bereiche</option>
          {areas.data?.areas.map((a) => <option key={a.key} value={a.key}>{a.label}{count(a.key) ? ` (${count(a.key)})` : ''}</option>)}
        </select>
        <input className="inline-input" placeholder="Suche (Aktion, Grund, ID) …" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
        <input className="inline-input" placeholder="Benutzer-ID" value={f.actorId} onChange={(e) => setF({ ...f, actorId: e.target.value })} />
        <select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })} aria-label="Ergebnis"><option value="">Alle Ergebnisse</option><option value="success">Erfolg</option><option value="partial">Teilweise</option><option value="failed">Fehlgeschlagen</option></select>
        <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="Von" />
        <input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Bis" />
        <button className="btn">Filtern</button>
        <button type="button" className="btn" onClick={() => void download()}>CSV-Export</button>
      </form>
      {q.isLoading && <div className="skeleton">Lade …</div>}
      {q.error && (
        <div className="alert error" role="alert">
          <span>{errorText(q.error)}</span>
          <button className="btn" onClick={() => void q.refetch()}>Erneut versuchen</button>
        </div>
      )}
      {q.data && items.length === 0 && <p className="muted">Keine Einträge.</p>}
      <ul className="list">
        {items.map((e) => (
          <li key={e.id} className="card">
            <div className="row-head">
              <strong>{e.action}</strong>
              <small className="muted">{new Date(e.createdAt).toLocaleString('de-DE')}</small>
            </div>
            <small className="muted">
              {areas.data?.areas.find((a) => a.key === e.area)?.label ?? 'Sonstiges'} · {e.actorType}{e.actorId ? ` ${e.actorId}` : ''}{e.automation ? ` (${e.automation})` : ''}
              {e.resourceType ? ` · ${e.resourceType} ${e.resourceId ?? ''}` : ''}{e.permission ? ` · Recht: ${e.permission}` : ''}{e.result && e.result !== 'success' ? ` · ${e.result}` : ''}
            </small>
            {e.reason && <div><small>Grund: {e.reason}</small></div>}
            {(e.before != null || e.after != null) && (
              <details>
                <summary>Änderung</summary>
                {e.before != null && <pre>Vorher: {JSON.stringify(e.before, null, 2)}</pre>}
                {e.after != null && <pre>Nachher: {JSON.stringify(e.after, null, 2)}</pre>}
              </details>
            )}
          </li>
        ))}
      </ul>
      {q.hasNextPage && (
        <button className="btn" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          {q.isFetchingNextPage ? 'Lade …' : 'Mehr laden'}
        </button>
      )}
    </>
  );
}
