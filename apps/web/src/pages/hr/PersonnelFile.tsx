import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Ban, Plus, Trash2 } from 'lucide-react';
import type { HrConfig, PromotionCheck } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { onSaved, pendingBody, useAutosaveDraft } from '../../lib/autosave';
import { fmtDate, requestStatus, statusInfo, useHrConfig, useRanks, type HrRank, type HrRecord, type HrRequest, type Profile } from '../../lib/hr';
import { Avatar } from '../../components/TeamRoster';
import { SaveStatus } from '../../components/SaveStatus';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, StatusBadge, Tabs, Textarea, type Tone } from '../../components/ui';
import { RankLabel } from './PersonnelOverview';

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const day = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');
const Err = ({ e }: { e: unknown }) => (e ? <p role="alert" className="text-sm text-danger">{errText(e)}</p> : null);
const Bar = ({ value, tone = 'bg-primary' }: { value: number; tone?: string }) => (
  <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
);
const blocks = (p: number) => { const n = Math.round(Math.max(0, Math.min(100, p)) / 10); return `${'█'.repeat(n)}${'░'.repeat(10 - n)} ${p} %`; };

const TRAINING_STATUS: Record<string, [string, Tone]> = {
  NOT_STARTED: ['Nicht begonnen', 'neutral'], IN_PROGRESS: ['In Bearbeitung', 'info'], PASSED: ['Bestanden', 'success'], FAILED: ['Nicht bestanden', 'danger'], ABORTED: ['Abgebrochen', 'neutral'], EXPIRED: ['Abgelaufen', 'warning'],
};
const EXAM_STATUS: Record<string, string> = { IN_PROGRESS: 'Läuft', SUBMITTED: 'Abgegeben – wird bewertet', GRADED: 'Bewertet' };
const DN_ACTION: Record<string, string> = { ASSIGNED_AUTO: 'Automatisch vergeben', ASSIGNED_MANUAL: 'Manuell vergeben', CHANGED: 'Geändert', RELEASED: 'Freigegeben', BLOCKED: 'Gesperrt', UNBLOCKED: 'Entsperrt', RESERVED: 'Reserviert', FORMER: 'Ehemalig', PENDING: 'Ausstehend' };
const WARN_STATE: Record<string, [string, Tone]> = { ACTIVE: ['Aktiv', 'danger'], EXPIRED: ['Abgelaufen', 'neutral'], REVOKED: ['Aufgehoben', 'neutral'] };

/** Gemeinsame Änderungen an Einträgen der Akte – danach Akte neu laden. */
function useRecordOps(id: string) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries({ queryKey: ['hr-profile', id] });
  const add = useMutation({ mutationFn: (body: Record<string, unknown>) => api(`/hr/people/${id}/records`, { method: 'POST', body }), onSuccess: done });
  const patch = useMutation({ mutationFn: ({ rid, body }: { rid: string; body: Record<string, unknown> }) => api(`/hr/records/${rid}`, { method: 'PATCH', body }), onSuccess: done });
  const remove = useMutation({ mutationFn: (rid: string) => api(`/hr/records/${rid}`, { method: 'DELETE' }), onSuccess: done });
  return { add, patch, remove, done };
}

/** Liste von Einträgen (Notizen, Auszeichnungen, Empfehlungen …) mit optionalem Löschen. */
function RecordList({ records, empty, canDelete, onDelete, render }: { records: HrRecord[]; empty: string; canDelete?: boolean; onDelete?: (r: HrRecord) => void; render?: (r: HrRecord) => ReactNode }) {
  if (!records.length) return <EmptyState text={empty} />;
  return (
    <ul className="divide-y divide-line">
      {records.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
          <div className="min-w-0">
            {render ? render(r) : <><p className="font-medium">{r.summary}</p>{r.details && <p className="whitespace-pre-wrap text-muted">{r.details}</p>}</>}
            <p className="mt-0.5 text-xs text-muted">{r.createdByName} · {fmt(r.createdAt)}</p>
          </div>
          {canDelete && onDelete && <Button size="sm" variant="ghost" aria-label="Eintrag löschen" onClick={() => onDelete(r)}><Trash2 size={14} aria-hidden /></Button>}
        </li>
      ))}
    </ul>
  );
}

/** Einfacher Eintrag (Notiz/Empfehlung): Kurztext + Details. */
function AddSimpleRecord({ id, type, label }: { id: string; type: 'NOTE' | 'RECOMMENDATION'; label: string }) {
  const { add } = useRecordOps(id);
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  return (
    <form className="mb-3 grid gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate({ type, summary: summary.trim(), details: details.trim() || undefined }, { onSuccess: () => { setSummary(''); setDetails(''); } }); }}>
      <Input aria-label={`${label} – Kurztext`} placeholder={`${label} (Kurztext)`} maxLength={300} value={summary} onChange={(e) => setSummary(e.target.value)} />
      <Textarea aria-label={`${label} – Details`} rows={2} placeholder="Details (optional)" maxLength={5000} value={details} onChange={(e) => setDetails(e.target.value)} />
      <Err e={add.error} />
      <div><Button type="submit" size="sm" disabled={summary.trim().length < 2 || add.isPending}><Plus size={14} aria-hidden />{label} hinzufügen</Button></div>
    </form>
  );
}

