import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { onSaved, useAutosaveDraft } from '../../lib/autosave';
import { fmtDate } from '../../lib/hr';
import { RolePicker, TagListEditor } from '../../components/DiscordPickers';
import { SaveStatus } from '../../components/SaveStatus';
import { TrainingSessionsTab } from './TrainingSessions';
import { L, MultiPick, nullIfEmpty, Switch, usePeople, useStaff } from './trainingCommon';
import { useExams } from './exams/common';
import { ExamsTab } from './exams/ExamsTab';
import { GradingTab } from './exams/GradingTab';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../../components/ui';

// ───────────── Typen ─────────────

const TRAINING_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'ABORTED', 'EXPIRED'] as const;
type TrainingStatus = (typeof TRAINING_STATUSES)[number];
const STATUS_INFO: Record<TrainingStatus, { label: string; emoji: string; tone: Tone }> = {
  NOT_STARTED: { label: 'Nicht begonnen', emoji: '⚪', tone: 'neutral' }, IN_PROGRESS: { label: 'In Bearbeitung', emoji: '🔵', tone: 'info' }, PASSED: { label: 'Bestanden', emoji: '🟢', tone: 'success' },
  FAILED: { label: 'Nicht bestanden', emoji: '🔴', tone: 'danger' }, ABORTED: { label: 'Abgebrochen', emoji: '⚫', tone: 'neutral' }, EXPIRED: { label: 'Abgelaufen', emoji: '🟠', tone: 'warning' },
};
const statusOf = (s: string) => STATUS_INFO[s as TrainingStatus] ?? { label: s, emoji: '', tone: 'neutral' as Tone };

interface TrainingInput {
  name: string; description: string | null; requirements: string | null; instructorIds: string[]; duration: string | null; active: boolean; examRequired: boolean;
  examId: string | null; certificate: boolean; audience: string | null; requiredRoleId: string | null; validDays: number | null; modules: string[];
}
interface Training extends TrainingInput { id: string; position: number; passed: number; createdAt: string; updatedAt: string }
interface ProgressRow {
  id: string; trainingId: string; personnelId: string; status: string; progress: number; doneModules: string[]; examinerId: string | null; note: string | null; startedAt: string | null; completedAt: string | null;
  expiresAt: string | null; certificateNo: string | null; updatedAt: string; personnel: { id: string; rank: string | null; user: { displayName: string } };
}
interface CertificateData {
  certificateNo: string; name: string; roblox: string | null; training: string; description: string | null; result: string; date: string | null; expiresAt: string | null;
  examiner: string; organisation: string; logo: string; signature: string; status: string;
}

// ───────────── Hilfen ─────────────

const bar = (p: number) => { const n = Math.max(0, Math.min(10, Math.round(p / 10))); return `${'█'.repeat(n)}${'░'.repeat(10 - n)} ${p} %`; };
const useTrainings = () => useQuery({ queryKey: ['hr-trainings'], queryFn: () => api<Training[]>('/hr/trainings') });

// ───────────── Seite ─────────────

export function Trainings() {
  const { can } = useAuth();
  const exams = useExams(can('exam.view'));
  // Prüfer einzelner Prüfungen bewerten auch ohne exam.grade
  const canGrade = can('exam.grade|exam.manage') || !!exams.data?.some((e) => e.canGrade);
  const tabs = [...(can('training.view') ? ['Termine', 'Ausbildungen'] : []), ...(can('exam.view') ? ['Prüfungen'] : []), ...(canGrade ? ['Bewertung'] : [])];
  const [params, setParams] = useSearchParams();
  const wanted = params.get('tab');
  const tab = wanted && tabs.includes(wanted) ? wanted : tabs[0] ?? 'Termine';
  const setTab = (t: string) => setParams((p) => { p.set('tab', t); return p; }, { replace: true });
  return (
    <div>
      <PageHeader title="🎓 Ausbildungen & Prüfungen" subtitle="Termine mit Anmeldung und Auswertung, Ausbildungen, Fortschritt, Zertifikate und Online-Prüfungen" />
      {tabs.length > 1 && <div className="mb-4"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>}
      {!tabs.length && <EmptyState text="Keine Berechtigung" hint="Du hast keinen Zugriff auf Ausbildungen oder Prüfungen." />}
      {tab === 'Termine' && can('training.view') && <TrainingSessionsTab />}
      {tab === 'Ausbildungen' && can('training.view') && <TrainingsTab />}
      {tab === 'Prüfungen' && can('exam.view') && <ExamsTab />}
      {tab === 'Bewertung' && canGrade && <GradingTab />}
    </div>
  );
}

