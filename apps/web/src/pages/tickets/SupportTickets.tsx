import { lazy, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DataTable, useDebounced } from '../../components/DataTable';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';
import { duration, errText, hex, label, useTicketConfig, type RatingSummary, type TicketRow, type TicketStats } from '../../lib/tickets';
const TicketSetup = lazy(() => import('./TicketSetup').then((m) => ({ default: m.TicketSetup })));

const TAB = { list: 'Tickets', transcripts: 'Transcripts', ratings: 'Ratings', stats: 'Statistics', panels: 'Panels', categories: 'Categories', states: 'Statuses & priorities', settings: 'General' } as const;
type TabKey = keyof typeof TAB;
const SETUP: TabKey[] = ['panels', 'categories', 'states', 'settings'];

/** Support-Tickets: Übersicht, Transcripts, Bewertungen, Statistik und die komplette Einrichtung des Ticket-Systems. */
export function SupportTickets() {
  const { can } = useAuth();
  const [search, setSearch] = useSearchParams();
  const keys = (Object.keys(TAB) as TabKey[]).filter((k) => (k === 'transcripts' ? can('ticket.transcript') : SETUP.includes(k) ? can('ticket.settings') : true));
  const tab = (keys.find((k) => k === search.get('tab')) ?? 'list') as TabKey;
  const go = (k: TabKey) => setSearch(k === 'list' ? {} : { tab: k });
  return (
    <>
      <PageHeader title="Support Tickets" subtitle="Discord ticket system – everything (panels, categories, questions, buttons, texts, roles) is configured here." />
      <Tabs tabs={keys.map((k) => TAB[k])} active={TAB[tab]} onChange={(t) => go(keys.find((k) => TAB[k] === t)!)} />
      <div className="mt-4">
        {tab === 'list' && <TicketList />}
        {tab === 'transcripts' && <Transcripts />}
        {tab === 'ratings' && <Ratings />}
        {tab === 'stats' && <Statistics />}
        {SETUP.includes(tab) && <TicketSetup section={tab as 'panels' | 'categories' | 'states' | 'settings'} />}
      </div>
    </>
  );
}

const KINDS = [['open', 'Open'], ['closed', 'Closed'], ['escalated', 'Escalated'], ['archived', 'Archived'], ['deleted', 'Deleted'], ['all', 'All']] as const;

export const StatusChip = ({ s }: { s: { name: string; emoji?: string | null; color: number } | null }) => (s
  ? <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium" style={{ borderColor: hex(s.color), color: hex(s.color) }}>{s.emoji && <span aria-hidden>{s.emoji}</span>}{s.name}</span>
  : <span className="text-muted">—</span>);