export function PersonnelFile() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const cfg = useHrConfig().data;
  const ranks = useRanks().data ?? [];
  const q = useQuery({ queryKey: ['hr-profile', id], queryFn: () => api<Profile>(`/hr/people/${id}`), enabled: !!id });
  const [tab, setTab] = useState('Übersicht');
  const [del, setDel] = useState(false);
  const remove = useMutation({ mutationFn: () => api(`/hr/people/${id}`, { method: 'DELETE' }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-people'] }); nav('/personnel'); } });
  const p = q.data;
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.error || !p) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const s = p.sections;
  const tabs: [string, boolean][] = [
    ['Übersicht', s.overview !== false],
    ['Rang & Beförderungen', !!s.rank || p.promotions !== null],
    ['Versetzungen', !!s.transfers && p.transfers !== null],
    ['Ausbildungen', !!s.trainings && p.trainings !== null],
    ['Prüfungen', !!s.exams && p.exams !== null],
    ['Auszeichnungen', !!s.awards && p.awards !== null],
    ['Verwarnungen', !!s.warnings && p.warnings !== null],
    ['Abwesenheiten', !!s.absences && p.absences !== null],
    ['Dienstnummern', !!s.servicenumbers && p.serviceNumbers !== null],
    ['Notizen', !!s.notes && p.notes !== null],
    ['Empfehlungen', true],
    ['Historie', !!s.history && p.history !== null],
  ];
  const visible = tabs.filter(([, ok]) => ok).map(([t]) => t);
  const active = visible.includes(tab) ? tab : visible[0] ?? '';
  const st = statusInfo(cfg, p.status);
  const editCard = can('personnel.edit') && <EditCard key={p.id} p={p} cfg={cfg} />;

  return (
    <div className="grid gap-4">
      <PageHeader title="Personalakte" subtitle={p.name}
        actions={<>
          <Link to="/personnel" className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-fg"><ArrowLeft size={14} aria-hidden />Zur Übersicht</Link>
          {can('personnel.delete') && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} aria-hidden />Personalakte löschen</Button>}
        </>} />

      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <Avatar src={p.avatar} name={p.name} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold uppercase tracking-wide">{p.name}</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Item label="Rang"><RankLabel name={p.rank} color={p.rankInfo?.color ?? null} icon={p.rankInfo?.icon ?? null} /></Item>
              <Item label="Abteilung">{p.department ?? '—'}</Item>
              <Item label="Status">{p.status ? <span style={{ color: st.color }}>{st.emoji} {st.label}</span> : '—'}</Item>
              <Item label="Eintritt">{fmtDate(p.joinDate)}</Item>
              <Item label="Dienstnummer">{p.serviceNumber ?? '—'}</Item>
              {p.callsign && <Item label="Rufname">{p.callsign}</Item>}
              {p.discordName && <Item label="Discord-Name">{p.discordName}</Item>}
              {p.discordId && <Item label="Discord-ID"><code className="text-xs">{p.discordId}</code></Item>}
              {p.robloxName && <Item label="Roblox-Name">{p.robloxName}</Item>}
              {p.robloxId && <Item label="Roblox-ID"><code className="text-xs">{p.robloxId}</code></Item>}
            </dl>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
            {([['🎖️', 'Beförderungen', p.counts.promotions], ['📚', 'Ausbildungen', p.counts.trainings], ['🏅', 'Auszeichnungen', p.counts.awards], ...(p.warnings !== null ? [['⚠️', 'Verwarnungen', p.counts.warnings] as const] : [])] as const).map(([icon, label, n]) => (
              <div key={label} className="rounded-md border border-line bg-panel-2/50 px-3 py-2"><p className="text-lg font-semibold"><span aria-hidden>{icon}</span> {n}</p><p className="text-xs text-muted">{label}</p></div>
            ))}
          </div>
        </div>
      </Card>

      {visible.length > 0 && <Tabs tabs={visible} active={active} onChange={setTab} />}
      {active === 'Übersicht' && <OverviewTab p={p} cfg={cfg} edit={editCard} />}
      {active === 'Rang & Beförderungen' && <RankTab p={p} cfg={cfg} ranks={ranks} />}
      {active === 'Versetzungen' && <TransferTab p={p} cfg={cfg} />}
      {active === 'Ausbildungen' && <TrainingsTab p={p} />}
      {active === 'Prüfungen' && <ExamsTab p={p} />}
      {active === 'Auszeichnungen' && <AwardsTab p={p} cfg={cfg} />}
      {active === 'Verwarnungen' && <WarningsTab p={p} cfg={cfg} />}
      {active === 'Abwesenheiten' && <AbsencesTab p={p} cfg={cfg} />}
      {active === 'Dienstnummern' && <ServiceNumbersTab p={p} />}
      {active === 'Notizen' && <SimpleTab p={p} records={p.notes ?? []} type="NOTE" title="Notizen" label="Notiz" canAdd={can('personnel.edit')} canDelete={can('personnel.delete')} />}
      {active === 'Empfehlungen' && <SimpleTab p={p} records={p.recommendations} type="RECOMMENDATION" title="Empfehlungen" label="Empfehlung" canAdd={can('promotion.create')} canDelete={can('promotion.manage')} />}
      {active === 'Historie' && <HistoryTab p={p} />}
      {active !== 'Übersicht' && !visible.includes('Übersicht') && editCard}

      <ConfirmDialog open={del} danger title="Personalakte löschen" busy={remove.isPending} confirmLabel="Endgültig löschen" onClose={() => setDel(false)} onConfirm={() => remove.mutate()}
        message={<>Die Personalakte von <b>{p.name}</b> wird mit allen Einträgen gelöscht. Eine Dienstnummer wird nach Einstellung des Nummernkreises freigegeben. {remove.error ? <span role="alert" className="block text-danger">{errText(remove.error)}</span> : null}</>} />
    </div>
  );
}

