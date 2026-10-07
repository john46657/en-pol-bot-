import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  HR_EVENTS, HR_EVENT_LABEL, REQUEST_STATUSES, REQUEST_STATUS_DEFAULT, REQUIREMENT_LABEL, REQUIREMENT_TYPES, hrConfigSchema, rankSchema,
  type HrConfig, type HrEvent, type Requirement, type RequirementType, type RequestStatus,
} from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { onSaved, pendingBody, useAutosaveDraft } from '../../lib/autosave';
import { fmtDate, requestStatus, useHrConfig, useRanks, type HrRank, type HrRequest, type HrRequestDetail } from '../../lib/hr';
import { Toggle } from '../../components/ApplicationSettings';
import { ChannelPicker, RolePicker } from '../../components/DiscordPickers';
import { SaveStatus } from '../../components/SaveStatus';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Forbidden, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, fmt, type Tone } from '../../components/ui';

// ───────────── Gemeinsame Bausteine ─────────────

interface Opt { id: string; label: string }
type Kind = 'PROMOTION' | 'TRANSFER';
const KIND_LABEL: Record<Kind, string> = { PROMOTION: 'Beförderung', TRANSFER: 'Versetzung' };
const STATUS_TONE: Record<RequestStatus, Tone> = { OPEN: 'warning', IN_REVIEW: 'info', APPROVED: 'success', REJECTED: 'danger', DEFERRED: 'neutral', EXECUTED: 'primary', CANCELLED: 'neutral' };
const DECISION_LABEL: Record<HrRequest['approvals'][number]['decision'], string> = { APPROVE: '✅ genehmigt', REJECT: '❌ abgelehnt', REVIEW: '🔵 in Prüfung genommen', DEFER: '⚫ zurückgestellt' };

const useDashRoles = () => useQuery({ queryKey: ['roles'], queryFn: () => api<{ id: string; name: string }[]>('/roles'), staleTime: 60_000, retry: false });

function StatusPill({ cfg, status }: { cfg: HrConfig | undefined; status: RequestStatus }) {
  const s = requestStatus(cfg, status);
  return <Badge tone={STATUS_TONE[status]} icon={s.emoji || undefined}>{s.label || REQUEST_STATUS_DEFAULT[status].label}</Badge>;
}

