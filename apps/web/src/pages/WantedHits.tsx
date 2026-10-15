import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Page } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { ChannelPicker } from '../components/DiscordPickers';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Field, Input, Modal, PageHeader, PriorityBadge, Select, SkeletonRows, StatusBadge, Textarea, type Tone } from '../components/ui';

interface Hit {
  id: string; reference: string; wantedId: string; personId: string | null; playerName: string; robloxUserId: string | null; matchType: 'ROBLOX_ID' | 'NAME';
  reviewStatus: 'CONFIRMED' | 'PENDING' | 'VERIFIED' | 'DISMISSED'; matchNote: string | null; wantedReason: string; wantedPriority: string; detectedAt: string; erlcServerName: string | null;
  reviewedByName: string | null; reviewedAt: string | null; reviewNote: string | null; delivery: 'NONE' | 'QUEUED' | 'SENT' | 'SKIPPED' | 'FAILED'; deliveryError: string | null;
  wanted: { id: string; status: string; priority: string; reason: string } | null; person: { id: string; robloxUsername: string; robloxUserId: string | null } | null;
  session: { joinedAt: string; lastSeenAt: string; leftAt: string | null } | null;
}
interface Settings { enabled: boolean; notifyDiscord: boolean; notifyPossible: boolean; channelId: string | null }
interface Summary {
  pending: number; confirmed24h: number; total: number; settings: Settings;
  servers: { id: string; name: string; active: boolean; status: string; lastSyncAt: string | null; lastError: string | null; lastErrorAt: string | null; playersEnabled: boolean; match: { lastRunAt: string; lastOkAt: string | null; lastError: string | null; online: number; joined: number; hits: number } | null }[];
}

const REVIEW: Record<Hit['reviewStatus'], [string, Tone]> = {
  CONFIRMED: ['Bestätigt (Roblox-ID)', 'danger'], PENDING: ['Manuelle Prüfung erforderlich', 'warning'], VERIFIED: ['Manuell bestätigt', 'danger'], DISMISSED: ['Verworfen', 'neutral'],
};
const DELIVERY: Record<Hit['delivery'], [string, Tone] | null> = {
  NONE: null, QUEUED: ['Discord: wird gesendet', 'info'], SENT: ['Discord: gesendet', 'success'], SKIPPED: ['Discord: kein Kanal', 'neutral'], FAILED: ['Discord: fehlgeschlagen', 'danger'],
};
const SERVER_TONE: Record<string, Tone> = { CONNECTED: 'success', LIMITED: 'warning', OFFLINE: 'warning', ERROR: 'danger', DISABLED: 'neutral', UNKNOWN: 'neutral' };
const SERVER_LABEL: Record<string, string> = { CONNECTED: 'Verbunden', LIMITED: 'Eingeschränkt', OFFLINE: 'Offline / nicht erreichbar', ERROR: 'Fehler', DISABLED: 'Deaktiviert', UNKNOWN: 'Noch nicht abgerufen' };
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Fehlgeschlagen');

/** 🎯 ER:LC-Fahndungstreffer: automatischer Abgleich der Spieler auf dem ER:LC-Server mit aktiven Fahndungen. */
export function WantedHits() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const focus = params.get('id');
  const [status, setStatus] = useState(focus ? '' : 'PENDING');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [review, setReview] = useState<Hit | null>(null);
  useRealtime('cad', ['wanted.hit'], [['wanted-hits']]);
  const summary = useQuery({ queryKey: ['wanted-hits', 'summary'], queryFn: () => api<Summary>('/wanted-hits/summary'), refetchInterval: 15_000 });
  const list = useQuery({ queryKey: ['wanted-hits', 'list', status, q, page], queryFn: () => api<Page<Hit>>('/wanted-hits', { query: { status: status || undefined, q: q.trim() || undefined, page, pageSize: 25 } }), refetchInterval: 15_000 });
  const focused = useQuery({ queryKey: ['wanted-hits', 'one', focus], queryFn: () => api<Hit>(`/wanted-hits/${focus}`), enabled: !!focus });
  const rows = [...(focused.data && !list.data?.items.some((h) => h.id === focused.data!.id) ? [focused.data] : []), ...(list.data?.items ?? [])];
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <PageHeader title="🎯 ER:LC-Fahndungstreffer" subtitle="Bei jedem erfolgreichen ER:LC-Abruf wird die Spielerliste mit allen aktiven Personen-Fahndungen verglichen. Bestätigt wird ein Treffer nur, wenn die Roblox-ID der Akte exakt mit der von ER:LC gelieferten ID übereinstimmt – ein gleicher Name ergibt nur eine mögliche Übereinstimmung. Es werden keine Maßnahmen im Spiel ausgelöst." />
      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Prüfung offen" value={summary.data?.pending} tone={summary.data?.pending ? 'warning' : 'neutral'} onClick={() => { setStatus('PENDING'); setPage(1); }} />
        <Stat label="Bestätigte Treffer (24 h)" value={summary.data?.confirmed24h} tone={summary.data?.confirmed24h ? 'danger' : 'neutral'} onClick={() => { setStatus('CONFIRMED'); setPage(1); }} />
        <Stat label="Treffer gesamt (Historie)" value={summary.data?.total} tone="neutral" onClick={() => { setStatus(''); setPage(1); }} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_minmax(0,22rem)]">
        <Card title="Treffer" actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input aria-label="Suche" placeholder="Spieler, Roblox-ID, Grund" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-full sm:w-48" />
            <Select aria-label="Status" className="w-full sm:w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Alle</option>{(Object.keys(REVIEW) as Hit['reviewStatus'][]).map((s) => <option key={s} value={s}>{REVIEW[s][0]}</option>)}
            </Select>
          </div>}>
          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !rows.length ? <EmptyState text={status === 'PENDING' ? 'Keine offenen Prüfungen.' : 'Keine Treffer.'} hint="Treffer entstehen, wenn eine gesuchte Person dem ER:LC-Server beitritt." /> : (
            <ul className="divide-y divide-line">{rows.map((h) => <HitRow key={h.id} h={h} focused={h.id === focus} canReview={can('wanted.review_hits')} onReview={() => setReview(h)} />)}</ul>
          )}
          {pages > 1 && <div className="mt-3 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Zurück</Button><span>Seite {page} / {pages}</span><Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Weiter</Button></div>}
        </Card>
        <div className="space-y-3">
          <SyncStatus s={summary.data} loading={summary.isLoading} error={summary.error} />
          {can('wanted.manage_matching') && summary.data && <MatchSettings initial={summary.data.settings} onSaved={() => void qc.invalidateQueries({ queryKey: ['wanted-hits'] })} />}
        </div>
      </div>
      {review && <ReviewDialog hit={review} onClose={() => setReview(null)} onDone={() => { setReview(null); void qc.invalidateQueries({ queryKey: ['wanted-hits'] }); }} />}
    </>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: number | undefined; tone: Tone; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card border border-line p-3 text-left hover:border-primary">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value ?? '—'}</p>
      {value ? <Badge tone={tone}>{tone === 'neutral' ? 'Anzeigen' : 'Ansehen'}</Badge> : null}
    </button>
  );
}