const Item = ({ label, children }: { label: string; children: ReactNode }) => <div className="flex gap-2"><dt className="w-28 shrink-0 text-muted">{label}</dt><dd className="min-w-0">{children}</dd></div>;

// ───────────── Bearbeiten (automatisch gespeichert) ─────────────
interface Draft { department: string; status: string; joinDate: string; callsign: string }
function EditCard({ p, cfg }: { p: Profile; cfg: HrConfig | undefined }) {
  const qc = useQueryClient();
  const key = `personnel:${p.id}`;
  const [base] = useState<Draft>(() => ({ department: p.department ?? '', status: p.status ?? '', joinDate: day(p.joinDate), callsign: p.callsign ?? '' }));
  const [d, setD] = useState<Draft>(() => {
    const pend = pendingBody<Partial<Record<keyof Draft, string | null>>>(key);
    return pend ? { ...base, ...Object.fromEntries(Object.entries(pend).map(([k, v]) => [k, v ?? ''])) } : base;
  });
  useEffect(() => onSaved(key, () => { void qc.invalidateQueries({ queryKey: ['hr-profile', p.id] }); void qc.invalidateQueries({ queryKey: ['hr-people'] }); }), [key, qc, p.id]);
  // nur geänderte Felder senden – ausgeblendete (geschützte) Felder bleiben unberührt
  useAutosaveDraft<Draft>(key, d, (x) => {
    const body: Record<string, string | null> = {};
    if (x.department !== base.department) body.department = x.department || null;
    if (x.status !== base.status && x.status) body.status = x.status;
    if (x.joinDate !== base.joinDate && x.joinDate) body.joinDate = x.joinDate;
    if (x.callsign !== base.callsign) body.callsign = x.callsign.trim() || null;
    return Object.keys(body).length ? { method: 'PATCH', path: `/hr/people/${p.id}`, body, label: 'Personalakte' } : null;
  });
  return (
    <Card title="Bearbeiten" actions={<SaveStatus />}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Abteilung<Select aria-label="Abteilung" value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })}><option value="">– keine –</option>{(cfg?.departments ?? []).map((x) => <option key={x.id}>{x.name}</option>)}{d.department && !cfg?.departments.some((x) => x.name === d.department) && <option>{d.department}</option>}</Select></label>
        <label className="grid gap-1 text-sm">Status<Select aria-label="Status" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value })}>{!d.status && <option value="">—</option>}{(cfg?.statuses ?? []).filter((x) => x.active || x.key === d.status).map((x) => <option key={x.key} value={x.key}>{x.emoji} {x.label}</option>)}</Select></label>
        <label className="grid gap-1 text-sm">Eintrittsdatum<Input type="date" aria-label="Eintrittsdatum" value={d.joinDate} onChange={(e) => setD({ ...d, joinDate: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Rufname<Input aria-label="Rufname" maxLength={16} value={d.callsign} onChange={(e) => setD({ ...d, callsign: e.target.value.toUpperCase() })} /></label>
      </div>
      <p className="mt-2 text-xs text-muted">Änderungen werden automatisch gespeichert. Den Rang ändert man über eine Beförderung.</p>
    </Card>
  );
}

// ───────────── Übersicht ─────────────
function OverviewTab({ p, cfg, edit }: { p: Profile; cfg: HrConfig | undefined; edit: ReactNode }) {
  const latest = [...(p.promotions ?? []), ...(p.transfers ?? []), ...(p.awards ?? []), ...(p.warnings ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const open = p.requests.filter((r) => ['OPEN', 'IN_REVIEW', 'APPROVED', 'DEFERRED'].includes(r.status));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Aktuell">
        <dl className="grid gap-1 text-sm">
          <Item label="Rang"><RankLabel name={p.rank} color={p.rankInfo?.color ?? null} icon={p.rankInfo?.icon ?? null} /></Item>
          <Item label="Im Rang seit">{fmtDate(p.rankSince)}</Item>
          {p.office && <Item label="Dienststelle">{p.office}</Item>}
          <Item label="Offene Anträge">{open.length ? open.map((r) => <span key={r.id} className="mr-2">{r.number} ({requestStatus(cfg, r.status).emoji} {requestStatus(cfg, r.status).label})</span>) : 'keine'}</Item>
        </dl>
        {p.next.length > 0 && <div className="mt-3 grid gap-2">{p.next.map((c) => <div key={c.rankId} className="text-sm"><p className="mb-1">Nächster Rang <b>{c.rankName}</b>: {c.met}/{c.total} Voraussetzungen</p><Bar value={c.total ? (c.met / c.total) * 100 : 100} tone={c.eligible ? 'bg-success' : 'bg-warning'} /></div>)}</div>}
      </Card>
      <Card title="Letzte Einträge">
        {latest.length ? <ul className="divide-y divide-line text-sm">{latest.map((r) => <li key={r.id} className="py-1.5"><Badge>{({ PROMOTION: 'Beförderung', TRANSFER: 'Versetzung', AWARD: 'Auszeichnung', WARNING: 'Verwarnung', DISCIPLINE: 'Verwarnung' } as Record<string, string>)[r.type] ?? r.type}</Badge> {r.summary} <span className="text-xs text-muted">· {fmtDate(r.createdAt)}</span></li>)}</ul> : <EmptyState text="Noch keine Einträge." />}
      </Card>
      {edit && <div className="lg:col-span-2">{edit}</div>}
    </div>
  );
}

// ───────────── Rang & Beförderungen ─────────────
function RequestList({ requests, cfg, label, link }: { requests: HrRequest[]; cfg: HrConfig | undefined; label: (r: HrRequest) => string; link?: boolean }) {
  if (!requests.length) return <EmptyState text="Keine Anträge." />;
  return (
    <ul className="divide-y divide-line text-sm">
      {requests.map((r) => { const s = requestStatus(cfg, r.status); return (
        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span><b>{r.number}</b> · {r.fromLabel ?? ''}{r.fromLabel ? ' → ' : '→ '}{r.toLabel ?? label(r)} <span className="text-xs text-muted">· {r.requesterName} · {fmtDate(r.createdAt)}</span></span>
          <span className="flex items-center gap-2"><Badge icon={s.emoji}>{s.label}</Badge>{link && <Link className="text-xs text-primary underline" to={`/promotions?req=${r.id}`}>öffnen</Link>}</span>
        </li>
      ); })}
    </ul>
  );
}

function CheckCard({ c, p }: { c: PromotionCheck; p: Profile }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const set = useMutation({ mutationFn: ({ req, value }: { req: string; value: boolean }) => api(`/hr/people/${p.id}/checks/${req}`, { method: 'PUT', body: { value } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['hr-profile', p.id] }) });
  const missing = c.results.filter((r) => !r.met);
  return (
    <div className="rounded-md border border-line p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">Nächster Rang: {c.rankName}</p><span className={c.eligible ? 'text-success' : 'text-warning'}>{c.eligible ? '🟢 BEFÖRDERUNG MÖGLICH' : '🟡 NOCH NICHT MÖGLICH'}</span></div>
      <div className="mb-2 flex items-center gap-2"><Bar value={c.total ? (c.met / c.total) * 100 : 100} tone={c.eligible ? 'bg-success' : 'bg-warning'} /><span className="shrink-0 text-xs text-muted">{c.met}/{c.total} erfüllt</span></div>
      {c.results.length ? (
        <ul className="grid gap-1">
          {c.results.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2">
              {r.manual && r.type === 'CUSTOM' && can('promotion.manage_requirements')
                ? <input type="checkbox" aria-label={`${r.label} abhaken`} checked={r.met} disabled={set.isPending} onChange={(e) => set.mutate({ req: r.id, value: e.target.checked })} />
                : <span aria-hidden>{r.met ? '✅' : '❌'}</span>}
              <span>{r.label}</span><span className="text-xs text-muted">{r.current} / {r.needed}</span><span className="sr-only">{r.met ? 'erfüllt' : 'nicht erfüllt'}</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-muted">Keine Voraussetzungen.</p>}
      {missing.length > 0 && <p className="mt-2 text-xs text-muted">Fehlt noch: {missing.map((r) => r.label).join(', ')}</p>}
      <Err e={set.error} />
    </div>
  );
}

function RankTab({ p, cfg, ranks }: { p: Profile; cfg: HrConfig | undefined; ranks: HrRank[] }) {
  const { can } = useAuth();
  const [req, setReq] = useState(false);
  const rankName = (rid: string) => ranks.find((r) => r.id === rid)?.name ?? rid;
  const promos = p.requests.filter((r) => r.kind === 'PROMOTION');
  return (
    <div className="grid gap-4">
      <Card title="🎖️ Beförderungen" actions={can('promotion.create') && <Button size="sm" onClick={() => setReq(true)}><Plus size={14} aria-hidden />Beförderung beantragen</Button>}>
        <dl className="grid gap-1 text-sm">
          <Item label="Aktueller Rang"><RankLabel name={p.rank} color={p.rankInfo?.color ?? null} icon={p.rankInfo?.icon ?? null} /></Item>
          <Item label="Im Rang seit">{fmtDate(p.rankSince)}</Item>
          {p.rankInfo?.description && <Item label="Beschreibung">{p.rankInfo.description}</Item>}
        </dl>
        {p.next.length > 0 && <div className="mt-3 grid gap-3 md:grid-cols-2">{p.next.map((c) => <CheckCard key={c.rankId} c={c} p={p} />)}</div>}
      </Card>
      <Card title="Anträge"><RequestList requests={promos} cfg={cfg} label={(r) => rankName(r.toValue)} link /></Card>
      {p.promotions !== null && (
        <Card title="Verlauf">
          {p.promotions.length ? (
            <ol className="relative grid gap-3 border-l border-line pl-4">
              {p.promotions.map((r) => { const d = r.data ?? {}; const approvers = strs(d.approvers); return (
                <li key={r.id} className="text-sm">
                  <span aria-hidden className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
                  <p className="font-medium">{str(d.from) ?? '—'} → {str(d.to) ?? r.summary}</p>
                  <p className="text-xs text-muted">{fmt(r.createdAt)}{str(d.requestNumber) ? ` · ${str(d.requestNumber)}` : ''}{str(d.executedBy) ? ` · durchgeführt von ${str(d.executedBy)}` : ` · ${r.createdByName}`}</p>
                  {approvers.length > 0 && <p className="text-xs text-muted">Genehmigt von: {approvers.join(', ')}</p>}
                  {str(d.reviewer) && <p className="text-xs text-muted">Geprüft von: {str(d.reviewer)}</p>}
                  {r.details && <p className="mt-1 whitespace-pre-wrap">{r.details}</p>}
                </li>
              ); })}
            </ol>
          ) : <EmptyState text="Noch keine Beförderungen." />}
        </Card>
      )}
      {req && <PromotionModal p={p} ranks={ranks} onClose={() => setReq(false)} />}
    </div>
  );
}

function PromotionModal({ p, ranks, onClose }: { p: Profile; ranks: HrRank[]; onClose: () => void }) {
  const qc = useQueryClient();
  const nextIds = new Set(p.next.map((c) => c.rankId));
  const active = ranks.filter((r) => r.active && r.id !== p.rankInfo?.id).sort((a, b) => a.position - b.position);
  const [d, setD] = useState({ to: p.next[0]?.rankId ?? '', reason: '', achievements: '', internalNote: '' });
  const save = useMutation({
    mutationFn: () => api<HrRequest>('/hr/requests', { method: 'POST', body: { kind: 'PROMOTION', personnelId: p.id, to: d.to, reason: d.reason.trim(), achievements: d.achievements.trim() || undefined, internalNote: d.internalNote.trim() || undefined } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-profile', p.id] }); onClose(); },
  });
  const check = p.next.find((c) => c.rankId === d.to);
  return (
    <Modal open title="Beförderung beantragen" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1 text-sm">Zielrang *<Select aria-label="Zielrang" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })}>
          <option value="">– wählen –</option>
          {nextIds.size > 0 && <optgroup label="Nächste Ränge">{active.filter((r) => nextIds.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}</optgroup>}
          <optgroup label={nextIds.size ? 'Weitere Ränge' : 'Ränge'}>{active.filter((r) => !nextIds.has(r.id)).map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}</optgroup>
        </Select></label>
        {check && <p className={`text-xs ${check.eligible ? 'text-success' : 'text-warning'}`}>{check.eligible ? '🟢' : '🟡'} {check.met}/{check.total} Voraussetzungen erfüllt</p>}
        <label className="grid gap-1 text-sm">Begründung *<Textarea aria-label="Begründung" required maxLength={2000} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Leistungen<Textarea aria-label="Leistungen" rows={3} maxLength={4000} value={d.achievements} onChange={(e) => setD({ ...d, achievements: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Interne Notiz<Textarea aria-label="Interne Notiz" rows={2} maxLength={2000} value={d.internalNote} onChange={(e) => setD({ ...d, internalNote: e.target.value })} /></label>
        <Err e={save.error} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!d.to || d.reason.trim().length < 3 || save.isPending}>Antrag stellen</Button></div>
      </form>
    </Modal>
  );
}

// ───────────── Versetzungen ─────────────
function TransferTab({ p, cfg }: { p: Profile; cfg: HrConfig | undefined }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState({ to: '', reason: '' });
  const save = useMutation({
    mutationFn: () => api('/hr/requests', { method: 'POST', body: { kind: 'TRANSFER', personnelId: p.id, to: d.to, reason: d.reason.trim() } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-profile', p.id] }); setOpen(false); setD({ to: '', reason: '' }); },
  });
  return (
    <div className="grid gap-4">
      <Card title="Versetzungen" actions={can('transfer.create') && <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} aria-hidden />Versetzung beantragen</Button>}>
        <RecordList records={p.transfers ?? []} empty="Noch keine Versetzungen." render={(r) => { const a = strs(r.data?.approvers); return <><p className="font-medium">{r.summary}</p>{r.details && <p className="whitespace-pre-wrap text-muted">{r.details}</p>}{a.length > 0 && <p className="text-xs text-muted">Genehmigt von: {a.join(', ')}</p>}</>; }} />
      </Card>
      <Card title="Anträge"><RequestList requests={p.requests.filter((r) => r.kind === 'TRANSFER')} cfg={cfg} label={(r) => r.toValue} /></Card>
      <Modal open={open} title="Versetzung beantragen" onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <label className="grid gap-1 text-sm">Neue Abteilung *<Select aria-label="Neue Abteilung" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })}><option value="">– wählen –</option>{(cfg?.departments ?? []).filter((x) => x.name !== p.department).map((x) => <option key={x.id}>{x.name}</option>)}</Select></label>
          <label className="grid gap-1 text-sm">Begründung<Textarea aria-label="Begründung" maxLength={2000} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></label>
          <Err e={save.error} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" disabled={!d.to || save.isPending}>Antrag stellen</Button></div>
        </form>
      </Modal>
    </div>
  );
}

// ───────────── Ausbildungen & Prüfungen ─────────────
function TrainingsTab({ p }: { p: Profile }) {
  const list = p.trainings ?? [];
  return (
    <Card title="Ausbildungen">
      {list.length ? (
        <ul className="divide-y divide-line text-sm">
          {list.map((t) => { const [label, tone] = TRAINING_STATUS[t.status] ?? [t.status, 'neutral' as Tone]; return (
            <li key={t.id} className="grid gap-1 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{t.training.name}</span><Badge tone={tone}>{label}</Badge></div>
              <code className="text-xs text-muted" aria-label={`Fortschritt ${t.progress} Prozent`}>{blocks(t.progress)}</code>
              <p className="text-xs text-muted">
                {t.completedAt && <>Abgeschlossen {fmtDate(t.completedAt)} · </>}{t.expiresAt && <>gültig bis {fmtDate(t.expiresAt)} · </>}
                {t.certificateNo && <Link className="text-primary underline" to={`/certificates/${t.certificateNo}`}>Zertifikat {t.certificateNo}</Link>}
              </p>
              {t.note && <p className="text-xs">{t.note}</p>}
            </li>
          ); })}
        </ul>
      ) : <EmptyState text="Noch keine Ausbildungen." />}
    </Card>
  );
}

function ExamsTab({ p }: { p: Profile }) {
  const list = p.exams ?? [];
  return (
    <Card title="Prüfungen">
      {list.length ? (
        <ul className="divide-y divide-line text-sm">
          {list.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{a.exam.title}</b> <span className="text-xs text-muted">· begonnen {fmt(a.startedAt)}{a.submittedAt ? ` · abgegeben ${fmt(a.submittedAt)}` : ''}</span></span>
              <span className="flex items-center gap-2">
                {a.score !== null && a.maxScore !== null && <span className="text-xs">{a.score}/{a.maxScore} Punkte{a.maxScore ? ` (${Math.round((a.score / a.maxScore) * 100)} %)` : ''}</span>}
                {a.passed === null ? <Badge>{EXAM_STATUS[a.status] ?? a.status}</Badge> : a.passed ? <Badge tone="success">✅ Bestanden</Badge> : <Badge tone="danger">❌ Nicht bestanden</Badge>}
              </span>
            </li>
          ))}
        </ul>
      ) : <EmptyState text="Noch keine Prüfungsversuche." />}
    </Card>
  );
}

// ───────────── Auszeichnungen ─────────────
function AwardsTab({ p, cfg }: { p: Profile; cfg: HrConfig | undefined }) {
  const { can } = useAuth();
  const { add, remove } = useRecordOps(p.id);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<HrRecord | null>(null);
  const [d, setD] = useState({ awardId: '', reason: '' });
  const awards = (cfg?.awards ?? []).filter((a) => a.active);
  return (
    <Card title="Auszeichnungen" actions={can('awards.create') && <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} aria-hidden />Auszeichnung verleihen</Button>}>
      <RecordList records={p.awards ?? []} empty="Noch keine Auszeichnungen." canDelete={can('awards.manage')} onDelete={setDel}
        render={(r) => <><p className="font-medium" style={{ color: str(r.data?.color) ?? undefined }}>{r.summary}</p>{r.details && <p className="whitespace-pre-wrap text-muted">{r.details}</p>}</>} />
      <Modal open={open} title="Auszeichnung verleihen" onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); add.mutate({ type: 'AWARD', awardId: d.awardId, summary: d.reason.trim() }, { onSuccess: () => { setOpen(false); setD({ awardId: '', reason: '' }); } }); }}>
          <label className="grid gap-1 text-sm">Auszeichnung *<Select aria-label="Auszeichnung" value={d.awardId} onChange={(e) => setD({ ...d, awardId: e.target.value })}><option value="">– wählen –</option>{awards.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}</Select></label>
          {awards.find((a) => a.id === d.awardId)?.description && <p className="text-xs text-muted">{awards.find((a) => a.id === d.awardId)?.description}</p>}
          <label className="grid gap-1 text-sm">Begründung *<Textarea aria-label="Begründung" maxLength={300} value={d.reason} onChange={(e) => setD({ ...d, reason: e.target.value })} /></label>
          <Err e={add.error} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" disabled={!d.awardId || d.reason.trim().length < 2 || add.isPending}>Verleihen</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={!!del} danger title="Auszeichnung entfernen" message={<>„{del?.summary}“ entfernen? {remove.error ? <span role="alert" className="block text-danger">{errText(remove.error)}</span> : null}</>} busy={remove.isPending} confirmLabel="Entfernen"
        onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })} />
    </Card>
  );
}

