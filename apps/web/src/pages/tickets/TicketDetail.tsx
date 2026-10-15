import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';
import { errText, label, type TicketDetail as Detail, type TicketOptions } from '../../lib/tickets';
import { StatusChip } from './SupportTickets';
import { GuildTag, useGuilds } from '../../lib/guilds';

const LOG: Record<string, string> = {
  created: 'Ticket geöffnet', answers: 'Fragen beantwortet', claimed: 'Übernommen', claim_transferred: 'Bearbeiter gewechselt', unclaimed: 'Freigegeben', user_added: 'Benutzer hinzugefügt', user_removed: 'Benutzer entfernt',
  role_added: 'Rolle hinzugefügt', role_removed: 'Rolle entfernt', priority_changed: 'Priorität geändert', status_changed: 'Status geändert', category_changed: 'Kategorie geändert', renamed: 'Umbenannt', moved: 'Verschoben',
  locked: 'Gesperrt', unlocked: 'Entsperrt', escalated: 'Eskaliert', closed: 'Geschlossen', reopened: 'Wieder geöffnet', transcript_created: 'Transkript erstellt', transcript_deleted: 'Transkript gelöscht', note_added: 'Interne Notiz hinzugefügt', replied: 'Über das Dashboard geantwortet',
  rating_requested: 'Bewertung angefragt', rated: 'Bewertet', access_expired: 'Temporärer Zugriff abgelaufen', auto_warning: 'Inaktivitätswarnung', deleted: 'Gelöscht',
};
type Dialog = null | 'close' | 'rename' | 'access' | 'move' | 'delete';

