import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Link2, Plus, Unlink } from 'lucide-react';
import { CASE_LINK_LABEL, CASE_LINK_ROLES, CASE_LINK_TYPES, CASE_STATUSES, CASE_STATUS_LABEL, type CaseLinkType, type CaseStatus } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../../components/ui';
import { dt } from './common';

interface CaseRow { id: string; number: string; title: string; status: CaseStatus; statusLabel: string; createdAt: string; updatedAt: string; links: number; mergedIntoId: string | null }
interface LinkRow { id: string; entityType: CaseLinkType; typeLabel: string; entityId: string | null; role: string | null; note: string | null; label: string; visible: boolean; gone: boolean; status: string | null; occurredAt: string | null; addedAt: string; addedBy: string; removedAt: string | null; removedBy: string | null; removeReason: string | null }
interface CaseDetail { id: string; number: string; title: string; description: string | null; status: CaseStatus; statusLabel: string; version: number; createdAt: string; createdBy: string; mergedIntoId: string | null; links: LinkRow[]; removedLinks: LinkRow[]; events: { at: string; kind: string; text: string; actor: string | null; source: string }[] }
interface Dup { a: { id: string; number: string; title: string }; b: { id: string; number: string; title: string }; strength: 'STRONG' | 'WEAK'; reasons: string[] }

/** Wohin ein verknüpfter Datensatz im Dashboard führt. */
const hrefFor = (t: CaseLinkType, id: string) => ({
  INCIDENT: `/cad/incidents?id=${id}`, CALL: `/cad/calls?id=${id}`, REPORT: `/reports/${id}`, WANTED: `/wanted/${id}`, PERSON: `/persons/${id}`, VEHICLE: `/vehicles/${id}`,
  TICKET: null, COMPLAINT: `/complaints/${id}`, UNIT: '/cad/units', OFFICER: `/personnel/${id}`, HR_REQUEST: '/promotions', PERSONNEL_RECORD: null,
} as Record<CaseLinkType, string | null>)[t];

/** Suche je Datensatzart über die vorhandenen Listen (nur, was die Person sehen darf). Ohne Suche: ID eingeben. */
const SEARCH: Partial<Record<CaseLinkType, (q: string) => string>> = {
  INCIDENT: (q) => `/cad/incidents?q=${encodeURIComponent(q)}`, CALL: () => '/cad/calls?status=ALL', REPORT: (q) => `/reports?q=${encodeURIComponent(q)}&pageSize=20`,
  WANTED: (q) => `/wanted?q=${encodeURIComponent(q)}&pageSize=20`, PERSON: (q) => `/persons?q=${encodeURIComponent(q)}&pageSize=20`, VEHICLE: (q) => `/vehicles?q=${encodeURIComponent(q)}&pageSize=20`,
  UNIT: () => '/cad/units', OFFICER: (q) => `/hr/people?q=${encodeURIComponent(q)}`, COMPLAINT: (q) => `/complaints?q=${encodeURIComponent(q)}&pageSize=20`,
};
type Any = Record<string, unknown>;
const rowsOf = (r: unknown): Any[] => (Array.isArray(r) ? r : ((r as Any).items ?? (r as Any).rows ?? []) as Any[]);
const labelOf = (x: Any) => [x.number ?? (x.callNumber ? `#${x.callNumber}` : null), x.title ?? x.reason ?? x.robloxUsername ?? x.plate ?? x.callsign ?? x.name ?? x.category ?? x.description].filter(Boolean).join(' · ');

