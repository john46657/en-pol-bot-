import { lazy, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { DataTable, useDebounced, useTablePageSize } from '../../components/DataTable';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs } from '../../components/ui';
import { GuildTag, useGuilds, useServer } from '../../lib/guilds';
import { duration, errText, hex, label, TRANSCRIPT_STATUS, useTicketConfig, type Board, type RatingSummary, type TicketOverview, type TicketRow, type TicketStats, type TranscriptVersion } from '../../lib/tickets';
import { LOAD_DOT, LOAD_LABEL, loadLevel, type LoadLevel } from '@enrp/shared';
const TicketSetup = lazy(() => import('./TicketSetup').then((m) => ({ default: m.TicketSetup })));

const TAB = { overview: 'Übersicht', list: 'Tickets', transcripts: 'Transkripte', ratings: 'Bewertungen', stats: 'Statistik', audit: 'Audit', panels: 'Panels', categories: 'Kategorien', forms: 'Formulare', automations: 'Automatisierungen', departments: 'Abteilungen', lifecycle: 'Status & SLA', settings: 'Allgemein' } as const;
type TabKey = keyof typeof TAB;
const SETUP: TabKey[] = ['panels', 'categories', 'forms', 'automations', 'lifecycle', 'settings'];

/** Support-Tickets: Übersicht, Transkripte, Statistik und die komplette Einrichtung des Ticket-Systems. */
export function SupportTickets() {
  const { can } = useAuth();
  const [search, setSearch] = useSearchParams();
  const keys = (Object.keys(TAB) as TabKey[]).filter((k) => (k === 'transcripts' ? can('ticket.transcript') : k === 'audit' ? can('ticket.audit') : k === 'departments' ? can('ticket.departments') : SETUP.includes(k) ? can('ticket.settings') : true));
  const tab = (keys.find((k) => k === search.get('tab')) ?? 'list') as TabKey;
  const go = (k: TabKey) => setSearch(k === 'list' ? {} : { tab: k });
  return (
    <>
      <PageHeader title="Ticket-Center" subtitle="Discord-Ticketsystem – Tickets bearbeiten, Transkripte, Statistik und die komplette Einrichtung (Panels, Kategorien, Formulare, Abteilungen, SLA)." />
      <Tabs tabs={keys.map((k) => TAB[k])} active={TAB[tab]} onChange={(t) => go(keys.find((k) => TAB[k] === t)!)} />
      <div className="mt-4">
        {tab === 'overview' && <Overview />}
        {tab === 'ratings' && <Ratings />}
        {tab === 'list' && <TicketList />}
        {tab === 'transcripts' && <Transcripts />}
        {tab === 'stats' && <Statistics />}
        {tab === 'audit' && <AuditLog />}
        {(SETUP.includes(tab) || tab === 'departments') && <TicketSetup section={tab as 'panels' | 'categories' | 'settings' | 'departments' | 'lifecycle' | 'forms' | 'automations'} />}
      </div>
    </>
  );
}

const KINDS = [['open', 'Offen'], ['closed', 'Geschlossen'], ['escalated', 'Eskaliert'], ['archived', 'Archiviert'], ['deleted', 'Gelöscht'], ['all', 'Alle']] as const;

export const StatusChip = ({ s }: { s: { name: string; emoji?: string | null; color: number } | null }) => (s
  ? <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium" style={{ borderColor: hex(s.color), color: hex(s.color) }}>{s.emoji && <span aria-hidden>{s.emoji}</span>}{s.name}</span>
  : <span className="text-muted">—</span>);