/** Ein Support-Ticket: Verlauf, Antworten, interne Notizen, Protokoll, Transkripte und alle Aktionen (jede mit eigenem Recht). */
export function TicketDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ['support-ticket', id], queryFn: () => api<Detail>(`/support-tickets/${id}`), refetchInterval: 10_000 }); // neue Nachrichten aus Discord
  const opts = useQuery({ queryKey: ['support-ticket-options', id], queryFn: () => api<TicketOptions>(`/support-tickets/${id}/options`), enabled: !!t.data });
  const [dialog, setDialog] = useState<Dialog>(null);
  const multiServer = (useGuilds().data?.length ?? 0) > 1;
  const [msg, setMsg] = useState<string>();
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ message: string }>(`/support-tickets/${id}/actions`, { method: 'POST', body }),
    onSuccess: (r) => { setMsg(r.message); setDialog(null); setNote(''); setReply(''); void qc.invalidateQueries({ queryKey: ['support-ticket', id] }); void qc.invalidateQueries({ queryKey: ['support-ticket-options', id] }); void qc.invalidateQueries({ queryKey: ['support-tickets'] }); },
    onError: () => setMsg(undefined),
  });
  if (t.isLoading) return <SkeletonRows />;
  if (t.error) return <ErrorState error={t.error} onRetry={() => void t.refetch()} />;
  const d = t.data!;
  const o = opts.data;
  const closed = o?.closed ?? !!d.closedAt;
  const deleted = !!d.deletedAt;
  const run = (body: Record<string, unknown>) => act.mutate(body);
  const B = ({ show, children, onClick, danger }: { show: boolean; children: ReactNode; onClick: () => void; danger?: boolean }) => (show ? <Button size="sm" variant={danger ? 'danger' : 'secondary'} disabled={act.isPending} onClick={onClick}>{children}</Button> : null);
  const pick = (title: string, value: string, items: { id: string; name: string; emoji?: string | null }[], onPick: (v: string) => void) => (
    <div className="w-44"><Select aria-label={title} value="" disabled={act.isPending || !items.length} onChange={(e) => e.target.value && onPick(e.target.value)}>
      <option value="">{title}{value ? `: ${value}` : ''}</option>{items.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}
    </Select></div>
  );

  return (
    <>
      <PageHeader title={`Ticket #${d.number}`} subtitle={`${label(d.category)} · ${d.name}`} actions={<Link to="/support-tickets" className="text-sm text-primary underline">Alle Tickets</Link>} />
      {act.error && <p role="alert" className="mb-3 text-sm text-danger">{errText(act.error)}</p>}
      {msg && <p role="status" className="mb-3 text-sm text-success">{msg}</p>}
      {!deleted && (
        <Card className="mb-4" title="Aktionen">
          <div className="flex flex-wrap items-center gap-2">
            <B show={!closed && can('ticket.claim')} onClick={() => run({ action: 'claim' })}>👤 Übernehmen</B>
            <B show={!closed && can('ticket.claim') && d.claimers.length > 0} onClick={() => run({ action: 'unclaim' })}>↩️ Freigeben</B>
            <B show={!closed && can('ticket.close')} onClick={() => setDialog('close')} danger>🔒 Schließen</B>
            <B show={closed && can('ticket.reopen') && d.category.allowReopen} onClick={() => run({ action: 'reopen' })}>🔓 Wieder öffnen</B>
            <B show={!closed && can('ticket.lock')} onClick={() => run({ action: d.locked ? 'unlock' : 'lock' })}>{d.locked ? '✅ Entsperren' : '⛔ Sperren'}</B>
            <B show={!closed && can('ticket.escalate')} onClick={() => run({ action: 'escalate' })}>🟠 Eskalieren</B>
            <B show={can('ticket.transcript')} onClick={() => run({ action: 'transcript' })}>📋 Transkript</B>
            <B show={!closed && can('ticket.rename')} onClick={() => setDialog('rename')}>✏️ Umbenennen</B>
            <B show={can('ticket.move')} onClick={() => setDialog('move')}>📁 Verschieben</B>
            <B show={!closed && (can('ticket.add_user') || can('ticket.remove_user'))} onClick={() => setDialog('access')}>➕ Zugriff</B>
            <B show={closed && can('ticket.rate')} onClick={() => run({ action: 'rating' })}>⭐ Bewertung anfragen</B>
            <B show={closed && can('ticket.delete')} onClick={() => setDialog('delete')} danger>🗑️ Löschen</B>
            {!closed && can('ticket.change_priority') && o && pick('Priorität', d.priority?.name ?? '', o.priorities, (v) => run({ action: 'priority', priorityId: v }))}
            {can('ticket.change_status') && o && pick('Status', d.status?.name ?? '', o.statuses, (v) => run({ action: 'status', statusId: v }))}
            {!closed && can('ticket.change_category') && o && pick('Kategorie', d.category.name, o.categories, (v) => run({ action: 'category', categoryId: v }))}
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
          {d.answers.length > 0 && (
            <Card title="Antworten">
              <dl className="grid gap-2 text-sm">{d.answers.map((a, i) => <div key={i}><dt className="text-xs text-muted">{a.label}</dt><dd className="whitespace-pre-wrap">{a.value}</dd></div>)}</dl>
            </Card>
          )}
          <Card title={`Verlauf (${d.messages.length})`}>
            {!d.messages.length ? <p className="text-sm text-muted">Noch keine Nachrichten aufgezeichnet. (Der Bot benötigt dafür den Message-Content-Intent.)</p> : (
              <ol className="grid gap-3">{d.messages.map((m) => (
                <li key={m.id} className="flex gap-2">
                  {m.authorAvatar && /^https:\/\//.test(m.authorAvatar) ? <img src={m.authorAvatar} alt="" className="h-8 w-8 shrink-0 rounded-full" /> : <div aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-panel-2" />}
                  <div className="min-w-0">
                    <p className="text-sm"><strong>{m.authorName}</strong> {m.isBot ? <Badge tone="primary">Bot</Badge> : m.isStaff ? <Badge tone="info">Team</Badge> : null} <span className="text-xs text-muted">{fmt(m.createdAt)}</span></p>
                    {m.content && <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>}
                    {m.embeds.map((e, i) => <div key={i} className="mt-1 rounded border-l-4 border-primary bg-panel-2 px-2 py-1 text-sm">{e.title && <p className="font-semibold">{e.title}</p>}{e.description && <p className="whitespace-pre-wrap">{e.description}</p>}</div>)}
                    {m.attachments.map((a, i) => {
                      const href = a.storageKey ? `/api/v1/support-tickets/attachments/${a.storageKey}` : a.url;
                      return a.storageKey && a.contentType?.startsWith('image/')
                        ? <a key={i} href={href} target="_blank" rel="noreferrer"><img src={href} alt={a.name} className="mt-1 max-h-60 rounded" /></a>
                        : <a key={i} href={href} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-primary underline">📎 {a.name} ({Math.max(1, Math.round(a.size / 1024))} KB)</a>;
                    })}
                  </div>
                </li>
              ))}</ol>
            )}
            {!closed && !deleted && can('ticket.claim') && (
              <div className="mt-3 grid gap-2 border-t border-line pt-3">
                <Textarea aria-label="Antwort an den Ersteller" rows={3} maxLength={4000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={d.channelId ? 'Antwort schreiben … (erscheint im Discord-Ticket)' : 'Das Ticket hat noch keinen Discord-Kanal.'} disabled={!d.channelId}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && reply.trim()) run({ action: 'reply', text: reply }); }} />
                <div className="flex items-center gap-2"><Button size="sm" disabled={!reply.trim() || !d.channelId || act.isPending} onClick={() => run({ action: 'reply', text: reply })}>💬 Antworten</Button><span className="text-xs text-muted">Strg/⌘ + Enter sendet</span></div>
              </div>
            )}
          </Card>
          {d.notes && (
            <Card title="Interne Notizen (für den Ersteller nie sichtbar)">
              {d.notes.length ? <ul className="mb-3 grid gap-2">{d.notes.map((n) => <li key={n.id} className="rounded border border-warning/30 bg-warning/10 p-2 text-sm"><p className="whitespace-pre-wrap">{n.text}</p><p className="mt-1 text-xs text-muted">{n.authorName} · {fmt(n.createdAt)}</p></li>)}</ul> : <p className="mb-3 text-sm text-muted">Keine Notizen.</p>}
              {can('ticket.internal_notes') && !deleted && (
                <div className="grid gap-2">
                  <Textarea aria-label="Neue interne Notiz" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Interne Notiz hinzufügen …" />
                  <div><Button size="sm" disabled={!note.trim() || act.isPending} onClick={() => run({ action: 'note', text: note })}>Notiz hinzufügen</Button></div>
                </div>
              )}
            </Card>
          )}
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <Card title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Status</dt><dd><StatusChip s={d.status} />{d.locked && <span className="ml-1"><Badge tone="danger">gesperrt</Badge></span>}{deleted && <span className="ml-1"><Badge tone="neutral">gelöscht</Badge></span>}</dd>
              <dt className="text-muted">Priorität</dt><dd><StatusChip s={d.priority} /></dd>
              <dt className="text-muted">Kategorie</dt><dd>{label(d.category)}</dd>
              {multiServer && <><dt className="text-muted">Server</dt><dd><GuildTag id={d.guildId} /></dd></>}
              <dt className="text-muted">Ersteller</dt><dd>{d.creatorName} <span className="font-mono text-xs text-muted">{d.creatorId}</span></dd>
              <dt className="text-muted">Bearbeiter</dt><dd>{d.claimers.length ? d.claimers.map((c, i) => <span key={c} className="mr-2 inline-block">{d.names[c] ?? <span className="font-mono text-xs">{c}</span>}{i === 0 && d.category.claimMode === 'PRIMARY' && d.claimers.length > 1 ? ' (Haupt)' : ''}</span>) : <span className="text-muted">nicht übernommen</span>}</dd>
              <dt className="text-muted">Kanal</dt><dd>{d.channelId ? <a className="text-primary underline" href={`https://discord.com/channels/${d.guildId}/${d.channelId}`} target="_blank" rel="noreferrer">In Discord öffnen</a> : '—'}</dd>
              <dt className="text-muted">Geöffnet</dt><dd>{fmt(d.createdAt)}</dd>
              <dt className="text-muted">Erste Antwort</dt><dd>{fmt(d.firstResponseAt)}</dd>
              <dt className="text-muted">Letzte Aktivität</dt><dd>{fmt(d.lastActivityAt)}</dd>
              {d.closedAt && <><dt className="text-muted">Geschlossen</dt><dd>{fmt(d.closedAt)}{d.closedByName ? ` · ${d.closedByName}` : ''}</dd><dt className="text-muted">Grund</dt><dd className="whitespace-pre-wrap">{d.closeReason ?? '—'}</dd></>}
              {d.deleteAt && !deleted && <><dt className="text-muted">Löschung</dt><dd>{fmt(d.deleteAt)}</dd></>}
            </dl>
          </Card>
          <Card title="Zugriff">
            {d.access.length ? <ul className="grid gap-1 text-sm">{d.access.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>{a.kind === 'ROLE' ? '🛡️ Rolle' : '👤'} {a.kind === 'USER' && d.names[a.targetId] ? d.names[a.targetId] : <span className="font-mono text-xs">{a.targetId}</span>}{a.expiresAt && <span className="text-xs text-muted"> · bis {fmt(a.expiresAt)}</span>}</span>
                {!closed && !deleted && can('ticket.remove_user') && <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => run({ action: 'remove_access', targetId: a.targetId })}>Entfernen</Button>}
              </li>
            ))}</ul> : <p className="text-sm text-muted">Nur Ersteller und Team der Kategorie.</p>}
          </Card>
          {d.rating && <Card title="Bewertung"><p className="text-lg">{'★'.repeat(d.rating.stars)}{'☆'.repeat(5 - d.rating.stars)}</p>{d.rating.comment && <p className="whitespace-pre-wrap text-sm">{d.rating.comment}</p>}<p className="text-xs text-muted">{fmt(d.rating.createdAt)}</p></Card>}
          {d.transcripts && (
            <Card title="Transkripte">
              {d.transcripts.length ? <ul className="grid gap-1 text-sm">{d.transcripts.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2"><span>{fmt(x.createdAt)}</span>
                  <span className="flex gap-2"><a className="text-primary underline" href={`/api/v1/support-tickets/transcripts/${x.id}`} target="_blank" rel="noreferrer">Öffnen</a><a className="text-primary underline" href={`/api/v1/support-tickets/transcripts/${x.id}?download=1`}>Herunterladen</a></span></li>
              ))}</ul> : <p className="text-sm text-muted">Noch keine.</p>}
            </Card>
          )}
          <Card title="Protokoll">
            <ol className="grid gap-1.5 text-sm">{d.logs.map((g) => (
              <li key={g.id}><span>{LOG[g.action] ?? g.action}</span>{g.detail.to !== undefined && <span className="text-muted">: {String(g.detail.from ?? '—')} → {String(g.detail.to)}</span>}{typeof g.detail.reason === 'string' && <span className="text-muted">: {g.detail.reason}</span>}{g.detail.to === undefined && typeof g.detail.target === 'string' && <span className="font-mono text-xs text-muted"> {g.detail.target}</span>}
                <span className="block text-xs text-muted">{g.actorName ?? 'System'} · {fmt(g.createdAt)}</span></li>
            ))}</ol>
          </Card>
        </div>
      </div>
      {dialog === 'close' && <CloseDialog o={o} busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(reason) => run({ action: 'close', ...(reason ? { reason } : {}) })} />}
      {dialog === 'rename' && <InputDialog title="Kanal umbenennen" field="Neuer Name (Platzhalter erlaubt, z. B. support-{username})" initial={d.name} busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(name) => run({ action: 'rename', name })} />}
      {dialog === 'move' && <InputDialog title="In Discord-Kategorie verschieben" field="Discord-Kategorie-ID (leer = keine Kategorie)" initial="" numeric busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(v) => run({ action: 'move', parentId: v || null })} allowEmpty />}
      {dialog === 'access' && <AccessDialog busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(b) => run(b)} />}
      <ConfirmDialog open={dialog === 'delete'} danger title="Ticket löschen?" message="Der Discord-Kanal wird gelöscht. Vorher wird ein Transkript gespeichert, falls die Kategorie dafür eingerichtet ist." confirmLabel="Löschen" busy={act.isPending} onConfirm={() => run({ action: 'delete' })} onClose={() => setDialog(null)} />
    </>
  );
}

