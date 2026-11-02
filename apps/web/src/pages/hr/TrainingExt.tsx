import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { LEARNING_KIND_LABEL, LEARNING_KINDS, QUALIFICATION_STATUS_LABEL, scorePractical, type PracticalCriterion, type QualificationStatus } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea } from '../../components/ui';
import { ActivityTab, DocumentsTab, NotesTab, QUAL_TONE, QualificationsTab, ServiceTab, useFileSummary } from './PersonnelFileExt';

interface PersonOpt { id: string; name: string }
/** Personen-Auswahl: Personal-Übersicht (personnel.view) bzw. eigene Einheit (personnel.view_unit). */
function usePeople() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['people-options', can('personnel.view')],
    queryFn: async () => can('personnel.view') ? (await api<{ rows: PersonOpt[] }>('/hr/people')).rows : api<PersonOpt[]>('/personnel-file/my-unit'),
  });
}

// ═════════════ Meine Einheit (Führungskräfte) ═════════════
/** Personalübersicht der Einheiten, die man führt (inkl. Untereinheiten). Vererbung über das Organigramm. */
export function UnitPersonnelPage() {
  const q = useQuery({ queryKey: ['my-unit'], queryFn: () => api<{ id: string; name: string; robloxName: string | null; rank: string | null; department: string | null; status: string; serviceNumber: string | null; callsign: string | null; joinDate: string }[]>('/personnel-file/my-unit') });
  const [term, setTerm] = useState('');
  const rows = (q.data ?? []).filter((r) => !term || [r.name, r.rank, r.department, r.serviceNumber, r.robloxName].some((v) => v?.toLowerCase().includes(term.toLowerCase())));
  return (
    <>
      <PageHeader title="Meine Einheit" subtitle="Personalakten der Einheiten, die du führst oder stellvertretend führst – einschließlich aller Untereinheiten (Organigramm)." />
      <div className="mb-3 w-full sm:w-72"><Input aria-label="Suche" placeholder="🔍 Name, Rang, Abteilung…" value={term} onChange={(e) => setTerm(e.target.value)} /></div>
      <Card className="overflow-x-auto">
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !rows.length ? <EmptyState text="Keine zuständigen Personalakten." hint="Du bist im Organigramm keiner Einheit als Führung oder Stellvertretung eingetragen." /> : (
          <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Name</th><th className="p-2">Roblox</th><th className="p-2">Rang</th><th className="p-2">Abteilung</th><th className="p-2">Dienstnummer</th><th className="p-2">Status</th><th className="p-2">Eintritt</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-b border-line/60"><td className="p-2"><Link className="font-medium hover:underline" to={`/personnel/unit/${r.id}`}>{r.name}</Link></td><td className="p-2">{r.robloxName ?? '—'}</td><td className="p-2">{r.rank ?? '—'}</td><td className="p-2">{r.department ?? '—'}</td><td className="p-2">{r.serviceNumber ?? '—'}</td><td className="p-2">{r.status}</td><td className="p-2">{fmt(r.joinDate)}</td></tr>)}</tbody></table>
        )}
      </Card>
    </>
  );
}