function TicketList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const cfg = useTicketConfig();
  const [f, setF] = useState({ kind: 'open', statusId: '', priorityId: '', categoryId: '', claimer: '', creator: '', from: '', to: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q), dCreator = useDebounced(f.creator);
  const query = { ...f, creator: dCreator, q: dq, page, pageSize: 25, from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined };
  const list = useQuery({ queryKey: ['support-tickets', query], queryFn: () => api<Page<TicketRow>>('/support-tickets', { query }) });
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const c = cfg.data;
  return (
    <>
      <DataTable<TicketRow>
        columns={[
          { key: 'number', label: '#', render: (t) => <span className="font-mono">#{t.number}</span> },
          { key: 'name', label: 'Channel', render: (t) => <span>{t.name}{t.locked && <span className="ml-1" title="Locked">⛔</span>}{t.escalatedAt && !t.closedAt && <span className="ml-1" title="Escalated">🟠</span>}</span> },
          { key: 'category', label: 'Category', render: (t) => label(t.category) },
          { key: 'status', label: 'Status', render: (t) => <StatusChip s={t.status} /> },
          { key: 'priority', label: 'Priority', render: (t) => <StatusChip s={t.priority} /> },
          { key: 'creator', label: 'Creator', render: (t) => t.creatorName },
          { key: 'claimers', label: 'Staff', render: (t) => (t.claimers.length ? `${t.claimers.length} claimed` : <span className="text-muted">unclaimed</span>) },
          { key: 'createdAt', label: 'Created', render: (t) => fmt(t.createdAt) },
        ]}
        rows={list.data?.items ?? []} total={list.data?.total ?? 0} page={page} pageSize={25} onPage={setPage}
        loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} onRowClick={(t) => void nav(`/support-tickets/${t.id}`)}
        empty={{ text: 'No tickets.', hint: 'Tickets are opened via a ticket panel in Discord.' }}
        search={q} onSearch={(v) => { setQ(v); setPage(1); }}
        toolbar={(
          <div className="flex flex-wrap gap-2">
            <div className="w-36"><Select aria-label="Type" value={f.kind} onChange={(e) => set({ kind: e.target.value })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
            <div className="w-40"><Select aria-label="Category" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">All categories</option>{c?.categories.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Status" value={f.statusId} onChange={(e) => set({ statusId: e.target.value })}><option value="">All statuses</option>{c?.statuses.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Priority" value={f.priorityId} onChange={(e) => set({ priorityId: e.target.value })}><option value="">All priorities</option>{c?.priorities.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Staff" value={f.claimer} onChange={(e) => set({ claimer: e.target.value })}><option value="">Any staff</option><option value="me">Claimed by me</option></Select></div>
            <div className="w-36"><Input aria-label="Creator" placeholder="Creator" value={f.creator} onChange={(e) => set({ creator: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="From" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="To" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            {can('ticket.create') && <Button variant="secondary" onClick={() => setOpen(true)}>Open ticket</Button>}
          </div>
        )}
      />
      {open && <OpenTicket onClose={() => setOpen(false)} />}
    </>
  );
}

/** Ticket im Namen eines Discord-Mitglieds öffnen (z. B. nach einer Meldung per DM). */
function OpenTicket({ onClose }: { onClose: () => void }) {
  const cfg = useTicketConfig();
  const nav = useNavigate();
  const [v, setV] = useState({ categoryId: '', discordId: '', discordName: '' });
  const m = useMutation({ mutationFn: () => api<{ ticket: { id: string } }>('/support-tickets', { method: 'POST', body: { ...v, discordName: v.discordName || undefined } }), onSuccess: (r) => { onClose(); void nav(`/support-tickets/${r.ticket.id}`); } });
  return (
    <Modal open title="Open a ticket for a member" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Category">{(id) => <Select id={id} value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}><option value="">Choose …</option>{cfg.data?.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</Select>}</Field>
        <Field label="Member's Discord ID">{(id) => <Input id={id} inputMode="numeric" value={v.discordId} onChange={(e) => setV({ ...v, discordId: e.target.value.trim() })} placeholder="123456789012345678" />}</Field>
        <Field label="Name (optional)">{(id) => <Input id={id} value={v.discordName} maxLength={100} onChange={(e) => setV({ ...v, discordName: e.target.value })} />}</Field>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!v.categoryId || !v.discordId || m.isPending} onClick={() => m.mutate()}>Open ticket</Button></div>
      </div>
    </Modal>
  );
}

interface TranscriptRow { id: string; ticketId: string; ticketNumber: string; categoryName: string; creatorId: string; creatorName: string; claimers: string[]; statusName: string; sizeBytes: number; createdAt: string; createdByName: string | null }

function Transcripts() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const cfg = useTicketConfig();
  const [f, setF] = useState({ categoryName: '', creator: '', staff: '', status: '', from: '', to: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [del, setDel] = useState<TranscriptRow>();
  const dq = useDebounced(q), dc = useDebounced(f.creator), ds = useDebounced(f.staff);
  const query = { ...f, creator: dc, staff: /^\d{15,25}$/.test(ds) ? ds : undefined, q: dq, page, pageSize: 25, from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined };
  const list = useQuery({ queryKey: ['ticket-transcripts', query], queryFn: () => api<Page<TranscriptRow>>('/support-tickets/transcripts', { query }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/support-tickets/transcripts/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); void qc.invalidateQueries({ queryKey: ['ticket-transcripts'] }); } });
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const href = (id: string, download = false) => `/api/v1/support-tickets/transcripts/${id}${download ? '?download=1' : ''}`;
  return (
    <>
      <DataTable<TranscriptRow>
        columns={[
          { key: 'ticketNumber', label: 'Ticket', render: (t) => <span className="font-mono">#{t.ticketNumber}</span> },
          { key: 'categoryName', label: 'Category' }, { key: 'creatorName', label: 'Creator' }, { key: 'statusName', label: 'Status' },
          { key: 'createdAt', label: 'Created', render: (t) => `${fmt(t.createdAt)}${t.createdByName ? ` · ${t.createdByName}` : ''}` },
          { key: 'size', label: 'Size', render: (t) => `${Math.max(1, Math.round(t.sizeBytes / 1024))} KB` },
          { key: 'actions', label: 'Actions', render: (t) => (
            <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              <a className="rounded border border-line px-2 py-0.5 text-xs hover:bg-panel-2" href={href(t.id)} target="_blank" rel="noreferrer">Open</a>
              <a className="rounded border border-line px-2 py-0.5 text-xs hover:bg-panel-2" href={href(t.id, true)}>Download</a>
              {can('ticket.transcript_delete') && <Button size="sm" variant="ghost" onClick={() => setDel(t)}>Delete</Button>}
            </span>
          ) },
        ]}
        rows={list.data?.items ?? []} total={list.data?.total ?? 0} page={page} pageSize={25} onPage={setPage}
        loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()}
        empty={{ text: 'No transcripts.', hint: 'Transcripts are created when a ticket is closed (if enabled for the category) or via the Transcript button.' }}
        search={q} onSearch={(v) => { setQ(v); setPage(1); }}
        toolbar={(
          <div className="flex flex-wrap gap-2">
            <div className="w-40"><Select aria-label="Category" value={f.categoryName} onChange={(e) => set({ categoryName: e.target.value })}><option value="">All categories</option>{cfg.data?.categories.map((c) => <option key={c.id} value={c.name}>{label(c)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All statuses</option>{cfg.data?.statuses.map((s) => <option key={s.id} value={s.name}>{label(s)}</option>)}</Select></div>
            <div className="w-36"><Input aria-label="Creator" placeholder="Creator" value={f.creator} onChange={(e) => set({ creator: e.target.value })} /></div>
            <div className="w-44"><Input aria-label="Staff Discord ID" placeholder="Staff Discord ID" inputMode="numeric" value={f.staff} onChange={(e) => set({ staff: e.target.value.trim() })} /></div>
            <div className="w-36"><Input aria-label="From" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="To" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
          </div>
        )}
      />
      <ConfirmDialog open={!!del} danger title="Delete transcript?" message={`The transcript of ticket #${del?.ticketNumber ?? ''} is deleted permanently.`} confirmLabel="Delete" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </>
  );
}

const Who = ({ id, names }: { id: string; names: Record<string, string> }) => (names[id] ? <span>{names[id]}</span> : <span className="font-mono text-xs">{id}</span>);
const stars = (n: number | null) => (n === null ? '—' : `${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))} ${n}`);
function RatingCards({ s, names = {} }: { s: RatingSummary; names?: Record<string, string> }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card title="Overall">
        <p className="text-2xl font-semibold">{stars(s.average)}</p>
        <p className="text-sm text-muted">{s.count} ratings · {s.positive} positive (4–5★) · {s.negative} negative (1–2★)</p>
      </Card>
      <Card title="Per staff member">{s.perStaff.length ? <ul className="grid gap-1 text-sm">{s.perStaff.slice(0, 10).map((x) => <li key={x.discordId} className="flex justify-between gap-2"><Who id={x.discordId} names={names} /><span>{stars(x.average)} ({x.count})</span></li>)}</ul> : <p className="text-sm text-muted">—</p>}</Card>
      <Card title="Per category">{s.perCategory.length ? <ul className="grid gap-1 text-sm">{s.perCategory.map((x) => <li key={x.id} className="flex justify-between gap-2"><span>{x.name}</span><span>{stars(x.average)} ({x.count})</span></li>)}</ul> : <p className="text-sm text-muted">—</p>}</Card>
    </div>
  );
}

interface RatingRow { id: string; ticketId: string; stars: number; comment: string | null; createdAt: string; staffIds: string[]; ticket: { number: string; creatorName: string } | null; category: string }
function Ratings() {
  const nav = useNavigate();
  const cfg = useTicketConfig();
  const [f, setF] = useState({ stars: '', categoryId: '' });
  const [page, setPage] = useState(1);
  const query = { ...f, page, pageSize: 25 };
  const r = useQuery({ queryKey: ['ticket-ratings', query], queryFn: () => api<{ total: number; summary: RatingSummary; names: Record<string, string>; items: RatingRow[] }>('/support-tickets/ratings', { query }) });
  return (
    <div className="grid gap-4">
      {r.data && <RatingCards s={r.data.summary} names={r.data.names} />}
      <DataTable<RatingRow>
        columns={[
          { key: 'ticket', label: 'Ticket', render: (x) => (x.ticket ? <span className="font-mono">#{x.ticket.number}</span> : '—') },
          { key: 'stars', label: 'Rating', render: (x) => <span aria-label={`${x.stars} stars`}>{'★'.repeat(x.stars)}{'☆'.repeat(5 - x.stars)}</span> },
          { key: 'comment', label: 'Comment', render: (x) => x.comment ?? <span className="text-muted">—</span> },
          { key: 'category', label: 'Category' }, { key: 'creator', label: 'Creator', render: (x) => x.ticket?.creatorName ?? '—' },
          { key: 'createdAt', label: 'Date', render: (x) => fmt(x.createdAt) },
        ]}
        rows={r.data?.items ?? []} total={r.data?.total ?? 0} page={page} pageSize={25} onPage={setPage} loading={r.isLoading} error={r.error} onRetry={() => void r.refetch()}
        onRowClick={(x) => void nav(`/support-tickets/${x.ticketId}`)} empty={{ text: 'No ratings yet.' }}
        toolbar={(
          <div className="flex flex-wrap gap-2">
            <div className="w-32"><Select aria-label="Stars" value={f.stars} onChange={(e) => { setF({ ...f, stars: e.target.value }); setPage(1); }}><option value="">All stars</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</Select></div>
            <div className="w-40"><Select aria-label="Category" value={f.categoryId} onChange={(e) => { setF({ ...f, categoryId: e.target.value }); setPage(1); }}><option value="">All categories</option>{cfg.data?.categories.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</Select></div>
          </div>
        )}
      />
    </div>
  );
}

function Statistics() {
  const s = useQuery({ queryKey: ['ticket-stats'], queryFn: () => api<TicketStats>('/support-tickets/stats') });
  if (s.isLoading) return <SkeletonRows />;
  if (s.error) return <ErrorState error={s.error} onRetry={() => void s.refetch()} />;
  const d = s.data!;
  if (!d.total) return <EmptyState text="No tickets yet." hint="Statistics appear once the first ticket was opened." />;
  const kpi: [string, string | number][] = [['Total', d.total], ['Open', d.open], ['Closed', d.closed], ['Archived', d.archived], ['Today', d.today], ['This week', d.week], ['This month', d.month], ['Escalations', d.escalations], ['Ø first response', duration(d.avgFirstResponseMinutes)], ['Ø time to close', duration(d.avgCloseMinutes)]];
  const max = Math.max(1, ...d.perCategory.map((c) => c.total));
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{kpi.map(([k, v]) => <Card key={k}><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold">{v}</p></Card>)}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Tickets per category">
          <ul className="grid gap-2 text-sm">{d.perCategory.map((c) => (
            <li key={c.id}><div className="flex justify-between"><span>{c.name}</span><span>{c.total} <span className="text-muted">({c.open} open)</span></span></div>
              <div className="mt-1 h-2 rounded bg-panel-2"><div className="h-2 rounded bg-primary" style={{ width: `${(c.total / max) * 100}%` }} /></div></li>
          ))}</ul>
        </Card>
        <Card title="Most active staff (claimed tickets)">
          {d.perStaff.length ? <ul className="grid gap-1 text-sm">{d.perStaff.slice(0, 15).map((x) => <li key={x.discordId} className="flex justify-between gap-2"><Who id={x.discordId} names={d.names} /><span>{x.tickets} <Badge tone="success">{x.closed} closed</Badge></span></li>)}</ul> : <p className="text-sm text-muted">No claimed tickets yet.</p>}
        </Card>
      </div>
      <RatingCards s={d.ratings} names={d.names} />
    </div>
  );
}
