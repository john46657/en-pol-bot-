import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Award, Pencil, Play, Plus, Printer, Trash2, X } from 'lucide-react';
import { EXAM_QUESTION_TYPES, EXAM_QUESTION_TYPE_LABEL, gradeAnswer, type Question } from '@enrp/shared';
import { api, type Page } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { onSaved, useAutosaveDraft } from '../../lib/autosave';
import { fmtDate, type Overview } from '../../lib/hr';
import { Toggle } from '../../components/ApplicationSettings';
import { RolePicker } from '../../components/DiscordPickers';
import { SaveStatus } from '../../components/SaveStatus';
import { TrainingSessionsTab } from './TrainingSessions';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, PageHeader, Select, SkeletonRows, Tabs, Textarea, type Tone } from '../../components/ui';

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
  examId: string | null; certificate: boolean; audience: string | null; requiredRoleId: string | null; validDays: number | null;
}
interface Training extends TrainingInput { id: string; position: number; passed: number; createdAt: string; updatedAt: string }
interface ProgressRow {
  id: string; trainingId: string; personnelId: string; status: string; progress: number; examinerId: string | null; note: string | null; startedAt: string | null; completedAt: string | null;
  expiresAt: string | null; certificateNo: string | null; updatedAt: string; personnel: { id: string; rank: string | null; user: { displayName: string } };
}
interface MyAttempt { examId: string; status: string; passed: boolean | null; score: number | null; maxScore: number | null; submittedAt: string | null; startedAt: string }
interface ExamInput {
  title: string; description: string | null; questions: Question[]; questionCount: number; passPercent: number; timeLimitMin: number | null; maxAttempts: number; retryHours: number;
  autoGrade: boolean; showResult: boolean; examinerIds: string[]; trainingId: string | null; active: boolean;
}
interface Exam extends Omit<ExamInput, 'questions'> { id: string; questions?: Question[]; questionTotal: number; myAttempts: MyAttempt[] }
type AttemptQuestion = Omit<Question, 'correct'> & { correct?: string[] };
interface AttemptView {
  id: string; examId: string; title: string; description: string | null; status: string; startedAt: string; submittedAt: string | null; timeLimitMin: number | null; passPercent: number;
  name: string; answers: Record<string, unknown> | null; grader: boolean; questions: AttemptQuestion[];
  result: { score?: number | null; maxScore?: number | null; passed: boolean | null; feedback?: string | null } | null;
}
interface AttemptRow {
  id: string; examId: string; personnelId: string; status: string; score: number | null; maxScore: number | null; passed: boolean | null; startedAt: string; submittedAt: string | null;
  gradedAt: string | null; feedback: string | null; exam: { title: string }; personnel: { user: { displayName: string } };
}
interface CertificateData {
  certificateNo: string; name: string; roblox: string | null; training: string; description: string | null; result: string; date: string | null; expiresAt: string | null;
  examiner: string; organisation: string; logo: string; signature: string; status: string;
}
type Answer = string | string[];
interface PickItem { id: string; name: string }

// ───────────── Hilfen ─────────────