export function UnitFilePage() {
  const { id = '' } = useParams();
  const s = useFileSummary(id);
  const [tab, setTab] = useState('Dienst & Organisation');
  if (s.isLoading) return <SkeletonRows rows={6} />;
  if (s.error || !s.data) return <ErrorState error={s.error} />;
  const tabs = ['Dienst & Organisation', 'Qualifikationen', ...(s.data.permissions.notes ? ['Vermerke'] : []), ...(s.data.permissions.documents ? ['Dokumente'] : []), ...(s.data.permissions.activity ? ['Aktivitäten'] : [])];
  return (
    <div className="grid gap-4">
      <PageHeader title="Personalakte (Einheit)" actions={<Link to="/personnel/unit" className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm text-muted hover:bg-panel-2"><ArrowLeft size={14} />Zur Einheit</Link>} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'Dienst & Organisation' && <ServiceTab s={s.data} />}
      {tab === 'Qualifikationen' && <QualificationsTab s={s.data} personnelId={id} />}
      {tab === 'Vermerke' && <NotesTab s={s.data} personnelId={id} />}
      {tab === 'Dokumente' && <DocumentsTab s={s.data} personnelId={id} />}
      {tab === 'Aktivitäten' && <ActivityTab personnelId={id} />}
    </div>
  );
}

// ═════════════ Qualifikationsregister ═════════════
interface Def { id: string; name: string; description: string | null; color: string | null; operational: boolean; validDays: number | null; autoGrant: boolean; active: boolean; trainingIds: string[]; examIds: string[]; _count: { records: number } }
interface RegRow { id: string; personnelId: string; personName: string; rank: string | null; name: string; status: QualificationStatus; sourceLabel: string; issuedAt: string | null; issuedBy: string | null; expiresAt: string | null; color: string | null }
export function QualificationRegistryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('Register');
  return (
    <>
      <PageHeader title="🎖️ Qualifikationen" subtitle="Register aller Qualifikationen mit Abschlussdatum, ausstellender Person und Status. Vergabe nur durch Berechtigte oder nach bestätigter Leistung (Ausbildung, Prüfung, praktische Prüfung)." />
      <Tabs tabs={['Register', ...(can('qualification.manage') ? ['Katalog'] : [])]} active={tab} onChange={setTab} />
      <div className="mt-3">{tab === 'Register' ? <Registry /> : <Catalog />}</div>
    </>
  );
}

function Registry() {
  const [f, setF] = useState({ q: '', status: '', definitionId: '', page: 1 });
  const defs = useQuery({ queryKey: ['qual-defs'], queryFn: () => api<Def[]>('/qualification-registry/definitions') });
  const q = useQuery({ queryKey: ['qual-reg', f], queryFn: () => api<{ total: number; page: number; pageSize: number; rows: RegRow[] }>('/qualification-registry', { query: { q: f.q || undefined, status: f.status || undefined, definitionId: f.definitionId || undefined, page: f.page } }) });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / (q.data?.pageSize ?? 50)));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="w-full sm:w-64"><Input aria-label="Suche" placeholder="🔍 Person oder Qualifikation…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value, page: 1 })} /></div>
        <Select aria-label="Status" className="w-44" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Alle Status</option>{Object.entries(QUALIFICATION_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        <Select aria-label="Qualifikation" className="w-56" value={f.definitionId} onChange={(e) => setF({ ...f, definitionId: e.target.value, page: 1 })}><option value="">Alle Qualifikationen</option>{(defs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      </div>
      <Card className="overflow-x-auto">
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} /> : !q.data?.rows.length ? <EmptyState text="Keine Einträge." /> : (
          <>
            <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Person</th><th className="p-2">Qualifikation</th><th className="p-2">Status</th><th className="p-2">Herkunft</th><th className="p-2">Abschluss</th><th className="p-2">Aussteller</th><th className="p-2">Gültig bis</th></tr></thead>
              <tbody>{q.data.rows.map((r) => <tr key={r.id} className="border-b border-line/60"><td className="p-2"><Link className="hover:underline" to={`/personnel/${r.personnelId}`}>{r.personName}</Link>{r.rank && <span className="block text-xs text-muted">{r.rank}</span>}</td><td className="p-2">{r.name}</td><td className="p-2"><Badge tone={QUAL_TONE[r.status]}>{QUALIFICATION_STATUS_LABEL[r.status]}</Badge></td><td className="p-2 text-xs">{r.sourceLabel}</td><td className="p-2 text-xs">{fmt(r.issuedAt)}</td><td className="p-2 text-xs">{r.issuedBy ?? '—'}</td><td className="p-2 text-xs">{r.expiresAt ? fmt(r.expiresAt) : 'unbegrenzt'}</td></tr>)}</tbody></table>
            <div className="mt-2 flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="ghost" disabled={f.page <= 1} onClick={() => setF({ ...f, page: f.page - 1 })}>Zurück</Button><span>{f.page}/{pages} · {q.data.total} Einträge</span><Button size="sm" variant="ghost" disabled={f.page >= pages} onClick={() => setF({ ...f, page: f.page + 1 })}>Weiter</Button></div>
          </>
        )}
      </Card>
    </>
  );
}

