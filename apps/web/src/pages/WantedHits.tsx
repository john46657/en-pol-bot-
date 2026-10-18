import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WANTED_HIT_STATUSES, WANTED_HIT_STATUS_LABELS } from '@enrp/shared';
import { api, ApiError, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { Badge, Button, Card, EmptyState, ErrorState, Field, fmt, Modal, PageHeader, PriorityBadge, Select, SkeletonRows, StatusBadge, Textarea, type Tone } from '../components/ui';

export interface WantedHit {
  id: string; serverName: string; playerName: string; robloxUserId: string | null; matchType: string; matchLabel: string; identified: boolean; identification: string;
  reviewStatus: string; reviewLabel: string; reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null; detectedAt: string; sessionStartedAt: string;
  wantedId: string | null; wantedNumber: string | null; reason: string; priority: string; wantedStatus: string | null; personId: string | null;
  person: { id: string; robloxUsername: string; robloxUserId: string | null } | null;
  notify: { status: string; attempts: number; error: string | null };
}
interface SyncStatus {
  open: number; review: number;
  servers: { id: string; name: string; active: boolean; status: string; lastSyncAt: string | null; lastError: string | null; lastErrorAt: string | null; playersEnabled: boolean; joinLogsEnabled: boolean; wantedCheckAt: string | null; wantedCheckError: string | null; online: number;
    /** Zur Fehlersuche: wer gerade online ist und wie viele aktive Personen-Fahndungen abgeglichen werden */ players?: { name: string; robloxUserId: string | null; wantedStars?: number }[]; activeWanted?: number }[];
}

const CONN: Record<string, [Tone, string]> = { CONNECTED: ['success', 'Verbunden'], LIMITED: ['warning', 'Eingeschränkt'], OFFLINE: ['danger', 'Offline'], ERROR: ['danger', 'Fehler'], UNKNOWN: ['neutral', 'Unbekannt'], DISABLED: ['neutral', 'Deaktiviert'] };
const REVIEW_TONE: Record<string, Tone> = { NEW: 'danger', REVIEW_REQUIRED: 'warning', ACKNOWLEDGED: 'neutral', CONFIRMED: 'success', REJECTED: 'neutral', ENDED: 'neutral' };
const NOTIFY: Record<string, string> = { SENT: 'Discord: gesendet', QUEUED: 'Discord: wartet auf den Bot', RETRYING: 'Discord: wird wiederholt', FAILED: 'Discord: fehlgeschlagen', NOT_CONFIGURED: 'Discord: kein Kanal eingestellt', UNKNOWN: 'Discord: unbekannt' };

/** Verbindungs- und Abgleichsstatus je ER:LC-Server (letzte erfolgreiche Synchronisierung, Fehler). */
export function WantedSyncStatus() {
  const q = useQuery({ queryKey: ['wanted-hits', 'status'], queryFn: () => api<SyncStatus>('/wanted-hits/status'), refetchInterval: 15_000 });
  if (q.isLoading) return <SkeletonRows rows={1} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data.servers.length) return <p className="text-sm text-muted">Kein ER:LC-Server verbunden – der automatische Abgleich ist inaktiv (CAD → Einstellungen → ER:LC).</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {q.data.servers.map((s) => {
        const [tone, label] = CONN[s.status] ?? ['neutral', s.status];
        return (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line px-2 py-1.5">
            <span className="font-medium">{s.name}</span><Badge tone={tone}>{label}</Badge>
            <span className="text-xs text-muted">Letzte erfolgreiche Synchronisierung: {fmt(s.lastSyncAt)}</span>
            <span className="text-xs text-muted">Letzter Abgleich: {fmt(s.wantedCheckAt)}</span>
            {s.playersEnabled ? <span className="text-xs text-muted">{s.online} Spieler online</span> : <Badge tone="warning">Spielerdaten nicht freigegeben</Badge>}
            {s.activeWanted !== undefined && <span className="text-xs text-muted">{s.activeWanted} aktive Personen-{s.activeWanted === 1 ? 'Fahndung' : 'Fahndungen'} im Abgleich</span>}
            {!!s.players?.length && <span className="w-full text-xs text-muted">Online: {s.players.map((p) => `${p.name}${p.robloxUserId ? ` (Roblox-ID ${p.robloxUserId})` : ''}${p.wantedStars ? ` – im Spiel gesucht ${'★'.repeat(Math.min(p.wantedStars, 5))}` : ''}`).join(', ')}{s.online > s.players.length ? ` … und ${s.online - s.players.length} weitere` : ''}</span>}
            {s.playersEnabled && s.activeWanted === 0 && <span className="w-full text-xs text-warning">Für diesen Server gibt es keine aktive Fahndung auf eine Person im Dashboard – Fahndungen auf Fahrzeuge oder auf einem anderen Discord-Server werden nicht abgeglichen. Wer im Spiel gesucht wird (Wanted-Sterne), wird trotzdem gemeldet.</span>}
            {s.lastError && <span role="alert" className="w-full text-xs text-danger">ER:LC: {s.lastError}{s.lastErrorAt ? ` (${fmt(s.lastErrorAt)})` : ''} – vorhandene Treffer bleiben erhalten, der Abgleich läuft nach der Wiederverbindung weiter.</span>}
            {s.wantedCheckError && <span role="alert" className="w-full text-xs text-danger">Abgleich fehlgeschlagen: {s.wantedCheckError}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Tabelle der Treffer; `wantedId`: nur Treffer einer Fahndung (Fahndungsakte), `compact`: ohne Filter. */
export function WantedHitList({ wantedId, compact, openOnly }: { wantedId?: string; compact?: boolean; openOnly?: boolean }) {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const focus = params.get('id') ?? undefined;
  // Ohne Fahndungsakte: standardmäßig nur offene Treffer (beendete/bearbeitete über den Filter)
  const [status, setStatus] = useState(openOnly || !wantedId ? 'OPEN' : '');
  const [page, setPage] = useState(1);
  const [review, setReview] = useState<{ hit: WantedHit; decision: 'ACKNOWLEDGED' | 'CONFIRMED' | 'REJECTED' }>();
  const query = { page, pageSize: compact ? 10 : 25, wantedId, id: compact ? undefined : focus, ...(status === 'OPEN' ? { open: 'true' } : status ? { status } : {}) };
  const q = useQuery({ queryKey: ['wanted-hits', 'list', query], queryFn: () => api<Page<WantedHit>>('/wanted-hits', { query }), refetchInterval: 15_000, placeholderData: (p) => p });
  useRealtime('cad', ['wanted.hits'], [['wanted-hits']]);
  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Prüfstatus" className="w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">Alle Treffer</option><option value="OPEN">Offen (neu / Prüfung nötig)</option>
            {WANTED_HIT_STATUSES.map((s) => <option key={s} value={s}>{WANTED_HIT_STATUS_LABELS[s]}</option>)}
          </Select>
          {focus && <Link className="text-xs text-primary underline" to="/wanted/hits">Alle Treffer anzeigen</Link>}
        </div>
      )}
      {q.isLoading ? <SkeletonRows rows={3} /> : q.error || !q.data ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data.items.length ? <EmptyState text={status === 'OPEN' ? 'Keine offenen Fahndungstreffer.' : 'Keine Fahndungstreffer.'} hint="Treffer entstehen automatisch, wenn ein gesuchter Spieler dem ER:LC-Server beitritt." /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted">
              <th className="px-2 py-1.5">Erkannt</th><th className="px-2 py-1.5">Spieler</th><th className="px-2 py-1.5">Identifikation</th>{!wantedId && <th className="px-2 py-1.5">Fahndung</th>}<th className="px-2 py-1.5">Prüfung</th><th className="px-2 py-1.5" />
            </tr></thead>
            <tbody>
              {q.data.items.map((h) => (
                <tr key={h.id} className={`border-b border-line/60 align-top ${h.id === focus ? 'bg-primary/10' : ''}`}>
                  <td className="whitespace-nowrap px-2 py-2">{fmt(h.detectedAt)}<div className="text-xs text-muted">{h.serverName}</div></td>
                  <td className="px-2 py-2"><span className="font-medium">{h.playerName}</span><div className="text-xs text-muted">{h.robloxUserId ? `Roblox-ID ${h.robloxUserId}` : 'keine Roblox-ID von ER:LC'}</div></td>
                  <td className="px-2 py-2">
                    <Badge tone={h.identified ? 'danger' : h.reviewStatus === 'REJECTED' ? 'neutral' : 'warning'}>{h.identified ? 'Bestätigt' : h.reviewStatus === 'REJECTED' ? 'Verworfen' : 'Mögliche Übereinstimmung'}</Badge>
                    <div className="mt-0.5 text-xs text-muted">{h.matchLabel}{h.person ? <> · Akte: <Link className="text-primary hover:underline" to={`/persons/${h.person.id}`}>{h.person.robloxUsername}</Link>{h.person.robloxUserId ? ` (ID ${h.person.robloxUserId})` : ' (ohne ID)'}</> : null}</div>
                  </td>
                  {!wantedId && (
                    <td className="px-2 py-2">
                      {h.wantedId ? <Link className="font-medium text-primary hover:underline" to={`/wanted/${h.wantedId}`}>{h.wantedNumber ?? 'Fahndung'}</Link> : <span>{h.wantedNumber ?? (h.matchType === 'ERLC_WANTED' ? 'Im Spiel (ER:LC)' : '—')}</span>}
                      <div className="text-xs">{h.reason}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1"><PriorityBadge priority={h.priority} />{h.wantedStatus && <StatusBadge status={h.wantedStatus} />}</div>
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <Badge tone={REVIEW_TONE[h.reviewStatus] ?? 'neutral'}>{h.reviewLabel}</Badge>
                    {(h.reviewedBy || h.reviewStatus === 'ENDED') && <div className="mt-0.5 text-xs text-muted">{h.reviewedBy ?? 'System'} · {fmt(h.reviewedAt)}{h.reviewNote ? ` – ${h.reviewNote}` : ''}</div>}
                    <div className={`mt-0.5 text-xs ${h.notify.status === 'FAILED' ? 'text-danger' : 'text-muted'}`} title={h.notify.error ?? undefined}>{NOTIFY[h.notify.status] ?? h.notify.status}{h.notify.error ? ` (${h.notify.error})` : ''}</div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {can('wanted.edit') && h.reviewStatus === 'NEW' && <Button size="sm" variant="secondary" onClick={() => setReview({ hit: h, decision: 'ACKNOWLEDGED' })}>Zur Kenntnis</Button>}
                    {can('wanted.edit') && h.reviewStatus === 'REVIEW_REQUIRED' && <span className="inline-flex gap-1"><Button size="sm" onClick={() => setReview({ hit: h, decision: 'CONFIRMED' })}>Bestätigen</Button><Button size="sm" variant="secondary" onClick={() => setReview({ hit: h, decision: 'REJECTED' })}>Verwerfen</Button></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {q.data.total > q.data.pageSize && (
            <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button>
              Seite {page} von {Math.ceil(q.data.total / q.data.pageSize)}
              <Button size="sm" variant="ghost" disabled={page * q.data.pageSize >= q.data.total} onClick={() => setPage(page + 1)}>Weiter</Button>
            </div>
          )}
        </div>
      )}
      {review && <ReviewDialog hit={review.hit} decision={review.decision} onClose={() => setReview(undefined)} />}
    </div>
  );
}

function ReviewDialog({ hit, decision, onClose }: { hit: WantedHit; decision: 'ACKNOWLEDGED' | 'CONFIRMED' | 'REJECTED'; onClose: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [link, setLink] = useState(false);
  const canLink = decision === 'CONFIRMED' && !!hit.robloxUserId && !!hit.person && !hit.person.robloxUserId;
  const m = useMutation({
    mutationFn: () => api(`/wanted-hits/${hit.id}/review`, { body: { decision, note: note.trim() || undefined, linkRobloxId: canLink && link ? true : undefined } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['wanted-hits'] }); void qc.invalidateQueries({ queryKey: ['persons'] }); onClose(); },
  });
  const needsNote = decision !== 'ACKNOWLEDGED';
  const title = decision === 'ACKNOWLEDGED' ? 'Treffer zur Kenntnis nehmen' : decision === 'CONFIRMED' ? 'Mögliche Übereinstimmung bestätigen' : 'Mögliche Übereinstimmung verwerfen';
  return (
    <Modal open title={title} onClose={onClose}>
      <p className="text-sm"><b>{hit.playerName}</b>{hit.robloxUserId ? ` (Roblox-ID ${hit.robloxUserId})` : ''} · {hit.matchLabel} · Fahndung {hit.wantedNumber ?? '—'}: {hit.reason}</p>
      {decision === 'CONFIRMED' && <p className="mt-2 text-xs text-muted">Nur bestätigen, wenn die Identität im Rollenspiel geprüft wurde. Es wird nichts im Spiel ausgelöst (kein Kick, kein Bann).</p>}
      <div className="mt-3"><Field label={`Begründung${needsNote ? ' *' : ' (optional)'}`}>{(id) => <Textarea id={id} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}</Field></div>
      {canLink && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={link} onChange={(e) => setLink(e.target.checked)} />Roblox-ID {hit.robloxUserId} in die Personenakte übernehmen (spätere Beitritte werden dann eindeutig erkannt)</label>}
      {m.error && <p role="alert" className="mt-2 text-sm text-danger">{m.error instanceof ApiError ? m.error.message : 'Speichern fehlgeschlagen.'}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={m.isPending || (needsNote && note.trim().length < 3)} onClick={() => m.mutate()}>Speichern</Button></div>
    </Modal>
  );
}

/** Kurzübersicht über der Fahndungsliste: offene Treffer + Verbindungsstatus, Link zur vollständigen Liste. */
export function WantedHitsNotice() {
  const q = useQuery({ queryKey: ['wanted-hits', 'status'], queryFn: () => api<SyncStatus>('/wanted-hits/status'), refetchInterval: 15_000 });
  useRealtime('cad', ['wanted.hits'], [['wanted-hits']]);
  if (!q.data?.servers.length) return null;
  const pending = q.data.open + q.data.review;
  return (
    <Card className="mb-4" title={<span className="flex items-center gap-2">🎯 ER:LC-Fahndungsabgleich {q.data.open > 0 && <Badge tone="danger">{q.data.open} bestätigt</Badge>}{q.data.review > 0 && <Badge tone="warning">{q.data.review} zu prüfen</Badge>}</span>}
      actions={<Link className="text-xs text-primary underline" to="/wanted/hits">{pending ? 'Treffer ansehen' : 'Alle Treffer'}</Link>}>
      <WantedSyncStatus />
    </Card>
  );
}

export function WantedHits() {
  return (
    <>
      <PageHeader title="Fahndungstreffer (ER:LC)" subtitle="Automatischer Abgleich der Spieler auf dem ER:LC-Server mit den aktiven Fahndungen" />
      <div className="space-y-4">
        <Card title="Verbindung & Synchronisierung"><WantedSyncStatus /></Card>
        <Card title="Treffer"><WantedHitList /></Card>
        <Card title="So funktioniert der Abgleich">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Die ER:LC-API liefert je Spieler den Roblox-Namen und die Roblox-ID. Weitere eindeutige Kennungen gibt es nicht; Beitritte meldet ER:LC nicht per Webhook – das System vergleicht darum bei jedem Abruf die Spielerliste mit der vorherigen.</li>
            <li><b>Im Spiel gesucht:</b> Hat ein Spieler in ER:LC Wanted-Sterne, entsteht automatisch ein Treffer (einer je Aufenthalt) – auch ohne Fahndung im Dashboard. Hat der Spieler keine Sterne mehr oder verlässt er den Server, wird der Treffer automatisch beendet. Discord-Kanal: Ereignis „Im Spiel gesucht“ in den CAD-Einstellungen, sonst der Kanal für Fahndungstreffer.</li>
            <li><b>Bestätigt</b> ist ein Treffer nur, wenn die Roblox-ID exakt mit der Roblox-ID in der Personenakte übereinstimmt.</li>
            <li>Gleicher Name oder Alias ergibt nur eine <b>mögliche Übereinstimmung</b> – sie muss manuell bestätigt oder verworfen werden.</li>
            <li>Je Aufenthalt auf dem Server und Fahndung gibt es höchstens einen Treffer und eine Discord-Meldung. Verlässt der Spieler den Server und kommt wieder, ist das ein neuer Aufenthalt.</li>
            <li>Archivierte, erledigte, abgebrochene und abgelaufene Fahndungen werden nicht abgeglichen. Treffer bleiben dauerhaft gespeichert.</li>
            <li>Es wird nie automatisch gekickt, gebannt oder sanktioniert – die Funktion dient nur der Information.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