const Err = ({ error }: { error: unknown }) => (error ? <p role="alert" className="text-sm text-danger">{errText(error)}</p> : null);

function CloseDialog({ o, busy, error, onClose, onConfirm }: { o?: TicketOptions; busy: boolean; error: unknown; onClose: () => void; onConfirm: (reason?: string) => void }) {
  const mode = o?.close.mode ?? 'OPTIONAL', source = o?.close.source ?? 'BOTH';
  const [preset, setPreset] = useState('');
  const [custom, setCustom] = useState('');
  const reason = (custom.trim() || preset).trim();
  return (
    <Modal open title="Ticket schließen" onClose={onClose}>
      <div className="grid gap-3">
        {mode !== 'NONE' && source !== 'CUSTOM' && !!o?.reasons.length && (
          <Field label="Grund">{(id) => <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value)}><option value="">Auswählen …</option>{o.reasons.map((r) => <option key={r.id} value={r.text}>{r.text}</option>)}</Select>}</Field>
        )}
        {mode !== 'NONE' && (source !== 'PRESET' || !o?.reasons.length) && (
          <Field label={source === 'BOTH' && o?.reasons.length ? 'Oder eigener Grund' : 'Grund'}>{(id) => <Textarea id={id} rows={3} maxLength={500} value={custom} onChange={(e) => setCustom(e.target.value)} />}</Field>
        )}
        {mode === 'REQUIRED' && <p className="text-xs text-muted">Für diese Kategorie ist ein Grund erforderlich.</p>}
        <Err error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button variant="danger" disabled={busy || (mode === 'REQUIRED' && !reason)} onClick={() => onConfirm(mode === 'NONE' ? undefined : reason || undefined)}>Ticket schließen</Button></div>
      </div>
    </Modal>
  );
}

