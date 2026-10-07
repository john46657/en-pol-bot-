import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, History, Lock, Pencil, Plus, Search, Trash2, Unlock, UserPlus } from 'lucide-react';
import {
  DN_STATUSES, DN_STATUS_LABEL, DN_VARIABLES, dnSettingsSchema, fillTemplate, formatServiceNumber, rangeSchema,
  type DnSettings, type DnStatus, type RangeInput,
} from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { useHrConfig, useRanks, type Overview, type PersonRow } from '../../lib/hr';
import { onSaved, useAutosaveDraft } from '../../lib/autosave';
import { Toggle } from '../../components/ApplicationSettings';
import { RolePicker } from '../../components/DiscordPickers';
import { DiscordPreview } from '../../components/DiscordPreview';
import { SaveStatus } from '../../components/SaveStatus';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../../components/ui';

// ───────────── Typen (Antworten von /dienstnummern) ─────────────
interface DnRow {
  id: string; display: string; value: number; status: DnStatus; rangeId: string; range: string; note: string | null; assignedAt: string | null; reservedAt: string | null;
  userId: string | null; name: string | null; roblox: string | null; discordId: string | null; personnelId: string | null; rank: string | null; department: string | null;
}
interface RangeRow {
  id: string; name: string; prefix: string; suffix: string; start: number; end: number; padLength: number; order: RangeInput['order']; autoAssign: boolean; manual: boolean; reuse: boolean;
  releaseAs: RangeInput['releaseAs']; department: string | null; position: number;
  /** Achtung: `active` ist hier die Anzahl aktiver Nummern, der Schalter heißt `isActive`. */
  total: number; active: number; reserved: number; blocked: number; former: number; free: number; first: string; last: string; isActive: boolean;
}
interface PendingRow { id: string; applicationId: string; kind: string; userId: string; discordId: string | null; reason: string | null; status: string; createdAt: string; name: string; personnelId: string | null }
interface HistoryEvent { id: string; display: string; oldDisplay: string | null; action: string; reason: string | null; createdAt: string; name: string | null; actor: string; approver: string | null }
interface QualiConfig { units: { key: string; name: string }[] }

const STATUS_TONE: Record<DnStatus, Tone> = { ACTIVE: 'success', RESERVED: 'warning', FREE: 'neutral', BLOCKED: 'danger', FORMER: 'neutral' };
const ACTION_LABEL: Record<string, string> = {
  ASSIGNED_AUTO: 'automatisch vergeben', ASSIGNED_MANUAL: 'manuell vergeben', CHANGED: 'geändert', RELEASED: 'freigegeben', BLOCKED: 'gesperrt',
  UNBLOCKED: 'entsperrt', RESERVED: 'reserviert', FORMER: 'ehemalig', PENDING: 'ausstehend',
};
const ORDER_LABEL: Record<RangeInput['order'], string> = { LOWEST_FREE: 'kleinste freie Nummer', SEQUENTIAL: 'fortlaufend' };
const RELEASE_LABEL: Record<RangeInput['releaseAs'], string> = { FREE: 'frei', FORMER: 'ehemalig', BLOCKED: 'gesperrt' };
const TIMING_LABEL: Record<DnSettings['timing'], string> = { ACCEPT: 'direkt bei Annahme', COMPLETE: 'nach Abschluss der Einstellung (Bestätigung unter Übersicht)', MANUAL: 'manuell bestätigen' };
const NICK_EXAMPLES = ['[{dienstnummer}] {name}', '{dienstnummer} | {name}', '[P-{dienstnummer}] {name}'];
const SAMPLE = { user: '@Max', name: 'MaxMustermann', dienstnummer: '1042', rang: 'Polizeimeister', abteilung: 'Polizei', bewerbung: 'Polizei' };
const sampleVars = () => ({ ...SAMPLE, datum: new Date().toLocaleDateString('de-DE') });

const StatusPill = ({ status }: { status: DnStatus }) => <Badge tone={STATUS_TONE[status]} icon={DN_STATUS_LABEL[status].emoji}>{DN_STATUS_LABEL[status].label}</Badge>;
const Err = ({ text }: { text?: string }) => (text ? <p role="alert" className="text-sm text-danger">{text}</p> : null);
const Row = ({ label, children }: { label: string; children: ReactNode }) => <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-muted">{label}</span>{children}</label>;
const ToggleRow = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <div className="flex items-center justify-between gap-3 py-1"><div className="text-sm">{label}{hint && <p className="text-xs text-muted">{hint}</p>}</div><Toggle checked={checked} onChange={onChange} label={label} /></div>
);

/** Alle Dienstnummer-Abfragen neu laden (Liste, Kreise, Ausstehende, Historie). */
function useInvalidate() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ['dn'] }); void qc.invalidateQueries({ queryKey: ['hr-people'] }); };
}
const useRanges = () => useQuery({ queryKey: ['dn', 'ranges'], queryFn: () => api<RangeRow[]>('/dienstnummern/ranges') });
const usePeople = (enabled: boolean) => useQuery({ queryKey: ['hr-people', 'dn-picker'], queryFn: () => api<Overview>('/hr/people'), enabled, staleTime: 30_000 });

// ───────────── Seite ─────────────
export function ServiceNumbers() {
  const { can } = useAuth();
  const tabs = ['Übersicht', 'Nummernkreise', ...(can('dienstnummer.manage_settings') ? ['Automatik & Einstellungen'] : [])];
  const [tab, setTab] = useState('Übersicht');
  return (
    <div className="space-y-4">
      <PageHeader title="🪪 Dienstnummern" subtitle="Nummernkreise, Vergabe, Änderungen und Automatik nach angenommener Bewerbung" actions={tab === 'Automatik & Einstellungen' ? <SaveStatus /> : undefined} />
      <Tabs tabs={tabs} active={tabs.includes(tab) ? tab : 'Übersicht'} onChange={setTab} />
      {tab === 'Nummernkreise' ? <RangesTab /> : tab === 'Automatik & Einstellungen' && can('dienstnummer.manage_settings') ? <SettingsTab /> : <OverviewTab />}
    </div>
  );
}

// ───────────── Übersicht ─────────────
type Action = { kind: 'assign' | 'reserve' | 'block' | 'unblock' | 'release' | 'change' | 'history'; row: DnRow } | { kind: 'manual' } | null;

