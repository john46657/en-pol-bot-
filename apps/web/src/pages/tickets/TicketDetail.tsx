import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Textarea } from '../../components/ui';
import { errText, label, type TicketDetail as Detail, type TicketOptions } from '../../lib/tickets';
import { StatusChip } from './SupportTickets';

const LOG: Record<string, string> = {
  created: 'Ticket opened', answers: 'Questions answered', claimed: 'Claimed', claim_transferred: 'Staff changed', unclaimed: 'Unclaimed', user_added: 'User added', user_removed: 'User removed',
  role_added: 'Role added', role_removed: 'Role removed', priority_changed: 'Priority changed', status_changed: 'Status changed', category_changed: 'Category changed', renamed: 'Renamed', moved: 'Moved',
  locked: 'Locked', unlocked: 'Unlocked', escalated: 'Escalated', closed: 'Closed', reopened: 'Reopened', transcript_created: 'Transcript created', transcript_deleted: 'Transcript deleted', note_added: 'Internal note added',
  rating_requested: 'Rating requested', rated: 'Rated', access_expired: 'Temporary access expired', auto_warning: 'Inactivity warning', deleted: 'Deleted',
};
type Dialog = null | 'close' | 'rename' | 'access' | 'move' | 'delete';

/** Ein Support-Ticket: Verlauf, Antworten, interne Notizen, Protokoll, Transcripts und alle Aktionen (jede mit eigenem Recht). */
export function TicketDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const t = useQuery({ queryKey: ['support-ticket', id], queryFn: () => api<Detail>(`/support-tickets/${id}`) });
  const opts = useQuery({ queryKey: ['support-ticket-options', id], queryFn: () => api<TicketOptions>(`/support-tickets/${id}/options`), enabled: !!t.data });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [msg, setMsg] = useState<string>();
  const [note, setNote] = useState('');
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<{ message: string }>(`/support-tickets/${id}/actions`, { method: 'POST', body }),
    onSuccess: (r) => { setMsg(r.message); setDialog(null); setNote(''); void qc.invalidateQueries({ queryKey: ['support-ticket', id] }); void qc.invalidateQueries({ queryKey: ['support-ticket-options', id] }); void qc.invalidateQueries({ queryKey: ['support-tickets'] }); },
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
      <PageHeader title={`Ticket #${d.number}`} subtitle={`${label(d.category)} · ${d.name}`} actions={<Link to="/support-tickets" className="text-sm text-primary underline">All tickets</Link>} />
      {act.error && <p role="alert" className="mb-3 text-sm text-danger">{errText(act.error)}</p>}
      {msg && <p role="status" className="mb-3 text-sm text-success">{msg}</p>}
      {!deleted && (
        <Card className="mb-4" title="Actions">
          <div className="flex flex-wrap items-center gap-2">
            <B show={!closed && can('ticket.claim')} onClick={() => run({ action: 'claim' })}>👤 Claim</B>
            <B show={!closed && can('ticket.claim') && d.claimers.length > 0} onClick={() => run({ action: 'unclaim' })}>↩️ Unclaim</B>
            <B show={!closed && can('ticket.close')} onClick={() => setDialog('close')} danger>🔒 Close</B>
            <B show={closed && can('ticket.reopen') && d.category.allowReopen} onClick={() => run({ action: 'reopen' })}>🔓 Reopen</B>
            <B show={!closed && can('ticket.lock')} onClick={() => run({ action: d.locked ? 'unlock' : 'lock' })}>{d.locked ? '✅ Unlock' : '⛔ Lock'}</B>
            <B show={!closed && can('ticket.escalate')} onClick={() => run({ action: 'escalate' })}>🟠 Escalate</B>
            <B show={can('ticket.transcript')} onClick={() => run({ action: 'transcript' })}>📋 Transcript</B>
            <B show={!closed && can('ticket.rename')} onClick={() => setDialog('rename')}>✏️ Rename</B>
            <B show={can('ticket.move')} onClick={() => setDialog('move')}>📁 Move</B>
            <B show={!closed && (can('ticket.add_user') || can('ticket.remove_user'))} onClick={() => setDialog('access')}>➕ Access</B>
            <B show={closed && can('ticket.rate')} onClick={() => run({ action: 'rating' })}>⭐ Request rating</B>
            <B show={closed && can('ticket.delete')} onClick={() => setDialog('delete')} danger>🗑️ Delete</B>
            {!closed && can('ticket.change_priority') && o && pick('Priority', d.priority?.name ?? '', o.priorities, (v) => run({ action: 'priority', priorityId: v }))}
            {can('ticket.change_status') && o && pick('Status', d.status?.name ?? '', o.statuses, (v) => run({ action: 'status', statusId: v }))}
            {!closed && can('ticket.change_category') && o && pick('Category', d.category.name, o.categories, (v) => run({ action: 'category', categoryId: v }))}
          </div>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid min-w-0 content-start gap-4 lg:col-span-2">
          {d.answers.length > 0 && (
            <Card title="Answers">
              <dl className="grid gap-2 text-sm">{d.answers.map((a, i) => <div key={i}><dt className="text-xs text-muted">{a.label}</dt><dd className="whitespace-pre-wrap">{a.value}</dd></div>)}</dl>
            </Card>
          )}
          <Card title={`Conversation (${d.messages.length})`}>
            {!d.messages.length ? <p className="text-sm text-muted">No messages recorded yet. (The bot needs the Message Content intent to record messages.)</p> : (
              <ol className="grid gap-3">{d.messages.map((m) => (
                <li key={m.id} className="flex gap-2">
                  {m.authorAvatar && /^https:\/\//.test(m.authorAvatar) ? <img src={m.authorAvatar} alt="" className="h-8 w-8 shrink-0 rounded-full" /> : <div aria-hidden className="h-8 w-8 shrink-0 rounded-full bg-panel-2" />}
                  <div className="min-w-0">
                    <p className="text-sm"><strong>{m.authorName}</strong> {m.isBot ? <Badge tone="primary">Bot</Badge> : m.isStaff ? <Badge tone="info">Staff</Badge> : null} <span className="text-xs text-muted">{fmt(m.createdAt)}</span></p>
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
          </Card>
          {d.notes && (
            <Card title="Internal notes (never shown to the creator)">
              {d.notes.length ? <ul className="mb-3 grid gap-2">{d.notes.map((n) => <li key={n.id} className="rounded border border-warning/30 bg-warning/10 p-2 text-sm"><p className="whitespace-pre-wrap">{n.text}</p><p className="mt-1 text-xs text-muted">{n.authorName} · {fmt(n.createdAt)}</p></li>)}</ul> : <p className="mb-3 text-sm text-muted">No notes.</p>}
              {can('ticket.internal_notes') && !deleted && (
                <div className="grid gap-2">
                  <Textarea aria-label="New internal note" rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an internal note …" />
                  <div><Button size="sm" disabled={!note.trim() || act.isPending} onClick={() => run({ action: 'note', text: note })}>Add note</Button></div>
                </div>
              )}
            </Card>
          )}
        </div>
        <div className="grid min-w-0 content-start gap-4">
          <Card title="Details">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted">Status</dt><dd><StatusChip s={d.status} />{d.locked && <span className="ml-1"><Badge tone="danger">locked</Badge></span>}{deleted && <span className="ml-1"><Badge tone="neutral">deleted</Badge></span>}</dd>
              <dt className="text-muted">Priority</dt><dd><StatusChip s={d.priority} /></dd>
              <dt className="text-muted">Category</dt><dd>{label(d.category)}</dd>
              <dt className="text-muted">Creator</dt><dd>{d.creatorName} <span className="font-mono text-xs text-muted">{d.creatorId}</span></dd>
              <dt className="text-muted">Staff</dt><dd>{d.claimers.length ? d.claimers.map((c, i) => <span key={c} className="mr-2 inline-block">{d.names[c] ?? <span className="font-mono text-xs">{c}</span>}{i === 0 && d.category.claimMode === 'PRIMARY' && d.claimers.length > 1 ? ' (primary)' : ''}</span>) : <span className="text-muted">unclaimed</span>}</dd>
              <dt className="text-muted">Channel</dt><dd>{d.channelId ? <a className="text-primary underline" href={`https://discord.com/channels/${d.guildId}/${d.channelId}`} target="_blank" rel="noreferrer">Open in Discord</a> : '—'}</dd>
              <dt className="text-muted">Opened</dt><dd>{fmt(d.createdAt)}</dd>
              <dt className="text-muted">First reply</dt><dd>{fmt(d.firstResponseAt)}</dd>
              <dt className="text-muted">Last activity</dt><dd>{fmt(d.lastActivityAt)}</dd>
              {d.closedAt && <><dt className="text-muted">Closed</dt><dd>{fmt(d.closedAt)}{d.closedByName ? ` · ${d.closedByName}` : ''}</dd><dt className="text-muted">Reason</dt><dd className="whitespace-pre-wrap">{d.closeReason ?? '—'}</dd></>}
              {d.deleteAt && !deleted && <><dt className="text-muted">Deletion</dt><dd>{fmt(d.deleteAt)}</dd></>}
            </dl>
          </Card>
          <Card title="Access">
            {d.access.length ? <ul className="grid gap-1 text-sm">{d.access.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>{a.kind === 'ROLE' ? '🛡️ Role' : '👤'} {a.kind === 'USER' && d.names[a.targetId] ? d.names[a.targetId] : <span className="font-mono text-xs">{a.targetId}</span>}{a.expiresAt && <span className="text-xs text-muted"> · until {fmt(a.expiresAt)}</span>}</span>
                {!closed && !deleted && can('ticket.remove_user') && <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => run({ action: 'remove_access', targetId: a.targetId })}>Remove</Button>}
              </li>
            ))}</ul> : <p className="text-sm text-muted">Only creator and category staff.</p>}
          </Card>
          {d.rating && <Card title="Rating"><p className="text-lg">{'★'.repeat(d.rating.stars)}{'☆'.repeat(5 - d.rating.stars)}</p>{d.rating.comment && <p className="whitespace-pre-wrap text-sm">{d.rating.comment}</p>}<p className="text-xs text-muted">{fmt(d.rating.createdAt)}</p></Card>}
          {d.transcripts && (
            <Card title="Transcripts">
              {d.transcripts.length ? <ul className="grid gap-1 text-sm">{d.transcripts.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2"><span>{fmt(x.createdAt)}</span>
                  <span className="flex gap-2"><a className="text-primary underline" href={`/api/v1/support-tickets/transcripts/${x.id}`} target="_blank" rel="noreferrer">Open</a><a className="text-primary underline" href={`/api/v1/support-tickets/transcripts/${x.id}?download=1`}>Download</a></span></li>
              ))}</ul> : <p className="text-sm text-muted">None yet.</p>}
            </Card>
          )}
          <Card title="Log">
            <ol className="grid gap-1.5 text-sm">{d.logs.map((g) => (
              <li key={g.id}><span>{LOG[g.action] ?? g.action}</span>{g.detail.to !== undefined && <span className="text-muted">: {String(g.detail.from ?? '—')} → {String(g.detail.to)}</span>}{typeof g.detail.reason === 'string' && <span className="text-muted">: {g.detail.reason}</span>}{g.detail.to === undefined && typeof g.detail.target === 'string' && <span className="font-mono text-xs text-muted"> {g.detail.target}</span>}
                <span className="block text-xs text-muted">{g.actorName ?? 'System'} · {fmt(g.createdAt)}</span></li>
            ))}</ol>
          </Card>
        </div>
      </div>
      {dialog === 'close' && <CloseDialog o={o} busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(reason) => run({ action: 'close', ...(reason ? { reason } : {}) })} />}
      {dialog === 'rename' && <InputDialog title="Rename channel" field="New name (placeholders allowed, e.g. support-{username})" initial={d.name} busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(name) => run({ action: 'rename', name })} />}
      {dialog === 'move' && <InputDialog title="Move to Discord category" field="Discord category ID (empty = no category)" initial="" numeric busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(v) => run({ action: 'move', parentId: v || null })} allowEmpty />}
      {dialog === 'access' && <AccessDialog busy={act.isPending} error={act.error} onClose={() => setDialog(null)} onConfirm={(b) => run(b)} />}
      <ConfirmDialog open={dialog === 'delete'} danger title="Delete ticket?" message="The Discord channel is deleted. A transcript is saved first if the category is set up for it." confirmLabel="Delete" busy={act.isPending} onConfirm={() => run({ action: 'delete' })} onClose={() => setDialog(null)} />
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
    <Modal open title="Close ticket" onClose={onClose}>
      <div className="grid gap-3">
        {mode !== 'NONE' && source !== 'CUSTOM' && !!o?.reasons.length && (
          <Field label="Reason">{(id) => <Select id={id} value={preset} onChange={(e) => setPreset(e.target.value)}><option value="">Choose …</option>{o.reasons.map((r) => <option key={r.id} value={r.text}>{r.text}</option>)}</Select>}</Field>
        )}
        {mode !== 'NONE' && (source !== 'PRESET' || !o?.reasons.length) && (
          <Field label={source === 'BOTH' && o?.reasons.length ? 'Or your own reason' : 'Reason'}>{(id) => <Textarea id={id} rows={3} maxLength={500} value={custom} onChange={(e) => setCustom(e.target.value)} />}</Field>
        )}
        {mode === 'REQUIRED' && <p className="text-xs text-muted">A reason is required for this category.</p>}
        <Err error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={busy || (mode === 'REQUIRED' && !reason)} onClick={() => onConfirm(mode === 'NONE' ? undefined : reason || undefined)}>Close ticket</Button></div>
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
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || (!allowEmpty && !v.trim())} onClick={() => onConfirm(v.trim())}>Save</Button></div>
      </div>
    </Modal>
  );
}

function AccessDialog({ busy, error, onClose, onConfirm }: { busy: boolean; error: unknown; onClose: () => void; onConfirm: (b: Record<string, unknown>) => void }) {
  const [v, setV] = useState({ targetId: '', kind: 'USER', minutes: '0' });
  return (
    <Modal open title="Add user or role to the ticket" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Type">{(id) => <Select id={id} value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="USER">User</option><option value="ROLE">Role</option></Select>}</Field>
        <Field label="Discord ID">{(id) => <Input id={id} inputMode="numeric" value={v.targetId} onChange={(e) => setV({ ...v, targetId: e.target.value.trim() })} placeholder="123456789012345678" />}</Field>
        <Field label="Duration">{(id) => <Select id={id} value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })}><option value="0">Permanent</option><option value="60">1 hour</option><option value="1440">24 hours</option><option value="10080">7 days</option></Select>}</Field>
        <Err error={error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={busy || !/^\d{15,25}$/.test(v.targetId)} onClick={() => onConfirm({ action: 'add_access', targetId: v.targetId, kind: v.kind, ...(Number(v.minutes) ? { minutes: Number(v.minutes) } : {}) })}>Add</Button></div>
      </div>
    </Modal>
  );
}
