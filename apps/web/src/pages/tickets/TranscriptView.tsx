import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, PageHeader, Select, SkeletonRows } from '../../components/ui';
import { errText, TRANSCRIPT_STATUS, type TranscriptVersion } from '../../lib/tickets';

interface ByRef {
  ticketId: string | null; ref: string; subject: string | null; category: { name: string; emoji: string | null } | null; createdAt: string; closedAt: string | null;
  as: 'staff' | 'creator'; canExport: boolean; canJson: boolean; canManage: boolean; versions: TranscriptVersion[];
}

/**
 * Online-Transkript unter /transcript/EMD-000123. Der Link allein gewährt keinen Zugriff: das System prüft bei jedem Abruf
 * Anmeldung, Recht und Zugriff auf genau dieses Ticket (Mitarbeiter) bzw. ob es das eigene Ticket ist (Ersteller).
 * Das Transkript selbst läuft in einer Sandbox ohne Skripte.
 */
export function TranscriptView() {
  const { ref = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['transcript-ref', ref], queryFn: () => api<ByRef>(`/support-tickets/transcripts/ref/${encodeURIComponent(ref)}`), retry: false, refetchInterval: (x) => (x.state.data?.versions.some((v) => v.status === 'PENDING' || v.status === 'RUNNING') ? 5000 : false) });
  const [pick, setPick] = useState<string>();
  const retry = useMutation({
    mutationFn: (transcriptId: string) => api(`/support-tickets/${q.data!.ticketId}/actions`, { method: 'POST', body: { action: 'transcript_retry', transcriptId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['transcript-ref', ref] }),
  });
  if (q.isLoading) return <div className="p-4"><SkeletonRows /></div>;
  if (q.error) {
    const missing = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 403);
    return <div className="mx-auto max-w-xl p-4">{missing ? <EmptyState text="Transkript nicht gefunden oder kein Zugriff." hint="Transkripte sind nur für berechtigte Teammitglieder und den Ersteller des Tickets abrufbar. Prüfe, ob du mit dem richtigen Discord-Konto angemeldet bist." /> : <ErrorState error={q.error} onRetry={() => void q.refetch()} />}</div>;
  }
  const d = q.data!;
  const done = d.versions.filter((v) => v.status === 'DONE');
  const cur = d.versions.find((v) => v.id === pick) ?? done[0] ?? d.versions[0];
  const src = (id: string, extra = '') => `/api/v1/support-tickets/transcripts/${id}${extra}`;
  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-3 sm:p-4">
      <PageHeader title={`Transkript ${d.ref}`} subtitle={[d.subject, d.category ? `${d.category.emoji ? `${d.category.emoji} ` : ''}${d.category.name}` : null, `erstellt ${fmt(d.createdAt)}`, d.closedAt ? `geschlossen ${fmt(d.closedAt)}` : null].filter(Boolean).join(' · ')}
        actions={d.ticketId ? <Link to={`/support-tickets/${d.ticketId}`} className="text-sm text-primary underline">Zum Ticket</Link> : undefined} />
      {!d.versions.length ? <EmptyState text="Für dieses Ticket gibt es noch kein Transkript." hint="Transkripte entstehen beim Schließen (falls eingerichtet) oder auf Anforderung des Teams." /> : (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-64"><Select aria-label="Version" value={cur?.id ?? ''} onChange={(e) => setPick(e.target.value)}>{d.versions.map((v) => <option key={v.id} value={v.id}>Version {v.version} · {TRANSCRIPT_STATUS[v.status].label} · {fmt(v.completedAt ?? v.createdAt)}</option>)}</Select></div>
              {cur && <Badge tone={TRANSCRIPT_STATUS[cur.status].tone}>{TRANSCRIPT_STATUS[cur.status].label}</Badge>}
              {cur?.status === 'DONE' && (
                <span className="ml-auto flex flex-wrap gap-2">
                  <a className="rounded border border-line px-2 py-1 text-sm hover:bg-panel-2" href={src(cur.id)} target="_blank" rel="noreferrer">In neuem Tab</a>
                  {d.canExport && <a className="rounded border border-line px-2 py-1 text-sm hover:bg-panel-2" href={src(cur.id, '?download=1')}>HTML</a>}
                  {d.canExport && <a className="rounded border border-line px-2 py-1 text-sm hover:bg-panel-2" href={src(cur.id, '?format=txt')}>TXT</a>}
                  {d.canJson && <a className="rounded border border-line px-2 py-1 text-sm hover:bg-panel-2" href={src(cur.id, '?format=json')}>JSON</a>}
                </span>
              )}
            </div>
            {cur?.sha256 && <p className="mt-2 break-all text-xs text-muted">Integrität (SHA-256): <span className="font-mono">{cur.sha256}</span></p>}
            {cur?.status === 'FAILED' && (
              <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-sm text-danger">
                <span>Die Erstellung ist fehlgeschlagen{cur.lastError ? `: ${cur.lastError}` : ''}. Die Nachrichten des Tickets sind gespeichert.</span>
                {d.canManage && <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(cur.id)}>Erneut versuchen</Button>}
              </div>
            )}
            {(cur?.status === 'PENDING' || cur?.status === 'RUNNING') && <p role="status" className="mt-2 text-sm text-muted">Das Transkript wird erstellt – die Seite aktualisiert sich automatisch.</p>}
            {retry.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(retry.error)}</p>}
          </Card>
          {cur?.status === 'DONE' && (
            // eigene Sandbox: keine Skripte, kein Zugriff auf das Dashboard (der Server setzt zusätzlich eine strenge CSP)
            <iframe title={`Transkript ${d.ref} Version ${cur.version}`} src={src(cur.id)} sandbox="" referrerPolicy="no-referrer" className="h-[75vh] w-full rounded-md border border-line bg-[#1e1f22]" />
          )}
        </>
      )}
    </div>
  );
}