function OverviewTab() {
  const { can } = useAuth();
  const ranges = useRanges();
  const cfg = useHrConfig();
  const ranks = useRanks();
  const pending = useQuery({ queryKey: ['dn', 'pending'], queryFn: () => api<PendingRow[]>('/dienstnummern/pending') });
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<DnStatus | ''>('');
  const [rangeId, setRangeId] = useState('');
  const [department, setDepartment] = useState('');
  const [rank, setRank] = useState('');
  const [limit, setLimit] = useState(300);
  const dq = useDeferredValue(q.trim());
  const list = useQuery({
    queryKey: ['dn', 'list', { status, rangeId, q: dq, department, rank, limit }],
    queryFn: () => api<DnRow[]>('/dienstnummern', { query: { status: status || undefined, rangeId: rangeId || undefined, q: dq || undefined, department: department || undefined, rank: rank || undefined, limit } }),
    placeholderData: (p) => p,
  });
  const [action, setAction] = useState<Action>(null);
  const [confirmPending, setConfirmPending] = useState<PendingRow | null>(null);

  const totals = useMemo(() => {
    const t: Record<DnStatus, number> = { ACTIVE: 0, RESERVED: 0, FREE: 0, BLOCKED: 0, FORMER: 0 };
    for (const r of ranges.data ?? []) { t.ACTIVE += r.active; t.RESERVED += r.reserved; t.FREE += r.free; t.BLOCKED += r.blocked; t.FORMER += r.former; }
    return t;
  }, [ranges.data]);

  const close = () => setAction(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" aria-label="Kennzahlen">
        {DN_STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} aria-label={`${DN_STATUS_LABEL[s].label}: ${totals[s]} – Filter umschalten`} onClick={() => setStatus(status === s ? '' : s)}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${status === s ? 'border-primary bg-primary/10' : 'border-line bg-panel hover:bg-panel-2'}`}>
            <span aria-hidden>{DN_STATUS_LABEL[s].emoji}</span><span className="text-muted">{DN_STATUS_LABEL[s].label}</span><b className="tabular-nums">{ranges.isLoading ? '…' : totals[s].toLocaleString('de-DE')}</b>
          </button>
        ))}
        <div className="ml-auto">{can('dienstnummer.assign') && <Button onClick={() => setAction({ kind: 'manual' })}><UserPlus size={16} aria-hidden />Manuell vergeben</Button>}</div>
      </div>

      {(pending.data?.length ?? 0) > 0 && (
        <Card title={<span className="flex items-center gap-2 text-warning"><AlertTriangle size={16} aria-hidden />⚠️ Dienstnummer ausstehend ({pending.data!.length})</span>} className="border-warning/50">
          <ul className="divide-y divide-line">
            {pending.data!.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{p.personnelId ? <Link className="hover:underline" to={`/personnel/${p.personnelId}`}>{p.name}</Link> : p.name} <span className="text-xs text-muted">· {p.kind === 'police' ? 'Polizei-Bewerbung' : p.kind}</span></p>
                  <p className="text-xs text-muted">{p.reason ?? 'Keine Angabe'} · seit {fmt(p.createdAt)}</p>
                </div>
                {can('dienstnummer.assign') && <Button size="sm" onClick={() => setConfirmPending(p)} aria-label={`Nummer an ${p.name} vergeben`}>Nummer vergeben</Button>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input className="pl-8" aria-label="Suche" placeholder="Dienstnummer, Discord, Roblox, Name, Rang, Abteilung …" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Status filtern" value={status} onChange={(e) => setStatus(e.target.value as DnStatus | '')}>
            <option value="">Alle Status</option>
            {DN_STATUSES.map((s) => <option key={s} value={s}>{DN_STATUS_LABEL[s].emoji} {DN_STATUS_LABEL[s].label}</option>)}
          </Select>
          <Select aria-label="Abteilung filtern" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">Alle Abteilungen</option>
            {(cfg.data?.departments ?? []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
          </Select>
          <Select aria-label="Rang filtern" value={rank} onChange={(e) => setRank(e.target.value)}>
            <option value="">Alle Ränge</option>
            {(ranks.data ?? []).map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </Select>
          <Select aria-label="Nummernkreis filtern" value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
            <option value="">Alle Nummernkreise</option>
            {(ranges.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.length ? (
          <EmptyState text="Keine Dienstnummern gefunden." hint={ranges.data?.length ? 'Filter oder Suche anpassen.' : 'Lege zuerst unter „Nummernkreise“ einen Kreis an.'} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-line">
                    {['Dienstnummer', 'Status', 'Name', 'Discord ID', 'Roblox', 'Rang', 'Abteilung', 'Nummernkreis', 'vergeben am', 'Notiz', 'Aktionen'].map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((r) => (
                    <tr key={r.id} className="border-b border-line/60 align-middle hover:bg-panel-2/50">
                      <td className="px-2 py-1.5 font-mono font-semibold">{r.display}</td>
                      <td className="px-2 py-1.5"><StatusPill status={r.status} /></td>
                      <td className="px-2 py-1.5">{r.personnelId ? <Link className="text-primary hover:underline" to={`/personnel/${r.personnelId}`}>{r.name ?? '—'}</Link> : r.name ?? '—'}</td>
                      <td className="px-2 py-1.5 font-mono text-xs">{r.discordId ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.roblox ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.rank ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.department ?? '—'}</td>
                      <td className="px-2 py-1.5">{r.range}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.assignedAt ? fmt(r.assignedAt) : r.reservedAt ? <span className="text-muted">reserviert {fmt(r.reservedAt)}</span> : '—'}</td>
                      <td className="max-w-[16rem] truncate px-2 py-1.5 text-muted" title={r.note ?? undefined}>{r.note ?? '—'}</td>
                      <td className="px-2 py-1.5"><RowActions row={r} onAction={setAction} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>{list.data.length} Einträge{list.data.length >= limit ? ' (Limit erreicht – Filter nutzen oder Limit erhöhen)' : ''}</span>
              <label className="flex items-center gap-2">Anzeigen
                <Select className="w-auto py-1" aria-label="Anzahl Einträge" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>{[100, 300, 1000].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
              </label>
            </div>
          </>
        )}
      </Card>

      {confirmPending && <ConfirmPendingModal p={confirmPending} onClose={() => setConfirmPending(null)} />}
      {action?.kind === 'manual' && <AssignModal onClose={close} />}
      {action?.kind === 'assign' && <AssignModal row={action.row} onClose={close} />}
      {action && action.kind !== 'manual' && ['reserve', 'block', 'unblock', 'release'].includes(action.kind) && <StatusModal kind={action.kind as StatusKind} row={action.row} onClose={close} />}
      {action?.kind === 'change' && <ChangeModal row={action.row} onClose={close} />}
      {action?.kind === 'history' && <HistoryModal display={action.row.display} onClose={close} />}
    </div>
  );
}

function RowActions({ row, onAction }: { row: DnRow; onAction: (a: Action) => void }) {
  const { can } = useAuth();
  const b = (kind: Exclude<NonNullable<Action>['kind'], 'manual'>, label: string, icon?: ReactNode, variant: 'secondary' | 'ghost' | 'danger' = 'secondary') => (
    <Button key={kind} size="sm" variant={variant} aria-label={`${label}: ${row.display}`} onClick={() => onAction({ kind, row })}>{icon}{label}</Button>
  );
  const items: ReactNode[] = [];
  if (row.status === 'FREE') {
    if (can('dienstnummer.assign')) items.push(b('assign', 'Vergeben', <UserPlus size={13} aria-hidden />));
    if (can('dienstnummer.create')) items.push(b('reserve', 'Reservieren'));
    if (can('dienstnummer.block')) items.push(b('block', 'Sperren', <Lock size={13} aria-hidden />));
  } else if (row.status === 'ACTIVE') {
    if (can('dienstnummer.edit') && row.personnelId) items.push(b('change', 'Ändern', <Pencil size={13} aria-hidden />));
    if (can('dienstnummer.release')) items.push(b('release', 'Freigeben'));
  } else if (row.status === 'BLOCKED') {
    if (can('dienstnummer.block')) items.push(b('unblock', 'Entsperren', <Unlock size={13} aria-hidden />));
  } else if (can('dienstnummer.release')) items.push(b('release', 'Freigeben'));
  if (can('dienstnummer.history')) items.push(b('history', 'Historie', <History size={13} aria-hidden />, 'ghost'));
  return <div className="flex flex-wrap gap-1">{items.length ? items : <span className="text-xs text-muted">—</span>}</div>;
}

/** Person aus den Personalakten wählen (mit Suche). */
function PersonPicker({ value, onChange, label, people, filter }: { value: string; onChange: (id: string) => void; label: string; people: PersonRow[] | undefined; filter?: (p: PersonRow) => boolean }) {
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const rows = (people ?? []).filter((p) => (filter ? filter(p) : true) && (!t || [p.name, p.username, p.discordName, p.discordId, p.robloxName, p.serviceNumber, p.rank].some((v) => v?.toLowerCase().includes(t))));
  return (
    <div className="grid gap-1">
      <Input aria-label={`${label} suchen`} placeholder="Suchen (Name, Discord, Roblox, Dienstnummer) …" value={term} onChange={(e) => setTerm(e.target.value)} />
      <Select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} disabled={!people}>
        <option value="">{people ? `– ${label} wählen (${rows.length}) –` : 'Lädt …'}</option>
        {rows.slice(0, 300).map((p) => <option key={p.id} value={p.id}>{p.name}{p.rank ? ` · ${p.rank}` : ''}{p.serviceNumber ? ` · ${p.serviceNumber}` : ''}</option>)}
      </Select>
    </div>
  );
}

const CHECKS = ['Nummer existiert in einem Nummernkreis', 'Nummer ist verfügbar (frei)', 'Nummer ist nicht reserviert oder gesperrt', 'Person hat noch keine aktive Dienstnummer'];

/** Manuelle Vergabe – an einer freien Zeile (Nummer fest) oder über den Knopf oben (Nummer oder nächste freie aus Kreis). */
function AssignModal({ row, onClose }: { row?: DnRow; onClose: () => void }) {
  const invalidate = useInvalidate();
  const people = usePeople(true);
  const ranges = useRanges();
  const [personnelId, setPersonnelId] = useState('');
  const [mode, setMode] = useState<'display' | 'range'>('display');
  const [display, setDisplay] = useState(row?.display ?? '');
  const [rangeId, setRangeId] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  const person = people.data?.rows.find((p) => p.id === personnelId);
  const target = row ? row.display : mode === 'display' ? display.trim() : `nächste freie aus „${ranges.data?.find((r) => r.id === rangeId)?.name ?? '?'}“`;
  const save = useMutation({
    mutationFn: () => api<{ display: string }>('/dienstnummern/assign', { method: 'POST', body: { personnelId, ...(row || mode === 'display' ? { display: row?.display ?? display.trim() } : { rangeId }), reason: reason.trim() || undefined } }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => { setConfirm(false); setErr(errText(e)); },
  });
  const ready = !!personnelId && (row ? true : mode === 'display' ? !!display.trim() : !!rangeId);
  return (
    <>
      <Modal open={!confirm} title={row ? `Dienstnummer ${row.display} vergeben` : 'Dienstnummer manuell vergeben'} onClose={onClose}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (ready) { setErr(undefined); setConfirm(true); } }}>
          <Row label="Person (Personalakte) *"><PersonPicker label="Person" value={personnelId} onChange={setPersonnelId} people={people.data?.rows} /></Row>
          {person?.serviceNumber && <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">⚠️ {person.name} hat bereits die Dienstnummer <b>{person.serviceNumber}</b>. Nutze stattdessen „Ändern“ – eine zweite aktive Nummer ist nicht erlaubt.</p>}
          {!row && (
            <>
              <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Art der Nummer">
                <label className="flex items-center gap-1.5"><input type="radio" name="dn-mode" checked={mode === 'display'} onChange={() => setMode('display')} />Bestimmte Nummer</label>
                <label className="flex items-center gap-1.5"><input type="radio" name="dn-mode" checked={mode === 'range'} onChange={() => setMode('range')} />Nächste freie aus Kreis</label>
              </div>
              {mode === 'display' ? (
                <Row label="Dienstnummer *"><Input aria-label="Dienstnummer" className="font-mono" maxLength={40} placeholder="z. B. LS-042" value={display} onChange={(e) => setDisplay(e.target.value)} /></Row>
              ) : (
                <Row label="Nummernkreis *">
                  <Select aria-label="Nummernkreis" value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
                    <option value="">– wählen –</option>
                    {(ranges.data ?? []).filter((r) => r.isActive && r.manual).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.first}–{r.last}, {r.free} frei)</option>)}
                  </Select>
                </Row>
              )}
            </>
          )}
          <Row label="Grund / Notiz"><Input aria-label="Grund" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Row>
          <div className="rounded-md border border-line bg-panel-2 p-2 text-xs text-muted">
            <p className="mb-1 font-medium text-fg">Wird beim Speichern geprüft:</p>
            <ul className="list-inside list-disc space-y-0.5">{CHECKS.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          <Err text={err} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!ready}>Weiter</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={confirm} title="Vergabe bestätigen" busy={save.isPending} confirmLabel="Vergeben" onClose={() => setConfirm(false)} onConfirm={() => save.mutate()}
        message={<>Dienstnummer <b className="font-mono">{target}</b> an <b>{person?.name ?? '—'}</b> vergeben? Nickname und DM folgen den Einstellungen.</>} />
    </>
  );
}

type StatusKind = 'reserve' | 'block' | 'unblock' | 'release';
const STATUS_TEXT: Record<StatusKind, { title: string; button: string; path: string; danger?: boolean }> = {
  reserve: { title: 'reservieren', button: 'Reservieren', path: '/dienstnummern/reserve' },
  block: { title: 'sperren', button: 'Sperren', path: '/dienstnummern/block', danger: true },
  unblock: { title: 'entsperren', button: 'Entsperren', path: '/dienstnummern/unblock' },
  release: { title: 'freigeben', button: 'Freigeben', path: '/dienstnummern/release', danger: true },
};

/** Reservieren, sperren, entsperren, freigeben – mit Grund und Bestätigung. */
function StatusModal({ kind, row, onClose }: { kind: StatusKind; row: DnRow; onClose: () => void }) {
  const invalidate = useInvalidate();
  const t = STATUS_TEXT[kind];
  const [reason, setReason] = useState('');
  const [as, setAs] = useState<'FREE' | 'FORMER'>(row.status === 'ACTIVE' ? 'FORMER' : 'FREE');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  const save = useMutation({
    mutationFn: () => api(t.path, { method: 'POST', body: { display: row.display, reason: reason.trim() || undefined, ...(kind === 'release' ? { as } : {}) } }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => { setConfirm(false); setErr(errText(e)); },
  });
  return (
    <>
      <Modal open={!confirm} title={`Dienstnummer ${row.display} ${t.title}`} onClose={onClose}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); setErr(undefined); setConfirm(true); }}>
          <p className="flex flex-wrap items-center gap-2 text-sm">Aktuell: <StatusPill status={row.status} />{row.name && <span>· {row.name}</span>}</p>
          {kind === 'release' && row.status === 'ACTIVE' && (
            <Row label="Nummer wird">
              <Select aria-label="Nummer wird" value={as} onChange={(e) => setAs(e.target.value as 'FREE' | 'FORMER')}>
                <option value="FORMER">⚫ ehemalig (bleibt der Person zugeordnet, nicht neu vergebbar)</option>
                <option value="FREE">⚪ frei (sofort wieder vergebbar)</option>
              </Select>
            </Row>
          )}
          {kind === 'release' && row.status === 'ACTIVE' && <p className="text-xs text-warning">Die Person verliert ihre Dienstnummer in der Personalakte.</p>}
          <Row label="Grund"><Input aria-label="Grund" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Row>
          <Err text={err} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" variant={t.danger ? 'danger' : 'primary'}>Weiter</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={confirm} danger={t.danger} busy={save.isPending} title={`${t.button}?`} confirmLabel={t.button} onClose={() => setConfirm(false)} onConfirm={() => save.mutate()}
        message={<>Dienstnummer <b className="font-mono">{row.display}</b> wirklich {t.title}{kind === 'release' ? ` (wird ${as === 'FREE' ? 'frei' : 'ehemalig'})` : ''}?</>} />
    </>
  );
}

/** Aktive Nummer ändern: neue Nummer oder nächste freie aus einem Kreis; Grund Pflicht, Genehmiger je nach Einstellung. */
function ChangeModal({ row, onClose }: { row: DnRow; onClose: () => void }) {
  const invalidate = useInvalidate();
  const ranges = useRanges();
  const people = usePeople(true);
  const settings = useQuery({ queryKey: ['dn', 'settings'], queryFn: () => api<DnSettings>('/dienstnummern/settings') });
  const [mode, setMode] = useState<'display' | 'range'>('display');
  const [display, setDisplay] = useState('');
  const [rangeId, setRangeId] = useState(row.rangeId);
  const [reason, setReason] = useState('');
  const [approver, setApprover] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  const needsApprover = settings.data?.changeNeedsApprover ?? false;
  const approverUserId = people.data?.rows.find((p) => p.id === approver)?.userId;
  const range = ranges.data?.find((r) => r.id === rangeId);
  const next = mode === 'display' ? display.trim() || '…' : range ? `nächste freie aus „${range.name}“` : '…';
  const save = useMutation({
    mutationFn: () => api<{ display: string; old: string | null }>('/dienstnummern/change', { method: 'POST', body: { personnelId: row.personnelId, ...(mode === 'display' ? { display: display.trim() } : { rangeId }), reason: reason.trim(), approverId: approverUserId ?? null } }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => { setConfirm(false); setErr(errText(e)); },
  });
  const ready = reason.trim().length >= 3 && (mode === 'display' ? !!display.trim() : !!rangeId) && (!needsApprover || !!approverUserId);
  return (
    <>
      <Modal open={!confirm} title={`Dienstnummer von ${row.name ?? row.display} ändern`} onClose={onClose}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (ready) { setErr(undefined); setConfirm(true); } }}>
          <div className="flex items-center justify-center gap-3 rounded-md border border-line bg-panel-2 p-3 font-mono text-lg" aria-label="Vorschau alte und neue Nummer">
            <span className="text-muted line-through">{row.display}</span><span aria-hidden>→</span><span className="font-semibold text-primary">{next}</span>
          </div>
          <div className="flex gap-4 text-sm" role="radiogroup" aria-label="Neue Nummer">
            <label className="flex items-center gap-1.5"><input type="radio" name="dn-change" checked={mode === 'display'} onChange={() => setMode('display')} />Neue Nummer eingeben</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="dn-change" checked={mode === 'range'} onChange={() => setMode('range')} />Nächste freie aus Kreis</label>
          </div>
          {mode === 'display' ? (
            <Row label="Neue Dienstnummer *"><Input aria-label="Neue Dienstnummer" className="font-mono" maxLength={40} value={display} onChange={(e) => setDisplay(e.target.value)} /></Row>
          ) : (
            <Row label="Nummernkreis *">
              <Select aria-label="Nummernkreis" value={rangeId} onChange={(e) => setRangeId(e.target.value)}>
                <option value="">– wählen –</option>
                {(ranges.data ?? []).filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.free} frei)</option>)}
              </Select>
            </Row>
          )}
          <Row label="Grund * (mind. 3 Zeichen)"><Textarea aria-label="Grund" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></Row>
          <Row label={`Genehmiger${needsApprover ? ' * (andere Person mit Recht „dienstnummer.edit“)' : ' (optional)'}`}>
            <PersonPicker label="Genehmiger" value={approver} onChange={setApprover} people={people.data?.rows} filter={(p) => p.userId !== row.userId} />
          </Row>
          <p className="text-xs text-muted">Die alte Nummer wird je nach Nummernkreis frei, ehemalig oder gesperrt. Der Wechsel steht in Historie, Personalakte und Audit-Log.</p>
          <Err text={err} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!ready}>Weiter</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={confirm} busy={save.isPending} title="Nummernwechsel bestätigen" confirmLabel="Ändern" onClose={() => setConfirm(false)} onConfirm={() => save.mutate()}
        message={<>Dienstnummer von <b>{row.name}</b>: <b className="font-mono">{row.display}</b> → <b className="font-mono">{next}</b>. Fortfahren?</>} />
    </>
  );
}

function ConfirmPendingModal({ p, onClose }: { p: PendingRow; onClose: () => void }) {
  const invalidate = useInvalidate();
  const [display, setDisplay] = useState('');
  const [err, setErr] = useState<string>();
  const save = useMutation({
    mutationFn: () => api<{ display: string }>(`/dienstnummern/pending/${p.id}/confirm`, { method: 'POST', body: { display: display.trim() || undefined } }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <Modal open title={`Dienstnummer für ${p.name} vergeben`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <p className="text-sm text-muted">{p.kind === 'police' ? 'Polizei-Bewerbung' : p.kind} · ausstehend seit {fmt(p.createdAt)}{p.reason ? ` · ${p.reason}` : ''}</p>
        <Row label="Bestimmte Nummer (optional)"><Input aria-label="Bestimmte Nummer" className="font-mono" maxLength={40} placeholder="leer = automatisch aus der Zuordnung" value={display} onChange={(e) => setDisplay(e.target.value)} /></Row>
        <Err text={err} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={save.isPending}>Nummer vergeben</Button></div>
      </form>
    </Modal>
  );
}

function HistoryModal({ display, onClose }: { display: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['dn', 'history', display], queryFn: () => api<HistoryEvent[]>('/dienstnummern/history', { query: { display } }) });
  return (
    <Modal open wide title={`Historie ${display}`} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState text="Noch keine Einträge." /> : (
        <ol className="relative space-y-3 border-l border-line pl-4">
          {q.data.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <p className="flex flex-wrap items-center gap-2">
                <Badge tone={e.action === 'BLOCKED' ? 'danger' : e.action.startsWith('ASSIGNED') ? 'success' : e.action === 'PENDING' || e.action === 'RESERVED' ? 'warning' : 'neutral'}>{ACTION_LABEL[e.action] ?? e.action}</Badge>
                <span className="font-mono">{e.oldDisplay ? <>{e.oldDisplay} → {e.display}</> : e.display}</span>
                {e.name && <span>· {e.name}</span>}
              </p>
              <p className="text-xs text-muted">{fmt(e.createdAt)} · durch {e.actor}{e.approver ? ` · genehmigt von ${e.approver}` : ''}</p>
              {e.reason && <p className="mt-0.5 text-xs">Grund: {e.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

// ───────────── Nummernkreise ─────────────
const emptyRange = (): RangeInput => ({ name: '', prefix: '', suffix: '', start: 1, end: 999, padLength: 3, order: 'LOWEST_FREE', autoAssign: true, manual: true, reuse: true, releaseAs: 'FORMER', department: null, active: true });
const toInput = (r: RangeRow): RangeInput => ({ name: r.name, prefix: r.prefix, suffix: r.suffix, start: r.start, end: r.end, padLength: r.padLength, order: r.order, autoAssign: r.autoAssign, manual: r.manual, reuse: r.reuse, releaseAs: r.releaseAs, department: r.department, active: r.isActive });

function RangesTab() {
  const { can } = useAuth();
  const edit = can('dienstnummer.manage_ranges');
  const ranges = useRanges();
  const [editing, setEditing] = useState<{ id?: string; value: RangeInput } | null>(null);
  const [del, setDel] = useState<RangeRow | null>(null);
  const [err, setErr] = useState<string>();
  const invalidate = useInvalidate();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/dienstnummern/ranges/${id}`, { method: 'DELETE' }),
    onSuccess: () => { invalidate(); setDel(null); },
    onError: (e) => { setDel(null); setErr(errText(e)); },
  });
  if (ranges.isLoading) return <SkeletonRows />;
  if (ranges.error) return <ErrorState error={ranges.error} onRetry={() => void ranges.refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Jeder Kreis hat eine eigene Schreibweise (Präfix, Länge, Suffix). Kreise mit gleicher Schreibweise dürfen sich nicht überschneiden.</p>
        {edit && <Button onClick={() => setEditing({ value: emptyRange() })}><Plus size={16} aria-hidden />Nummernkreis</Button>}
      </div>
      <Err text={err} />
      {!ranges.data?.length ? <Card><EmptyState text="Noch kein Nummernkreis angelegt." hint="z. B. „Polizei“ mit 001–999." /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ranges.data.map((r) => {
            const used = r.total - r.free;
            const pct = r.total ? Math.round((used / r.total) * 100) : 0;
            return (
              <Card key={r.id} title={<span className="flex items-center gap-2">{r.name}{!r.isActive && <Badge>deaktiviert</Badge>}</span>}
                actions={edit && <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={`${r.name} bearbeiten`} onClick={() => { setErr(undefined); setEditing({ id: r.id, value: toInput(r) }); }}><Pencil size={14} aria-hidden /></Button>
                  <Button size="sm" variant="ghost" aria-label={`${r.name} löschen`} onClick={() => { setErr(undefined); setDel(r); }}><Trash2 size={14} aria-hidden /></Button>
                </div>}>
                <p className="font-mono text-lg font-semibold">{r.first} – {r.last}</p>
                <p className="text-xs text-muted">{r.total.toLocaleString('de-DE')} Nummern{r.department ? ` · Abteilung ${r.department}` : ''}</p>
                <div className="mt-3" role="progressbar" aria-label={`Auslastung ${r.name}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="mb-1 flex justify-between text-xs"><span>Auslastung</span><span className="tabular-nums">{pct} % ({used}/{r.total})</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-panel-2"><div className={`h-full rounded-full ${pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${pct}%` }} /></div>
                </div>
                <dl className="mt-3 grid grid-cols-5 gap-1 text-center text-xs">
                  {([['ACTIVE', r.active], ['RESERVED', r.reserved], ['FREE', r.free], ['BLOCKED', r.blocked], ['FORMER', r.former]] as const).map(([s, n]) => (
                    <div key={s} className="rounded bg-panel-2 px-1 py-1.5"><dt className="truncate text-muted"><span aria-hidden>{DN_STATUS_LABEL[s].emoji}</span> {DN_STATUS_LABEL[s].label}</dt><dd className="font-semibold tabular-nums">{n}</dd></div>
                  ))}
                </dl>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Badge tone="info">{ORDER_LABEL[r.order]}</Badge>
                  {r.autoAssign && <Badge tone="success">automatisch</Badge>}
                  {r.manual && <Badge tone="primary">manuell</Badge>}
                  {r.reuse && <Badge>wiederverwenden</Badge>}
                  <Badge>alte Nr.: {RELEASE_LABEL[r.releaseAs]}</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <RangeEditor id={editing.id} initial={editing.value} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!del} danger busy={remove.isPending} title="Nummernkreis löschen?" confirmLabel="Löschen" onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)}
        message={<>„{del?.name}“ wirklich löschen? Das geht nur, wenn keine Nummer vergeben, reserviert, gesperrt oder ehemalig ist – sonst lieber deaktivieren.</>} />
    </div>
  );
}

function RangeEditor({ id, initial, onClose }: { id?: string; initial: RangeInput; onClose: () => void }) {
  const invalidate = useInvalidate();
  const cfg = useHrConfig();
  const [v, setV] = useState<RangeInput>(initial);
  const [err, setErr] = useState<string>();
  const set = <K extends keyof RangeInput>(k: K, x: RangeInput[K]) => setV((p) => ({ ...p, [k]: x }));
  const parsed = rangeSchema.safeParse(v);
  const issue = parsed.success ? undefined : parsed.error.issues[0]?.message;
  const save = useMutation({
    mutationFn: () => api(id ? `/dienstnummern/ranges/${id}` : '/dienstnummern/ranges', { method: id ? 'PUT' : 'POST', body: v }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const num = (s: string) => (s === '' ? 0 : Math.max(0, Math.floor(Number(s)) || 0));
  return (
    <Modal open wide title={id ? `Nummernkreis „${initial.name}“ bearbeiten` : 'Neuer Nummernkreis'} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (parsed.success) save.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Row label="Name *"><Input aria-label="Name" maxLength={60} value={v.name} onChange={(e) => set('name', e.target.value)} /></Row>
          <Row label="Präfix"><Input aria-label="Präfix" className="font-mono" maxLength={10} placeholder="z. B. LS-" value={v.prefix} onChange={(e) => set('prefix', e.target.value)} /></Row>
          <Row label="Suffix"><Input aria-label="Suffix" className="font-mono" maxLength={10} value={v.suffix} onChange={(e) => set('suffix', e.target.value)} /></Row>
          <Row label="Startnummer"><Input aria-label="Startnummer" type="number" min={0} value={v.start} onChange={(e) => set('start', num(e.target.value))} /></Row>
          <Row label="Endnummer"><Input aria-label="Endnummer" type="number" min={0} value={v.end} onChange={(e) => set('end', num(e.target.value))} /></Row>
          <Row label="Nummernlänge (führende Nullen)"><Input aria-label="Nummernlänge" type="number" min={0} max={10} value={v.padLength} onChange={(e) => set('padLength', Math.min(10, num(e.target.value)))} /></Row>
          <Row label="Vergabereihenfolge">
            <Select aria-label="Vergabereihenfolge" value={v.order} onChange={(e) => set('order', e.target.value as RangeInput['order'])}>{(Object.keys(ORDER_LABEL) as RangeInput['order'][]).map((k) => <option key={k} value={k}>{ORDER_LABEL[k]}</option>)}</Select>
          </Row>
          <Row label="Alte Nummer wird">
            <Select aria-label="Alte Nummer wird" value={v.releaseAs} onChange={(e) => set('releaseAs', e.target.value as RangeInput['releaseAs'])}>{(Object.keys(RELEASE_LABEL) as RangeInput['releaseAs'][]).map((k) => <option key={k} value={k}>{RELEASE_LABEL[k]}</option>)}</Select>
          </Row>
          <Row label="Abteilung">
            <Select aria-label="Abteilung" value={v.department ?? ''} onChange={(e) => set('department', e.target.value || null)}>
              <option value="">– keine –</option>
              {(cfg.data?.departments ?? []).map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
              {v.department && !cfg.data?.departments.some((d) => d.name === v.department) && <option value={v.department}>{v.department}</option>}
            </Select>
          </Row>
        </div>
        <div className="grid gap-x-6 sm:grid-cols-2">
          <ToggleRow label="Automatische Vergabe" checked={v.autoAssign} onChange={(x) => set('autoAssign', x)} />
          <ToggleRow label="Manuelle Vergabe" checked={v.manual} onChange={(x) => set('manual', x)} />
          <ToggleRow label="Nummern wiederverwenden" checked={v.reuse} onChange={(x) => set('reuse', x)} />
          <ToggleRow label="Aktiv" checked={v.active} onChange={(x) => set('active', x)} />
        </div>
        <div className="rounded-md border border-line bg-panel-2 p-3" aria-live="polite">
          <p className="text-xs text-muted">Vorschau</p>
          <p className="font-mono text-lg font-semibold">{formatServiceNumber(v, v.start)} … {formatServiceNumber(v, Math.max(v.start, v.end))}</p>
          <p className="text-xs text-muted">{Math.max(0, v.end - v.start + 1).toLocaleString('de-DE')} Nummern</p>
        </div>
        {id && <p className="text-xs text-muted">Präfix, Suffix und Länge lassen sich nicht mehr ändern, sobald Nummern vergeben wurden.</p>}
        <Err text={err ?? (v.name.trim() ? issue : undefined)} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!parsed.success || save.isPending}>Speichern</Button></div>
      </form>
    </Modal>
  );
}

// ───────────── Automatik & Einstellungen ─────────────
type Mapping = DnSettings['mappings'][number];
const CUSTOM = '__custom';

function SettingsTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['dn', 'settings'], queryFn: () => api<DnSettings>('/dienstnummern/settings') });
  const ranges = useRanges();
  const ranks = useRanks();
  const cfg = useHrConfig();
  const quali = useQuery({ queryKey: ['quali-config', ''], queryFn: () => api<QualiConfig>('/qualifications/config'), enabled: can('qualifications.view'), retry: false, staleTime: 60_000 });
  const [draft, setDraft] = useState<DnSettings>();
  useEffect(() => { if (settings.data && !draft) setDraft(settings.data); }, [settings.data, draft]);
  useEffect(() => onSaved('dn-settings', () => void qc.invalidateQueries({ queryKey: ['dn', 'settings'] })), [qc]);
  useAutosaveDraft('dn-settings', draft, (d) => (dnSettingsSchema.safeParse(d).success ? { method: 'PUT', path: '/dienstnummern/settings', body: d, label: 'Dienstnummern' } : null));

  if (settings.isLoading || !draft) return settings.error ? <ErrorState error={settings.error} onRetry={() => void settings.refetch()} /> : <SkeletonRows />;
  const d = draft;
  const patch = (p: Partial<DnSettings>) => setDraft({ ...d, ...p });
  const setMap = (i: number, p: Partial<Mapping>) => patch({ mappings: d.mappings.map((m, j) => (j === i ? { ...m, ...p } : m)) });
  const kinds = [{ value: 'police', label: 'Polizei-Bewerbung' }, ...(quali.data?.units ?? []).map((u) => ({ value: u.name, label: `Einheit: ${u.name}` }))];
  const vars = sampleVars();
  const nick = fillTemplate(d.nickname.format, vars);
  const valid = dnSettingsSchema.safeParse(d);

  return (
    <div className="space-y-4">
      <Card title="ℹ️ Ablauf nach angenommener Bewerbung">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ablauf">
          {['Bewerbung angenommen', 'Dienstnummer', 'Personalakte', 'Rang', 'Discord-Rollen', 'Nickname', 'DM', 'Audit-Log'].map((s, i, a) => (
            <li key={s} className="flex items-center gap-1.5"><span className="rounded-md border border-line bg-panel-2 px-2 py-1">{s}</span>{i < a.length - 1 && <span aria-hidden className="text-muted">→</span>}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted">Die Vergabe ist atomar – eine Nummer wird nie doppelt vergeben. Klappt sie nicht (kein Kreis, keine freie Nummer, fehlende Rechte), erscheint die Person unter „⚠️ Dienstnummer ausstehend“.</p>
      </Card>
      {!valid.success && <p role="alert" className="text-sm text-danger">Nicht gespeichert – bitte prüfen: {valid.error.issues[0]?.message}</p>}

      <Card title="⏱️ Vergabezeitpunkt">
        <div className="grid gap-2" role="radiogroup" aria-label="Vergabezeitpunkt">
          {(Object.keys(TIMING_LABEL) as DnSettings['timing'][]).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm"><input type="radio" name="dn-timing" checked={d.timing === t} onChange={() => patch({ timing: t })} />{TIMING_LABEL[t]}</label>
          ))}
        </div>
        <div className="mt-3 grid gap-x-6 border-t border-line pt-3 sm:grid-cols-2">
          <ToggleRow label="Rangrolle vergeben" hint="Discord-Rollen des Startrangs" checked={d.rankRoles} onChange={(x) => patch({ rankRoles: x })} />
          <ToggleRow label="Abteilungsrolle vergeben" hint="Discord-Rollen der Abteilung" checked={d.departmentRoles} onChange={(x) => patch({ departmentRoles: x })} />
          <ToggleRow label="Nummernwechsel braucht Genehmiger" hint="Zweite Person mit Recht dienstnummer.edit" checked={d.changeNeedsApprover} onChange={(x) => patch({ changeNeedsApprover: x })} />
        </div>
      </Card>

      <Card title="🔗 Zuordnungen (Bewerbung → Nummernkreis)" actions={<Button size="sm" variant="secondary" disabled={d.mappings.length >= 50} onClick={() => patch({ mappings: [...d.mappings, { kind: '', rangeId: null, department: null, rankId: null, createProfile: true, roleIds: [] }] })}><Plus size={14} aria-hidden />Zuordnung</Button>}>
        {!d.mappings.length ? <EmptyState text="Keine Zuordnung – es wird nichts automatisch vergeben." /> : (
          <div className="space-y-3">
            {d.mappings.map((m, i) => {
              const known = kinds.some((k) => k.value === m.kind);
              return (
                <fieldset key={i} className="grid gap-3 rounded-md border border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <legend className="px-1 text-xs text-muted">Zuordnung {i + 1}</legend>
                  <Row label="Bewerbung *">
                    <div className="grid gap-1">
                      <Select aria-label={`Bewerbung ${i + 1}`} value={known ? m.kind : CUSTOM} onChange={(e) => setMap(i, { kind: e.target.value === CUSTOM ? '' : e.target.value })}>
                        {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                        <option value={CUSTOM}>Andere (Freitext) …</option>
                      </Select>
                      {!known && <Input aria-label={`Bewerbung ${i + 1} Freitext`} maxLength={64} placeholder="Name der Einheit" value={m.kind} onChange={(e) => setMap(i, { kind: e.target.value })} />}
                    </div>
                  </Row>
                  <Row label="Nummernkreis">
                    <Select aria-label={`Nummernkreis ${i + 1}`} value={m.rangeId ?? ''} onChange={(e) => setMap(i, { rangeId: e.target.value || null })}>
                      <option value="">keine automatische Dienstnummer</option>
                      {(ranges.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name} ({r.first}–{r.last}){r.isActive ? '' : ' – deaktiviert'}</option>)}
                    </Select>
                  </Row>
                  <Row label="Abteilung">
                    <Select aria-label={`Abteilung ${i + 1}`} value={m.department ?? ''} onChange={(e) => setMap(i, { department: e.target.value || null })}>
                      <option value="">– keine –</option>
                      {(cfg.data?.departments ?? []).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
                      {m.department && !cfg.data?.departments.some((x) => x.name === m.department) && <option value={m.department}>{m.department}</option>}
                    </Select>
                  </Row>
                  <Row label="Startrang">
                    <Select aria-label={`Startrang ${i + 1}`} value={m.rankId ?? ''} onChange={(e) => setMap(i, { rankId: e.target.value || null })}>
                      <option value="">– keiner –</option>
                      {(ranks.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}
                    </Select>
                  </Row>
                  <div className="sm:col-span-2"><Row label="Zusätzliche Discord-Rollen"><RolePicker ariaLabel={`Zusätzliche Discord-Rollen ${i + 1}`} max={10} value={m.roleIds} onChange={(ids) => setMap(i, { roleIds: ids })} /></Row></div>
                  <div className="flex items-end justify-between gap-3 sm:col-span-2">
                    <ToggleRow label="Personalakte anlegen" checked={m.createProfile} onChange={(x) => setMap(i, { createProfile: x })} />
                    <Button size="sm" variant="ghost" aria-label={`Zuordnung ${i + 1} entfernen`} onClick={() => patch({ mappings: d.mappings.filter((_, j) => j !== i) })}><Trash2 size={14} aria-hidden />Entfernen</Button>
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}
      </Card>

      <VariableChips />

      <Card title="🏷️ Discord-Nickname">
        <ToggleRow label="Nickname setzen" checked={d.nickname.enabled} onChange={(x) => patch({ nickname: { ...d.nickname, enabled: x } })} />
        <div className="mt-2 grid gap-2">
          <Row label="Format"><Input aria-label="Nickname-Format" maxLength={60} value={d.nickname.format} onChange={(e) => patch({ nickname: { ...d.nickname, format: e.target.value } })} /></Row>
          <div className="flex flex-wrap gap-1.5" aria-label="Beispiele">
            {NICK_EXAMPLES.map((x) => <Button key={x} size="sm" variant="secondary" className="font-mono" aria-label={`Beispiel ${x} übernehmen`} onClick={() => patch({ nickname: { ...d.nickname, format: x } })}>{x}</Button>)}
          </div>
          <p className="text-sm">Vorschau: <b className="font-mono">{nick.slice(0, 32)}</b> <span className={nick.length > 32 ? 'text-warning' : 'text-muted'}>({nick.length}/32 Zeichen{nick.length > 32 ? ' – wird gekürzt' : ''})</span></p>
          <p className="text-xs text-muted">Discord erlaubt höchstens 32 Zeichen. Der Bot braucht „Nicknamen verwalten“ und muss über der Rolle der Person stehen.</p>
        </div>
      </Card>

      <Card title="✉️ Direktnachricht (DM)">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-2">
            <ToggleRow label="DM senden" checked={d.dm.enabled} onChange={(x) => patch({ dm: { ...d.dm, enabled: x } })} />
            <Row label="Titel"><Input aria-label="DM-Titel" maxLength={256} value={d.dm.title} onChange={(e) => patch({ dm: { ...d.dm, title: e.target.value } })} /></Row>
            <Row label="Text"><Textarea aria-label="DM-Text" rows={8} maxLength={3000} value={d.dm.template} onChange={(e) => patch({ dm: { ...d.dm, template: e.target.value } })} /></Row>
            <Row label="Farbe">
              <div className="flex items-center gap-2">
                <input type="color" aria-label="DM-Farbe" className="h-9 w-12 cursor-pointer rounded border border-line bg-bg" value={/^#[0-9a-f]{6}$/i.test(d.dm.color) ? d.dm.color : '#22c55e'} onChange={(e) => patch({ dm: { ...d.dm, color: e.target.value } })} />
                <Input aria-label="DM-Farbe (Hex)" className="w-32 font-mono" maxLength={7} value={d.dm.color} onChange={(e) => patch({ dm: { ...d.dm, color: e.target.value } })} />
              </div>
            </Row>
            <p className="text-xs text-muted">Bei einem Nummernwechsel wird keine DM gesendet.</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-muted">Vorschau mit Beispielwerten</p>
            <DiscordPreview message={{ embeds: [{ title: fillTemplate(d.dm.title, vars).slice(0, 256), description: fillTemplate(d.dm.template, vars).slice(0, 4000), color: parseInt(d.dm.color.slice(1), 16) || 0, timestamp: new Date().toISOString() }] }} />
          </div>
        </div>
      </Card>
    </div>
  );
}

function VariableChips() {
  const [copied, setCopied] = useState<string>();
  const copy = (v: string) => { void navigator.clipboard?.writeText(v).then(() => setCopied(v), () => undefined); };
  const vars = sampleVars();
  return (
    <Card title="🧩 Platzhalter (Nickname & DM)">
      <div className="flex flex-wrap gap-1.5">
        {DN_VARIABLES.map((v) => (
          <button key={v} type="button" onClick={() => copy(v)} aria-label={`Platzhalter ${v} kopieren`} title={`Beispiel: ${fillTemplate(v, vars)}`}
            className="rounded border border-line bg-panel-2 px-2 py-0.5 font-mono text-xs hover:border-primary">{v}{copied === v ? ' ✓' : ''}</button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Klicken zum Kopieren. Beispielwerte: {Object.entries(vars).map(([k, x]) => `{${k}} = ${x}`).join(' · ')}</p>
    </Card>
  );
}