const bar = (p: number) => { const n = Math.max(0, Math.min(10, Math.round(p / 10))); return `${'█'.repeat(n)}${'░'.repeat(10 - n)} ${p} %`; };
const L = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="grid gap-1 text-sm"><span className="text-xs font-medium text-muted">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
);
const Switch = ({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) => (
  <div className="flex items-start gap-2 text-sm"><Toggle label={label} checked={checked} onChange={onChange} /><div><div>{label}</div>{hint && <div className="text-xs text-muted">{hint}</div>}</div></div>
);
const nullIfEmpty = (s: string | null) => (s && s.trim() ? s : null);
const pct = (score: number | null | undefined, max: number | null | undefined) => (score != null && max ? Math.round((score / max) * 100) : null);

/** Personal (für „Person hinzufügen“). */
function usePeople(enabled = true) {
  const { can } = useAuth();
  return useQuery({ queryKey: ['hr-people', 'pick'], queryFn: () => api<Overview>('/hr/people'), enabled: enabled && can('personnel.view'), staleTime: 60_000 });
}
/** Benutzer für Ausbilder/Prüfer: mit users.view aus der Benutzerliste, sonst aus dem Personal. */
function useStaff(): PickItem[] {
  const { can } = useAuth();
  const viaUsers = can('users.view');
  const users = useQuery({ queryKey: ['users', 'pick'], queryFn: () => api<Page<{ id: string; displayName: string; active: boolean }>>('/users', { query: { pageSize: 500 } }), enabled: viaUsers, staleTime: 60_000 });
  const people = usePeople(!viaUsers);
  return useMemo(() => {
    const list = viaUsers ? (users.data?.items ?? []).filter((u) => u.active).map((u) => ({ id: u.id, name: u.displayName })) : (people.data?.rows ?? []).map((p) => ({ id: p.userId, name: p.name }));
    return list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [viaUsers, users.data, people.data]);
}

function MultiPick({ value, onChange, options, ariaLabel, max = 30 }: { value: string[]; onChange: (v: string[]) => void; options: PickItem[]; ariaLabel: string; max?: number }) {
  const name = (id: string) => options.find((o) => o.id === id)?.name ?? `${id.slice(0, 8)}…`;
  return (
    <div className="grid gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-0.5 text-xs">
              {name(id)}
              <button type="button" aria-label={`${name(id)} entfernen`} className="text-muted hover:text-danger" onClick={() => onChange(value.filter((x) => x !== id))}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <Select aria-label={ariaLabel} value="" disabled={value.length >= max} onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); }}>
        <option value="">+ hinzufügen …</option>
        {options.filter((o) => !value.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Select>
      {!options.length && <span className="text-xs text-muted">Keine Auswahl verfügbar (fehlende Berechtigung zum Lesen der Benutzerliste).</span>}
    </div>
  );
}

const useTrainings = () => useQuery({ queryKey: ['hr-trainings'], queryFn: () => api<Training[]>('/hr/trainings') });
const useExams = (enabled = true) => useQuery({ queryKey: ['hr-exams'], queryFn: () => api<Exam[]>('/hr/exams'), enabled });

// ───────────── Seite ─────────────

export function Trainings() {
  const { can } = useAuth();
  const canGrade = can('exam.grade') || can('exam.manage');
  const tabs = [...(can('training.view') ? ['Termine', 'Ausbildungen'] : []), ...(can('exam.view') ? ['Prüfungen'] : []), ...(canGrade ? ['Bewertung'] : [])];
  const [tab, setTab] = useState(tabs[0] ?? 'Termine');
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
              </div>
            </li>
          ))}
        </ul>
      )}
      {edit && <TrainingEditor value={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

const emptyTraining = (): TrainingInput => ({ name: '', description: null, requirements: null, instructorIds: [], duration: null, active: true, examRequired: false, examId: null, certificate: true, audience: null, requiredRoleId: null, validDays: null });
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
    const { name, description, requirements, instructorIds, duration, active, examRequired, examId, certificate, audience, requiredRoleId, validDays } = value;
    return { name, description, requirements, instructorIds, duration, active, examRequired, examId, certificate, audience, requiredRoleId, validDays };
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
    mutationFn: (b: { personnelId: string; status: string; progress?: number; note?: string | null }) => api('/hr/training-progress', { method: 'PUT', body: { trainingId: t.id, ...b } }),
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
                        {canSet && r.status !== 'PASSED' && <ProgressInput key={`${r.id}-${r.progress}`} initial={r.progress} label={`Fortschritt von ${r.personnel.user.displayName} in Prozent`} onCommit={(v) => save.mutate({ personnelId: r.personnelId, status: r.status === 'NOT_STARTED' && v > 0 ? 'IN_PROGRESS' : r.status, progress: v })} />}
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

function ProgressInput({ initial, onCommit, label }: { initial: number; onCommit: (v: number) => void; label: string }) {
  const [v, setV] = useState(String(initial));
  const commit = () => { const n = Math.max(0, Math.min(100, Math.round(Number(v) || 0))); if (n !== initial) onCommit(n); else setV(String(initial)); };
  return <Input aria-label={label} type="number" min={0} max={100} step={5} className="w-20 py-1" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />;
}

// ───────────── Prüfungen ─────────────

function ExamsTab() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const q = useExams();
  const [active, setActive] = useState<AttemptView | null>(null);
  const [edit, setEdit] = useState<Exam | 'new' | null>(null);
  const [err, setErr] = useState<string>();
  const start = useMutation({
    mutationFn: (id: string) => api<AttemptView>(`/hr/exams/${id}/start`, { method: 'POST' }),
    onSuccess: (v) => { setErr(undefined); setActive(v); void qc.invalidateQueries({ queryKey: ['hr-exams'] }); },
    onError: (e) => setErr(errText(e)),
  });
  if (active) return <AttemptRunner initial={active} onClose={() => { setActive(null); void qc.invalidateQueries({ queryKey: ['hr-exams'] }); }} />;
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const list = q.data ?? [];
  return (
    <Card title={`Prüfungen (${list.length})`} actions={can('exam.create') && <Button size="sm" onClick={() => setEdit('new')}><Plus size={14} />Neue Prüfung</Button>}>
      {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
      {!list.length ? <EmptyState text="Keine Prüfungen verfügbar" /> : (
        <ul className="grid gap-2 md:grid-cols-2">
          {list.map((e) => {
            const open = e.myAttempts.find((a) => a.status === 'IN_PROGRESS');
            const passed = e.myAttempts.some((a) => a.passed);
            const done = e.myAttempts.filter((a) => a.status !== 'IN_PROGRESS').length;
            const last = [...e.myAttempts].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
            return (
              <li key={e.id} className="grid gap-2 rounded-md border border-line bg-panel-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">📝 {e.title}</div>
                    {e.description && <p className="whitespace-pre-wrap text-xs text-muted">{e.description}</p>}
                  </div>
                  {can('exam.manage') && <Button size="sm" variant="ghost" aria-label={`${e.title} bearbeiten`} onClick={() => setEdit(e)}><Pencil size={14} /></Button>}
                </div>
                <div className="flex flex-wrap gap-1">
                  {!e.active && <Badge>inaktiv</Badge>}
                  <Badge icon="❓">{e.questionCount && e.questionCount < e.questionTotal ? `${e.questionCount} von ${e.questionTotal} Fragen` : `${e.questionTotal} Fragen`}</Badge>
                  <Badge icon="🎯">ab {e.passPercent} %</Badge>
                  {e.timeLimitMin && <Badge icon="⏱️">{e.timeLimitMin} Min.</Badge>}
                  <Badge>Versuche {done}/{e.maxAttempts}</Badge>
                  {passed && <Badge tone="success" icon="🟢">bestanden</Badge>}
                </div>
                {last && last.status !== 'IN_PROGRESS' && (
                  <p className="text-xs text-muted">
                    Letzter Versuch {fmt(last.submittedAt ?? last.startedAt)}: {last.status === 'SUBMITTED' ? '⏳ wird bewertet' : last.passed === true ? '🟢 Bestanden' : last.passed === false ? '🔴 Nicht bestanden' : 'bewertet'}
                    {pct(last.score, last.maxScore) !== null && ` (${pct(last.score, last.maxScore)} %)`}
                  </p>
                )}
                {!passed && e.active && (
                  <div><Button size="sm" disabled={start.isPending || (!open && done >= e.maxAttempts)} onClick={() => start.mutate(e.id)}><Play size={14} />{open ? 'Prüfung fortsetzen' : 'Prüfung starten'}</Button></div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && <ExamEditor value={edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

const normAnswers = (raw: Record<string, unknown> | null | undefined): Record<string, Answer> => {
  const out: Record<string, Answer> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = Array.isArray(v) ? v.map(String) : v == null ? '' : String(v);
  return out;
};
const backupKey = (id: string) => `exam.${id}`;
const readBackup = (id: string): Record<string, Answer> | null => {
  try { const r = localStorage.getItem(backupKey(id)); return r ? normAnswers(JSON.parse(r) as Record<string, unknown>) : null; } catch { return null; }
};
const writeBackup = (id: string, a: Record<string, Answer>) => { try { localStorage.setItem(backupKey(id), JSON.stringify(a)); } catch { /* privater Modus */ } };
const dropBackup = (id: string) => { try { localStorage.removeItem(backupKey(id)); } catch { /* egal */ } };
const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function AttemptRunner({ initial, onClose }: { initial: AttemptView; onClose: () => void }) {
  const [view, setView] = useState(initial);
  const inProgress = view.status === 'IN_PROGRESS';
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => ({ ...normAnswers(initial.answers), ...(initial.status === 'IN_PROGRESS' ? readBackup(initial.id) ?? {} : {}) }));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  const latest = useRef(answers);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const finished = useRef(false);

  const persist = (a: Record<string, Answer>) => {
    dirty.current = false;
    setSaveState('saving');
    api<{ saved: true } | AttemptView>(`/hr/attempts/${view.id}/answers`, { method: 'PUT', body: { answers: a } }).then((r) => {
      if ('questions' in r) { finished.current = true; dropBackup(view.id); setView(r); } // Zeit abgelaufen → automatisch abgegeben
      setSaveState('saved');
    }, () => setSaveState('error'));
  };
  const change = (qid: string, v: Answer) => {
    const next = { ...latest.current, [qid]: v };
    latest.current = next;
    setAnswers(next);
    writeBackup(view.id, next);
    dirty.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(latest.current), 1500);
  };
  // Beim Verlassen ausstehende Antworten sofort senden
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current && !finished.current) void api(`/hr/attempts/${initial.id}/answers`, { method: 'PUT', body: { answers: latest.current } }).catch(() => undefined); }, [initial.id]);

  const submit = useMutation({
    mutationFn: () => { clearTimeout(timer.current); dirty.current = false; return api<AttemptView>(`/hr/attempts/${view.id}/submit`, { method: 'POST', body: { answers: latest.current } }); },
    onSuccess: (r) => { finished.current = true; dropBackup(view.id); setConfirm(false); setView(r); },
    onError: (e) => { setConfirm(false); setErr(errText(e)); },
  });

  const deadline = view.timeLimitMin ? new Date(view.startedAt).getTime() + view.timeLimitMin * 60_000 : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline || !inProgress) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline, inProgress]);
  const left = deadline ? Math.max(0, deadline - now) : null;
  const autoSent = useRef(false);
  useEffect(() => {
    if (left === 0 && inProgress && !autoSent.current && !submit.isPending) { autoSent.current = true; submit.mutate(); }
  }, [left, inProgress, submit]);

  const answered = view.questions.filter((q) => { const a = answers[q.id]; return Array.isArray(a) ? a.length > 0 : !!a?.trim(); }).length;

  if (!inProgress) return (
    <Card title={`📝 ${view.title}`} actions={<Button size="sm" variant="secondary" onClick={onClose}><ArrowLeft size={14} />Zurück zur Übersicht</Button>}>
      <ResultBox v={view} />
    </Card>
  );
  return (
    <div className="grid gap-4">
      <Card title={`📝 ${view.title}`} actions={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted" role="status" aria-live="polite">{saveState === 'saving' ? '🔄 Speichert …' : saveState === 'saved' ? '✅ Zwischengespeichert' : saveState === 'error' ? '⚠️ Nur lokal gespeichert' : ''}</span>
          {left !== null && <span role="timer" aria-label="Verbleibende Zeit" className={`rounded border px-2 py-0.5 font-mono text-sm ${left < 60_000 ? 'border-danger text-danger' : left < 300_000 ? 'border-warning text-warning' : 'border-line'}`}>⏱️ {mmss(left)}</span>}
          <Button size="sm" variant="secondary" onClick={onClose}>Später fortsetzen</Button>
        </div>
      }>
        {view.description && <p className="mb-2 whitespace-pre-wrap text-sm text-muted">{view.description}</p>}
        <p className="text-xs text-muted">{answered} von {view.questions.length} Fragen beantwortet · Bestanden ab {view.passPercent} % · Antworten werden automatisch gespeichert.</p>
      </Card>
      <ol className="grid gap-3">
        {view.questions.map((q, i) => (
          <li key={q.id}><Card title={<span>Frage {i + 1} <span className="font-normal text-muted">· {q.points} {q.points === 1 ? 'Punkt' : 'Punkte'}</span></span>}><QuestionInput q={q} value={answers[q.id]} onChange={(v) => change(q.id, v)} /></Card></li>
        ))}
      </ol>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex justify-end"><Button disabled={submit.isPending} onClick={() => setConfirm(true)}>Abgeben</Button></div>
      <ConfirmDialog open={confirm} title="Prüfung abgeben?" message={answered < view.questions.length ? `Du hast erst ${answered} von ${view.questions.length} Fragen beantwortet. Nach dem Abgeben sind keine Änderungen mehr möglich.` : 'Nach dem Abgeben sind keine Änderungen mehr möglich.'} confirmLabel="Abgeben" busy={submit.isPending} onConfirm={() => submit.mutate()} onClose={() => setConfirm(false)} />
    </div>
  );
}

function QuestionInput({ q, value, onChange }: { q: AttemptQuestion; value: Answer | undefined; onChange: (v: Answer) => void }) {
  const single = typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
  const multi = Array.isArray(value) ? value : value ? [value] : [];
  const name = `q-${q.id}`;
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 whitespace-pre-wrap text-sm font-medium">{q.text}</legend>
      {q.type === 'SINGLE' && q.options.map((o, i) => (
        <label key={i} className="flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-2 text-sm hover:bg-panel-2"><input type="radio" name={name} checked={single === String(i)} onChange={() => onChange(String(i))} />{o}</label>
      ))}
      {q.type === 'MULTI' && q.options.map((o, i) => (
        <label key={i} className="flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-2 text-sm hover:bg-panel-2">
          <input type="checkbox" checked={multi.includes(String(i))} onChange={(e) => onChange(e.target.checked ? [...multi, String(i)].sort() : multi.filter((x) => x !== String(i)))} />{o}
        </label>
      ))}
      {q.type === 'YESNO' && (
        <div className="flex gap-2">
          {(['ja', 'nein'] as const).map((v) => <label key={v} className="flex cursor-pointer items-center gap-2 rounded border border-line px-4 py-2 text-sm hover:bg-panel-2"><input type="radio" name={name} checked={single === v} onChange={() => onChange(v)} />{v === 'ja' ? 'Ja' : 'Nein'}</label>)}
        </div>
      )}
      {q.type === 'TEXT' && <Textarea aria-label={`Antwort auf Frage: ${q.text}`} maxLength={4000} value={single} onChange={(e) => onChange(e.target.value)} />}
      {q.type === 'NUMBER' && <Input aria-label={`Antwort auf Frage: ${q.text}`} type="number" step="any" className="max-w-xs" value={single} onChange={(e) => onChange(e.target.value)} />}
    </fieldset>
  );
}

function ResultBox({ v }: { v: AttemptView }) {
  const r = v.result;
  if (!r || r.passed == null) return <div role="status" className="rounded-md border border-line bg-panel-2 p-4 text-sm">⏳ Deine Prüfung wurde abgegeben und wird von einem Prüfer bewertet.</div>;
  const p = pct(r.score, r.maxScore);
  return (
    <div role="status" className={`grid gap-2 rounded-md border p-4 ${r.passed ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
      <p className="text-lg font-semibold">{r.passed ? '🟢 Bestanden' : '🔴 Nicht bestanden'}</p>
      {r.score != null && r.maxScore != null && <p className="text-sm">{r.score} von {r.maxScore} Punkten{p !== null && ` (${p} %)`} · Bestanden ab {v.passPercent} %</p>}
      {r.feedback && <p className="whitespace-pre-wrap text-sm"><span className="text-muted">Rückmeldung: </span>{r.feedback}</p>}
    </div>
  );
}

// ───────────── Prüfungs-Editor ─────────────

const newQuestion = (): Question => ({ id: crypto.randomUUID().slice(0, 8), type: 'SINGLE', text: '', options: ['', ''], correct: [], points: 1 });
const emptyExam = (): ExamInput => ({ title: '', description: null, questions: [], questionCount: 0, passPercent: 70, timeLimitMin: null, maxAttempts: 3, retryHours: 24, autoGrade: true, showResult: true, examinerIds: [], trainingId: null, active: true });
const isChoice = (t: Question['type']) => t === 'SINGLE' || t === 'MULTI';

function examProblems(d: ExamInput): string[] {
  const out: string[] = [];
  if (!d.title.trim()) out.push('Titel fehlt');
  d.questions.forEach((q, i) => {
    const n = `Frage ${i + 1}`;
    if (!q.text.trim()) out.push(`${n}: Text fehlt`);
    if (isChoice(q.type)) {
      if (q.options.length < 2) out.push(`${n}: mindestens 2 Antworten`);
      if (q.options.some((o) => !o.trim())) out.push(`${n}: leere Antwortmöglichkeit`);
      if (q.type === 'SINGLE' && q.correct.length !== 1) out.push(`${n}: richtige Antwort wählen`);
      if (q.type === 'MULTI' && !q.correct.length) out.push(`${n}: mindestens eine richtige Antwort wählen`);
    }
    if (q.type === 'NUMBER' && (!q.correct[0]?.trim() || Number.isNaN(Number(q.correct[0].replace(',', '.'))))) out.push(`${n}: richtige Zahl fehlt`);
  });
  return out;
}

function ExamEditor({ value, onClose }: { value: Exam | 'new'; onClose: () => void }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const isNew = value === 'new';
  const [d, setD] = useState<ExamInput>(() => {
    if (value === 'new') return emptyExam();
    const { title, description, questions, questionCount, passPercent, timeLimitMin, maxAttempts, retryHours, autoGrade, showResult, examinerIds, trainingId, active } = value;
    return { title, description, questions: questions ?? [], questionCount, passPercent, timeLimitMin, maxAttempts, retryHours, autoGrade, showResult, examinerIds, trainingId, active };
  });
  const [err, setErr] = useState<string>();
  const [del, setDel] = useState(false);
  const staff = useStaff();
  const trainings = useQuery({ queryKey: ['hr-trainings'], queryFn: () => api<Training[]>('/hr/trainings'), enabled: can('training.view') });
  const set = (p: Partial<ExamInput>) => setD((x) => ({ ...x, ...p }));
  const setQ = (i: number, q: Question) => set({ questions: d.questions.map((x, j) => (j === i ? q : x)) });
  const moveQ = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= d.questions.length) return; const n = [...d.questions]; [n[i], n[j]] = [n[j]!, n[i]!]; set({ questions: n }); };
  const problems = examProblems(d);
  const save = useMutation({
    mutationFn: () => {
      const body: ExamInput = { ...d, title: d.title.trim(), description: nullIfEmpty(d.description), questions: d.questions.map((q) => ({ ...q, text: q.text.trim(), options: isChoice(q.type) ? q.options.map((o) => o.trim()) : [], correct: q.correct.map((c) => c.trim()).filter(Boolean) })) };
      return isNew ? api<Exam>('/hr/exams', { method: 'POST', body }) : api<Exam>(`/hr/exams/${value.id}`, { method: 'PUT', body });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-exams'] }); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/hr/exams/${isNew ? '' : value.id}`, { method: 'DELETE' }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-exams'] }); onClose(); },
    onError: (e) => { setDel(false); setErr(errText(e)); },
  });
  const maxPoints = d.questions.reduce((n, q) => n + q.points, 0);
  return (
    <Modal open wide title={isNew ? 'Neue Prüfung' : `Prüfung bearbeiten: ${d.title || '…'}`} onClose={onClose}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (!problems.length) save.mutate(); }}>
        <div className="grid gap-3">
          <L label="Titel *"><Input aria-label="Titel" maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} /></L>
          <L label="Beschreibung"><Textarea aria-label="Beschreibung" rows={3} maxLength={3000} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></L>
          <div className="grid gap-3 sm:grid-cols-3">
            <L label="Bestehensgrenze (%)"><Input aria-label="Bestehensgrenze in Prozent" type="number" min={1} max={100} value={d.passPercent} onChange={(e) => set({ passPercent: Number(e.target.value) })} /></L>
            <L label="Zeitlimit (Min.)" hint="Leer = ohne Zeitlimit"><Input aria-label="Zeitlimit in Minuten" type="number" min={1} max={600} value={d.timeLimitMin ?? ''} onChange={(e) => set({ timeLimitMin: e.target.value ? Number(e.target.value) : null })} /></L>
            <L label="Max. Versuche"><Input aria-label="Maximale Versuche" type="number" min={1} max={50} value={d.maxAttempts} onChange={(e) => set({ maxAttempts: Number(e.target.value) })} /></L>
            <L label="Wartezeit (Std.)" hint="Zwischen zwei Versuchen"><Input aria-label="Wartezeit in Stunden" type="number" min={0} max={2160} value={d.retryHours} onChange={(e) => set({ retryHours: Number(e.target.value) })} /></L>
            <L label="Fragen je Versuch" hint="0 = alle; sonst zufällige Auswahl"><Input aria-label="Fragen je Versuch" type="number" min={0} max={200} value={d.questionCount} onChange={(e) => set({ questionCount: Number(e.target.value) })} /></L>
            <L label="Verknüpfte Ausbildung">
              <Select aria-label="Verknüpfte Ausbildung" value={d.trainingId ?? ''} onChange={(e) => set({ trainingId: e.target.value || null })}>
                <option value="">— keine —</option>
                {(trainings.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </L>
          </div>
          <L label="Prüfer"><MultiPick ariaLabel="Prüfer hinzufügen" value={d.examinerIds} onChange={(v) => set({ examinerIds: v })} options={staff} /></L>
          <div className="grid gap-3 sm:grid-cols-3">
            <Switch label="Aktiv" checked={d.active} onChange={(v) => set({ active: v })} />
            <Switch label="Automatisch bewerten" checked={d.autoGrade} onChange={(v) => set({ autoGrade: v })} hint="Freitext ohne Stichworte → Prüfer" />
            <Switch label="Ergebnis anzeigen" checked={d.showResult} onChange={(v) => set({ showResult: v })} hint="Punkte für Teilnehmer sichtbar" />
          </div>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Fragen ({d.questions.length} · {maxPoints} Punkte)</h3><Button size="sm" variant="secondary" disabled={d.questions.length >= 200} onClick={() => set({ questions: [...d.questions, newQuestion()] })}><Plus size={14} />Frage hinzufügen</Button></div>
          {!d.questions.length && <p className="text-sm text-muted">Noch keine Fragen.</p>}
          {d.questions.map((q, i) => (
            <QuestionEditor key={q.id} q={q} index={i} count={d.questions.length} onChange={(x) => setQ(i, x)} onRemove={() => set({ questions: d.questions.filter((_, j) => j !== i) })} onMove={(dir) => moveQ(i, dir)} />
          ))}
        </div>
        {problems.length > 0 && <p className="text-xs text-warning">Noch offen: {problems.slice(0, 6).join(' · ')}{problems.length > 6 ? ' …' : ''}</p>}
        {err && <p role="alert" className="text-sm text-danger">{err}</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3">
          <Button type="submit" disabled={!!problems.length || save.isPending}>{isNew ? 'Erstellen' : 'Speichern'}</Button>
          <div className="flex gap-2">
            {!isNew && can('exam.manage') && <Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} />Löschen</Button>}
            <Button variant="secondary" onClick={onClose}>Abbrechen</Button>
          </div>
        </div>
      </form>
      <ConfirmDialog open={del} danger title="Prüfung löschen?" message="Die Prüfung und alle Versuche werden gelöscht. Das kann nicht rückgängig gemacht werden." confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />
    </Modal>
  );
}

function QuestionEditor({ q, index, count, onChange, onRemove, onMove }: { q: Question; index: number; count: number; onChange: (q: Question) => void; onRemove: () => void; onMove: (d: -1 | 1) => void }) {
  const [keywords, setKeywords] = useState(q.type === 'TEXT' ? q.correct.join(', ') : '');
  const n = index + 1;
  const setType = (type: Question['type']) => onChange({ ...q, type, options: isChoice(type) ? (q.options.length ? q.options : ['', '']) : [], correct: type === 'YESNO' ? ['ja'] : [] });
  const setOption = (i: number, v: string) => onChange({ ...q, options: q.options.map((o, j) => (j === i ? v : o)) });
  const removeOption = (i: number) => onChange({
    ...q, options: q.options.filter((_, j) => j !== i),
    correct: q.correct.filter((c) => c !== String(i)).map((c) => (Number(c) > i ? String(Number(c) - 1) : c)),
  });
  const toggleCorrect = (i: number, on: boolean) => {
    const k = String(i);
    if (q.type === 'SINGLE') onChange({ ...q, correct: [k] });
    else onChange({ ...q, correct: on ? [...new Set([...q.correct, k])].sort() : q.correct.filter((c) => c !== k) });
  };
  return (
    <fieldset className="grid gap-2 rounded-md border border-line bg-panel-2 p-3">
      <legend className="sr-only">Frage {n}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Frage {n}</span>
        <Select aria-label={`Typ von Frage ${n}`} className="w-44 py-1" value={q.type} onChange={(e) => setType(e.target.value as Question['type'])}>
          {EXAM_QUESTION_TYPES.map((t) => <option key={t} value={t}>{EXAM_QUESTION_TYPE_LABEL[t]}</option>)}
        </Select>
        <label className="flex items-center gap-1 text-xs text-muted">Punkte<Input aria-label={`Punkte für Frage ${n}`} type="number" min={0} max={100} step={0.5} className="w-20 py-1" value={q.points} onChange={(e) => onChange({ ...q, points: Number(e.target.value) })} /></label>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} nach oben`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} nach unten`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} löschen`} onClick={onRemove}><Trash2 size={14} /></Button>
        </div>
      </div>
      <Textarea aria-label={`Text von Frage ${n}`} rows={2} maxLength={1000} placeholder="Fragetext" value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
      {isChoice(q.type) && (
        <div className="grid gap-1.5">
          <span className="text-xs text-muted">Antwortmöglichkeiten – {q.type === 'SINGLE' ? 'die richtige markieren' : 'alle richtigen markieren'}</span>
          {q.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type={q.type === 'SINGLE' ? 'radio' : 'checkbox'} name={`correct-${q.id}`} aria-label={`Antwort ${i + 1} ist richtig`} checked={q.correct.includes(String(i))} onChange={(e) => toggleCorrect(i, e.target.checked)} />
              <Input aria-label={`Antwort ${i + 1} von Frage ${n}`} className="py-1" maxLength={200} value={o} onChange={(e) => setOption(i, e.target.value)} />
              <Button size="sm" variant="ghost" aria-label={`Antwort ${i + 1} entfernen`} disabled={q.options.length <= 2} onClick={() => removeOption(i)}><X size={14} /></Button>
            </div>
          ))}
          {q.options.length < 10 && <div><Button size="sm" variant="ghost" onClick={() => onChange({ ...q, options: [...q.options, ''] })}><Plus size={14} />Antwort hinzufügen</Button></div>}
        </div>
      )}
      {q.type === 'YESNO' && (
        <L label="Richtige Antwort"><Select aria-label={`Richtige Antwort für Frage ${n}`} className="w-32" value={q.correct[0] ?? 'ja'} onChange={(e) => onChange({ ...q, correct: [e.target.value] })}><option value="ja">Ja</option><option value="nein">Nein</option></Select></L>
      )}
      {q.type === 'NUMBER' && (
        <L label="Richtige Zahl"><Input aria-label={`Richtige Zahl für Frage ${n}`} className="w-40" inputMode="decimal" value={q.correct[0] ?? ''} onChange={(e) => onChange({ ...q, correct: [e.target.value] })} /></L>
      )}
      {q.type === 'TEXT' && (
        <L label="Stichworte (optional, kommagetrennt)" hint="Alle Stichworte müssen in der Antwort vorkommen. Leer = Bewertung durch einen Prüfer.">
          <Input aria-label={`Stichworte für Frage ${n}`} value={keywords} onChange={(e) => { setKeywords(e.target.value); onChange({ ...q, correct: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10) }); }} />
        </L>
      )}
    </fieldset>
  );
}

// ───────────── Bewertung ─────────────

const ATTEMPT_STATUS: Record<string, { label: string; tone: Tone }> = { IN_PROGRESS: { label: 'Läuft', tone: 'warning' }, SUBMITTED: { label: 'Wartet auf Bewertung', tone: 'info' }, GRADED: { label: 'Bewertet', tone: 'success' } };

function GradingTab() {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['hr-attempts'], queryFn: () => api<AttemptRow[]>('/hr/attempts') });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const all = q.data ?? [];
  const list = filter === 'open' ? all.filter((a) => a.status === 'SUBMITTED') : all;
  return (
    <Card title="Prüfungsversuche" actions={
      <Select aria-label="Filter" className="w-56" value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')}>
        <option value="open">Zu bewerten ({all.filter((a) => a.status === 'SUBMITTED').length})</option>
        <option value="all">Alle Versuche ({all.length})</option>
      </Select>
    }>
      {!list.length ? <EmptyState text={filter === 'open' ? 'Nichts zu bewerten' : 'Noch keine Versuche'} /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted"><tr><th className="p-2">Person</th><th className="p-2">Prüfung</th><th className="p-2">Status</th><th className="p-2">Ergebnis</th><th className="p-2">Abgegeben</th><th className="p-2"><span className="sr-only">Aktion</span></th></tr></thead>
            <tbody>
              {list.map((a) => {
                const s = ATTEMPT_STATUS[a.status] ?? { label: a.status, tone: 'neutral' as Tone };
                const p = pct(a.score, a.maxScore);
                return (
                  <tr key={a.id} className="border-t border-line">
                    <td className="p-2 font-medium">{a.personnel.user.displayName}</td>
                    <td className="p-2">{a.exam.title}</td>
                    <td className="p-2"><Badge tone={s.tone}>{s.label}</Badge></td>
                    <td className="p-2">{a.passed === true ? '🟢 ' : a.passed === false ? '🔴 ' : ''}{p !== null ? `${a.score}/${a.maxScore} (${p} %)` : '—'}</td>
                    <td className="p-2">{fmt(a.submittedAt)}</td>
                    <td className="p-2 text-right">{a.status !== 'IN_PROGRESS' && <Button size="sm" variant={a.status === 'SUBMITTED' ? 'primary' : 'secondary'} onClick={() => setOpen(a.id)}>{a.status === 'SUBMITTED' ? 'Bewerten' : 'Ansehen'}</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <GradeModal id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

function fmtAnswer(q: AttemptQuestion, a: unknown): string {
  if (a == null || a === '' || (Array.isArray(a) && !a.length)) return '—';
  const opt = (x: unknown) => q.options[Number(x)] ?? String(x);
  if (q.type === 'SINGLE') return opt(Array.isArray(a) ? a[0] : a);
  if (q.type === 'MULTI') return (Array.isArray(a) ? a : [a]).map(opt).join(', ');
  if (q.type === 'YESNO') return String(a).toLowerCase() === 'ja' ? 'Ja' : String(a).toLowerCase() === 'nein' ? 'Nein' : String(a);
  return Array.isArray(a) ? a.map(String).join(', ') : String(a);
}
function fmtCorrect(q: AttemptQuestion): string {
  const c = q.correct ?? [];
  if (!c.length) return q.type === 'TEXT' ? 'manuelle Bewertung' : '—';
  if (q.type === 'TEXT') return `Stichworte: ${c.join(', ')}`;
  return fmtAnswer(q, q.type === 'MULTI' ? c : c[0]);
}

function GradeModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['hr-attempts', id], queryFn: () => api<AttemptView>(`/hr/attempts/${id}`) });
  return (
    <Modal open wide title={q.data ? `${q.data.title} – ${q.data.name}` : 'Versuch'} onClose={onClose}>
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data && <GradeForm v={q.data} onClose={onClose} />}
    </Modal>
  );
}

function GradeForm({ v, onClose }: { v: AttemptView; onClose: () => void }) {
  const qc = useQueryClient();
  const answers = v.answers ?? {};
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(v.questions.map((q) => [q.id, gradeAnswer({ ...q, correct: q.correct ?? [] }, answers[q.id]) ?? 0])));
  const [feedback, setFeedback] = useState(v.result?.feedback ?? '');
  const [err, setErr] = useState<string>();
  const total = v.questions.reduce((n, q) => n + Math.min(q.points, scores[q.id] ?? 0), 0);
  const max = v.questions.reduce((n, q) => n + q.points, 0);
  const p = max ? Math.round((total / max) * 100) : 0;
  const grade = useMutation({
    mutationFn: () => api<AttemptView>(`/hr/attempts/${v.id}/grade`, { method: 'POST', body: { scores, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['hr-attempts'] }); onClose(); },
    onError: (e) => setErr(errText(e)),
  });
  return (
    <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); grade.mutate(); }}>
      <p className="text-xs text-muted">Abgegeben: {fmt(v.submittedAt)} · Status: {ATTEMPT_STATUS[v.status]?.label ?? v.status}{v.result?.passed != null && ` · bisher ${v.result.passed ? '🟢 bestanden' : '🔴 nicht bestanden'}`}</p>
      <ol className="grid gap-2">
        {v.questions.map((q, i) => {
          const auto = gradeAnswer({ ...q, correct: q.correct ?? [] }, answers[q.id]);
          return (
            <li key={q.id} className="grid gap-1.5 rounded-md border border-line bg-panel-2 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><span className="text-xs text-muted">Frage {i + 1} · {EXAM_QUESTION_TYPE_LABEL[q.type]}</span><p className="whitespace-pre-wrap font-medium">{q.text}</p></div>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <Input aria-label={`Punkte für Frage ${i + 1}`} type="number" min={0} max={q.points} step={0.5} className="w-20 py-1" value={scores[q.id] ?? 0} onChange={(e) => setScores({ ...scores, [q.id]: Math.max(0, Math.min(q.points, Number(e.target.value) || 0)) })} />
                  / {q.points}
                </label>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                <div><span className="text-xs text-muted">Antwort: </span><span className="whitespace-pre-wrap">{fmtAnswer(q, answers[q.id])}</span></div>
                <div><span className="text-xs text-muted">Richtig: </span>{fmtCorrect(q)}{auto !== null && <span className="ml-1">{auto >= q.points ? '✅' : '❌'}</span>}</div>
              </div>
            </li>
          );
        })}
      </ol>
      <L label="Rückmeldung (optional)"><Textarea aria-label="Rückmeldung" rows={3} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} /></L>
      <p className="text-sm">Summe: <strong>{total} / {max}</strong> Punkte ({p} %) · Bestanden ab {v.passPercent} % → {p >= v.passPercent ? '🟢 Bestanden' : '🔴 Nicht bestanden'}</p>
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={grade.isPending}>{v.status === 'GRADED' ? 'Neu bewerten' : 'Bewertung speichern'}</Button></div>
    </form>
  );
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