/** Mehrfachauswahl aus einer festen Liste (Dashboard-Rollen, Ränge). */
function MultiPick({ options, value, onChange, ariaLabel, disabled, max = 20 }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void; ariaLabel: string; disabled?: boolean; max?: number }) {
  const name = (id: string) => options.find((o) => o.id === id)?.label ?? 'Unbekannt';
  const rest = options.filter((o) => !value.includes(o.id));
  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">{value.map((id) => (
          <li key={id} className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs">
            <span>{name(id)}</span>
            {!disabled && <button type="button" aria-label={`${name(id)} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>}
          </li>
        ))}</ul>
      ) : disabled && <span className="text-xs text-muted">—</span>}
      {!disabled && value.length < max && rest.length > 0 && (
        <Select aria-label={ariaLabel} value="" onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
          <option value="">Hinzufügen…</option>
          {rest.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      )}
    </div>
  );
}

const Lbl = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <div className="grid content-start gap-1 text-sm"><span className="text-xs font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</div>
);
const ToggleRow = ({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) => (
  <div className="flex items-start justify-between gap-3 rounded-md border border-line p-2.5">
    <div className="text-sm"><p>{label}</p>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
    {disabled ? <span className="text-sm">{checked ? 'Ja' : 'Nein'}</span> : <Toggle checked={checked} onChange={onChange} label={label} />}
  </div>
);

// ───────────── Anträge ─────────────

interface Stats { byStatus: { kind: Kind; status: RequestStatus; count: number }[]; recent: { id: string; personnelId: string; name: string; summary: string; at: string }[] }
interface Filters { kind: '' | Kind; status: string; q: string; rank: string; department: string; from: string; to: string; requesterId: string; approverId: string }
const EMPTY_FILTERS: Filters = { kind: '', status: 'ACTIVE', q: '', rank: '', department: '', from: '', to: '', requesterId: '', approverId: '' };
const KPI_STATUSES: RequestStatus[] = ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DEFERRED', 'EXECUTED'];

function RequestsTab({ cfg, ranks }: { cfg: HrConfig | undefined; ranks: HrRank[] }) {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [f, setF] = useState<Filters>(EMPTY_FILTERS);
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setF((x) => (x.q === q.trim() ? x : { ...x, q: q.trim() })), 350); return () => clearTimeout(t); }, [q]);
  const stats = useQuery({ queryKey: ['hr-requests', 'stats'], queryFn: () => api<Stats>('/hr/requests/stats'), enabled: can('promotion.view') });
  const list = useQuery({ queryKey: ['hr-requests', 'list', f], queryFn: () => api<HrRequest[]>('/hr/requests', { query: { ...f } }) });
  // Antragsteller/Genehmiger aus allen bisher geladenen Anträgen sammeln (Filter sollen die Auswahl nicht verkleinern)
  const [users, setUsers] = useState<{ req: Record<string, string>; appr: Record<string, string> }>({ req: {}, appr: {} });
  useEffect(() => {
    if (!list.data) return;
    setUsers((u) => {
      const req = { ...u.req }, appr = { ...u.appr };
      for (const r of list.data) { req[r.requesterId] = r.requesterName; for (const a of r.approvals) appr[a.userId] = a.name; }
      return { req, appr };
    });
  }, [list.data]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));
  const count = (s: RequestStatus) => stats.data?.byStatus.filter((x) => x.kind === 'PROMOTION' && x.status === s).reduce((n, x) => n + x.count, 0) ?? 0;
  const openId = params.get('req');
  const open = (id: string | null) => { const p = new URLSearchParams(params); if (id) p.set('req', id); else p.delete('req'); setParams(p, { replace: !id }); };
  const sorted = (o: Record<string, string>) => Object.entries(o).sort((a, b) => a[1].localeCompare(b[1], 'de'));
  const dirty = JSON.stringify({ ...f, q: '' }) !== JSON.stringify({ ...EMPTY_FILTERS }) || !!q;

  return (
    <div className="grid gap-4">
      {can('promotion.view') && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {KPI_STATUSES.map((s) => {
            const st = requestStatus(cfg, s);
            return (
              <button key={s} type="button" onClick={() => setF({ ...f, kind: 'PROMOTION', status: s })} className="card border border-line p-3 text-left transition hover:border-primary" aria-label={`${st.label}: ${count(s)} Beförderungsanträge – filtern`}>
                <p className="text-xs text-muted"><span aria-hidden>{st.emoji} </span>{st.label}</p>
                <p className="mt-1 text-2xl font-semibold">{stats.isLoading ? '…' : count(s)}</p>
              </button>
            );
          })}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <Card title="Anträge" actions={dirty && <Button size="sm" variant="ghost" onClick={() => { setF(EMPTY_FILTERS); setQ(''); }}>Filter zurücksetzen</Button>}>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input aria-label="Mitarbeiter oder Antrag suchen" placeholder="Mitarbeiter, Antragsnummer, Begründung…" value={q} onChange={(e) => setQ(e.target.value)} />
            <Select aria-label="Art" value={f.kind} onChange={(e) => set('kind', e.target.value as Filters['kind'])}>
              <option value="">Alle Arten</option>
              {(can('promotion.view') || !can('transfer.view')) && <option value="PROMOTION">Beförderung</option>}
              {can('transfer.view') && <option value="TRANSFER">Versetzung</option>}
            </Select>
            <Select aria-label="Status" value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="">Alle Status</option>
              <option value="ACTIVE">Offene (Offen, In Prüfung, Zurückgestellt)</option>
              {REQUEST_STATUSES.map((s) => { const st = requestStatus(cfg, s); return <option key={s} value={s}>{st.emoji} {st.label}</option>; })}
            </Select>
            <Select aria-label="Rang" value={f.rank} onChange={(e) => set('rank', e.target.value)}>
              <option value="">Alle Ränge</option>
              {ranks.map((r) => <option key={r.id} value={r.id}>{r.icon ? `${r.icon} ` : ''}{r.name}</option>)}
            </Select>
            <Select aria-label="Abteilung" value={f.department} onChange={(e) => set('department', e.target.value)}>
              <option value="">Alle Abteilungen</option>
              {cfg?.departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
            </Select>
            <Select aria-label="Antragsteller" value={f.requesterId} onChange={(e) => set('requesterId', e.target.value)}>
              <option value="">Alle Antragsteller</option>
              {sorted(users.req).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </Select>
            <Select aria-label="Genehmiger" value={f.approverId} onChange={(e) => set('approverId', e.target.value)}>
              <option value="">Alle Genehmiger</option>
              {sorted(users.appr).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </Select>
            <div className="flex items-center gap-1">
              <Input type="date" aria-label="Zeitraum von" value={f.from} max={f.to || undefined} onChange={(e) => set('from', e.target.value)} />
              <span className="text-muted" aria-hidden>–</span>
              <Input type="date" aria-label="Zeitraum bis" value={f.to} min={f.from || undefined} onChange={(e) => set('to', e.target.value)} />
            </div>
          </div>
          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : !list.data?.length ? <EmptyState text="Keine Anträge gefunden." hint={dirty ? 'Filter anpassen oder zurücksetzen.' : undefined} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr className="border-b border-line">
                  <th className="px-2 py-2 font-medium">Antrag</th><th className="px-2 py-2 font-medium">Mitarbeiter</th><th className="px-2 py-2 font-medium">Änderung</th>
                  <th className="px-2 py-2 font-medium">Status</th><th className="px-2 py-2 font-medium">Antragsteller</th><th className="px-2 py-2 font-medium">Datum</th>
                </tr></thead>
                <tbody>{list.data.map((r) => (
                  <tr key={r.id} className="cursor-pointer border-b border-line/60 hover:bg-panel-2" onClick={() => open(r.id)}>
                    <td className="px-2 py-2"><button type="button" className="font-mono text-xs text-primary hover:underline" onClick={(e) => { e.stopPropagation(); open(r.id); }}>{r.number}</button><p className="text-xs text-muted">{KIND_LABEL[r.kind]}</p></td>
                    <td className="px-2 py-2">{r.personnel?.user.displayName ?? '—'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{r.fromLabel ?? '—'} <span className="text-muted">→</span> <b>{r.toLabel ?? r.toValue}</b></td>
                    <td className="px-2 py-2"><StatusPill cfg={cfg} status={r.status} /></td>
                    <td className="px-2 py-2">{r.requesterName}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</td>
                  </tr>
                ))}</tbody>
              </table>
              {list.data.length >= 500 && <p className="mt-2 text-xs text-muted">Es werden höchstens 500 Anträge angezeigt – bitte Filter nutzen.</p>}
            </div>
          )}
        </Card>
        {can('promotion.view') && (
          <Card title="🎖️ Kürzlich durchgeführte Beförderungen">
            {stats.isLoading ? <SkeletonRows rows={3} /> : !stats.data?.recent.length ? <p className="text-sm text-muted">Noch keine Beförderungen.</p> : (
              <ul className="grid gap-2">{stats.data.recent.map((r) => (
                <li key={r.id} className="rounded-md border border-line p-2 text-sm">
                  <Link to={`/personnel/${r.personnelId}`} className="font-medium text-primary hover:underline">{r.name}</Link>
                  <p className="text-xs text-muted">{r.summary}</p>
                  <p className="text-xs text-muted">{fmtDate(r.at)}</p>
                </li>
              ))}</ul>
            )}
          </Card>
        )}
      </div>
      {openId && <RequestDetail id={openId} cfg={cfg} onClose={() => open(null)} />}
    </div>
  );
}

type Decision = 'APPROVE' | 'REJECT' | 'REVIEW' | 'DEFER' | 'CANCEL';

function RequestDetail({ id, cfg, onClose }: { id: string; cfg: HrConfig | undefined; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hr-requests', 'detail', id], queryFn: () => api<HrRequestDetail>(`/hr/requests/${id}`), retry: false });
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string>();
  const [msg, setMsg] = useState<string>();
  const [confirmExec, setConfirmExec] = useState(false);
  const done = (m: string) => { setErr(undefined); setMsg(m); setComment(''); void qc.invalidateQueries({ queryKey: ['hr-requests'] }); void qc.invalidateQueries({ queryKey: ['hr-people'] }); };
  const decide = useMutation({
    mutationFn: (decision: Decision) => api(`/hr/requests/${id}/decide`, { body: { decision, comment: comment.trim() || undefined } }),
    onSuccess: (_d, decision) => done({ APPROVE: 'Genehmigung gespeichert.', REJECT: 'Antrag abgelehnt.', REVIEW: 'Antrag ist jetzt in Prüfung.', DEFER: 'Antrag zurückgestellt.', CANCEL: 'Antrag abgebrochen.' }[decision]),
    onError: (e) => { setMsg(undefined); setErr(errText(e)); },
  });
  const execute = useMutation({
    mutationFn: () => api(`/hr/requests/${id}/execute`, { method: 'POST' }),
    onSuccess: () => { setConfirmExec(false); done('Durchgeführt: Rang/Abteilung gesetzt, Rollen getauscht, Personalakte aktualisiert.'); },
    onError: (e) => { setConfirmExec(false); setMsg(undefined); setErr(errText(e)); },
  });
  const r = q.data;
  const run = (d: Decision) => {
    if ((d === 'REJECT' || d === 'DEFER') && !comment.trim()) { setErr('Bitte im Kommentarfeld eine Begründung angeben.'); return; }
    decide.mutate(d);
  };
  const approved = r?.approvals.filter((a) => a.decision === 'APPROVE') ?? [];
  const busy = decide.isPending || execute.isPending;
  const anyAction = !!r && (r.can.approve || r.can.reject || r.can.review || r.can.cancel || r.can.execute);

  return (
    <Modal open wide title={r ? `${KIND_LABEL[r.kind]} ${r.number}` : 'Antrag'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error || !r ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
        <div className="grid gap-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <Link to={`/personnel/${r.personnelId}`} className="text-base font-semibold text-primary hover:underline">{r.personnel?.user.displayName ?? 'Mitarbeiter'}</Link>
              <p className="text-muted">{r.fromLabel ?? '—'} <span aria-hidden>→</span><span className="sr-only">nach</span> <b className="text-fg">{r.toLabel ?? r.toValue}</b></p>
            </div>
            <StatusPill cfg={cfg} status={r.status} />
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div><dt className="text-xs text-muted">Antragsteller</dt><dd>{r.requesterName}</dd></div>
            <div><dt className="text-xs text-muted">Erstellt</dt><dd>{fmt(r.createdAt)}</dd></div>
            {r.executedAt && <div><dt className="text-xs text-muted">Durchgeführt</dt><dd>{fmt(r.executedAt)}</dd></div>}
            {r.decidedAt && <div><dt className="text-xs text-muted">Entschieden</dt><dd>{fmt(r.decidedAt)}</dd></div>}
            <div className="sm:col-span-2"><dt className="text-xs text-muted">Begründung</dt><dd className="whitespace-pre-wrap">{r.reason || '—'}</dd></div>
            {r.achievements && <div className="sm:col-span-2"><dt className="text-xs text-muted">Leistungen</dt><dd className="whitespace-pre-wrap">{r.achievements}</dd></div>}
            {r.internalNote !== null && <div className="sm:col-span-2"><dt className="text-xs text-muted">🔒 Interne Notiz</dt><dd className="whitespace-pre-wrap">{r.internalNote || '—'}</dd></div>}
            <div><dt className="text-xs text-muted">Anhänge</dt><dd>{r.attachments.length ? `📎 ${r.attachments.length}` : 'keine'}</dd></div>
          </dl>

          {r.check && (
            <section className="rounded-md border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Voraussetzungen für {r.check.rankName} ({r.check.met}/{r.check.total})</h3>
                <span className={r.check.eligible ? 'font-semibold text-success' : 'font-semibold text-warning'}>{r.check.eligible ? '🟢 BEFÖRDERUNG MÖGLICH' : '🟡 NOCH NICHT MÖGLICH'}</span>
              </div>
              {r.check.results.length ? (
                <ul className="grid gap-1">{r.check.results.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span aria-hidden>{x.met ? '✅' : '❌'}</span><span className="sr-only">{x.met ? 'erfüllt' : 'nicht erfüllt'}</span>
                    <span>{x.label || REQUIREMENT_LABEL[x.type]}</span>
                    <span className="text-xs text-muted">{x.current}{x.needed ? ` / ${x.needed}` : ''}{x.manual ? ' · manuell' : ''}</span>
                  </li>
                ))}</ul>
              ) : <p className="text-muted">Für diesen Rang sind keine Voraussetzungen hinterlegt.</p>}
            </section>
          )}

          <section className="rounded-md border border-line p-3">
            <h3 className="mb-2 font-semibold">Genehmigung ({approved.length}/{r.needed})</h3>
            {r.stages.length > 0 && (
              <ol className="mb-2 flex flex-wrap gap-2">{r.stages.map((s, i) => {
                const ok = approved.some((a) => a.stage === s.id);
                const cur = r.next?.id === s.id;
                return <li key={s.id} className={`rounded border px-2 py-1 text-xs ${ok ? 'border-success/40 bg-success/10 text-success' : cur ? 'border-primary/40 bg-primary/10' : 'border-line text-muted'}`}>{ok ? '✓' : `${i + 1}.`} {s.name}{cur ? ' · aktuell' : ''}</li>;
              })}</ol>
            )}
            <div className="h-2 overflow-hidden rounded bg-line" role="progressbar" aria-label="Genehmigungsfortschritt" aria-valuemin={0} aria-valuemax={r.needed} aria-valuenow={Math.min(approved.length, r.needed)}>
              <div className="h-full bg-success" style={{ width: `${Math.min(100, (approved.length / Math.max(1, r.needed)) * 100)}%` }} />
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-semibold">Verlauf</h3>
            <ol className="grid gap-2 border-l border-line pl-3">
              <li><p>📝 Antrag gestellt von <b>{r.requesterName}</b></p><p className="text-xs text-muted">{fmt(r.createdAt)}</p></li>
              {r.approvals.map((a, i) => (
                <li key={`${a.userId}-${a.at}-${i}`}>
                  <p>{DECISION_LABEL[a.decision]} von <b>{a.name}</b>{a.stage ? <span className="text-muted"> · Stufe {r.stages.find((s) => s.id === a.stage)?.name ?? '?'}</span> : null}</p>
                  {a.comment && <p className="whitespace-pre-wrap text-muted">„{a.comment}“</p>}
                  <p className="text-xs text-muted">{fmt(a.at)}</p>
                </li>
              ))}
              {r.executedAt && <li><p>🎖️ Durchgeführt</p><p className="text-xs text-muted">{fmt(r.executedAt)}</p></li>}
            </ol>
          </section>

          {msg && <p role="status" className="rounded-md border border-success/40 bg-success/10 p-2 text-success">{msg}</p>}
          {err && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-2 text-danger">{err}</p>}
          {!r.can.approve && r.can.approveWhy && <p className="text-xs text-muted">ℹ️ Genehmigen nicht möglich: {r.can.approveWhy}</p>}

          {anyAction && (
            <div className="grid gap-2 border-t border-line pt-3">
              {(r.can.approve || r.can.reject || r.can.review) && (
                <Textarea aria-label="Kommentar" rows={2} maxLength={1000} placeholder="Kommentar (bei Ablehnen und Zurückstellen erforderlich)" value={comment} onChange={(e) => setComment(e.target.value)} />
              )}
              <div className="flex flex-wrap gap-2">
                {r.can.approve && <Button disabled={busy} onClick={() => run('APPROVE')}>✅ Genehmigen</Button>}
                {r.can.review && r.status !== 'IN_REVIEW' && <Button variant="secondary" disabled={busy} onClick={() => run('REVIEW')}>🔵 In Prüfung nehmen</Button>}
                {r.can.review && r.status !== 'DEFERRED' && <Button variant="secondary" disabled={busy} onClick={() => run('DEFER')}>⚫ Zurückstellen</Button>}
                {r.can.reject && <Button variant="danger" disabled={busy} onClick={() => run('REJECT')}>❌ Ablehnen</Button>}
                {r.can.execute && <Button disabled={busy} onClick={() => setConfirmExec(true)}>🎖️ Durchführen</Button>}
                {r.can.cancel && <Button variant="ghost" disabled={busy} onClick={() => run('CANCEL')}>Antrag abbrechen</Button>}
              </div>
            </div>
          )}
          <ConfirmDialog open={confirmExec} title={`${KIND_LABEL[r.kind]} durchführen?`} busy={execute.isPending} confirmLabel="Durchführen" onClose={() => setConfirmExec(false)} onConfirm={() => execute.mutate()}
            message={r.kind === 'PROMOTION'
              ? 'Rang setzen, Discord-Rolle tauschen, Personalakte aktualisieren, Mitarbeiter benachrichtigen.'
              : 'Abteilung setzen, Discord-Rollen tauschen, Personalakte aktualisieren, Mitarbeiter benachrichtigen.'} />
        </div>
      )}
    </Modal>
  );
}

// ───────────── Ränge ─────────────

type RankDraft = Omit<HrRank, 'id' | 'position'>;
const NEW_RANK: RankDraft = { name: '', description: null, icon: null, color: '#64748b', discordRoleIds: [], dashboardRoleIds: [], nextRankIds: [], approverRankIds: [], requirements: [], active: true };
const toDraft = (r: HrRank): RankDraft => ({ name: r.name, description: r.description, icon: r.icon, color: r.color, discordRoleIds: r.discordRoleIds, dashboardRoleIds: r.dashboardRoleIds, nextRankIds: r.nextRankIds, approverRankIds: r.approverRankIds, requirements: r.requirements, active: r.active });
const NUMERIC: RequirementType[] = ['MIN_DAYS_IN_RANK', 'MIN_DUTY_HOURS', 'MIN_INCIDENTS', 'RECOMMENDATION'];

function RanksTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const ranks = useRanks();
  const manage = can('promotion.manage_ranks');
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const [del, setDel] = useState<HrRank | null>(null);
  const [err, setErr] = useState<string>();
  useEffect(() => onSaved('hr-rank:', () => void qc.invalidateQueries({ queryKey: ['hr-ranks'] })), [qc]);
  const order = useMutation({
    mutationFn: (ids: string[]) => api('/hr/ranks/order', { method: 'PUT', body: { ids } }),
    onMutate: (ids) => { qc.setQueryData<HrRank[]>(['hr-ranks'], (l) => l && ids.map((id, i) => ({ ...l.find((r) => r.id === id)!, position: i }))); },
    onError: (e) => setErr(errText(e)),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['hr-ranks'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/hr/ranks/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDel(null); setErr(undefined); void qc.invalidateQueries({ queryKey: ['hr-ranks'] }); },
    onError: (e) => { setDel(null); setErr(errText(e)); },
  });
  const list = ranks.data ?? [];
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= list.length) return; const ids = list.map((r) => r.id); [ids[i], ids[j]] = [ids[j]!, ids[i]!]; order.mutate(ids); };
  const editing = edit && edit !== 'new' ? list.find((r) => r.id === edit) : undefined;

  return (
    <Card title="Ränge (von unten nach oben)" actions={manage && <Button size="sm" onClick={() => setEdit('new')}><Plus size={14} /> Rang anlegen</Button>}>
      {err && <p role="alert" className="mb-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{err}</p>}
      {ranks.isLoading ? <SkeletonRows /> : ranks.error ? <ErrorState error={ranks.error} onRetry={() => void ranks.refetch()} /> : !list.length ? <EmptyState text="Noch keine Ränge angelegt." /> : (
        <ol className="grid gap-2">{list.map((r, i) => (
          <li key={r.id} className={`flex flex-wrap items-center gap-3 rounded-md border border-line p-2.5 ${r.active ? '' : 'opacity-60'}`}>
            <span className="w-6 text-right text-xs text-muted">{i + 1}.</span>
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.icon && <span aria-hidden>{r.icon} </span>}{r.name}{!r.active && <span className="ml-2"><Badge>inaktiv</Badge></span>}</p>
              <p className="text-xs text-muted">{r.requirements.length} Voraussetzung(en){r.nextRankIds.length ? ` · weiter zu: ${r.nextRankIds.map((x) => list.find((o) => o.id === x)?.name ?? '?').join(', ')}` : ''}{r.description ? ` · ${r.description}` : ''}</p>
            </div>
            {manage ? (
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" aria-label={`${r.name} nach oben`} disabled={i === 0 || order.isPending} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`${r.name} nach unten`} disabled={i === list.length - 1 || order.isPending} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`${r.name} bearbeiten`} onClick={() => setEdit(r.id)}><Pencil size={14} /></Button>
                <Button size="sm" variant="ghost" aria-label={`${r.name} löschen`} onClick={() => setDel(r)}><Trash2 size={14} /></Button>
              </div>
            ) : <Button size="sm" variant="ghost" onClick={() => setEdit(r.id)}>Ansehen</Button>}
          </li>
        ))}</ol>
      )}
      {edit === 'new' && <RankEditor ranks={list} manage={manage} onClose={() => setEdit(null)} />}
      {editing && <RankEditor key={editing.id} rank={editing} ranks={list} manage={manage} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} danger title="Rang löschen?" busy={remove.isPending} confirmLabel="Löschen" onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)}
        message={`„${del?.name ?? ''}“ wird gelöscht. Ränge, die noch vergeben sind, können nicht gelöscht werden – stattdessen deaktivieren.`} />
    </Card>
  );
}

function RankEditor({ rank, ranks, manage, onClose }: { rank?: HrRank; ranks: HrRank[]; manage: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const key = rank ? `hr-rank:${rank.id}` : null;
  const [d, setD] = useState<RankDraft>(() => (key && pendingBody<RankDraft>(key)) || (rank ? toDraft(rank) : NEW_RANK));
  const [err, setErr] = useState<string>();
  const roles = useDashRoles();
  const needTrainings = d.requirements.some((r) => r.type === 'TRAINING');
  const needExams = d.requirements.some((r) => r.type === 'EXAM');
  const trainings = useQuery({ queryKey: ['hr-trainings', 'names'], queryFn: () => api<{ id: string; name: string }[]>('/hr/trainings'), enabled: needTrainings, retry: false, staleTime: 60_000 });
  const exams = useQuery({ queryKey: ['hr-exams', 'names'], queryFn: () => api<{ id: string; title: string }[]>('/hr/exams'), enabled: needExams, retry: false, staleTime: 60_000 });
  const parsed = rankSchema.safeParse(d);
  const problem = parsed.success ? undefined : parsed.error.issues[0] ? `${parsed.error.issues[0].path.join('.') || 'Eingabe'}: ${parsed.error.issues[0].message}` : 'Ungültige Eingabe';
  useAutosaveDraft(manage ? key : null, d, (x) => {
    const p = rankSchema.safeParse(x);
    return p.success && rank ? { method: 'PUT', path: `/hr/ranks/${rank.id}`, body: p.data, label: `Rang ${x.name}` } : null;
  });
  const create = useMutation({
    mutationFn: () => api<HrRank>('/hr/ranks', { body: rankSchema.parse(d) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-ranks'] }); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const set = <K extends keyof RankDraft>(k: K, v: RankDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setReq = (i: number, patch: Partial<Requirement>) => set('requirements', d.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const moveReq = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= d.requirements.length) return; const n = [...d.requirements]; [n[i], n[j]] = [n[j]!, n[i]!]; set('requirements', n); };
  const others: Opt[] = ranks.filter((r) => r.id !== rank?.id).map((r) => ({ id: r.id, label: `${r.icon ? `${r.icon} ` : ''}${r.name}` }));
  const roleOpts: Opt[] = (roles.data ?? []).map((r) => ({ id: r.id, label: r.name }));
  const ro = !manage;

  return (
    <Modal open wide title={rank ? `Rang: ${rank.name}` : 'Neuer Rang'} onClose={onClose}>
      <div className="grid gap-4">
        {rank && manage && <div className="flex items-center justify-between gap-2 text-xs text-muted"><span>Änderungen werden automatisch gespeichert.</span><SaveStatus /></div>}
        <div className="grid gap-3 sm:grid-cols-[1fr_90px_110px]">
          <Lbl label="Name *"><Input aria-label="Name" maxLength={64} disabled={ro} value={d.name} onChange={(e) => set('name', e.target.value)} /></Lbl>
          <Lbl label="Icon"><Input aria-label="Icon (Emoji)" maxLength={16} disabled={ro} placeholder="⭐" value={d.icon ?? ''} onChange={(e) => set('icon', e.target.value || null)} /></Lbl>
          <Lbl label="Farbe"><Input type="color" aria-label="Farbe" className="h-10 p-1" disabled={ro} value={d.color} onChange={(e) => set('color', e.target.value)} /></Lbl>
        </div>
        <Lbl label="Beschreibung"><Textarea aria-label="Beschreibung" rows={2} maxLength={500} disabled={ro} value={d.description ?? ''} onChange={(e) => set('description', e.target.value || null)} /></Lbl>
        <div className="grid gap-3 sm:grid-cols-2">
          <Lbl label="Discord-Rollen" hint="Werden bei der Beförderung vergeben bzw. entfernt."><RolePicker ariaLabel="Discord-Rollen" max={10} disabled={ro} value={d.discordRoleIds} onChange={(v) => set('discordRoleIds', v)} /></Lbl>
          <Lbl label="Dashboard-Rollen"><MultiPick ariaLabel="Dashboard-Rollen" max={10} disabled={ro} options={roleOpts} value={d.dashboardRoleIds} onChange={(v) => set('dashboardRoleIds', v)} /></Lbl>
          <Lbl label="Erlaubte Beförderung nach" hint="Leer = nächster Rang in der Reihenfolge."><MultiPick ariaLabel="Erlaubte Beförderung nach" disabled={ro} options={others} value={d.nextRankIds} onChange={(v) => set('nextRankIds', v)} /></Lbl>
          <Lbl label="Beförderung in diesen Rang genehmigen dürfen" hint="Leer = jeder mit dem Recht „Beförderung genehmigen“."><MultiPick ariaLabel="Genehmigende Ränge" disabled={ro} options={others} value={d.approverRankIds} onChange={(v) => set('approverRankIds', v)} /></Lbl>
        </div>
        <ToggleRow label="Rang aktiv" disabled={ro} checked={d.active} onChange={(v) => set('active', v)} hint="Inaktive Ränge können nicht mehr vergeben werden." />

        <section className="grid gap-2">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Voraussetzungen</h3>
            {!ro && d.requirements.length < 30 && <Button size="sm" variant="secondary" onClick={() => set('requirements', [...d.requirements, { id: crypto.randomUUID(), type: 'MIN_DAYS_IN_RANK', label: '', value: 0, ref: null }])}><Plus size={14} /> Voraussetzung</Button>}
          </div>
          {!d.requirements.length && <p className="text-sm text-muted">Keine Voraussetzungen – Beförderung jederzeit möglich.</p>}
          {d.requirements.map((r, i) => (
            <div key={r.id} className="grid gap-2 rounded-md border border-line p-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Select aria-label={`Voraussetzung ${i + 1}: Art`} disabled={ro} value={r.type} onChange={(e) => setReq(i, { type: e.target.value as RequirementType, ref: null, value: 0 })}>
                {REQUIREMENT_TYPES.map((t) => <option key={t} value={t}>{REQUIREMENT_LABEL[t]}</option>)}
              </Select>
              <Input aria-label={`Voraussetzung ${i + 1}: Bezeichnung`} disabled={ro} maxLength={120} placeholder="Bezeichnung (optional)" value={r.label} onChange={(e) => setReq(i, { label: e.target.value })} />
              <div>
                {NUMERIC.includes(r.type) && <Input type="number" min={0} max={100000} aria-label={`Voraussetzung ${i + 1}: Wert`} disabled={ro} value={r.value} onChange={(e) => setReq(i, { value: Math.max(0, Number(e.target.value) || 0) })} />}
                {r.type === 'TRAINING' && (trainings.error ? <Input aria-label={`Voraussetzung ${i + 1}: Ausbildungs-ID`} disabled={ro} value={r.ref ?? ''} onChange={(e) => setReq(i, { ref: e.target.value || null })} /> : (
                  <Select aria-label={`Voraussetzung ${i + 1}: Ausbildung`} disabled={ro} value={r.ref ?? ''} onChange={(e) => setReq(i, { ref: e.target.value || null })}>
                    <option value="">Ausbildung wählen…</option>
                    {r.ref && !trainings.data?.some((t) => t.id === r.ref) && <option value={r.ref}>Unbekannt</option>}
                    {trainings.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                ))}
                {r.type === 'EXAM' && (exams.error ? <Input aria-label={`Voraussetzung ${i + 1}: Prüfungs-ID`} disabled={ro} value={r.ref ?? ''} onChange={(e) => setReq(i, { ref: e.target.value || null })} /> : (
                  <Select aria-label={`Voraussetzung ${i + 1}: Prüfung`} disabled={ro} value={r.ref ?? ''} onChange={(e) => setReq(i, { ref: e.target.value || null })}>
                    <option value="">Prüfung wählen…</option>
                    {r.ref && !exams.data?.some((t) => t.id === r.ref) && <option value={r.ref}>Unbekannt</option>}
                    {exams.data?.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </Select>
                ))}
                {r.type === 'DISCORD_ROLE' && <RolePicker ariaLabel={`Voraussetzung ${i + 1}: Discord-Rolle`} max={1} disabled={ro} value={r.ref ? [r.ref] : []} onChange={(v) => setReq(i, { ref: v[0] ?? null })} />}
                {r.type === 'CUSTOM' && <span className="text-xs text-muted">Wird in der Personalakte manuell abgehakt.</span>}
              </div>
              {!ro && (
                <div className="flex items-start gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Voraussetzung ${i + 1} nach oben`} disabled={i === 0} onClick={() => moveReq(i, -1)}><ArrowUp size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Voraussetzung ${i + 1} nach unten`} disabled={i === d.requirements.length - 1} onClick={() => moveReq(i, 1)}><ArrowDown size={14} /></Button>
                  <Button size="sm" variant="ghost" aria-label={`Voraussetzung ${i + 1} entfernen`} onClick={() => set('requirements', d.requirements.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
                </div>
              )}
            </div>
          ))}
        </section>

        {manage && problem && <p role="alert" className="text-xs text-warning">Noch nicht gespeichert – bitte prüfen: {problem}</p>}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Schließen</Button>
          {!rank && manage && <Button disabled={!parsed.success || create.isPending} onClick={() => create.mutate()}>Anlegen</Button>}
        </div>
      </div>
    </Modal>
  );
}

// ───────────── Workflow & Benachrichtigungen ─────────────

type Stage = HrConfig['promotion']['stages'][number];
const VARIABLES = ['{mitglied}', '{name}', '{alter_rang}', '{neuer_rang}', '{begruendung}', '{durch}', '{datum}', '{antrag}'];

function StagesEditor({ value, onChange, roles, label }: { value: Stage[]; onChange: (v: Stage[]) => void; roles: Opt[]; label: string }) {
  const upd = (i: number, p: Partial<Stage>) => onChange(value.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= value.length) return; const n = [...value]; [n[i], n[j]] = [n[j]!, n[i]!]; onChange(n); };
  return (
    <div className="grid gap-2">
      {!value.length && <p className="text-sm text-muted">Keine Stufen – jede berechtigte Person kann genehmigen.</p>}
      {value.map((s, i) => (
        <div key={s.id} className="grid gap-2 rounded-md border border-line p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <Input aria-label={`${label}: Stufe ${i + 1} Name`} maxLength={60} placeholder={`Stufe ${i + 1}`} value={s.name} onChange={(e) => upd(i, { name: e.target.value })} />
          <MultiPick ariaLabel={`${label}: Stufe ${i + 1} Dashboard-Rollen`} options={roles} value={s.roleIds} onChange={(v) => upd(i, { roleIds: v })} />
          <div className="flex items-start gap-1">
            <Button size="sm" variant="ghost" aria-label={`Stufe ${i + 1} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label={`Stufe ${i + 1} nach unten`} disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
            <Button size="sm" variant="ghost" aria-label={`Stufe ${i + 1} entfernen`} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
          </div>
        </div>
      ))}
      {value.length < 10 && <div><Button size="sm" variant="secondary" onClick={() => onChange([...value, { id: crypto.randomUUID(), name: `Stufe ${value.length + 1}`, roleIds: [] }])}><Plus size={14} /> Stufe</Button></div>}
    </div>
  );
}