function Catalog() {
  const qc = useQueryClient();
  const defs = useQuery({ queryKey: ['qual-defs', 'all'], queryFn: () => api<Def[]>('/qualification-registry/definitions', { query: { all: '1' } }) });
  const trainings = useQuery({ queryKey: ['hr-trainings-opts'], queryFn: () => api<{ id: string; name: string }[]>('/hr/trainings') });
  const exams = useQuery({ queryKey: ['hr-exams-opts'], queryFn: () => api<{ id: string; title: string }[]>('/hr/exams').catch(() => []) });
  const [edit, setEdit] = useState<Def | 'new' | null>(null);
  return (
    <Card title="Katalog" actions={<Button size="sm" onClick={() => setEdit('new')}><Plus size={14} />Qualifikation</Button>}>
      {defs.isLoading ? <SkeletonRows /> : !defs.data?.length ? <EmptyState text="Noch keine Qualifikationen angelegt." hint="Angelegt wird nur, was ihr tatsächlich vergebt – es gibt keine Vorgaben." /> : (
        <ul className="grid gap-2 text-sm">{defs.data.map((d) => (
          <li key={d.id} className={`flex flex-wrap items-center gap-2 rounded-md border border-line p-2 ${d.active ? '' : 'opacity-60'}`}>
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: d.color ?? '#1e40af' }} aria-hidden /><b>{d.name}</b>
            {d.operational && <Badge tone="info">Leitstelle/MDT</Badge>}{d.autoGrant ? <Badge tone="success">automatisch aktiv</Badge> : <Badge>mit Bestätigung</Badge>}{d.validDays && <Badge>{d.validDays} Tage</Badge>}
            <span className="text-xs text-muted">{d._count.records} aktiv · {d.trainingIds.length} Ausbildungen · {d.examIds.length} Prüfungen verknüpft</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setEdit(d)}>Bearbeiten</Button>
          </li>))}</ul>
      )}
      {edit && <DefForm def={edit === 'new' ? null : edit} trainings={trainings.data ?? []} exams={Array.isArray(exams.data) ? exams.data : []} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void qc.invalidateQueries({ queryKey: ['qual-defs'] }); }} />}
    </Card>
  );
}

function DefForm({ def, trainings, exams, onClose, onDone }: { def: Def | null; trainings: { id: string; name: string }[]; exams: { id: string; title: string }[]; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState({ name: def?.name ?? '', description: def?.description ?? '', color: def?.color ?? '#1e40af', operational: def?.operational ?? true, validDays: def?.validDays ?? '', autoGrant: def?.autoGrant ?? false, active: def?.active ?? true, trainingIds: def?.trainingIds ?? [], examIds: def?.examIds ?? [] });
  const m = useMutation({ mutationFn: () => api(def ? `/qualification-registry/definitions/${def.id}` : '/qualification-registry/definitions', { method: def ? 'PUT' : 'POST', body: { ...v, description: v.description || null, validDays: v.validDays === '' ? null : Number(v.validDays) } }), onSuccess: onDone });
  const toggle = (k: 'trainingIds' | 'examIds', id: string) => setV({ ...v, [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] });
  return (
    <Modal open wide title={def ? 'Qualifikation bearbeiten' : 'Neue Qualifikation'} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Name<Input value={v.name} maxLength={80} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Farbe<Input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Beschreibung<Textarea value={v.description} maxLength={1000} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Gültigkeit (Tage, leer = unbegrenzt)<Input type="number" min={1} max={3650} value={v.validDays} onChange={(e) => setV({ ...v, validDays: e.target.value })} /></label>
        <div className="grid gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.operational} onChange={(e) => setV({ ...v, operational: e.target.checked })} />In Leitstelle/MDT anzeigen (einsatzrelevant)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.autoGrant} onChange={(e) => setV({ ...v, autoGrant: e.target.checked })} />Nach bestandener Leistung sofort aktiv (sonst Bestätigung nötig)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Aktiv</label>
        </div>
        <fieldset className="text-sm"><legend className="mb-1 text-muted">Wird erzeugt durch Ausbildung</legend><div className="grid max-h-40 gap-1 overflow-auto">{trainings.map((t) => <label key={t.id} className="flex gap-2"><input type="checkbox" checked={v.trainingIds.includes(t.id)} onChange={() => toggle('trainingIds', t.id)} />{t.name}</label>)}</div></fieldset>
        <fieldset className="text-sm"><legend className="mb-1 text-muted">… oder Theorieprüfung</legend><div className="grid max-h-40 gap-1 overflow-auto">{exams.map((t) => <label key={t.id} className="flex gap-2"><input type="checkbox" checked={v.examIds.includes(t.id)} onChange={() => toggle('examIds', t.id)} />{t.title}</label>)}</div></fieldset>
      </div>
      {m.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(m.error)}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.name.trim().length < 2 || m.isPending} onClick={() => m.mutate()}>Speichern</Button></div>
    </Modal>
  );
}