// ───────────── Verwarnungen ─────────────
const plusDays = (n: number) => (n ? new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10) : '');
function WarningsTab({ p, cfg }: { p: Profile; cfg: HrConfig | undefined }) {
  const { can } = useAuth();
  const { add, patch, remove } = useRecordOps(p.id);
  const sevs = cfg?.warningSeverities ?? [];
  const blank = () => ({ severity: sevs[0]?.key ?? '', category: '', summary: '', details: '', expiresAt: plusDays(sevs[0]?.defaultDays ?? 0) });
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(blank);
  const [del, setDel] = useState<HrRecord | null>(null);
  const [revoke, setRevoke] = useState<HrRecord | null>(null);
  const manage = can('warning.manage');
  const submit = () => add.mutate(
    { type: 'WARNING', severity: d.severity || undefined, category: d.category || undefined, summary: d.summary.trim(), details: d.details.trim() || undefined, expiresAt: d.expiresAt ? new Date(`${d.expiresAt}T23:59:59`).toISOString() : null },
    { onSuccess: () => { setOpen(false); setD(blank()); } },
  );
  return (
    <Card title="Verwarnungen" actions={can('warning.create') && <Button size="sm" onClick={() => { setD(blank()); setOpen(true); }}><Plus size={14} aria-hidden />Verwarnung erstellen</Button>}>
      {(p.warnings ?? []).length ? (
        <ul className="divide-y divide-line text-sm">
          {(p.warnings ?? []).map((w) => { const data = w.data ?? {}; const [stLabel, tone] = WARN_STATE[w.state ?? 'ACTIVE'] ?? ['Aktiv', 'danger' as Tone]; return (
            <li key={w.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2"><span style={{ color: str(data.color) ?? undefined }}>{str(data.emoji) ?? '⚠️'} {str(data.severityLabel) ?? str(data.severity) ?? 'Verwarnung'}</span><Badge tone={tone}>{stLabel}</Badge>{str(data.category) && <Badge>{str(data.category)}</Badge>}</p>
                <p className={`mt-1 font-medium ${w.state !== 'ACTIVE' ? 'text-muted line-through' : ''}`}>{w.summary}</p>
                {w.details && <p className="whitespace-pre-wrap text-muted">{w.details}</p>}
                <p className="mt-0.5 text-xs text-muted">{w.createdByName} · {fmt(w.createdAt)} · {w.expiresAt ? `läuft ab ${fmtDate(w.expiresAt)}` : 'kein Ablauf'}</p>
              </div>
              {manage && <div className="flex gap-1">
                {w.state === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setRevoke(w)}><Ban size={14} aria-hidden />Aufheben</Button>}
                <Button size="sm" variant="ghost" aria-label="Verwarnung löschen" onClick={() => setDel(w)}><Trash2 size={14} aria-hidden /></Button>
              </div>}
            </li>
          ); })}
        </ul>
      ) : <EmptyState text="Keine Verwarnungen." />}
      <Modal open={open} title="Verwarnung erstellen" onClose={() => setOpen(false)}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Schweregrad<Select aria-label="Schweregrad" value={d.severity} onChange={(e) => { const s = sevs.find((x) => x.key === e.target.value); setD({ ...d, severity: e.target.value, expiresAt: plusDays(s?.defaultDays ?? 0) }); }}>{sevs.map((s) => <option key={s.key} value={s.key}>{s.emoji} {s.label}</option>)}</Select></label>
            <label className="grid gap-1 text-sm">Kategorie<Select aria-label="Kategorie" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}><option value="">– keine –</option>{(cfg?.warningCategories ?? []).map((c) => <option key={c}>{c}</option>)}</Select></label>
          </div>
          <label className="grid gap-1 text-sm">Grund *<Input aria-label="Grund" maxLength={300} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Beschreibung<Textarea aria-label="Beschreibung" maxLength={5000} value={d.details} onChange={(e) => setD({ ...d, details: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Ablaufdatum<Input type="date" aria-label="Ablaufdatum" value={d.expiresAt} onChange={(e) => setD({ ...d, expiresAt: e.target.value })} /><span className="text-xs text-muted">Leer = läuft nicht ab. Vorgabe aus dem Schweregrad.</span></label>
          <Err e={add.error} />
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Abbrechen</Button><Button type="submit" disabled={d.summary.trim().length < 2 || add.isPending}>Erstellen</Button></div>
        </form>
      </Modal>
      <ConfirmDialog open={!!revoke} title="Verwarnung aufheben" confirmLabel="Aufheben" busy={patch.isPending} onClose={() => setRevoke(null)}
        onConfirm={() => revoke && patch.mutate({ rid: revoke.id, body: { status: 'REVOKED' } }, { onSuccess: () => setRevoke(null) })}
        message={<>„{revoke?.summary}“ aufheben? Sie bleibt in der Akte sichtbar, zählt aber nicht mehr. {patch.error ? <span role="alert" className="block text-danger">{errText(patch.error)}</span> : null}</>} />
      <ConfirmDialog open={!!del} danger title="Verwarnung löschen" confirmLabel="Löschen" busy={remove.isPending} onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })}
        message={<>„{del?.summary}“ endgültig löschen? {remove.error ? <span role="alert" className="block text-danger">{errText(remove.error)}</span> : null}</>} />
    </Card>
  );
}