function InputDialog({ title, field, initial, numeric, allowEmpty, busy, error, onClose, onConfirm }: { title: string; field: string; initial: string; numeric?: boolean; allowEmpty?: boolean; busy: boolean; error: unknown; onClose: () => void; onConfirm: (v: string) => void }) {
  const [v, setV] = useState(initial);
  return (
    <Modal open title={title} onClose={onClose}>
      <div className="grid gap-3">
        <Field label={field}>{(id) => <Input id={id} value={v} inputMode={numeric ? 'numeric' : undefined} maxLength={90} onChange={(e) => setV(e.target.value)} />}</Field>
        <Err error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={busy || (!allowEmpty && !v.trim())} onClick={() => onConfirm(v.trim())}>Speichern</Button></div>
      </div>
    </Modal>
  );
}

function AccessDialog({ busy, error, onClose, onConfirm }: { busy: boolean; error: unknown; onClose: () => void; onConfirm: (b: Record<string, unknown>) => void }) {
  const [v, setV] = useState({ targetId: '', kind: 'USER', minutes: '0' });
  return (
    <Modal open title="Benutzer oder Rolle zum Ticket hinzufügen" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Typ">{(id) => <Select id={id} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="USER">Benutzer</option><option value="ROLE">Rolle</option></Select>}</Field>
        <Field label="Discord-ID">{(id) => <Input id={id} inputMode="numeric" value={v.targetId} onChange={(e) => setV({ ...v, targetId: e.target.value.trim() })} placeholder="123456789012345678" />}</Field>
        <Field label="Dauer">{(id) => <Select id={id} value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })}><option value="0">Permanent</option><option value="60">1 Stunde</option><option value="1440">24 Stunden</option><option value="10080">7 Tage</option></Select>}</Field>
        <Err error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={busy || !/^\d{15,25}$/.test(v.targetId)} onClick={() => onConfirm({ action: 'add_access', targetId: v.targetId, kind: v.kind, ...(Number(v.minutes) ? { minutes: Number(v.minutes) } : {}) })}>Hinzufügen</Button></div>
      </div>
    </Modal>
  );
}