// ═════════════ Lernmaterial ═════════════
interface Material { id: string; title: string; kind: (typeof LEARNING_KINDS)[number]; body: string; published: boolean; trainingIds: string[]; version: number; updatedAt: string; mediaIds?: string[]; qualificationDefId?: string | null; examId?: string | null }
export function LearningMaterialsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ q: '', kind: '' });
  const list = useQuery({ queryKey: ['materials', f], queryFn: () => api<Material[]>('/training-ext/materials', { query: { q: f.q || undefined, kind: f.kind || undefined } }) });
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Material | 'new' | null>(null);
  const doc = useQuery({ queryKey: ['material', open], queryFn: () => api<Material>(`/training-ext/materials/${open}`), enabled: !!open });
  return (
    <>
      <PageHeader title="📘 Lernmaterial" subtitle="Lerninhalte, Regelwerke, interne Anleitungen, Bilder/Dokumente und Wissensabfragen – verknüpfbar mit Ausbildungen und Qualifikationen." actions={can('training.materials') ? <Button onClick={() => setEdit('new')}><Plus size={16} />Neu</Button> : undefined} />
      <div className="mb-3 flex flex-wrap gap-2"><div className="w-full sm:w-64"><Input aria-label="Suche" placeholder="🔍 Titel oder Inhalt…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div><Select aria-label="Art" className="w-48" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Alle Arten</option>{LEARNING_KINDS.map((k) => <option key={k} value={k}>{LEARNING_KIND_LABEL[k]}</option>)}</Select></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          {list.isLoading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} /> : !list.data?.length ? <EmptyState text="Kein Lernmaterial." /> : (
            <ul className="grid gap-1 text-sm">{list.data.map((m) => <li key={m.id}><button type="button" onClick={() => setOpen(m.id)} className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-panel-2 ${open === m.id ? 'bg-panel-2' : ''}`}><b>{m.title}</b> <Badge>{LEARNING_KIND_LABEL[m.kind]}</Badge>{!m.published && <Badge tone="warning">Entwurf</Badge>}</button></li>)}</ul>
          )}
        </Card>
        <Card title={doc.data?.title ?? 'Auswahl'} actions={doc.data && can('training.materials') ? <Button size="sm" variant="secondary" onClick={() => setEdit(doc.data!)}>Bearbeiten</Button> : undefined}>
          {!open ? <EmptyState text="Links ein Lernmaterial wählen." /> : doc.isLoading ? <SkeletonRows /> : doc.error ? <ErrorState error={doc.error} /> : <article className="whitespace-pre-wrap text-sm leading-relaxed">{doc.data?.body || '—'}<p className="mt-3 text-xs text-muted">Version {doc.data?.version} · zuletzt geändert {fmt(doc.data?.updatedAt)}</p></article>}
        </Card>
      </div>
      {edit && <MaterialForm m={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={(id) => { setEdit(null); setOpen(id); void qc.invalidateQueries({ queryKey: ['materials'] }); void qc.invalidateQueries({ queryKey: ['material'] }); }} />}
    </>
  );
}

function MaterialForm({ m, onClose, onDone }: { m: Material | null; onClose: () => void; onDone: (id: string) => void }) {
  const trainings = useQuery({ queryKey: ['hr-trainings-opts'], queryFn: () => api<{ id: string; name: string }[]>('/hr/trainings') });
  const [v, setV] = useState({ title: m?.title ?? '', kind: m?.kind ?? 'TEXT', body: m?.body ?? '', published: m?.published ?? false, trainingIds: m?.trainingIds ?? [] });
  const save = useMutation({ mutationFn: () => api<{ id: string }>(m ? `/training-ext/materials/${m.id}` : '/training-ext/materials', { method: m ? 'PUT' : 'POST', body: { ...v, mediaIds: m?.mediaIds ?? [], qualificationDefId: m?.qualificationDefId ?? null, examId: m?.examId ?? null, ...(m ? { version: m.version } : {}) } }), onSuccess: (r) => onDone(r.id) });
  const archive = useMutation({ mutationFn: () => api(`/training-ext/materials/${m!.id}/archive`, { method: 'POST' }), onSuccess: () => onDone('') });
  return (
    <Modal open wide title={m ? 'Lernmaterial bearbeiten' : 'Neues Lernmaterial'} onClose={onClose}>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Titel<Input value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">Art<Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Material['kind'] })}>{LEARNING_KINDS.map((k) => <option key={k} value={k}>{LEARNING_KIND_LABEL[k]}</option>)}</Select></label></div>
        <label className="grid gap-1 text-sm">Inhalt<Textarea rows={12} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></label>
        <fieldset className="text-sm"><legend className="mb-1 text-muted">Ausbildungen</legend><div className="flex flex-wrap gap-3">{(trainings.data ?? []).map((t) => <label key={t.id} className="flex gap-1"><input type="checkbox" checked={v.trainingIds.includes(t.id)} onChange={() => setV({ ...v, trainingIds: v.trainingIds.includes(t.id) ? v.trainingIds.filter((x) => x !== t.id) : [...v.trainingIds, t.id] })} />{t.name}</label>)}</div></fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.published} onChange={(e) => setV({ ...v, published: e.target.checked })} />Veröffentlicht (für alle mit Ausbildungs-Leserecht sichtbar)</label>
        {(save.error || archive.error) && <p role="alert" className="text-sm text-danger">{errText(save.error ?? archive.error)}</p>}
        <div className="flex justify-between gap-2">{m ? <Button variant="danger" onClick={() => archive.mutate()}>Archivieren</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.title.trim().length < 2 || save.isPending} onClick={() => save.mutate()}>Speichern</Button></div></div>
      </div>
    </Modal>
  );
}

// ═════════════ Praktische Prüfungen ═════════════
interface PExam { id: string; title: string; description: string | null; tasks: string | null; criteria: PracticalCriterion[]; passPoints: number; examinerIds: string[]; trainingId: string | null; qualificationDefId: string | null; active: boolean; _count?: { assessments: number } }
interface Assessment { id: string; examId: string; examTitle: string; personnelId: string; personName: string; examinerName: string; status: 'OPEN' | 'COMPLETED' | 'CANCELLED'; total: number | null; maxPoints: number | null; passed: boolean | null; startedAt: string; completedAt: string | null }
export function PracticalExamsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const exams = useQuery({ queryKey: ['practical'], queryFn: () => api<PExam[]>('/training-ext/practical', { query: { all: '1' } }) });
  const ass = useQuery({ queryKey: ['assessments'], queryFn: () => api<Assessment[]>('/training-ext/assessments'), enabled: can('exam.conduct') || can('exam.results') || can('exam.manage') });
  const [edit, setEdit] = useState<PExam | 'new' | null>(null);
  const [start, setStart] = useState<PExam | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <PageHeader title="🧪 Praktische Prüfungen" subtitle="Aufgaben und Kriterien festlegen, Prüflinge auswählen, je Kriterium bewerten, abschließen. Bewerten dürfen nur eingetragene Prüfer (oder exam.manage) – nie die eigene Prüfung." actions={can('exam.create') ? <Button onClick={() => setEdit('new')}><Plus size={16} />Neue Prüfung</Button> : undefined} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Prüfungen">
          {exams.isLoading ? <SkeletonRows /> : !exams.data?.length ? <EmptyState text="Noch keine praktischen Prüfungen." /> : (
            <ul className="grid gap-2 text-sm">{exams.data.map((e) => (
              <li key={e.id} className={`rounded-md border border-line p-2 ${e.active ? '' : 'opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-2"><b>{e.title}</b><Badge>{e.criteria.length} Kriterien</Badge><Badge tone="info">Bestehen ab {e.passPoints}/{e.criteria.reduce((n, c) => n + c.maxPoints, 0)}</Badge></div>
                <div className="mt-2 flex gap-2">{can('exam.conduct') && e.active && <Button size="sm" onClick={() => setStart(e)}>Prüfling prüfen</Button>}{can('exam.create') && <Button size="sm" variant="ghost" onClick={() => setEdit(e)}>Bearbeiten</Button>}</div>
              </li>))}</ul>
          )}
        </Card>
        <Card title="Bewertungen" className="overflow-x-auto">
          {ass.isLoading ? <SkeletonRows /> : ass.error ? <ErrorState error={ass.error} /> : !ass.data?.length ? <EmptyState text="Keine Bewertungen." /> : (
            <table className="w-full text-sm"><thead><tr className="border-b border-line text-left text-xs text-muted"><th className="p-2">Prüfling</th><th className="p-2">Prüfung</th><th className="p-2">Status</th><th className="p-2">Ergebnis</th><th className="p-2">Prüfer</th></tr></thead>
              <tbody>{ass.data.map((a) => <tr key={a.id} className="cursor-pointer border-b border-line/60 hover:bg-panel-2" onClick={() => setOpen(a.id)}><td className="p-2">{a.personName}</td><td className="p-2">{a.examTitle}</td><td className="p-2">{a.status === 'OPEN' ? <Badge tone="warning">Läuft</Badge> : a.status === 'CANCELLED' ? <Badge>Abgebrochen</Badge> : <Badge tone={a.passed ? 'success' : 'danger'}>{a.passed ? 'Bestanden' : 'Nicht bestanden'}</Badge>}</td><td className="p-2">{a.total !== null ? `${a.total}/${a.maxPoints}` : '—'}</td><td className="p-2 text-xs">{a.examinerName}</td></tr>)}</tbody></table>
          )}
        </Card>
      </div>
      {edit && <PracticalForm exam={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void qc.invalidateQueries({ queryKey: ['practical'] }); }} />}
      {start && <StartModal exam={start} onClose={() => setStart(null)} onDone={(id) => { setStart(null); setOpen(id); void qc.invalidateQueries({ queryKey: ['assessments'] }); }} />}
      {open && <AssessmentModal id={open} onClose={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ['assessments'] }); }} />}
    </>
  );
}