// ───────────── Abwesenheiten, Dienstnummern ─────────────
function AbsencesTab({ p, cfg }: { p: Profile; cfg: HrConfig | undefined }) {
  const list = p.absences ?? [];
  const type = (k: string | null) => { const t = cfg?.absenceTypes.find((x) => x.key === k); return t ? `${t.emoji} ${t.label}`.trim() : k ?? '—'; };
  return (
    <Card title="Abwesenheiten" className="overflow-x-auto">
      {list.length ? (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Zeitraum</th><th className="p-2">Typ</th><th className="p-2">Status</th><th className="p-2">Grund</th><th className="p-2">Genehmiger</th></tr></thead>
          <tbody>{list.map((a) => (
            <tr key={a.id} className="border-b border-line/50">
              <td className="p-2 whitespace-nowrap">{fmtDate(a.startsAt)} – {fmtDate(a.endsAt)}</td><td className="p-2">{type(a.type)}</td><td className="p-2"><StatusBadge status={a.status} /></td>
              <td className="p-2">{a.reason ?? <span className="text-muted">—</span>}</td><td className="p-2">{a.decidedByName ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <EmptyState text="Keine Abwesenheiten." />}
    </Card>
  );
}

function ServiceNumbersTab({ p }: { p: Profile }) {
  const list = p.serviceNumbers ?? [];
  return (
    <Card title="Dienstnummern">
      {list.length ? (
        <ul className="divide-y divide-line text-sm">{list.map((e) => (
          <li key={e.id} className="py-2"><b>{e.display}</b>{e.oldDisplay && <span className="text-muted"> (vorher {e.oldDisplay})</span>} · {DN_ACTION[e.action] ?? e.action}{e.reason && <span className="text-muted"> · {e.reason}</span>} <span className="text-xs text-muted">· {fmt(e.createdAt)}</span></li>
        ))}</ul>
      ) : <EmptyState text="Keine Dienstnummer-Ereignisse." />}
    </Card>
  );
}

// ───────────── Notizen, Empfehlungen ─────────────
function SimpleTab({ p, records, type, title, label, canAdd, canDelete }: { p: Profile; records: HrRecord[]; type: 'NOTE' | 'RECOMMENDATION'; title: string; label: string; canAdd: boolean; canDelete: boolean }) {
  const { remove } = useRecordOps(p.id);
  const [del, setDel] = useState<HrRecord | null>(null);
  return (
    <Card title={title}>
      {canAdd && <AddSimpleRecord id={p.id} type={type} label={label} />}
      <RecordList records={records} empty={`Keine ${title}.`} canDelete={canDelete} onDelete={setDel} />
      <ConfirmDialog open={!!del} danger title={`${label} löschen`} confirmLabel="Löschen" busy={remove.isPending} onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id, { onSuccess: () => setDel(null) })}
        message={<>„{del?.summary}“ löschen? {remove.error ? <span role="alert" className="block text-danger">{errText(remove.error)}</span> : null}</>} />
    </Card>
  );
}

// ───────────── Historie ─────────────
function HistoryTab({ p }: { p: Profile }) {
  const list = p.history ?? [];
  const json = (v: unknown) => JSON.stringify(v, null, 2);
  return (
    <Card title="Historie">
      {list.length ? (
        <ul className="divide-y divide-line text-sm">{list.map((h) => (
          <li key={h.id} className="py-2">
            <p><code className="text-xs">{h.action}</code> · {h.actor} <span className="text-xs text-muted">· {fmt(h.at)}</span></p>
            {h.reason && <p className="text-xs text-muted">Grund: {h.reason}</p>}
            {(h.before != null || h.after != null) && (
              <details className="mt-1"><summary className="cursor-pointer text-xs text-muted">Änderungen anzeigen</summary>
                <div className="mt-1 grid gap-2 md:grid-cols-2">
                  {h.before != null && <div><p className="text-xs text-muted">Vorher</p><pre className="max-h-64 overflow-auto rounded bg-panel-2 p-2 text-xs">{json(h.before)}</pre></div>}
                  {h.after != null && <div><p className="text-xs text-muted">Nachher</p><pre className="max-h-64 overflow-auto rounded bg-panel-2 p-2 text-xs">{json(h.after)}</pre></div>}
                </div>
              </details>
            )}
          </li>
        ))}</ul>
      ) : <EmptyState text="Keine Einträge." />}
    </Card>
  );
}