// ───────────── Ausbildungen ─────────────

function TrainingsTab() {
  const { can } = useAuth();
  const q = useTrainings();
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Training | 'new' | null>(null);
  const selected = q.data?.find((t) => t.id === open);
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  if (selected) return <TrainingDetail t={selected} onBack={() => setOpen(null)} onEdit={() => setEdit(selected)} editor={edit ? <TrainingEditor value={edit} onClose={() => setEdit(null)} /> : null} />;
  const list = q.data ?? [];
  return (
    <Card title={`Ausbildungen (${list.length})`} actions={can('training.create') && <Button size="sm" onClick={() => setEdit('new')}><Plus size={14} />Neue Ausbildung</Button>}>
      {!list.length ? <EmptyState text="Noch keine Ausbildungen" hint={can('training.create') ? 'Lege die erste Ausbildung an.' : undefined} /> : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((t) => (
            <li key={t.id} className="rounded-md border border-line bg-panel-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 text-left" onClick={() => setOpen(t.id)} aria-label={`${t.name} öffnen`}>
                  <div className="font-medium hover:underline">{t.name}</div>
                  {t.description && <p className="line-clamp-2 text-xs text-muted">{t.description}</p>}
                </button>
                {can('training.manage') && <Button size="sm" variant="ghost" aria-label={`${t.name} bearbeiten`} onClick={() => setEdit(t)}><Pencil size={14} /></Button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {!t.active && <Badge>inaktiv</Badge>}
                <Badge tone="success" icon="🎓">{t.passed} bestanden</Badge>
                {t.examRequired && <Badge tone="info" icon="📝">Prüfung</Badge>}
                {t.certificate && <Badge tone="primary" icon="📜">Zertifikat</Badge>}
                {t.duration && <Badge icon="⏱️">{t.duration}</Badge>}
                {t.validDays && <Badge tone="warning">{t.validDays} Tage gültig</Badge>}
                {t.modules.length > 0 && <Badge icon="☑️">{t.modules.length} Module</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <TrainingEditor value={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

const emptyTraining = (): TrainingInput => ({ name: '', description: null, requirements: null, instructorIds: [], duration: null, active: true, examRequired: false, examId: null, certificate: true, audience: null, requiredRoleId: null, validDays: null, modules: [] });
const trainingBody = (d: TrainingInput): TrainingInput => ({
  ...d, name: d.name.trim(), description: nullIfEmpty(d.description), requirements: nullIfEmpty(d.requirements), duration: nullIfEmpty(d.duration), audience: nullIfEmpty(d.audience),
  validDays: d.validDays && d.validDays > 0 ? d.validDays : null,
});

function TrainingEditor({ value, onClose }: { value: Training | 'new'; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const isNew = value === 'new';
  const id = isNew ? null : value.id;
  const [d, setD] = useState<TrainingInput>(() => {
    if (value === 'new') return emptyTraining();
    const { name, description, requirements, instructorIds, duration, active, examRequired, examId, certificate, audience, requiredRoleId, validDays, modules } = value;
    return { name, description, requirements, instructorIds, duration, active, examRequired, examId, certificate, audience, requiredRoleId, validDays, modules: modules ?? [] };
  });
  const [err, setErr] = useState<string>();
  const [del, setDel] = useState(false);
  const staff = useStaff();
  const exams = useExams(can('exam.view'));
  const set = (p: Partial<TrainingInput>) => setD((x) => ({ ...x, ...p }));
  useAutosaveDraft(id ? `training:${id}` : null, d, (x) => (x.name.trim() ? { method: 'PUT', path: `/hr/trainings/${id}`, body: trainingBody(x), label: 'Ausbildung' } : null));
  useEffect(() => (id ? onSaved(`training:${id}`, () => void qc.invalidateQueries({ queryKey: ['hr-trainings'] })) : undefined), [id, qc]);
  const create = useMutation({
    mutationFn: () => api<Training>('/hr/trainings', { method: 'POST', body: trainingBody(d) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-trainings'] }); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/hr/trainings/${id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-trainings'] }); onClose(); },
    onError: (e) => { setDel(false); setErr(errText(e)); },
  });
  return (
    <Modal open wide title={isNew ? 'Neue Ausbildung' : `Ausbildung bearbeiten: ${d.name || '…'}`} onClose={onClose}>
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (isNew && d.name.trim()) create.mutate(); }}>
        <div className="grid gap-3 md:grid-cols-2">
          <L label="Name *"><Input aria-label="Name" maxLength={100} value={d.name} onChange={(e) => set({ name: e.target.value })} /></L>
          <L label="Dauer"><Input aria-label="Dauer" maxLength={60} placeholder="z. B. 2 Stunden" value={d.duration ?? ''} onChange={(e) => set({ duration: e.target.value })} /></L>
        </div>
        <L label="Beschreibung"><Textarea aria-label="Beschreibung" maxLength={3000} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></L>
        <L label="Voraussetzungen"><Textarea aria-label="Voraussetzungen" rows={2} maxLength={1000} value={d.requirements ?? ''} onChange={(e) => set({ requirements: e.target.value })} /></L>
        <div className="grid gap-3 md:grid-cols-2">
          <L label="Ausbilder"><MultiPick ariaLabel="Ausbilder hinzufügen" value={d.instructorIds} onChange={(v) => set({ instructorIds: v })} options={staff} /></L>
          <L label="Zielgruppe"><Input aria-label="Zielgruppe" maxLength={200} placeholder="z. B. alle Anwärter" value={d.audience ?? ''} onChange={(e) => set({ audience: e.target.value })} /></L>
          <L label="Benötigte Discord-Rolle (optional)"><RolePicker ariaLabel="Benötigte Discord-Rolle" max={1} value={d.requiredRoleId ? [d.requiredRoleId] : []} onChange={(ids) => set({ requiredRoleId: ids[0] ?? null })} /></L>
          <L label="Ablauf in Tagen (optional)" hint="Leer = unbegrenzt gültig"><Input aria-label="Ablauf in Tagen" type="number" min={1} max={3650} value={d.validDays ?? ''} onChange={(e) => set({ validDays: e.target.value ? Number(e.target.value) : null })} /></L>
        </div>
        <L label="Module (Checkliste)" hint="In der Reihenfolge der Ausbildung. Ausbilder haken sie pro Person ab, der Fortschritt ergibt sich daraus; „Bestanden“ erst, wenn alle Module erledigt sind. Leer = Fortschritt in Prozent von Hand.">
          <TagListEditor ariaLabel="Modul hinzufügen" ordered value={d.modules} placeholder="z. B. Funkverkehr + Enter" onChange={(v) => set({ modules: v })} />
        </L>
        <div className="grid gap-3 md:grid-cols-3">
          <Switch label="Aktiv" checked={d.active} onChange={(v) => set({ active: v })} />
          <Switch label="Zertifikat ausstellen" checked={d.certificate} onChange={(v) => set({ certificate: v })} />
          <Switch label="Prüfung erforderlich" checked={d.examRequired} onChange={(v) => set({ examRequired: v })} hint="„Bestanden“ erst nach bestandener Prüfung" />
        </div>
        {(d.examRequired || d.examId) && (
          <L label="Prüfung">
            <Select aria-label="Prüfung" value={d.examId ?? ''} onChange={(e) => set({ examId: e.target.value || null })}>
              <option value="">— keine —</option>
              {(exams.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          </L>
        )}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {isNew ? <Button type="submit" disabled={!d.name.trim() || create.isPending}>Erstellen</Button> : <div className="flex items-center gap-2 text-xs text-muted"><SaveStatus /><span>Änderungen werden automatisch gespeichert.</span></div>}
          <div className="flex gap-2">
            {!isNew && can('training.manage') && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} />Löschen</Button>}
            <Button variant="secondary" onClick={onClose}>{isNew ? 'Abbrechen' : 'Schließen'}</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog open={del} danger title="Ausbildung löschen?" message="Die Ausbildung und alle Fortschritte werden gelöscht. Das kann nicht rückgängig gemacht werden." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />
    </Modal>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="grid gap-0.5">
      <code className="text-xs tracking-tight" aria-hidden>{bar(value)}</code>
      <div role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label="Fortschritt" className="h-1.5 w-28 overflow-hidden rounded bg-line">
        <div className={`h-full ${value >= 100 ? 'bg-success' : 'bg-primary'}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function TrainingDetail({ t, onBack, onEdit, editor }: { t: Training; onBack: () => void; onEdit: () => void; editor: ReactNode }) {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hr-trainings', t.id, 'progress'], queryFn: () => api<ProgressRow[]>(`/hr/trainings/${t.id}/progress`) });
  const canSet = can('training.manage') || (!!user && t.instructorIds.includes(user.id));
  const people = usePeople(canSet);
  const staff = useStaff();
  const exams = useExams(can('exam.view'));
  const [err, setErr] = useState<string>();
  const [add, setAdd] = useState('');
  const save = useMutation({
    mutationFn: (b: { personnelId: string; status: string; progress?: number; doneModules?: string[]; note?: string | null }) => api('/hr/training-progress', { method: 'PUT', body: { trainingId: t.id, ...b } }),
    onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['hr-trainings'] }); },
    onError: (e) => setErr(errText(e)),
  });
  const rows = q.data ?? [];
  const candidates = (people.data?.rows ?? []).filter((p) => !rows.some((r) => r.personnelId === p.id));
  const instructors = t.instructorIds.map((id) => staff.find((s) => s.id === id)?.name).filter(Boolean).join(', ');
  const exam = exams.data?.find((e) => e.id === t.examId);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onBack}><ArrowLeft size={14} />Zurück</Button>
        {can('training.manage') && <Button variant="secondary" size="sm" onClick={onEdit}><Pencil size={14} />Bearbeiten</Button>}
      </div>
      <Card title={<span>🎓 {t.name}</span>}>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="grid gap-2">
            {t.description && <p className="whitespace-pre-wrap">{t.description}</p>}
            {t.requirements && <p><span className="text-muted">Voraussetzungen: </span><span className="whitespace-pre-wrap">{t.requirements}</span></p>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted">Ausbilder</dt><dd>{instructors || '—'}</dd>
            <dt className="text-muted">Dauer</dt><dd>{t.duration ?? '—'}</dd>
            <dt className="text-muted">Zielgruppe</dt><dd>{t.audience ?? '—'}</dd>
            <dt className="text-muted">Prüfung</dt><dd>{t.examRequired ? `erforderlich${exam ? ` (${exam.title})` : ''}` : exam ? exam.title : 'nein'}</dd>
            <dt className="text-muted">Gültigkeit</dt><dd>{t.validDays ? `${t.validDays} Tage` : 'unbegrenzt'}</dd>
            <dt className="text-muted">Zertifikat</dt><dd>{t.certificate ? 'ja' : 'nein'}</dd>
          </dl>
        </div>
        {t.modules.length > 0 && (
          <div className="mt-3 text-sm">
            <p className="mb-1 text-xs font-medium text-muted">Module</p>
            <ol className="list-inside list-decimal grid gap-0.5">{t.modules.map((m) => <li key={m}>{m}</li>)}</ol>
          </div>
        )}
      </Card>
      <Card title={`Fortschritt (${rows.length})`} actions={canSet && candidates.length > 0 && (
        <div className="flex items-center gap-2">
          <Select aria-label="Person auswählen" className="w-56" value={add} onChange={(e) => setAdd(e.target.value)}>
            <option value="">Person auswählen …</option>
            {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}{p.rank ? ` (${p.rank})` : ''}</option>)}
          </Select>
          <Button size="sm" disabled={!add || save.isPending} onClick={() => { save.mutate({ personnelId: add, status: 'IN_PROGRESS', progress: 0 }); setAdd(''); }}><Plus size={14} />Person hinzufügen</Button>
        </div>
      )}>
        {err && <p role="alert" className="mb-2 text-sm text-danger">{err}</p>}
        {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !rows.length ? <EmptyState text="Noch niemand in dieser Ausbildung" hint={canSet ? 'Füge oben eine Person hinzu.' : undefined} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="p-2">Person</th><th className="p-2">Status</th><th className="p-2">Fortschritt</th><th className="p-2">Abgeschlossen</th><th className="p-2">Gültig bis</th><th className="p-2">Zertifikat</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="p-2"><div className="font-medium">{r.personnel.user.displayName}</div>{r.personnel.rank && <div className="text-xs text-muted">{r.personnel.rank}</div>}{r.note && <div className="text-xs text-muted" title={r.note}>📝 {r.note}</div>}</td>
                    <td className="p-2">
                      {canSet ? (
                        <Select aria-label={`Status von ${r.personnel.user.displayName}`} className="w-44" value={r.status} disabled={save.isPending} onChange={(e) => save.mutate({ personnelId: r.personnelId, status: e.target.value })}>
                          {TRAINING_STATUSES.map((s) => <option key={s} value={s}>{STATUS_INFO[s].emoji} {STATUS_INFO[s].label}</option>)}
                        </Select>
                      ) : <Badge tone={statusOf(r.status).tone} icon={statusOf(r.status).emoji}>{statusOf(r.status).label}</Badge>}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={r.progress} />
                        {t.modules.length > 0 ? (
                          <ModuleChecklist modules={t.modules} done={r.doneModules ?? []} person={r.personnel.user.displayName} disabled={!canSet || save.isPending || r.status === 'PASSED' || r.status === 'EXPIRED'}
                            onChange={(next) => save.mutate({ personnelId: r.personnelId, status: r.status === 'NOT_STARTED' && next.length > 0 ? 'IN_PROGRESS' : r.status, doneModules: next })} />
                        ) : canSet && r.status !== 'PASSED' && <ProgressInput key={`${r.id}-${r.progress}`} initial={r.progress} label={`Fortschritt von ${r.personnel.user.displayName} in Prozent`} onCommit={(v) => save.mutate({ personnelId: r.personnelId, status: r.status === 'NOT_STARTED' && v > 0 ? 'IN_PROGRESS' : r.status, progress: v })} />}
                      </div>
                    </td>
                    <td className="p-2">{fmtDate(r.completedAt)}</td>
                    <td className="p-2">{r.expiresAt ? fmtDate(r.expiresAt) : '—'}</td>
                    <td className="p-2">{r.certificateNo ? <Link className="text-primary hover:underline" to={`/certificates/${r.certificateNo}`}><Award size={13} className="mr-1 inline" aria-hidden />{r.certificateNo}</Link> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canSet && !people.data && people.error && <p className="mt-2 text-xs text-muted">Personalliste nicht verfügbar – Personen können nicht hinzugefügt werden.</p>}
      </Card>
      {editor}
    </div>
  );
}

/** Modul-Checkliste einer Person (aufklappbar); abhaken nur für Ausbilder/Verwalter. */
function ModuleChecklist({ modules, done, person, disabled, onChange }: { modules: string[]; done: string[]; person: string; disabled: boolean; onChange: (next: string[]) => void }) {
  const count = modules.filter((m) => done.includes(m)).length;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-muted">{count}/{modules.length} Module</summary>
      <ul className="mt-1 grid gap-1">
        {modules.map((m) => (
          <li key={m}>
            <label className="flex items-center gap-2">
              <input type="checkbox" aria-label={`${m} – ${person}`} checked={done.includes(m)} disabled={disabled}
                onChange={(e) => onChange(modules.filter((x) => (x === m ? e.target.checked : done.includes(x))))} />
              <span className={done.includes(m) ? 'line-through text-muted' : undefined}>{m}</span>
            </label>
          </li>
        ))}
      </ul>
    </details>
  );
}

function ProgressInput({ initial, onCommit, label }: { initial: number; onCommit: (v: number) => void; label: string }) {
  const [v, setV] = useState(String(initial));
  const commit = () => { const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0))); if (n !== initial) onCommit(n); else setV(String(initial)); };
  return <Input aria-label={label} type="number" min={0} max={100} step={5} className="w-20 py-1" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />;
}

// ───────────── Zertifikat ─────────────

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #certificate-print, #certificate-print * { visibility: visible !important; }
  #certificate-print { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none; }
  @page { size: A4 landscape; margin: 12mm; }
}`;

export function Certificate() {
  const { no = '' } = useParams();
  const q = useQuery({ queryKey: ['hr-certificate', no], queryFn: () => api<CertificateData>(`/hr/certificates/${encodeURIComponent(no)}`), enabled: !!no });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  if (!c) return <EmptyState text="Zertifikat nicht gefunden" />;
  const expired = c.status === 'EXPIRED' || (!!c.expiresAt && new Date(c.expiresAt) < new Date());
  const logo = /^https:\/\//i.test(c.logo) ? c.logo : null;
  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to="/trainings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} />Ausbildungen</Link>
        <Button onClick={() => window.print()}><Printer size={14} />Drucken</Button>
      </div>
      {expired && <p role="alert" className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning print:hidden">🟠 Dieses Zertifikat ist abgelaufen.</p>}
      <article id="certificate-print" aria-label={`Zertifikat ${c.certificateNo}`} className="mx-auto max-w-4xl rounded-lg border-4 border-double border-amber-500/70 bg-white p-2 text-slate-900 shadow-xl print:border-amber-600 print:shadow-none">
        <div className="rounded border border-amber-500/40 px-6 py-10 text-center sm:px-14">
          {logo && <img src={logo} alt={`Logo ${c.organisation}`} className="mx-auto mb-4 h-20 w-auto object-contain" referrerPolicy="no-referrer" />}
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">{c.organisation}</p>
          <h1 className="mt-4 font-serif text-5xl font-bold tracking-wide text-amber-700">Zertifikat</h1>
          <p className="mt-6 text-sm text-slate-500">Hiermit wird bestätigt, dass</p>
          <p className="mt-2 font-serif text-3xl font-semibold">{c.name}</p>
          {c.roblox && <p className="text-xs text-slate-500">Roblox: {c.roblox}</p>}
          <p className="mt-4 text-sm text-slate-500">die Ausbildung</p>
          <p className="mt-1 text-2xl font-semibold">{c.training}</p>
          {c.description && <p className="mx-auto mt-2 max-w-2xl whitespace-pre-wrap text-xs text-slate-500">{c.description}</p>}
          <p className="mt-3 text-sm text-slate-500">erfolgreich abgeschlossen hat.</p>
          <dl className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Ergebnis</dt><dd className="font-semibold">{c.result}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Datum</dt><dd className="font-semibold">{fmtDate(c.date)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Gültig bis</dt><dd className="font-semibold">{c.expiresAt ? fmtDate(c.expiresAt) : 'unbegrenzt'}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-slate-500">Prüfer</dt><dd className="font-semibold">{c.examiner}</dd></div>
          </dl>
          <div className="mt-12 flex flex-wrap items-end justify-between gap-6 text-left">
            <div className="min-w-48">
              <p className="font-serif text-xl italic">{c.signature || c.examiner}</p>
              <div className="mt-1 border-t border-slate-400 pt-1 text-xs text-slate-500">Unterschrift{c.signature ? '' : ' (Prüfer)'}</div>
            </div>
            <div className="text-right text-xs text-slate-500"><div>Zertifikatsnummer</div><div className="font-mono text-sm font-semibold text-slate-800">{c.certificateNo}</div></div>
          </div>
        </div>
      </article>
    </div>
  );
}