function PracticalForm({ exam, onClose, onDone }: { exam: PExam | null; onClose: () => void; onDone: () => void }) {
  const users = useQuery({ queryKey: ['users-min'], queryFn: () => api<{ items: { id: string; displayName: string }[] }>('/users', { query: { pageSize: 200 } }).then((r) => r.items).catch(() => []) });
  const defs = useQuery({ queryKey: ['qual-defs'], queryFn: () => api<{ id: string; name: string }[]>('/qualification-registry/definitions').catch(() => []) });
  const [v, setV] = useState({ title: exam?.title ?? '', description: exam?.description ?? '', tasks: exam?.tasks ?? '', passPoints: exam?.passPoints ?? 0, examinerIds: exam?.examinerIds ?? [], qualificationDefId: exam?.qualificationDefId ?? '', active: exam?.active ?? true, criteria: exam?.criteria ?? [{ id: 'k1', label: '', maxPoints: 10, required: false }] });
  const max = v.criteria.reduce((n, c) => n + (c.maxPoints || 0), 0);
  const m = useMutation({ mutationFn: () => api(exam ? `/training-ext/practical/${exam.id}` : '/training-ext/practical', { method: exam ? 'PUT' : 'POST', body: { ...v, description: v.description || null, tasks: v.tasks || null, qualificationDefId: v.qualificationDefId || null, trainingId: exam?.trainingId ?? null } }), onSuccess: onDone });
  const setC = (i: number, patch: Partial<PracticalCriterion>) => setV({ ...v, criteria: v.criteria.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <Modal open wide title={exam ? 'Praktische Prüfung bearbeiten' : 'Neue praktische Prüfung'} onClose={onClose}>
      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">Titel<Input value={v.title} maxLength={120} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Beschreibung<Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></label>
        <label className="grid gap-1 text-sm">Prüfungsaufgaben (Szenario, Ablauf)<Textarea value={v.tasks} onChange={(e) => setV({ ...v, tasks: e.target.value })} /></label>
        <fieldset className="grid gap-2 text-sm"><legend className="mb-1 text-muted">Bewertungskriterien</legend>
          {v.criteria.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Input aria-label="Kriterium" className="min-w-48 flex-1" placeholder="Kriterium" value={c.label} onChange={(e) => setC(i, { label: e.target.value })} />
              <Input aria-label="Höchstpunkte" type="number" className="w-24" min={1} max={100} value={c.maxPoints} onChange={(e) => setC(i, { maxPoints: Number(e.target.value) })} />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!c.required} onChange={(e) => setC(i, { required: e.target.checked })} />Pflicht</label>
              {c.required && <Input aria-label="Mindestpunkte" type="number" className="w-24" min={0} max={c.maxPoints} placeholder="min." value={c.minPoints ?? ''} onChange={(e) => setC(i, { minPoints: e.target.value === '' ? undefined : Number(e.target.value) })} />}
              <Button size="sm" variant="ghost" disabled={v.criteria.length <= 1} onClick={() => setV({ ...v, criteria: v.criteria.filter((_, j) => j !== i) })}>Entfernen</Button>
            </div>))}
          <Button size="sm" variant="secondary" onClick={() => setV({ ...v, criteria: [...v.criteria, { id: `k${Date.now().toString(36)}`, label: '', maxPoints: 10, required: false }] })}><Plus size={14} />Kriterium</Button>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Bestehensgrenze (von {max} Punkten)<Input type="number" min={0} max={max} value={v.passPoints} onChange={(e) => setV({ ...v, passPoints: Number(e.target.value) })} /></label>
          <label className="grid gap-1 text-sm">Erzeugt Qualifikation<Select value={v.qualificationDefId} onChange={(e) => setV({ ...v, qualificationDefId: e.target.value })}><option value="">– keine –</option>{(defs.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></label>
        </div>
        <fieldset className="text-sm"><legend className="mb-1 text-muted">Prüfer</legend><div className="flex max-h-32 flex-wrap gap-3 overflow-auto">{(users.data ?? []).map((u) => <label key={u.id} className="flex gap-1"><input type="checkbox" checked={v.examinerIds.includes(u.id)} onChange={() => setV({ ...v, examinerIds: v.examinerIds.includes(u.id) ? v.examinerIds.filter((x) => x !== u.id) : [...v.examinerIds, u.id] })} />{u.displayName}</label>)}</div></fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Aktiv</label>
        {m.error && <p role="alert" className="text-sm text-danger">{errText(m.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={v.title.trim().length < 2 || v.criteria.some((c) => !c.label.trim()) || m.isPending} onClick={() => m.mutate()}>Speichern</Button></div>
      </div>
    </Modal>
  );
}

function StartModal({ exam, onClose, onDone }: { exam: PExam; onClose: () => void; onDone: (id: string) => void }) {
  const people = usePeople();
  const [pid, setPid] = useState('');
  const m = useMutation({ mutationFn: () => api<{ id: string }>(`/training-ext/practical/${exam.id}/assessments`, { method: 'POST', body: { personnelId: pid } }), onSuccess: (r) => onDone(r.id) });
  return (
    <Modal open title={`Prüfling für „${exam.title}“`} onClose={onClose}>
      <Select aria-label="Prüfling" value={pid} onChange={(e) => setPid(e.target.value)}><option value="">– wählen –</option>{(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
      {m.error && <p role="alert" className="mt-2 text-sm text-danger">{errText(m.error)}</p>}
      <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Abbrechen</Button><Button disabled={!pid || m.isPending} onClick={() => m.mutate()}>Bewertung starten</Button></div>
    </Modal>
  );
}

function AssessmentModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const a = useQuery({ queryKey: ['assessment', id], queryFn: () => api<{ id: string; personName: string; status: string; criteria: PracticalCriterion[]; passPoints: number; scores: Record<string, { points: number; note?: string }>; remarks: string | null; canEdit: boolean }>(`/training-ext/assessments/${id}`) });
  const [scores, setScores] = useState<Record<string, { points: number; note?: string }> | null>(null);
  const [remarks, setRemarks] = useState<string | null>(null);
  const cur = scores ?? a.data?.scores ?? {};
  const live = useMemo(() => (a.data ? scorePractical(a.data.criteria, cur, a.data.passPoints) : null), [a.data, cur]);
  const save = useMutation({ mutationFn: () => api(`/training-ext/assessments/${id}/scores`, { method: 'PUT', body: { scores: cur, remarks: remarks ?? a.data?.remarks ?? null } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['assessment', id] }) });
  const done = useMutation({ mutationFn: async () => { await save.mutateAsync(); return api(`/training-ext/assessments/${id}/complete`, { method: 'POST' }); }, onSuccess: onClose });
  const cancel = useMutation({ mutationFn: () => api(`/training-ext/assessments/${id}/cancel`, { method: 'POST', body: { reason: 'Abgebrochen durch Prüfer' } }), onSuccess: onClose });
  return (
    <Modal open wide title={a.data ? `Bewertung: ${a.data.personName}` : 'Bewertung'} onClose={onClose}>
      {a.isLoading || !a.data ? <SkeletonRows /> : (
        <div className="grid gap-3 text-sm">
          {a.data.criteria.map((c) => (
            <div key={c.id} className="grid gap-1 rounded-md border border-line p-2 sm:grid-cols-[2fr_1fr_2fr] sm:items-center">
              <span><b>{c.label}</b>{c.required && <Badge tone="warning">Pflicht{c.minPoints !== undefined ? ` ≥ ${c.minPoints}` : ''}</Badge>}</span>
              <Input aria-label={`Punkte ${c.label}`} type="number" min={0} max={c.maxPoints} disabled={!a.data!.canEdit} value={cur[c.id]?.points ?? ''} onChange={(e) => setScores({ ...cur, [c.id]: { ...cur[c.id], points: e.target.value === '' ? NaN : Number(e.target.value) } })} placeholder={`0–${c.maxPoints}`} />
              <Input aria-label={`Bemerkung ${c.label}`} disabled={!a.data!.canEdit} value={cur[c.id]?.note ?? ''} maxLength={1000} onChange={(e) => setScores({ ...cur, [c.id]: { points: cur[c.id]?.points ?? NaN, note: e.target.value } })} placeholder="Bemerkung" />
            </div>))}
          <label className="grid gap-1">Gesamtbemerkung<Textarea disabled={!a.data.canEdit} value={remarks ?? a.data.remarks ?? ''} onChange={(e) => setRemarks(e.target.value)} /></label>
          {live && <p>Zwischenstand: <b>{live.total}/{live.max}</b> Punkte · Bestehensgrenze {a.data.passPoints} · {live.complete ? (live.passed ? <Badge tone="success">würde bestehen</Badge> : <Badge tone="danger">würde nicht bestehen</Badge>) : <Badge>{live.missing.length} Kriterien offen</Badge>}</p>}
          {(save.error || done.error || cancel.error) && <p role="alert" className="text-danger">{errText(save.error ?? done.error ?? cancel.error)}</p>}
          {a.data.canEdit && <div className="flex justify-between gap-2"><Button variant="danger" onClick={() => cancel.mutate()}>Abbrechen</Button><div className="flex gap-2"><Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate()}>Zwischenstand speichern</Button><Button disabled={!live?.complete || done.isPending} onClick={() => done.mutate()}>Abschließen</Button></div></div>}
        </div>
      )}
    </Modal>
  );
}