function HitRow({ h, focused, canReview, onReview }: { h: Hit; focused: boolean; canReview: boolean; onReview: () => void }) {
  const [label, tone] = REVIEW[h.reviewStatus];
  const d = DELIVERY[h.delivery];
  const online = h.session && !h.session.leftAt;
  return (
    <li className={`space-y-1 py-2.5 text-sm ${focused ? 'rounded bg-primary/10 px-2' : ''} ${h.reviewStatus === 'DISMISSED' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        <b>{h.playerName}</b>
        <span className="text-xs text-muted">{h.robloxUserId ? `Roblox-ID ${h.robloxUserId}` : 'keine Roblox-ID geliefert'}</span>
        <Badge tone={tone}>{label}</Badge>
        <Badge tone={h.matchType === 'ROBLOX_ID' ? 'info' : 'warning'}>{h.matchType === 'ROBLOX_ID' ? 'Übereinstimmung: Roblox-ID' : 'Übereinstimmung: nur Name'}</Badge>
        {online ? <Badge tone="success">online</Badge> : h.session?.leftAt ? <Badge tone="neutral">verlassen {fmt(h.session.leftAt)}</Badge> : null}
        {canReview && (h.reviewStatus === 'PENDING' || h.reviewStatus === 'CONFIRMED') && <Button size="sm" variant={h.reviewStatus === 'PENDING' ? 'primary' : 'ghost'} className="ml-auto" onClick={onReview}>{h.reviewStatus === 'PENDING' ? 'Prüfen' : 'Verwerfen …'}</Button>}
      </div>
      <p>
        <Link to={`/wanted/${h.wantedId}`} className="font-medium hover:underline">{h.reference}</Link> · {h.wantedReason} <PriorityBadge priority={h.wantedPriority} />
        {h.wanted && <> · Fahndung aktuell: <StatusBadge status={h.wanted.status} /></>}
        {h.person && <> · Akte: <Link to={`/persons/${h.person.id}`} className="hover:underline">{h.person.robloxUsername}</Link>{h.person.robloxUserId ? ` (ID ${h.person.robloxUserId})` : ' (ohne Roblox-ID)'}</>}
      </p>
      {h.matchNote && <p className="text-xs text-warning">⚠️ {h.matchNote}</p>}
      <p className="text-xs text-muted">
        Erkannt {fmt(h.detectedAt)}{h.erlcServerName ? ` auf ${h.erlcServerName}` : ''}
        {h.reviewedAt && ` · geprüft ${fmt(h.reviewedAt)}${h.reviewedByName ? ` von ${h.reviewedByName}` : ''}${h.reviewNote ? `: „${h.reviewNote}“` : ''}`}
      </p>
      {d && <p className="text-xs"><Badge tone={d[1]}>{d[0]}</Badge>{h.deliveryError && <span className="ml-1 text-muted">{h.deliveryError}</span>}</p>}
    </li>
  );
}

function SyncStatus({ s, loading, error }: { s?: Summary; loading: boolean; error: unknown }) {
  return (
    <Card title="Synchronisierung">
      {loading ? <SkeletonRows rows={2} /> : error ? <ErrorState error={error} /> : !s?.servers.length ? <EmptyState text="Kein ER:LC-Server eingerichtet." hint="CAD → ER:LC-Server einrichten (Funktion „Spieler“ freigeben)." /> : (
        <ul className="space-y-2 text-sm">{s.servers.map((x) => (
          <li key={x.id} className="space-y-0.5">
            <div className="flex items-center gap-2"><b>{x.name}</b><Badge tone={SERVER_TONE[x.status] ?? 'neutral'}>{SERVER_LABEL[x.status] ?? x.status}</Badge></div>
            <p className="text-xs text-muted">Letzte erfolgreiche Synchronisierung: {fmt(x.lastSyncAt)}</p>
            {x.match && <p className="text-xs text-muted">Letzter Abgleich: {fmt(x.match.lastOkAt)} · {x.match.online} Spieler online</p>}
            {!x.playersEnabled && <p className="text-xs text-warning">Spielerliste ist für diesen Server nicht freigegeben – kein Abgleich möglich.</p>}
            {x.lastError && <p className="text-xs text-danger">{x.lastError}{x.lastErrorAt ? ` (${fmt(x.lastErrorAt)})` : ''}</p>}
            {x.match?.lastError && x.playersEnabled && <p className="text-xs text-warning">{x.match.lastError}</p>}
          </li>))}</ul>
      )}
      {s && !s.settings.enabled && <p className="mt-2 text-xs text-warning">Der automatische Abgleich ist ausgeschaltet.</p>}
    </Card>
  );
}

function MatchSettings({ initial, onSaved }: { initial: Settings; onSaved: () => void }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const save = useMutation({ mutationFn: () => api<Settings>('/wanted-hits/settings', { method: 'PUT', body: v }), onSuccess: (r) => { setV(r); setMsg({ ok: true, text: 'Gespeichert.' }); onSaved(); }, onError: (e) => setMsg({ ok: false, text: errText(e) }) });
  const box = (k: 'enabled' | 'notifyDiscord' | 'notifyPossible', label: string, disabled = false) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={disabled} checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />{label}</label>;
  return (
    <Card title="Einstellungen">
      <div className="space-y-2">
        {box('enabled', 'Automatischer Abgleich bei jedem ER:LC-Abruf')}
        {box('notifyDiscord', 'Bestätigte Treffer in Discord melden')}
        {box('notifyPossible', 'Auch mögliche Übereinstimmungen (nur Name) in Discord melden', !v.notifyDiscord)}
        <Field label="Interner Discord-Kanal" hint="Leer = Fahndungs-Kanal aus den Discord-Bot-Channels.">{(id) => <div id={id}><ChannelPicker ariaLabel="Kanal für Fahndungstreffer" value={v.channelId} onChange={(c) => setV({ ...v, channelId: c })} /></div>}</Field>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>Speichern</Button>
        {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      </div>
    </Card>
  );
}

function ReviewDialog({ hit, onClose, onDone }: { hit: Hit; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<'VERIFIED' | 'DISMISSED'>(hit.reviewStatus === 'CONFIRMED' ? 'DISMISSED' : 'VERIFIED');
  const [note, setNote] = useState('');
  const canStore = !!hit.robloxUserId && !!hit.person && !hit.person.robloxUserId;
  const [store, setStore] = useState(false);
  const m = useMutation({ mutationFn: () => api(`/wanted-hits/${hit.id}/review`, { body: { decision, note: note.trim(), storeRobloxId: decision === 'VERIFIED' && store } }), onSuccess: onDone });
  return (
    <Modal open title={`Treffer prüfen: ${hit.playerName}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <p className="text-sm">{hit.reference} · {hit.wantedReason}</p>
        {hit.matchNote && <p className="text-sm text-warning">⚠️ {hit.matchNote}</p>}
        {hit.reviewStatus === 'PENDING' ? (
          <Field label="Ergebnis">{(id) => <Select id={id} value={decision} onChange={(e) => setDecision(e.target.value as 'VERIFIED' | 'DISMISSED')}><option value="VERIFIED">Es ist die gesuchte Person (bestätigen)</option><option value="DISMISSED">Andere Person (verwerfen)</option></Select>}</Field>
        ) : <p className="text-sm">Der Treffer beruht auf der in der Akte hinterlegten Roblox-ID. Verwerfen, wenn diese ID falsch ist.</p>}
        {decision === 'VERIFIED' && canStore && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={store} onChange={(e) => setStore(e.target.checked)} />Roblox-ID {hit.robloxUserId} in die Akte übernehmen (künftig eindeutige Erkennung)</label>}
        <Field label="Begründung *">{(id) => <Textarea id={id} rows={3} required minLength={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" variant={decision === 'DISMISSED' ? 'secondary' : 'danger'} disabled={m.isPending || note.trim().length < 3}>{decision === 'VERIFIED' ? 'Bestätigen' : 'Verwerfen'}</Button></div>
      </form>
    </Modal>
  );
}