export function CasesPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('Vorgänge');
  const [f, setF] = useState({ q: '', incidentNumber: '', status: '', from: '', to: '' });
  const [creating, setCreating] = useState(false);
  const list = useQuery({ queryKey: ['cases', f], queryFn: () => api<{ items: CaseRow[]; total: number }>('/cases', { query: { ...f } }) });
  return (
    <>
      <PageHeader title="🗂️ Vorgänge" subtitle="Einsätze, Berichte, Fahndungen, Personen und Personalvorgänge unter einer Vorgangsnummer – Verknüpfungen nur ausdrücklich und nachvollziehbar."
        actions={can('cases.manage') && <Button onClick={() => setCreating(true)}><Plus size={14} />Neuer Vorgang</Button>} />
      {can('cases.manage') && <Tabs tabs={['Vorgänge', 'Mögliche Duplikate']} active={tab} onChange={setTab} />}
      {tab === 'Mögliche Duplikate' ? <Duplicates /> : (
        <Card>
          <div className="mb-3 grid gap-2 sm:grid-cols-5">
            <Input aria-label="Suche" placeholder="Nummer, Titel, verknüpfter Datensatz" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <Input aria-label="Einsatznummer" placeholder="Einsatznummer, z. B. E-2026-00012" value={f.incidentNumber} onChange={(e) => setF({ ...f, incidentNumber: e.target.value })} />
            <Select aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">alle Status</option>{CASE_STATUSES.map((s) => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}</Select>
            <Input aria-label="Angelegt ab" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            <Input aria-label="Angelegt bis" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </div>
          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.items.length ? <EmptyState text="Keine Vorgänge gefunden." /> : (
            <ul className="divide-y divide-line text-sm">{list.data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link to={`/cases/${c.id}`} className="font-medium underline">{c.number}</Link><span className="min-w-0 flex-1 truncate">{c.title}</span>
                <Badge tone={c.status === 'CLOSED' ? 'neutral' : 'info'}>{c.statusLabel}</Badge>{c.mergedIntoId && <Badge tone="warning">übernommen</Badge>}
                <span className="text-xs text-muted">{c.links} Verknüpfungen · geändert {dt(c.updatedAt)}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      )}
      {creating && <CreateCase onClose={() => setCreating(false)} />}
    </>
  );
}

function CreateCase({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const create = useMutation({ mutationFn: () => api<{ id: string }>('/cases', { body: { title: title.trim(), description: description.trim() || null } }), onSuccess: (r) => nav(`/cases/${r.id}`) });
  return (
    <Modal open title="Neuer Vorgang" onClose={onClose}>
      <form className="grid gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Input aria-label="Titel" placeholder="Titel, z. B. „Einbruchserie Innenstadt“" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea aria-label="Beschreibung" placeholder="Beschreibung (optional)" maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
        {create.error && <p role="alert" className="text-danger">{errText(create.error)}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={title.trim().length < 3 || create.isPending}>Anlegen</Button></div>
      </form>
    </Modal>
  );
}

export function CaseDetailPage() {
  const { id } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['case', id], queryFn: () => api<CaseDetail>(`/cases/${id}`) });
  const [linking, setLinking] = useState(false);
  const [unlink, setUnlink] = useState<LinkRow | null>(null);
  const [reason, setReason] = useState('');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['case', id] }); void qc.invalidateQueries({ queryKey: ['cases'] }); };
  const status = useMutation({ mutationFn: (s: CaseStatus) => api(`/cases/${id}`, { method: 'PATCH', body: { version: q.data!.version, status: s } }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => api(`/cases/${id}/links/${unlink!.id}`, { method: 'DELETE', body: { reason: reason.trim() } }), onSuccess: () => { setUnlink(null); setReason(''); refresh(); } });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error || !q.data) return <ErrorState error={q.error} />;
  const c = q.data;
  const manage = can('cases.manage') && !c.mergedIntoId;
  return (
    <>
      <Link to="/cases" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} />Vorgänge</Link>
      <PageHeader title={`🗂️ ${c.number} · ${c.title}`} subtitle={`Angelegt ${dt(c.createdAt)} von ${c.createdBy}`}
        actions={manage && <>
          <Select aria-label="Status" className="w-auto" value={c.status} onChange={(e) => status.mutate(e.target.value as CaseStatus)}>{CASE_STATUSES.map((s) => <option key={s} value={s}>{CASE_STATUS_LABEL[s]}</option>)}</Select>
          <Button onClick={() => setLinking(true)}><Link2 size={14} />Datensatz verknüpfen</Button>
        </>} />
      {c.mergedIntoId && <p className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">Dieser Vorgang wurde in einen anderen übernommen und ist schreibgeschützt. <Link className="underline" to={`/cases/${c.mergedIntoId}`}>Zum Vorgang</Link></p>}
      {status.error && <p role="alert" className="mb-2 text-sm text-danger">{errText(status.error)}</p>}
      {c.description && <p className="mb-3 whitespace-pre-wrap text-sm">{c.description}</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={`Verknüpfte Datensätze (${c.links.length})`}>
          {!c.links.length ? <EmptyState text="Noch nichts verknüpft." /> : (
            <ul className="divide-y divide-line text-sm">{c.links.map((l) => {
              const href = l.entityId ? hrefFor(l.entityType, l.entityId) : null;
              return (
                <li key={l.id} className="flex flex-wrap items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-muted">{l.typeLabel}{l.role ? ` · ${l.role}` : ''}{l.status ? ` · ${l.status}` : ''}</span>
                    <p className={l.visible ? '' : 'italic text-muted'}>{href ? <Link className="underline" to={href}>{l.label}</Link> : l.label}{l.gone && <Badge tone="warning">nicht mehr vorhanden</Badge>}</p>
                    <p className="text-[11px] text-muted">verknüpft {dt(l.addedAt)} von {l.addedBy}{l.note ? ` · ${l.note}` : ''}</p>
                  </div>
                  {manage && <Button size="sm" variant="ghost" aria-label={`Verknüpfung lösen: ${l.label}`} onClick={() => setUnlink(l)}><Unlink size={14} /></Button>}
                </li>
              );
            })}</ul>
          )}
          {c.removedLinks.length > 0 && (
            <details className="mt-3 text-sm"><summary className="cursor-pointer text-xs text-muted">Gelöste Verknüpfungen ({c.removedLinks.length})</summary>
              <ul className="mt-1 grid gap-1">{c.removedLinks.map((l) => <li key={l.id} className="text-xs text-muted line-through decoration-muted/40"><span className="no-underline">{l.typeLabel}: {l.label} – gelöst {dt(l.removedAt)} von {l.removedBy}: {l.removeReason}</span></li>)}</ul>
            </details>
          )}
        </Card>
        <Card title="Chronologische Ereignisübersicht">
          <ol className="grid gap-1.5 text-sm">{c.events.map((e, i) => (
            <li key={i} className="grid grid-cols-[7.5rem_1fr] gap-2"><span className="text-xs tabular-nums text-muted">{dt(e.at)}</span><span>{e.text}<span className="block text-[11px] text-muted">{e.source}{e.actor ? ` · ${e.actor}` : ''}</span></span></li>
          ))}</ol>
        </Card>
      </div>
      {linking && <LinkModal caseId={c.id} onClose={() => setLinking(false)} onDone={() => { setLinking(false); refresh(); }} />}
      <Modal open={!!unlink} title="Verknüpfung lösen" onClose={() => setUnlink(null)}>
        <form className="grid gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); remove.mutate(); }}>
          <p>{unlink?.typeLabel}: <b>{unlink?.label}</b></p>
          <p className="text-xs text-muted">Die Verknüpfung bleibt als „gelöst“ mit Begründung im Vorgang sichtbar.</p>
          <Input aria-label="Begründung" placeholder="Begründung (Pflicht)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          {remove.error && <p role="alert" className="text-danger">{errText(remove.error)}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setUnlink(null)}>Abbrechen</Button><Button variant="danger" disabled={reason.trim().length < 3 || remove.isPending}>Lösen</Button></div>
        </form>
      </Modal>
    </>
  );
}