function TicketList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const cfg = useTicketConfig();
  const guilds = useGuilds();
  const [server] = useServer();
  const multi = (guilds.data?.length ?? 0) > 1;
  const [f, setF] = useState({ kind: 'open', queue: '', statusId: '', priorityId: '', categoryId: '', departmentId: '', claimer: '', creator: '', from: '', to: '', closedFrom: '', closedTo: '', guildId: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTablePageSize();
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q), dCreator = useDebounced(f.creator);
  const day = (v: string, end = false) => (v ? new Date(end ? `${v}T23:59:59` : v).toISOString() : undefined);
  const query = { ...f, guildId: server || f.guildId, creator: dCreator, q: dq, page, pageSize, from: day(f.from), to: day(f.to, true), closedFrom: day(f.closedFrom), closedTo: day(f.closedTo, true) };
  const list = useQuery({ queryKey: ['support-tickets', query], queryFn: () => api<Page<TicketRow>>('/support-tickets', { query }) });
  const ov = useQuery({ queryKey: ['support-tickets-overview', server], queryFn: () => api<TicketOverview>('/support-tickets/overview', { query: { guildId: server || undefined } }), refetchInterval: 30_000 });
  const QUEUES: [string, string, keyof TicketOverview, Partial<typeof f>][] = [
    ['Offen', '🟢', 'open', { kind: 'open', queue: '' }], ['Nicht zugewiesen', '🫥', 'unassigned', { kind: 'all', queue: 'unassigned' }], ['In Bearbeitung', '🔵', 'inProgress', { kind: 'all', queue: 'in_progress' }],
    ['Wartend', '🟡', 'waiting', { kind: 'all', queue: 'waiting' }], ['Überfällig', '⏰', 'overdue', { kind: 'all', queue: 'overdue' }], ['Geschlossen', '⚫', 'closed', { kind: 'closed', queue: '' }], ['Archiviert', '📦', 'archived', { kind: 'archived', queue: '' }],
  ];
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const c = cfg.data;
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" role="group" aria-label="Warteschlangen">
        {QUEUES.map(([l, icon, k, filter]) => {
          const active = (filter.queue ?? '') === f.queue && (filter.queue ? true : filter.kind === f.kind);
          return (
            <button key={k} type="button" aria-pressed={active} onClick={() => set(filter)} className={`rounded-md border p-2 text-left transition ${active ? 'border-primary bg-primary/10' : 'border-line bg-panel hover:bg-panel-2'} ${k === 'overdue' && (ov.data?.overdue ?? 0) > 0 ? 'border-danger/50' : ''}`}>
              <span className="block text-xs text-muted">{icon} {l}</span><span className={`text-xl font-semibold ${k === 'overdue' && (ov.data?.overdue ?? 0) > 0 ? 'text-danger' : ''}`}>{ov.data ? ov.data[k] : '…'}</span>
            </button>
          );
        })}
      </div>
      <DataTable<TicketRow>
        columns={[
          { key: 'ref', label: 'Ticket-ID', render: (t) => <span className="font-mono">{t.ref}{t.category?.confidential && <span className="ml-1" title="Vertraulich">🔒</span>}</span> },
          { key: 'name', label: 'Betreff / Kanal', render: (t) => <span>{t.subject ?? t.name}{t.locked && <span className="ml-1" title="Gesperrt">⛔</span>}{t.escalatedAt && !t.closedAt && <span className="ml-1" title="Eskaliert">🟠</span>}{t.sla?.overdue && <span className="ml-1"><Badge tone="danger">überfällig</Badge></span>}{t.sla?.paused && !t.closedAt && <span className="ml-1"><Badge tone="warning">wartet auf Nutzer</Badge></span>}</span> },
          { key: 'department', label: 'Abteilung', render: (t) => (t.department ? label(t.department) : <span className="text-muted">—</span>) },
          ...(multi ? [{ key: 'guild', label: 'Server', render: (t: TicketRow) => <GuildTag id={t.guildId} /> }] : []),
          { key: 'category', label: 'Kategorie', render: (t) => label(t.category) },
          { key: 'status', label: 'Status', render: (t) => <StatusChip s={t.status} /> },
          { key: 'priority', label: 'Priorität', render: (t) => <StatusChip s={t.priority} /> },
          { key: 'creator', label: 'Ersteller', render: (t) => t.creatorName },
          { key: 'claimers', label: 'Team', render: (t) => (t.claimers.length ? `${t.claimers.length} übernommen` : <span className="text-muted">nicht übernommen</span>) },
          { key: 'createdAt', label: 'Erstellt', render: (t) => fmt(t.createdAt) },
        ]}
        rows={list.data?.items ?? []} total={list.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} onRowClick={(t) => void nav(`/support-tickets/${t.id}`)}
        empty={{ text: 'Keine Tickets.', hint: 'Tickets werden über ein Ticket-Panel in Discord geöffnet. Suche auch nach Ticket-ID (z. B. EMD-000123).' }}
        search={q} onSearch={(v) => { setQ(v); setPage(1); }}
        toolbar={(
          <div className="flex flex-wrap gap-2">
            {multi && !server && <div className="w-40"><Select aria-label="Server" value={f.guildId} onChange={(e) => set({ guildId: e.target.value })}><option value="">Alle Server</option>{guilds.data!.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>}
            <div className="w-36"><Select aria-label="Typ" value={f.kind} onChange={(e) => set({ kind: e.target.value, queue: '' })}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
            <div className="w-40"><Select aria-label="Abteilung" value={f.departmentId} onChange={(e) => set({ departmentId: e.target.value })}><option value="">Alle Abteilungen</option>{c?.departments.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-40"><Select aria-label="Kategorie" value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}><option value="">Alle Kategorien</option>{c?.categories.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Status" value={f.statusId} onChange={(e) => set({ statusId: e.target.value })}><option value="">Alle Status</option>{c?.statuses.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Priorität" value={f.priorityId} onChange={(e) => set({ priorityId: e.target.value })}><option value="">Alle Prioritäten</option>{c?.priorities.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Team" value={f.claimer === 'me' || !f.claimer ? f.claimer : 'id'} onChange={(e) => set({ claimer: e.target.value === 'id' ? '' : e.target.value })}><option value="">Alle Bearbeiter</option><option value="me">Von mir übernommen</option></Select></div>
            <div className="w-44"><Input aria-label="Bearbeiter (Discord-ID)" placeholder="Bearbeiter (Discord-ID)" inputMode="numeric" value={f.claimer === 'me' ? '' : f.claimer} onChange={(e) => { const v = e.target.value.trim(); set({ claimer: /^\d{15,25}$/.test(v) || !v ? v : f.claimer }); }} /></div>
            <div className="w-36"><Input aria-label="Ersteller" placeholder="Ersteller" value={f.creator} onChange={(e) => set({ creator: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="Von" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="Bis" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="Geschlossen ab" title="Geschlossen ab" type="date" value={f.closedFrom} onChange={(e) => set({ closedFrom: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="Geschlossen bis" title="Geschlossen bis" type="date" value={f.closedTo} onChange={(e) => set({ closedTo: e.target.value })} /></div>
            {can('ticket.create') && <Button variant="secondary" onClick={() => setOpen(true)}>Ticket öffnen</Button>}
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
    <Modal open title="Ticket für ein Mitglied öffnen" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Kategorie">{(id) => <Select id={id} value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })}><option value="">Auswählen …</option>{cfg.data?.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}</Select>}</Field>
        <Field label="Discord-ID des Mitglieds">{(id) => <Input id={id} inputMode="numeric" value={v.discordId} onChange={(e) => setV({ ...v, discordId: e.target.value.trim() })} placeholder="123456789012345678" />}</Field>
        <Field label="Name (optional)">{(id) => <Input id={id} value={v.discordName} maxLength={100} onChange={(e) => setV({ ...v, discordName: e.target.value })} />}</Field>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={!v.categoryId || !v.discordId || m.isPending} onClick={() => m.mutate()}>Ticket öffnen</Button></div>
      </div>
    </Modal>
  );
}

interface TranscriptRow { id: string; ticketId: string; ticketNumber: string; ref: string; categoryName: string; creatorId: string; creatorName: string; claimers: string[]; statusName: string; sizeBytes: number; createdAt: string; createdByName: string | null; version: number; status: TranscriptVersion['status']; lastError: string | null }

function Transcripts() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const cfg = useTicketConfig();
  const [f, setF] = useState({ categoryName: '', creator: '', staff: '', status: '', from: '', to: '' });
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTablePageSize();
  const [del, setDel] = useState<TranscriptRow>();
  const dq = useDebounced(q), dc = useDebounced(f.creator), ds = useDebounced(f.staff);
  const query = { ...f, creator: dc, staff: /^\d{15,25}$/.test(ds) ? ds : undefined, q: dq, page, pageSize, from: f.from ? new Date(f.from).toISOString() : undefined, to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : undefined };
  const list = useQuery({ queryKey: ['ticket-transcripts', query], queryFn: () => api<Page<TranscriptRow>>('/support-tickets/transcripts', { query }) });
  const remove = useMutation({ mutationFn: (id: string) => api(`/support-tickets/transcripts/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(undefined); void qc.invalidateQueries({ queryKey: ['ticket-transcripts'] }); } });
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setPage(1); };
  const href = (id: string, download = false) => `/api/v1/support-tickets/transcripts/${id}${download ? '?download=1' : ''}`;
  return (
    <>
      <DataTable<TranscriptRow>
        columns={[
          { key: 'ticketNumber', label: 'Ticket', render: (t) => <a className="font-mono text-primary underline" href={`/transcript/${t.ref}`} onClick={(e) => e.stopPropagation()}>{t.ref}</a> },
          { key: 'version', label: 'Version', render: (t) => <span>v{t.version} <Badge tone={TRANSCRIPT_STATUS[t.status].tone}>{TRANSCRIPT_STATUS[t.status].label}</Badge></span> },
          { key: 'categoryName', label: 'Kategorie' }, { key: 'creatorName', label: 'Ersteller' }, { key: 'statusName', label: 'Status' },
          { key: 'createdAt', label: 'Erstellt', render: (t) => `${fmt(t.createdAt)}${t.createdByName ? ` · ${t.createdByName}` : ''}` },
          { key: 'size', label: 'Größe', render: (t) => `${Math.max(1, Math.round(t.sizeBytes / 1024))} KB` },
          { key: 'actions', label: 'Aktionen', render: (t) => (
            <span className="flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
              {t.status === 'DONE' && <a className="rounded border border-line px-2 py-0.5 text-xs hover:bg-panel-2" href={href(t.id)} target="_blank" rel="noreferrer">Öffnen</a>}
              {t.status === 'DONE' && can('ticket.transcript_export') && <a className="rounded border border-line px-2 py-0.5 text-xs hover:bg-panel-2" href={href(t.id, true)}>Herunterladen</a>}
              {can('ticket.transcript_delete') && <Button size="sm" variant="ghost" onClick={() => setDel(t)}>Löschen</Button>}
            </span>
          ) },
        ]}
        rows={list.data?.items ?? []} total={list.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()}
        empty={{ text: 'Keine Transkripte.', hint: 'Transkripte entstehen beim Schließen eines Tickets (falls für die Kategorie aktiviert) oder über den Transkript-Button.' }}
        search={q} onSearch={(v) => { setQ(v); setPage(1); }}
        toolbar={(
          <div className="flex flex-wrap gap-2">
            <div className="w-40"><Select aria-label="Kategorie" value={f.categoryName} onChange={(e) => set({ categoryName: e.target.value })}><option value="">Alle Kategorien</option>{cfg.data?.categories.map((c) => <option key={c.id} value={c.name}>{label(c)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Status" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">Alle Status</option>{cfg.data?.statuses.map((s) => <option key={s.id} value={s.name}>{label(s)}</option>)}</Select></div>
            <div className="w-36"><Input aria-label="Ersteller" placeholder="Ersteller" value={f.creator} onChange={(e) => set({ creator: e.target.value })} /></div>
            <div className="w-44"><Input aria-label="Discord-ID des Teammitglieds" placeholder="Discord-ID Teammitglied" inputMode="numeric" value={f.staff} onChange={(e) => set({ staff: e.target.value.trim() })} /></div>
            <div className="w-36"><Input aria-label="Von" type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></div>
            <div className="w-36"><Input aria-label="Bis" type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></div>
          </div>
        )}
      />
      <ConfirmDialog open={!!del} danger title="Transkript löschen?" message={`Version ${del?.version ?? ''} des Transkripts von Ticket ${del?.ref ?? ''} wird endgültig gelöscht.`} confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(undefined)} />
    </>
  );
}

const Who = ({ id, names }: { id: string; names: Record<string, string> }) => (names[id] ? <span>{names[id]}</span> : <span className="font-mono text-xs">{id}</span>);
const stars = (n: number | null, scale = 5) => (n === null ? '—' : scale <= 5 ? `${'★'.repeat(Math.round(n))}${'☆'.repeat(Math.max(0, scale - Math.round(n)))} ${n}` : `${n}/${scale}`);
function RatingCards({ s, names = {} }: { s: RatingSummary; names?: Record<string, string> }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Card title="Gesamt">
        <p className="text-2xl font-semibold">{stars(s.average, s.scale)}</p>
        <p className="text-sm text-muted">{s.count} Bewertungen · {s.positive} positiv · {s.negative} negativ{s.scale ? ` · Skala 1–${s.scale}` : ''}</p>
      </Card>
      <Card title="Pro Teammitglied">{s.perStaff.length ? <ul className="grid gap-1 text-sm">{s.perStaff.slice(0, 10).map((x) => <li key={x.discordId} className="flex justify-between gap-2"><Who id={x.discordId} names={names} /><span>{stars(x.average, s.scale)} ({x.count})</span></li>)}</ul> : <p className="text-sm text-muted">—</p>}</Card>
      <Card title="Pro Kategorie">{s.perCategory.length ? <ul className="grid gap-1 text-sm">{s.perCategory.map((x) => <li key={x.id} className="flex justify-between gap-2"><span>{x.name}</span><span>{stars(x.average, s.scale)} ({x.count})</span></li>)}</ul> : <p className="text-sm text-muted">—</p>}</Card>
    </div>
  );
}

const LEVEL_TONE: Record<LoadLevel, 'neutral' | 'success' | 'warning' | 'danger'> = { none: 'neutral', normal: 'success', warn: 'warning', full: 'danger' };
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const useStats = () => { const [server] = useServer(); return useQuery({ queryKey: ['ticket-stats', server], queryFn: () => api<TicketStats>('/support-tickets/stats', { query: { guildId: server || undefined } }), refetchInterval: 60_000 }); };
/** Einfache Balken (eine Reihe je Wert) – Werte stehen immer als Zahl daneben. */
function Bars({ rows, label: l }: { rows: { key: string; label: string; a: number; b?: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.a, r.b ?? 0)));
  return (
    <ul className="grid gap-1 text-xs" aria-label={l}>{rows.map((r) => (
      <li key={r.key} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-2">
        <span className="text-muted">{r.label}</span>
        <span className="grid gap-0.5"><span className="h-2 rounded bg-primary" style={{ width: `${(r.a / max) * 100}%` }} />{r.b !== undefined && <span className="h-2 rounded bg-success/70" style={{ width: `${(r.b / max) * 100}%` }} />}</span>
        <span className="text-right tabular-nums">{r.a}{r.b !== undefined ? ` / ${r.b}` : ''}</span>
      </li>
    ))}</ul>
  );
}
function Heatmap({ m }: { m: number[][] }) {
  const max = Math.max(1, ...m.flat());
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px]" aria-label="Neue Tickets nach Wochentag und Uhrzeit"><thead><tr><th />{Array.from({ length: 24 }, (_, h) => <th key={h} className="px-0.5 font-normal text-muted">{h % 3 === 0 ? h : ''}</th>)}</tr></thead>
        <tbody>{m.map((row, d) => <tr key={d}><th className="pr-1 text-left font-normal text-muted">{WEEKDAYS[d]}</th>{row.map((n, h) => <td key={h} title={`${WEEKDAYS[d]} ${h}:00 – ${n} Tickets`}><span className="block h-4 w-4 rounded-sm bg-primary" style={{ opacity: n ? 0.15 + (n / max) * 0.85 : 0.05 }} /></td>)}</tr>)}</tbody></table>
    </div>
  );
}
function Leaderboard({ title, rows, names, unit }: { title: string; rows: Board[]; names: Record<string, string>; unit: (v: number) => string }) {
  return <Card title={title}>{rows.length ? <ol className="grid gap-1 text-sm">{rows.map((x, i) => <li key={x.discordId} className="flex justify-between gap-2"><span>{i + 1}. <Who id={x.discordId} names={names} /></span><span className="tabular-nums">{unit(x.value)}</span></li>)}</ol> : <p className="text-sm text-muted">Noch keine Daten.</p>}</Card>;
}

/** Übersicht: offene/geschlossene/bearbeitete/nicht zugewiesene Tickets, Tickets je Kategorie mit Auslastung, Antwort-/Bearbeitungszeit, Bewertung. */
function Overview() {
  const s = useStats();
  if (s.isLoading) return <SkeletonRows />;
  if (s.error) return <ErrorState error={s.error} onRetry={() => void s.refetch()} />;
  const d = s.data!;
  const kpi: [string, string | number][] = [['Offen', d.open], ['Geschlossen', d.closed], ['In Bearbeitung', d.inProgress ?? '—'], ['Nicht zugewiesen', d.unassigned ?? '—'], ['Ø erste Antwort', duration(d.avgFirstResponseMinutes)], ['Ø Bearbeitungszeit', duration(d.avgCloseMinutes)], ['Ø Bewertung', d.ratings.average === null ? '—' : `${d.ratings.average} / ${d.ratings.scale ?? 5}`], ['Heute neu', d.today]];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{kpi.map(([k, v]) => <Card key={k}><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold">{v}</p></Card>)}</div>
      <Card title="Tickets nach Kategorie">
        {!d.perCategory.length ? <EmptyState text="Noch keine Tickets." /> : <ul className="grid gap-2 text-sm">{d.perCategory.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2"><span>{c.emoji ? `${c.emoji} ` : ''}{c.name}</span>
            <span className="flex items-center gap-2"><span className="tabular-nums">{c.open} offen · {c.total} gesamt</span>{c.capacity ? <Badge tone={LEVEL_TONE[c.level ?? loadLevel(c.open, c.capacity)]}>{LOAD_DOT[c.level ?? 'none']} {c.load}% · {LOAD_LABEL[c.level ?? 'none']}</Badge> : null}</span></li>
        ))}</ul>}
      </Card>
    </div>
  );
}

function Statistics() {
  const s = useStats();
  if (s.isLoading) return <SkeletonRows />;
  if (s.error) return <ErrorState error={s.error} onRetry={() => void s.refetch()} />;
  const d = s.data!;
  if (!d.total) return <EmptyState text="Noch keine Tickets." hint="Die Statistik erscheint, sobald das erste Ticket geöffnet wurde." />;
  const kpi: [string, string | number][] = [
    ['Gesamt', d.total], ['Offen', d.open], ['Geschlossen', d.closed], ['Archiviert', d.archived], ['Heute', d.today], ['Diese Woche', d.week], ['Dieser Monat', d.month], ['Eskalationen', d.escalations],
    ['Ø erste Antwort', duration(d.avgFirstResponseMinutes)], ['Median erste Antwort', duration(d.medianFirstResponseMinutes ?? null)], ['p90 erste Antwort', duration(d.p90FirstResponseMinutes ?? null)],
    ['Ø Bearbeitungszeit', duration(d.avgCloseMinutes)], ['Median Bearbeitungszeit', duration(d.medianCloseMinutes ?? null)], ['p90 Bearbeitungszeit', duration(d.p90CloseMinutes ?? null)],
  ];
  const max = Math.max(1, ...d.perCategory.map((c) => c.total));
  const lb = d.leaderboards;
  return (
    <div className="grid gap-4">
      <p className="text-xs text-muted">Alle Werte werden aus den gespeicherten Tickets berechnet (nur Tickets, die du sehen darfst){d.timezone ? ` · Zeitzone ${d.timezone}` : ''}. Erste Antwort = erste Nachricht/Aktion des Teams.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">{kpi.map(([k, v]) => <Card key={k}><p className="text-xs text-muted">{k}</p><p className="text-xl font-semibold">{v}</p></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {d.perDay && <Card title="Tickets pro Tag (30 Tage) – neu / geschlossen"><Bars label="Tickets pro Tag" rows={d.perDay.slice(-14).map((x) => ({ key: x.day, label: x.day.slice(5).split('-').reverse().join('.'), a: x.created, b: x.closed }))} /><p className="mt-2 text-xs text-muted">Letzte 14 Tage angezeigt · 30 Tage: {d.perDay.reduce((a, x) => a + x.created, 0)} neu, {d.perDay.reduce((a, x) => a + x.closed, 0)} geschlossen</p></Card>}
        {d.perWeek && <Card title="Tickets pro Woche (12 Wochen) – neu / geschlossen"><Bars label="Tickets pro Woche" rows={d.perWeek.map((x) => ({ key: x.week, label: `KW ab ${x.week.slice(5).split('-').reverse().join('.')}`, a: x.created, b: x.closed }))} /></Card>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Auslastung und Tickets pro Kategorie">
          <ul className="grid gap-2 text-sm">{d.perCategory.map((c) => (
            <li key={c.id}><div className="flex justify-between gap-2"><span>{c.name}</span><span>{c.total} <span className="text-muted">({c.open} offen{c.capacity ? ` von ${c.capacity} · ${c.load}%` : ''})</span> {c.capacity ? LOAD_DOT[c.level ?? 'none'] : ''}</span></div>
              <div className="mt-1 h-2 rounded bg-panel-2"><div className="h-2 rounded bg-primary" style={{ width: `${(c.total / max) * 100}%` }} /></div></li>
          ))}</ul>
        </Card>
        <Card title="Tickets pro Mitarbeiter">
          {d.perStaff.length ? <ul className="grid gap-1 text-sm">{d.perStaff.slice(0, 15).map((x) => <li key={x.discordId} className="flex flex-wrap justify-between gap-2"><Who id={x.discordId} names={d.names} /><span>{x.tickets} übernommen <Badge tone="success">{x.closed} erledigt</Badge>{x.medianFirstResponseMinutes != null && <span className="ml-1 text-xs text-muted">Median 1. Antwort {duration(x.medianFirstResponseMinutes)}</span>}</span></li>)}</ul> : <p className="text-sm text-muted">Noch keine übernommenen Tickets.</p>}
        </Card>
      </div>
      {d.heatmap && <Card title="Aktivitäts-Heatmap (neue Tickets nach Wochentag und Uhrzeit)"><Heatmap m={d.heatmap} /></Card>}
      {lb && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Leaderboard title="🏆 Meiste Tickets" rows={lb.handled} names={d.names} unit={(v) => `${v}`} />
        <Leaderboard title="🔒 Meiste geschlossen" rows={lb.closed} names={d.names} unit={(v) => `${v}`} />
        <Leaderboard title="⚡ Schnellste erste Antwort (Median)" rows={lb.fastest} names={d.names} unit={(v) => duration(v)} />
        <Leaderboard title="⭐ Beste Bewertung (ab 3)" rows={lb.rated} names={d.names} unit={(v) => `${v}`} />
      </div>}
      <RatingCards s={d.ratings} names={d.names} />
    </div>
  );
}

interface RatingRow { id: string; ticketId: string; stars: number; scale: number; comment: string | null; answers: { label: string; value: string }[]; createdAt: string; staffIds: string[]; category: string; ticket: { number: string; creatorName: string } | null }
/** Bewertungen: Durchschnitt, je Kategorie/Mitarbeiter, Verlauf und alle Einzelbewertungen. */
function Ratings() {
  const nav = useNavigate();
  const cfg = useTicketConfig();
  const [f, setF] = useState({ categoryId: '', stars: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTablePageSize();
  const query = { categoryId: f.categoryId || undefined, stars: f.stars || undefined, page, pageSize };
  const list = useQuery({ queryKey: ['ticket-ratings', query], queryFn: () => api<{ total: number; items: RatingRow[]; summary: RatingSummary; names: Record<string, string> }>('/support-tickets/ratings', { query }) });
  const sum = list.data?.summary;
  const scale = cfg.data?.settings?.ratingScale ?? sum?.scale ?? 5;
  return (
    <div className="grid gap-4">
      {sum && <RatingCards s={sum} names={list.data!.names} />}
      {sum?.trend?.length ? <Card title="Bewertungsverlauf (je Monat)"><Bars label="Bewertungsverlauf" rows={sum.trend.map((t) => ({ key: t.month, label: t.month.split('-').reverse().join('.'), a: t.count }))} /><p className="mt-2 text-xs text-muted">{sum.trend.map((t) => `${t.month.split('-').reverse().join('.')}: Ø ${t.average ?? '—'}`).join(' · ')}</p></Card> : null}
      <p className="text-xs text-muted">Öffentlicher und interner Bewertungs-Log werden unter <b>Allgemein → Bewertungen</b> eingestellt (Kanäle, freigegebene Angaben, Skala).</p>
      <DataTable<RatingRow>
        columns={[
          { key: 'createdAt', label: 'Zeit', render: (r) => fmt(r.createdAt) },
          { key: 'ticket', label: 'Ticket', render: (r) => (r.ticket ? `#${r.ticket.number}` : '—') },
          { key: 'category', label: 'Kategorie' },
          { key: 'stars', label: 'Bewertung', render: (r) => <span className="tabular-nums">{r.stars}/{r.scale}</span> },
          { key: 'staff', label: 'Bearbeiter', render: (r) => r.staffIds.map((x) => list.data?.names[x] ?? x).join(', ') || '—' },
          { key: 'comment', label: 'Begründung / Formular', render: (r) => <span className="text-xs">{[r.comment, ...r.answers.filter((a) => a.label !== 'comment').map((a) => `${a.label}: ${a.value}`)].filter(Boolean).join(' · ').slice(0, 200) || '—'}</span> },
        ]}
        rows={list.data?.items ?? []} total={list.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
        loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} onRowClick={(r) => void nav(`/support-tickets/${r.ticketId}`)}
        empty={{ text: 'Noch keine Bewertungen.' }}
        toolbar={(
          <div className="flex flex-wrap gap-2">
            <div className="w-44"><Select aria-label="Kategorie" value={f.categoryId} onChange={(e) => { setF({ ...f, categoryId: e.target.value }); setPage(1); }}><option value="">Alle Kategorien</option>{cfg.data?.categories.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></div>
            <div className="w-36"><Select aria-label="Bewertung" value={f.stars} onChange={(e) => { setF({ ...f, stars: e.target.value }); setPage(1); }}><option value="">Alle Bewertungen</option>{Array.from({ length: scale }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}/{scale}</option>)}</Select></div>
          </div>
        )}
      />
    </div>
  );
}

interface AuditRow { id: string; action: string; actorName: string | null; entityType: string | null; entityId: string | null; after: Record<string, unknown> | null; result: string; requestId: string | null; createdAt: string }
/** Unveränderliches Audit-Protokoll des Ticket-Systems (nur Metadaten, keine Inhalte). */
function AuditLog() {
  const [f, setF] = useState({ action: '', result: '' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useTablePageSize();
  const da = useDebounced(f.action);
  const query = { action: da || undefined, result: f.result || undefined, page, pageSize };
  const list = useQuery({ queryKey: ['ticket-audit', query], queryFn: () => api<Page<AuditRow>>('/support-tickets/audit', { query }) });
  const nav = useNavigate();
  return (
    <DataTable<AuditRow>
      columns={[
        { key: 'createdAt', label: 'Zeit', render: (r) => fmt(r.createdAt) },
        { key: 'action', label: 'Aktion', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
        { key: 'ref', label: 'Ticket', render: (r) => (typeof r.after?.ref === 'string' ? <span className="font-mono">{r.after.ref}</span> : <span className="text-muted">—</span>) },
        { key: 'actorName', label: 'Akteur', render: (r) => r.actorName ?? '—' },
        { key: 'result', label: 'Ergebnis', render: (r) => <Badge tone={r.result === 'SUCCESS' ? 'success' : r.result === 'DENIED' ? 'danger' : 'warning'}>{r.result === 'SUCCESS' ? 'ok' : r.result === 'DENIED' ? 'verweigert' : 'fehlgeschlagen'}</Badge> },
        { key: 'details', label: 'Details', render: (r) => <span className="text-xs text-muted">{Object.entries(r.after ?? {}).filter(([k]) => k !== 'ref').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ').slice(0, 160)}</span> },
        { key: 'requestId', label: 'Korrelations-ID', render: (r) => <span className="font-mono text-[10px] text-muted">{r.requestId?.slice(0, 18) ?? '—'}</span> },
      ]}
      rows={list.data?.items ?? []} total={list.data?.total ?? 0} page={page} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }}
      loading={list.isLoading} error={list.error} onRetry={() => void list.refetch()} onRowClick={(r) => r.entityType === 'SupportTicket' && r.entityId && void nav(`/support-tickets/${r.entityId}`)}
      empty={{ text: 'Keine Einträge.' }}
      toolbar={(
        <div className="flex flex-wrap gap-2">
          <div className="w-56"><Input aria-label="Aktion" placeholder="Aktion, z. B. transcript" value={f.action} onChange={(e) => { setF({ ...f, action: e.target.value }); setPage(1); }} /></div>
          <div className="w-40"><Select aria-label="Ergebnis" value={f.result} onChange={(e) => { setF({ ...f, result: e.target.value }); setPage(1); }}><option value="">Alle Ergebnisse</option><option value="SUCCESS">ok</option><option value="DENIED">verweigert</option><option value="FAILED">fehlgeschlagen</option></Select></div>
        </div>
      )}
    />
  );
}