function WorkflowTab() {
  const qc = useQueryClient();
  const cfgQ = useHrConfig();
  const roles = useDashRoles();
  const [d, setD] = useState<HrConfig>();
  useEffect(() => { if (cfgQ.data && !d) setD(pendingBody<HrConfig>('hr-config') ?? cfgQ.data); }, [cfgQ.data, d]);
  useEffect(() => onSaved('hr-config', () => void qc.invalidateQueries({ queryKey: ['hr-config'] })), [qc]);
  const parsed = useMemo(() => (d ? hrConfigSchema.safeParse(d) : null), [d]);
  useAutosaveDraft('hr-config', d, (x) => (hrConfigSchema.safeParse(x).success ? { method: 'PUT', path: '/hr/config', body: x, label: 'Beförderungs-Einstellungen' } : null));
  if (cfgQ.isLoading || (!d && !cfgQ.error)) return <SkeletonRows />;
  if (cfgQ.error || !d) return <ErrorState error={cfgQ.error} onRetry={() => void cfgQ.refetch()} />;
  const roleOpts: Opt[] = (roles.data ?? []).map((r) => ({ id: r.id, label: r.name }));
  const p = d.promotion, t = d.transfer;
  const setP = (patch: Partial<HrConfig['promotion']>) => setD({ ...d, promotion: { ...p, ...patch } });
  const setT = (patch: Partial<HrConfig['transfer']>) => setD({ ...d, transfer: { ...t, ...patch } });
  const rule = (e: HrEvent) => d.notifications[e] ?? { dashboard: false, dm: false, channelId: null, roleIds: [] };
  const setRule = (e: HrEvent, patch: Partial<ReturnType<typeof rule>>) => setD({ ...d, notifications: { ...d.notifications, [e]: { ...rule(e), ...patch } } });
  const issue = parsed && !parsed.success ? parsed.error.issues[0] : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">Änderungen werden automatisch gespeichert.</p><SaveStatus />
      </div>
      {issue && <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">Nicht gespeichert – bitte prüfen: {issue.path.join(' › ')}: {issue.message}</p>}

      <Card title="🎖️ Beförderungen – Ablauf">
        <div className="grid gap-4">
          <Lbl label="Genehmigungsstufen" hint="Jede Stufe muss von einer Person mit einer der Rollen genehmigt werden (in dieser Reihenfolge).">
            <StagesEditor label="Beförderung" value={p.stages} roles={roleOpts} onChange={(v) => setP({ stages: v })} />
          </Lbl>
          <div className="grid gap-2 md:grid-cols-2">
            <Lbl label="Benötigte Genehmigungen" hint="Mindestens so viele wie Stufen."><Input type="number" min={1} max={10} aria-label="Benötigte Genehmigungen (Beförderung)" value={p.approvalsRequired} onChange={(e) => setP({ approvalsRequired: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></Lbl>
            <div />
            <ToggleRow label="Begründung erforderlich" checked={p.requireReason} onChange={(v) => setP({ requireReason: v })} />
            <ToggleRow label="Nur wenn alle Voraussetzungen erfüllt sind" checked={p.requireRequirements} onChange={(v) => setP({ requireRequirements: v })} />
            <ToggleRow label="Nach letzter Genehmigung automatisch durchführen" checked={p.autoExecute} onChange={(v) => setP({ autoExecute: v })} />
            <ToggleRow label="Discord-Rollen automatisch ändern" checked={p.discordRoles} onChange={(v) => setP({ discordRoles: v })} />
            <ToggleRow label="Dashboard-Rollen automatisch ändern" checked={p.dashboardRoles} onChange={(v) => setP({ dashboardRoles: v })} />
          </div>
        </div>
      </Card>

      <Card title="📣 Beförderungen – Ankündigung">
        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <Lbl label="Ankündigungskanal" hint="Leer = keine Ankündigung in Discord."><ChannelPicker ariaLabel="Ankündigungskanal Beförderungen" value={p.announceChannelId} onChange={(v) => setP({ announceChannelId: v })} /></Lbl>
          <Lbl label="Farbe"><Input type="color" aria-label="Farbe der Ankündigung" className="h-10 p-1" value={p.announceColor} onChange={(e) => setP({ announceColor: e.target.value })} /></Lbl>
          <div className="md:col-span-2">
            <Lbl label="Text der Ankündigung">
              <Textarea aria-label="Text der Ankündigung" rows={8} maxLength={2000} value={p.announceTemplate} onChange={(e) => setP({ announceTemplate: e.target.value })} />
              <div className="flex flex-wrap gap-1">{VARIABLES.map((v) => (
                <button key={v} type="button" className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted hover:text-fg" aria-label={`Platzhalter ${v} einfügen`} onClick={() => setP({ announceTemplate: (p.announceTemplate + v).slice(0, 2000) })}>{v}</button>
              ))}</div>
            </Lbl>
          </div>
        </div>
      </Card>

      <Card title="🏷️ Antragsstatus – Namen & Emojis">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {REQUEST_STATUSES.map((s) => {
            const cur = p.statusLabels[s] ?? REQUEST_STATUS_DEFAULT[s];
            const upd = (patch: Partial<typeof cur>) => setP({ statusLabels: { ...p.statusLabels, [s]: { ...cur, ...patch } } });
            return (
              <div key={s} className="grid grid-cols-[64px_1fr] gap-2 rounded-md border border-line p-2">
                <Input aria-label={`Emoji für ${REQUEST_STATUS_DEFAULT[s].label}`} maxLength={16} value={cur.emoji} onChange={(e) => upd({ emoji: e.target.value })} />
                <Input aria-label={`Bezeichnung für ${REQUEST_STATUS_DEFAULT[s].label}`} maxLength={40} placeholder={REQUEST_STATUS_DEFAULT[s].label} value={cur.label} onChange={(e) => upd({ label: e.target.value })} />
              </div>
            );
          })}
        </div>
        <div className="mt-2"><Button size="sm" variant="ghost" onClick={() => setP({ statusLabels: {} })}>Standardnamen wiederherstellen</Button></div>
      </Card>

      <Card title="🔀 Versetzungen">
        <div className="grid gap-4">
          <Lbl label="Genehmigungsstufen"><StagesEditor label="Versetzung" value={t.stages} roles={roleOpts} onChange={(v) => setT({ stages: v })} /></Lbl>
          <div className="grid gap-2 md:grid-cols-2">
            <Lbl label="Benötigte Genehmigungen"><Input type="number" min={1} max={10} aria-label="Benötigte Genehmigungen (Versetzung)" value={t.approvalsRequired} onChange={(e) => setT({ approvalsRequired: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })} /></Lbl>
            <Lbl label="Ankündigungskanal"><ChannelPicker ariaLabel="Ankündigungskanal Versetzungen" value={t.announceChannelId} onChange={(v) => setT({ announceChannelId: v })} /></Lbl>
            <ToggleRow label="Nach letzter Genehmigung automatisch durchführen" checked={t.autoExecute} onChange={(v) => setT({ autoExecute: v })} />
            <ToggleRow label="Discord-Rollen automatisch ändern" checked={t.discordRoles} onChange={(v) => setT({ discordRoles: v })} />
            <ToggleRow label="Dashboard-Rollen automatisch ändern" checked={t.dashboardRoles} onChange={(v) => setT({ dashboardRoles: v })} />
          </div>
        </div>
      </Card>

      <Card title="🔔 Benachrichtigungen">
        <div className="grid gap-2">
          {HR_EVENTS.map((e) => {
            const r = rule(e);
            return (
              <div key={e} className="grid gap-2 rounded-md border border-line p-2.5 lg:grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
                <p className="text-sm font-medium">{HR_EVENT_LABEL[e]}</p>
                <label className="flex items-center gap-2 text-xs text-muted">Dashboard <Toggle label={`${HR_EVENT_LABEL[e]}: Dashboard-Benachrichtigung`} checked={r.dashboard} onChange={(v) => setRule(e, { dashboard: v })} /></label>
                <label className="flex items-center gap-2 text-xs text-muted">DM <Toggle label={`${HR_EVENT_LABEL[e]}: Direktnachricht`} checked={r.dm} onChange={(v) => setRule(e, { dm: v })} /></label>
                <ChannelPicker ariaLabel={`${HR_EVENT_LABEL[e]}: Discord-Kanal`} value={r.channelId} onChange={(v) => setRule(e, { channelId: v })} />
                <MultiPick ariaLabel={`${HR_EVENT_LABEL[e]}: Dashboard-Rollen`} options={roleOpts} value={r.roleIds} onChange={(v) => setRule(e, { roleIds: v })} />
              </div>
            );
          })}
          <p className="text-xs text-muted">Dashboard-Rollen: wer die Benachrichtigung im Dashboard erhält. DM: Direktnachricht an den betroffenen Mitarbeiter.</p>
        </div>
      </Card>
    </div>
  );
}

// ───────────── Seite ─────────────

export function Promotions() {
  const { can } = useAuth();
  const cfg = useHrConfig();
  const ranks = useRanks();
  const tabs = [
    ...(can('promotion.view') || can('transfer.view') ? ['Anträge'] : []),
    ...(can('personnel.view') || can('promotion.manage_ranks') ? ['Ränge'] : []),
    ...(can('promotion.manage_settings') ? ['Workflow & Benachrichtigungen'] : []),
  ];
  const [tab, setTab] = useState(tabs[0] ?? '');
  const active = tabs.includes(tab) ? tab : tabs[0];
  if (!active) return <Forbidden />;
  return (
    <div>
      <PageHeader title="🎖️ Beförderungen" subtitle="Beförderungs- und Versetzungsanträge, Ränge und Ablauf" />
      <Tabs tabs={tabs} active={active} onChange={setTab} />
      <div className="mt-4">
        {active === 'Anträge' && <RequestsTab cfg={cfg.data} ranks={ranks.data ?? []} />}
        {active === 'Ränge' && <RanksTab />}
        {active === 'Workflow & Benachrichtigungen' && <WorkflowTab />}
      </div>
    </div>
  );
}