function LinkModal({ caseId, onClose, onDone }: { caseId: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<CaseLinkType>('INCIDENT');
  const [term, setTerm] = useState('');
  const [entityId, setEntityId] = useState('');
  const [role, setRole] = useState('');
  const [note, setNote] = useState('');
  const search = SEARCH[type];
  const results = useQuery({ queryKey: ['case-link-search', type, term], queryFn: async () => rowsOf(await api(search!(term))).slice(0, 30), enabled: !!search });
  const add = useMutation({ mutationFn: () => api(`/cases/${caseId}/links`, { body: { entityType: type, entityId, role: role || null, note: note.trim() || null } }), onSuccess: onDone });
  const filtered = (results.data ?? []).filter((x) => !term || labelOf(x).toLowerCase().includes(term.toLowerCase()));
  return (
    <Modal open wide title="Datensatz verknüpfen" onClose={onClose}>
      <div className="grid gap-2 text-sm">
        <p className="text-xs text-muted">Wähle den Datensatz ausdrücklich aus. Es wird nie automatisch über ähnliche Namen verknüpft.</p>
        <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
          <Select aria-label="Art" value={type} onChange={(e) => { setType(e.target.value as CaseLinkType); setEntityId(''); }}>{CASE_LINK_TYPES.map((t) => <option key={t} value={t}>{CASE_LINK_LABEL[t]}</option>)}</Select>
          {search ? <Input aria-label="Suchen" placeholder="Suchen …" value={term} onChange={(e) => setTerm(e.target.value)} /> : <Input aria-label="ID des Datensatzes" placeholder="ID des Datensatzes" value={entityId} onChange={(e) => setEntityId(e.target.value.trim())} />}
        </div>
        {search && (
          <ul className="max-h-64 overflow-auto rounded border border-line">
            {results.isLoading ? <li className="p-2"><SkeletonRows rows={2} /></li> : !filtered.length ? <li className="p-2 text-xs text-muted">Keine Treffer.</li> : filtered.map((x) => (
              <li key={String(x.id)}><label className={`flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-panel-2 ${entityId === x.id ? 'bg-primary/10' : ''}`}><input type="radio" name="entity" checked={entityId === x.id} onChange={() => setEntityId(String(x.id))} />{labelOf(x) || String(x.id)}</label></li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <Input aria-label="Rolle" list="case-roles" placeholder="Rolle (optional), z. B. TATVERDÄCHTIG" maxLength={40} value={role} onChange={(e) => setRole(e.target.value)} />
          <datalist id="case-roles">{CASE_LINK_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          <Input aria-label="Notiz" placeholder="Notiz (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {add.error && <p role="alert" className="text-danger">{errText(add.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button disabled={!/^[0-9a-f-]{36}$/i.test(entityId) || add.isPending} onClick={() => add.mutate()}>Verknüpfen</Button></div>
      </div>
    </Modal>
  );
}

function Duplicates() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['case-duplicates'], queryFn: () => api<Dup[]>('/cases/duplicates') });
  const decide = useMutation({ mutationFn: (b: { keepId: string; otherId: string; decision: 'NOT_DUPLICATE' | 'MERGE' }) => api('/cases/duplicates/decide', { body: b }), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['case-duplicates'] }); void qc.invalidateQueries({ queryKey: ['cases'] }); } });
  return (
    <Card title="Mögliche Duplikate (zur Prüfung)">
      <p className="mb-2 text-xs text-muted">Vorschläge – nichts wird automatisch zusammengeführt. „Zusammenführen“ übernimmt die Verknüpfungen in den ersten Vorgang und schließt den zweiten mit Verweis. Ähnliche Personennamen allein führen nie zu einem Vorschlag.</p>
      {decide.error && <p role="alert" className="text-sm text-danger">{errText(decide.error)}</p>}
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState text="Keine möglichen Duplikate." /> : (
        <ul className="divide-y divide-line text-sm">{q.data.map((d) => (
          <li key={`${d.a.id}-${d.b.id}`} className="grid gap-1 py-2">
            <p><Badge tone={d.strength === 'STRONG' ? 'warning' : 'neutral'}>{d.strength === 'STRONG' ? 'deutlicher Hinweis' : 'schwacher Hinweis'}</Badge> <Link className="underline" to={`/cases/${d.a.id}`}>{d.a.number}</Link> {d.a.title} ↔ <Link className="underline" to={`/cases/${d.b.id}`}>{d.b.number}</Link> {d.b.title}</p>
            <ul className="text-xs text-muted">{d.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ keepId: d.a.id, otherId: d.b.id, decision: 'NOT_DUPLICATE' })}>Kein Duplikat</Button>
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ keepId: d.a.id, otherId: d.b.id, decision: 'MERGE' })}>{d.b.number} in {d.a.number} übernehmen</Button>
              <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ keepId: d.b.id, otherId: d.a.id, decision: 'MERGE' })}>{d.a.number} in {d.b.number} übernehmen</Button>
            </div>
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

/** Vorgänge zu einem Datensatz (für Detailseiten). */
export function CasesFor({ type, id }: { type: CaseLinkType; id: string }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['cases-for', type, id], queryFn: () => api<{ id: string; number: string; title: string; statusLabel: string }[]>(`/cases/for/${type}/${id}`), enabled: can('cases.view') });
  if (!can('cases.view') || !q.data?.length) return null;
  return <p className="text-xs">🗂️ Vorgänge: {q.data.map((c, i) => <span key={c.id}>{i ? ', ' : ''}<Link className="underline" to={`/cases/${c.id}`}>{c.number}</Link> {c.title} ({c.statusLabel})</span>)}</p>;
}
