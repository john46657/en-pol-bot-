import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Copy, Download, Eye, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import {
  EXAM_EXPORT_FORMAT, EXAM_LAYOUTS, EXAM_LAYOUT_LABEL, EXAM_QUESTION_TYPES, EXAM_QUESTION_TYPE_HINT, EXAM_QUESTION_TYPE_LABEL, EXAM_REVIEW_LABEL, EXAM_REVIEW_MODES,
  examProblems, gapAnswers, gradeAnswer, maskGaps, questionProblems, type ExamInput, type ExamQuestionType, type Question,
} from '@enrp/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { errText } from '../../../lib/tickets';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Input, PageHeader, Select, SkeletonRows, Textarea } from '../../../components/ui';
import { AudiencePicker } from '../../../components/AudiencePicker';
import { L, MultiPick, Switch, useStaff } from '../trainingCommon';
import { AnswerReview, download, fileSafe, fromLocal, pts, QuestionImage, QuestionInput, toLocal, useExams, type Answer, type AttemptQuestion, type ExamDetail } from './common';

interface Training { id: string; name: string }

const emptyExam = (): ExamInput => ({
  title: '', description: null, instructions: null, category: null, questions: [], questionCount: 0, passPercent: 70, timeLimitMin: null, maxAttempts: 3, retryHours: 24,
  autoGrade: true, showResult: true, reviewMode: 'ANSWERS', layout: 'PAGED', shuffleQuestions: false, shuffleOptions: false, examinerIds: [], audienceRoleIds: [],
  trainingId: null, requiredExamId: null, availableFrom: null, availableUntil: null, notifyExaminers: true, active: true,
});
const newId = () => crypto.randomUUID().slice(0, 8);
const newQuestion = (type: ExamQuestionType = 'SINGLE'): Question => ({
  id: newId(), type, text: type === 'GAP' ? 'Text mit {{Lücke}}' : '', options: ['SINGLE', 'MULTI', 'ORDER', 'MATCH'].includes(type) ? ['', ''] : [], matches: type === 'MATCH' ? ['', ''] : [],
  correct: type === 'YESNO' ? ['ja'] : [], points: 1, partial: false, tolerance: 0, explanation: null, image: null,
});
const usesOptions = (t: ExamQuestionType) => t === 'SINGLE' || t === 'MULTI' || t === 'ORDER' || t === 'MATCH';
const canPartial = (q: Question) => q.type === 'MULTI' || q.type === 'ORDER' || q.type === 'MATCH' || q.type === 'GAP' || (q.type === 'TEXT' && q.correct.length > 1);
const pick = (e: ExamInput): ExamInput => { const x = emptyExam(); return Object.fromEntries(Object.keys(x).map((k) => [k, (e as unknown as Record<string, unknown>)[k] ?? (x as unknown as Record<string, unknown>)[k]])) as unknown as ExamInput; };
/** Für den Server aufräumen (Leerzeichen, unbenutzte Felder je Typ). */
const clean = (d: ExamInput): ExamInput => ({
  ...d, title: d.title.trim(), category: d.category?.trim() || null, description: d.description?.trim() || null, instructions: d.instructions?.trim() || null,
  questions: d.questions.map((q) => ({
    ...q, text: q.text.trim(), options: usesOptions(q.type) ? q.options.map((o) => o.trim()) : [], matches: q.type === 'MATCH' ? q.matches.map((o) => o.trim()) : [],
    correct: q.type === 'ORDER' || q.type === 'MATCH' || q.type === 'GAP' ? [] : q.correct.map((c) => c.trim()).filter(Boolean), partial: canPartial(q) && q.partial,
    tolerance: q.type === 'NUMBER' ? q.tolerance : 0, image: q.image?.trim() || null, explanation: q.explanation?.trim() || null,
  })),
});
/** Frage so, wie Teilnehmer sie sehen (für die Vorschau). */
const asAttempt = (q: Question): AttemptQuestion => ({
  id: q.id, type: q.type, text: q.type === 'GAP' ? maskGaps(q.text) : q.text, image: q.image, points: q.points, partial: q.partial,
  options: usesOptions(q.type) ? q.options.map((text, i) => ({ i, text })) : [], matches: q.type === 'MATCH' ? q.matches.map((text, i) => ({ i, text })).reverse() : [],
  correct: q.correct, gaps: q.type === 'GAP' ? gapAnswers(q.text) : undefined, tolerance: q.tolerance, explanation: q.explanation,
});

const draftKey = (id: string | undefined) => `enrp.examDraft.${id ?? 'new'}`;
interface Draft { at: number; data: ExamInput }
const readDraft = (id: string | undefined): Draft | null => { try { return JSON.parse(localStorage.getItem(draftKey(id)) ?? 'null') as Draft | null; } catch { return null; } };
const writeDraft = (id: string | undefined, data: ExamInput) => { try { localStorage.setItem(draftKey(id), JSON.stringify({ at: Date.now(), data })); } catch { /* privater Modus */ } };
const dropDraft = (id: string | undefined) => { try { localStorage.removeItem(draftKey(id)); } catch { /* egal */ } };

/** Seite: Prüfung anlegen/bearbeiten. */
export function ExamEditorPage() {
  const { id } = useParams();
  const loc = useLocation();
  const draft = (loc.state as { draft?: ExamInput } | null)?.draft;
  const q = useQuery({ queryKey: ['hr-exam', id], queryFn: () => api<ExamDetail>(`/hr/exams/${id}`), enabled: !!id });
  if (id && q.isLoading) return <SkeletonRows />;
  if (id && q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const initial = id && q.data ? pick(q.data) : draft ? pick(draft) : emptyExam();
  return <ExamEditor key={id ?? `new-${draft ? 'draft' : 'empty'}`} id={id} initial={initial} updatedAt={q.data?.updatedAt} attemptCount={q.data?.attemptCount ?? 0} fromImport={!!draft} />;
}

function ExamEditor({ id, initial, updatedAt, attemptCount, fromImport }: { id?: string; initial: ExamInput; updatedAt?: string; attemptCount: number; fromImport: boolean }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const isNew = !id;
  const [d, setD] = useState<ExamInput>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(isNew && fromImport ? emptyExam() : initial));
  const dirty = JSON.stringify(d) !== saved;
  const [open, setOpen] = useState<Set<string>>(() => new Set(initial.questions.length <= 3 ? initial.questions.map((q) => q.id) : []));
  const [preview, setPreview] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [del, setDel] = useState(false);
  const [addType, setAddType] = useState<ExamQuestionType>('SINGLE');
  const [restore, setRestore] = useState<Draft | null>(() => {
    const r = readDraft(id);
    return r && JSON.stringify(r.data) !== JSON.stringify(initial) && (!updatedAt || r.at > new Date(updatedAt).getTime()) ? r : null;
  });
  const staff = useStaff();
  const exams = useExams();
  const trainings = useQuery({ queryKey: ['hr-trainings'], queryFn: () => api<Training[]>('/hr/trainings'), enabled: can('training.view') });
  const categories = useMemo(() => [...new Set((exams.data ?? []).map((e) => e.category).filter((c): c is string => !!c))], [exams.data]);
  const set = (p: Partial<ExamInput>) => { setMsg(undefined); setD((x) => ({ ...x, ...p })); };
  const setQ = (i: number, q: Question) => set({ questions: d.questions.map((x, j) => (j === i ? q : x)) });
  const moveQ = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= d.questions.length) return; const n = [...d.questions]; [n[i], n[j]] = [n[j]!, n[i]!]; set({ questions: n }); };
  const toggle = (qid: string, v?: boolean) => setOpen((s) => { const n = new Set(s); if (v ?? !n.has(qid)) n.add(qid); else n.delete(qid); return n; });
  const problems = examProblems(d);
  const maxPoints = d.questions.reduce((n, q) => n + q.points, 0);

  // lokaler Entwurf: nichts geht verloren (Neuladen, Tab geschlossen)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (dirty && !restore) timer.current = setTimeout(() => writeDraft(id, d), 600);
    return () => clearTimeout(timer.current);
  }, [d, dirty, id, restore]);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const save = useMutation({
    mutationFn: () => { const body = clean(d); return isNew ? api<{ id: string }>('/hr/exams', { method: 'POST', body }) : api<{ id: string }>(`/hr/exams/${id}`, { method: 'PUT', body }); },
    onSuccess: (r) => {
      dropDraft(id); setSaved(JSON.stringify(d)); setMsg({ ok: true, text: 'Gespeichert.' });
      void qc.invalidateQueries({ queryKey: ['hr-exams'] }); void qc.invalidateQueries({ queryKey: ['hr-exam', r.id] });
      if (isNew) { dropDraft(undefined); nav(`/trainings/exams/${r.id}/edit`, { replace: true }); }
    },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/hr/exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => { dropDraft(id); setSaved(JSON.stringify(d)); void qc.invalidateQueries({ queryKey: ['hr-exams'] }); nav('/trainings?tab=Prüfungen'); },
    onError: (e) => { setDel(false); setMsg({ ok: false, text: errText(e) }); },
  });
  const exportFile = () => download(`pruefung-${fileSafe(d.title)}.json`, JSON.stringify({ format: EXAM_EXPORT_FORMAT, version: 1, exam: { ...clean(d), examinerIds: [], audienceRoleIds: [], trainingId: null, requiredExamId: null } }, null, 2));
  const addQuestion = () => { const q = newQuestion(addType); set({ questions: [...d.questions, q] }); toggle(q.id, true); setTimeout(() => document.getElementById(`question-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); };

  return (
    <div className="pb-24">
      <Link to="/trainings?tab=Prüfungen" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} />Prüfungen</Link>
      <PageHeader title={isNew ? '📝 Neue Prüfung' : `📝 ${d.title || 'Prüfung'} bearbeiten`} subtitle={isNew ? 'Lege Einstellungen und Fragen fest. Ein Entwurf wird automatisch im Browser gesichert.' : `${attemptCount} ${attemptCount === 1 ? 'Versuch' : 'Versuche'} bisher · Änderungen an Fragen wirken nur auf neue Versuche.`}
        actions={<>
          <Button variant="secondary" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>{preview ? <><Pencil size={14} />Bearbeiten</> : <><Eye size={14} />Vorschau</>}</Button>
          {d.questions.length > 0 && <Button variant="secondary" onClick={exportFile}><Download size={14} />Export</Button>}
        </>} />
      {restore && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span>Es gibt einen ungespeicherten Entwurf vom {new Date(restore.at).toLocaleString('de-DE')}.</span>
          <span className="flex gap-2"><Button size="sm" onClick={() => { setD(restore.data); setRestore(null); }}>Wiederherstellen</Button><Button size="sm" variant="secondary" onClick={() => { dropDraft(id); setRestore(null); }}>Verwerfen</Button></span>
        </div>
      )}
      {fromImport && isNew && <p className="mb-4 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm">Vorlage/Import geladen – prüfe die Einstellungen und speichere. Prüfer, Zielgruppe und Verknüpfungen bitte neu wählen.</p>}

      {preview ? <Preview d={d} /> : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid min-w-0 gap-4">
            <Card title="Allgemein">
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                  <L label="Titel *"><Input aria-label="Titel" maxLength={120} value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="z. B. Funkprüfung" /></L>
                  <L label="Kategorie"><Input aria-label="Kategorie" maxLength={60} list="exam-categories" value={d.category ?? ''} onChange={(e) => set({ category: e.target.value })} placeholder="z. B. Grundausbildung" /></L>
                  <datalist id="exam-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                </div>
                <L label="Beschreibung" hint="Kurz – erscheint in der Übersicht."><Textarea aria-label="Beschreibung" rows={2} maxLength={3000} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></L>
                <L label="Hinweise vor Beginn" hint="Erscheinen auf der Startseite der Prüfung (Regeln, Hilfsmittel, Ablauf)."><Textarea aria-label="Hinweise vor Beginn" rows={3} maxLength={4000} value={d.instructions ?? ''} onChange={(e) => set({ instructions: e.target.value })} /></L>
              </div>
            </Card>

            <Card title={<span>Fragen <span className="font-normal text-muted">· {d.questions.length} · {pts(maxPoints)}</span></span>} actions={d.questions.length > 1 && (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setOpen(new Set(d.questions.map((q) => q.id)))}>Alle aufklappen</Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(new Set())}>Alle zuklappen</Button>
              </span>
            )}>
              <div className="grid gap-2">
                {!d.questions.length && <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">Noch keine Fragen. Wähle unten einen Fragetyp und füge die erste Frage hinzu.</p>}
                {d.questions.map((q, i) => (
                  <QuestionEditor key={q.id} q={q} index={i} count={d.questions.length} open={open.has(q.id)} onToggle={() => toggle(q.id)}
                    onChange={(x) => setQ(i, x)} onMove={(dir) => moveQ(i, dir)}
                    onRemove={() => set({ questions: d.questions.filter((_, j) => j !== i) })}
                    onDuplicate={() => { const c = { ...q, id: newId() }; const n = [...d.questions]; n.splice(i + 1, 0, c); set({ questions: n }); toggle(c.id, true); }} />
                ))}
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line p-3">
                  <Select aria-label="Fragetyp der neuen Frage" className="w-auto min-w-48" value={addType} onChange={(e) => setAddType(e.target.value as ExamQuestionType)}>
                    {EXAM_QUESTION_TYPES.map((t) => <option key={t} value={t}>{EXAM_QUESTION_TYPE_LABEL[t]}</option>)}
                  </Select>
                  <Button disabled={d.questions.length >= 200} onClick={addQuestion}><Plus size={14} />Frage hinzufügen</Button>
                  <span className="text-xs text-muted">{EXAM_QUESTION_TYPE_HINT[addType]}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid content-start gap-4">
            <Card title="Ablauf">
              <div className="grid gap-3">
                <L label="Darstellung"><Select aria-label="Darstellung" value={d.layout} onChange={(e) => set({ layout: e.target.value as ExamInput['layout'] })}>{EXAM_LAYOUTS.map((l) => <option key={l} value={l}>{EXAM_LAYOUT_LABEL[l]}</option>)}</Select></L>
                <div className="grid grid-cols-2 gap-3">
                  <L label="Zeitlimit (Min.)" hint="leer = ohne"><Input aria-label="Zeitlimit in Minuten" type="number" min={1} max={600} value={d.timeLimitMin ?? ''} onChange={(e) => set({ timeLimitMin: e.target.value ? Number(e.target.value) : null })} /></L>
                  <L label="Fragen je Versuch" hint={`0 = alle (${d.questions.length})`}><Input aria-label="Fragen je Versuch" type="number" min={0} max={200} value={d.questionCount} onChange={(e) => set({ questionCount: Number(e.target.value) })} /></L>
                </div>
                <Switch label="Fragen mischen" checked={d.shuffleQuestions} onChange={(v) => set({ shuffleQuestions: v })} hint="Jeder Versuch in anderer Reihenfolge" />
                <Switch label="Antworten mischen" checked={d.shuffleOptions} onChange={(v) => set({ shuffleOptions: v })} hint="Reihenfolge der Antwortmöglichkeiten" />
              </div>
            </Card>
            <Card title="Bewertung & Versuche">
              <div className="grid gap-3">
                <div className="grid grid-cols-3 gap-3">
                  <L label="Bestehen ab %"><Input aria-label="Bestehensgrenze in Prozent" type="number" min={1} max={100} value={d.passPercent} onChange={(e) => set({ passPercent: Number(e.target.value) })} /></L>
                  <L label="Versuche"><Input aria-label="Maximale Versuche" type="number" min={1} max={50} value={d.maxAttempts} onChange={(e) => set({ maxAttempts: Number(e.target.value) })} /></L>
                  <L label="Wartezeit (Std.)"><Input aria-label="Wartezeit in Stunden" type="number" min={0} max={2160} value={d.retryHours} onChange={(e) => set({ retryHours: Number(e.target.value) })} /></L>
                </div>
                <Switch label="Automatisch bewerten" checked={d.autoGrade} onChange={(v) => set({ autoGrade: v })} hint="Freitext ohne Stichworte geht immer an Prüfer" />
                <Switch label="Punkte anzeigen" checked={d.showResult} onChange={(v) => set({ showResult: v })} hint="Sonst nur „bestanden / nicht bestanden“" />
                <L label="Einsicht nach der Bewertung"><Select aria-label="Einsicht nach der Bewertung" value={d.reviewMode} onChange={(e) => set({ reviewMode: e.target.value as ExamInput['reviewMode'] })}>{EXAM_REVIEW_MODES.map((m) => <option key={m} value={m}>{EXAM_REVIEW_LABEL[m]}</option>)}</Select></L>
              </div>
            </Card>
            <Card title="Zugriff & Verknüpfung">
              <div className="grid gap-3">
                <Switch label="Freigegeben" checked={d.active} onChange={(v) => set({ active: v })} hint="Aus = Entwurf, nur für Verwalter sichtbar" />
                <div className="grid grid-cols-2 gap-3">
                  <L label="Verfügbar ab"><Input aria-label="Verfügbar ab" type="datetime-local" value={toLocal(d.availableFrom)} onChange={(e) => set({ availableFrom: fromLocal(e.target.value) })} /></L>
                  <L label="Verfügbar bis"><Input aria-label="Verfügbar bis" type="datetime-local" value={toLocal(d.availableUntil)} onChange={(e) => set({ availableUntil: fromLocal(e.target.value) })} /></L>
                </div>
                <L label="Zielgruppe (Dashboard-Rollen)" hint="Leer = alle mit Prüfungs-Zugriff"><AudiencePicker value={d.audienceRoleIds} onChange={(v) => set({ audienceRoleIds: v })} /></L>
                <L label="Prüfer" hint="Bewerten Freitext-Antworten und sehen die Ergebnisse"><MultiPick ariaLabel="Prüfer hinzufügen" value={d.examinerIds} onChange={(v) => set({ examinerIds: v })} options={staff} /></L>
                <Switch label="Prüfer bei Abgabe benachrichtigen" checked={d.notifyExaminers} onChange={(v) => set({ notifyExaminers: v })} hint="Wenn manuell bewertet werden muss" />
                <L label="Voraussetzung" hint="Diese Prüfung muss vorher bestanden sein">
                  <Select aria-label="Vorausgesetzte Prüfung" value={d.requiredExamId ?? ''} onChange={(e) => set({ requiredExamId: e.target.value || null })}>
                    <option value="">— keine —</option>
                    {(exams.data ?? []).filter((e) => e.id !== id).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </Select>
                </L>
                {can('training.view') && (
                  <L label="Verknüpfte Ausbildung" hint="Bestanden → Ausbildung „in Bearbeitung“">
                    <Select aria-label="Verknüpfte Ausbildung" value={d.trainingId ?? ''} onChange={(e) => set({ trainingId: e.target.value || null })}>
                      <option value="">— keine —</option>
                      {(trainings.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </Select>
                  </L>
                )}
              </div>
            </Card>
            {!isNew && can('exam.manage') && <Card title="Gefahrenbereich"><Button variant="danger" onClick={() => setDel(true)}><Trash2 size={14} />Prüfung löschen</Button></Card>}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 max-md:bottom-bottombar border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1 text-xs">
            {msg ? <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-success' : 'text-danger'}>{msg.text}</span>
              : problems.length ? <span className="text-warning">⚠️ {problems.length} offen: {problems.slice(0, 3).join(' · ')}{problems.length > 3 ? ' …' : ''}</span>
              : dirty ? <span className="text-muted">Ungespeicherte Änderungen (lokal gesichert)</span> : <span className="text-muted">Alles gespeichert</span>}
          </div>
          <Button variant="secondary" onClick={() => nav('/trainings?tab=Prüfungen')}>{dirty ? 'Abbrechen' : 'Schließen'}</Button>
          <Button disabled={!!problems.length || save.isPending || (!dirty && !isNew)} onClick={() => save.mutate()}><Save size={14} />{isNew ? 'Prüfung erstellen' : 'Speichern'}</Button>
        </div>
      </div>
      <ConfirmDialog open={del} danger title="Prüfung löschen?" message={`Die Prüfung${attemptCount ? ` und ${attemptCount} ${attemptCount === 1 ? 'Versuch' : 'Versuche'}` : ''} werden gelöscht. Einträge in den Personalakten bleiben. Das kann nicht rückgängig gemacht werden.`} confirmLabel="Löschen" busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDel(false)} />
    </div>
  );
}

// ───────────── Frage bearbeiten ─────────────

function QuestionEditor({ q, index, count, open, onToggle, onChange, onRemove, onMove, onDuplicate }: {
  q: Question; index: number; count: number; open: boolean; onToggle: () => void; onChange: (q: Question) => void; onRemove: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void;
}) {
  const n = index + 1;
  const [keywords, setKeywords] = useState(q.type === 'TEXT' ? q.correct.join(', ') : '');
  const problems = questionProblems(q, `Frage ${n}`).map((p) => p.replace(`Frage ${n}: `, ''));
  const setType = (type: ExamQuestionType) => {
    const opts = usesOptions(type) ? (q.options.length >= 2 ? q.options : [...q.options, '', ''].slice(0, Math.max(2, q.options.length))) : [];
    onChange({ ...q, type, options: opts, matches: type === 'MATCH' ? opts.map((_, i) => q.matches[i] ?? '') : [], correct: type === 'YESNO' ? ['ja'] : [], text: type === 'GAP' && !q.text.includes('{{') ? `${q.text} {{Lücke}}`.trim() : q.text });
    setKeywords('');
  };
  const setOption = (i: number, v: string) => onChange({ ...q, options: q.options.map((o, j) => (j === i ? v : o)) });
  const removeOption = (i: number) => onChange({
    ...q, options: q.options.filter((_, j) => j !== i), matches: q.type === 'MATCH' ? q.matches.filter((_, j) => j !== i) : q.matches,
    correct: q.type === 'SINGLE' || q.type === 'MULTI' ? q.correct.filter((c) => c !== String(i)).map((c) => (Number(c) > i ? String(Number(c) - 1) : c)) : q.correct,
  });
  const moveOption = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= q.options.length) return;
    const o = [...q.options]; [o[i], o[j]] = [o[j]!, o[i]!];
    const m = [...q.matches]; if (q.type === 'MATCH') [m[i], m[j]] = [m[j]!, m[i]!];
    const swap = (c: string) => (c === String(i) ? String(j) : c === String(j) ? String(i) : c);
    onChange({ ...q, options: o, matches: m, correct: q.type === 'SINGLE' || q.type === 'MULTI' ? q.correct.map(swap) : q.correct });
  };
  const toggleCorrect = (i: number, on: boolean) => {
    const k = String(i);
    if (q.type === 'SINGLE') onChange({ ...q, correct: [k] });
    else onChange({ ...q, correct: on ? [...new Set([...q.correct, k])].sort() : q.correct.filter((c) => c !== k) });
  };
  const gaps = q.type === 'GAP' ? gapAnswers(q.text) : [];
  const summary = q.text.replace(/\{\{([^{}]*)\}\}/g, '[…]').split('\n')[0] || 'Ohne Text';
  return (
    <fieldset id={`question-${q.id}`} className={`rounded-lg border bg-panel-2/50 ${problems.length ? 'border-warning/50' : 'border-line'}`}>
      <legend className="sr-only">Frage {n}</legend>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown size={16} className="shrink-0 text-muted" /> : <ChevronRight size={16} className="shrink-0 text-muted" />}
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{n}</span>
          <span className="min-w-0 truncate text-sm">{summary}</span>
        </button>
        <Badge>{EXAM_QUESTION_TYPE_LABEL[q.type]}</Badge>
        <span className="text-xs tabular-nums text-muted">{pts(q.points)}</span>
        {problems.length > 0 && <Badge tone="warning" icon="⚠️">{problems.length}</Badge>}
        <span className="flex gap-0.5">
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} nach oben`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} nach unten`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} duplizieren`} title="Duplizieren" onClick={onDuplicate}><Copy size={14} /></Button>
          <Button size="sm" variant="ghost" aria-label={`Frage ${n} löschen`} title="Löschen" onClick={onRemove}><Trash2 size={14} /></Button>
        </span>
      </div>
      {open && (
        <div className="grid gap-3 border-t border-line p-3">
          <div className="flex flex-wrap items-end gap-3">
            <L label="Fragetyp"><Select aria-label={`Typ von Frage ${n}`} className="w-48" value={q.type} onChange={(e) => setType(e.target.value as ExamQuestionType)}>{EXAM_QUESTION_TYPES.map((t) => <option key={t} value={t}>{EXAM_QUESTION_TYPE_LABEL[t]}</option>)}</Select></L>
            <L label="Punkte"><Input aria-label={`Punkte für Frage ${n}`} type="number" min={0} max={100} step={0.5} className="w-24" value={q.points} onChange={(e) => onChange({ ...q, points: Number(e.target.value) })} /></L>
            {canPartial(q) && <div className="pb-1.5"><Switch label="Teilpunkte" checked={q.partial} onChange={(v) => onChange({ ...q, partial: v })} hint="anteilig je richtigem Teil" /></div>}
          </div>
          <p className="text-xs text-muted">{EXAM_QUESTION_TYPE_HINT[q.type]}</p>
          <L label={q.type === 'GAP' ? 'Text mit Lücken' : 'Frage'}>
            <Textarea aria-label={`Text von Frage ${n}`} rows={q.type === 'GAP' ? 3 : 2} maxLength={2000} placeholder="Fragetext" value={q.text} onChange={(e) => onChange({ ...q, text: e.target.value })} />
          </L>
          {q.type === 'GAP' && gaps.length > 0 && <p className="text-xs text-muted">{gaps.length} {gaps.length === 1 ? 'Lücke' : 'Lücken'} erkannt: {gaps.map((g, i) => <span key={i} className="mr-1 rounded bg-primary/10 px-1 text-fg">{i + 1}: {g.join(' / ') || '⚠️ leer'}</span>)}</p>}

          {(q.type === 'SINGLE' || q.type === 'MULTI') && (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted">Antwortmöglichkeiten – {q.type === 'SINGLE' ? 'die richtige markieren' : 'alle richtigen markieren'}</span>
              {q.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type={q.type === 'SINGLE' ? 'radio' : 'checkbox'} name={`correct-${q.id}`} aria-label={`Antwort ${i + 1} ist richtig`} checked={q.correct.includes(String(i))} onChange={(e) => toggleCorrect(i, e.target.checked)} />
                  <Input aria-label={`Antwort ${i + 1} von Frage ${n}`} className={`py-1 ${q.correct.includes(String(i)) ? 'border-success/60' : ''}`} maxLength={200} value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Antwort ${i + 1}`} />
                  <OptionTools i={i} len={q.options.length} onMove={moveOption} onRemove={removeOption} />
                </div>
              ))}
              {q.options.length < 12 && <div><Button size="sm" variant="ghost" onClick={() => onChange({ ...q, options: [...q.options, ''] })}><Plus size={14} />Antwort hinzufügen</Button></div>}
            </div>
          )}
          {q.type === 'ORDER' && (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted">Einträge in der richtigen Reihenfolge</span>
              {q.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 text-right text-xs text-muted">{i + 1}.</span>
                  <Input aria-label={`Eintrag ${i + 1} von Frage ${n}`} className="py-1" maxLength={200} value={o} onChange={(e) => setOption(i, e.target.value)} />
                  <OptionTools i={i} len={q.options.length} onMove={moveOption} onRemove={removeOption} />
                </div>
              ))}
              {q.options.length < 12 && <div><Button size="sm" variant="ghost" onClick={() => onChange({ ...q, options: [...q.options, ''] })}><Plus size={14} />Eintrag hinzufügen</Button></div>}
            </div>
          )}
          {q.type === 'MATCH' && (
            <div className="grid gap-1.5">
              <span className="text-xs text-muted">Richtige Paare (rechts wird beim Versuch gemischt)</span>
              {q.options.map((o, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                  <Input aria-label={`Begriff ${i + 1} von Frage ${n}`} className="py-1" maxLength={200} value={o} onChange={(e) => setOption(i, e.target.value)} placeholder="Begriff" />
                  <span aria-hidden className="text-muted">→</span>
                  <Input aria-label={`Gegenstück ${i + 1} von Frage ${n}`} className="py-1" maxLength={200} value={q.matches[i] ?? ''} onChange={(e) => onChange({ ...q, matches: q.options.map((_, j) => (j === i ? e.target.value : q.matches[j] ?? '')) })} placeholder="Gegenstück" />
                  <OptionTools i={i} len={q.options.length} onMove={moveOption} onRemove={removeOption} />
                </div>
              ))}
              {q.options.length < 12 && <div><Button size="sm" variant="ghost" onClick={() => onChange({ ...q, options: [...q.options, ''], matches: [...q.options.map((_, j) => q.matches[j] ?? ''), ''] })}><Plus size={14} />Paar hinzufügen</Button></div>}
            </div>
          )}
          {q.type === 'YESNO' && (
            <L label="Richtige Antwort"><Select aria-label={`Richtige Antwort für Frage ${n}`} className="w-32" value={q.correct[0] ?? 'ja'} onChange={(e) => onChange({ ...q, correct: [e.target.value] })}><option value="ja">Ja</option><option value="nein">Nein</option></Select></L>
          )}
          {q.type === 'NUMBER' && (
            <div className="flex flex-wrap gap-3">
              <L label="Richtige Zahl"><Input aria-label={`Richtige Zahl für Frage ${n}`} className="w-40" inputMode="decimal" value={q.correct[0] ?? ''} onChange={(e) => onChange({ ...q, correct: [e.target.value] })} /></L>
              <L label="Toleranz (±)"><Input aria-label={`Toleranz für Frage ${n}`} className="w-28" type="number" min={0} step="any" value={q.tolerance} onChange={(e) => onChange({ ...q, tolerance: Math.max(0, Number(e.target.value) || 0) })} /></L>
            </div>
          )}
          {q.type === 'TEXT' && (
            <L label="Stichworte (optional, kommagetrennt)" hint="Alle Stichworte müssen in der Antwort vorkommen (mit Teilpunkten: anteilig). Leer = Bewertung durch einen Prüfer.">
              <Input aria-label={`Stichworte für Frage ${n}`} value={keywords} onChange={(e) => { setKeywords(e.target.value); onChange({ ...q, correct: e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12) }); }} />
            </L>
          )}

          <details className="rounded-md border border-line px-3 py-2 text-sm" open={!!(q.explanation || q.image)}>
            <summary className="cursor-pointer text-xs font-medium text-muted">Erklärung & Bild (optional)</summary>
            <div className="mt-2 grid gap-2">
              <L label="Erklärung" hint="Wird bei „Einsicht mit Lösungen“ nach der Bewertung gezeigt."><Textarea aria-label={`Erklärung zu Frage ${n}`} rows={2} maxLength={2000} value={q.explanation ?? ''} onChange={(e) => onChange({ ...q, explanation: e.target.value })} /></L>
              <L label="Bild-Link (https)"><Input aria-label={`Bild-Link zu Frage ${n}`} maxLength={500} placeholder="https://…" value={q.image ?? ''} onChange={(e) => onChange({ ...q, image: e.target.value })} /></L>
            </div>
          </details>
          {problems.length > 0 && <ul className="grid gap-0.5 text-xs text-warning">{problems.map((p) => <li key={p}>⚠️ {p}</li>)}</ul>}
        </div>
      )}
    </fieldset>
  );
}

function OptionTools({ i, len, onMove, onRemove }: { i: number; len: number; onMove: (i: number, d: -1 | 1) => void; onRemove: (i: number) => void }) {
  return (
    <span className="flex shrink-0">
      <Button size="sm" variant="ghost" aria-label={`Eintrag ${i + 1} nach oben`} disabled={i === 0} onClick={() => onMove(i, -1)}><ArrowUp size={13} /></Button>
      <Button size="sm" variant="ghost" aria-label={`Eintrag ${i + 1} nach unten`} disabled={i === len - 1} onClick={() => onMove(i, 1)}><ArrowDown size={13} /></Button>
      <Button size="sm" variant="ghost" aria-label={`Eintrag ${i + 1} entfernen`} disabled={len <= 2} onClick={() => onRemove(i)}><X size={13} /></Button>
    </span>
  );
}

// ───────────── Vorschau ─────────────

/** Vorschau wie für Teilnehmer, mit sofortiger Auswertung. */
function Preview({ d }: { d: ExamInput }) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [check, setCheck] = useState(false);
  const qs = d.questions;
  const scores = qs.map((q) => gradeAnswer(q, answers[q.id]));
  const max = qs.reduce((n, q) => n + q.points, 0);
  const got = scores.reduce<number>((n, s) => n + (s ?? 0), 0);
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <Card title={`Vorschau: ${d.title || 'Ohne Titel'}`} actions={<span className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setAnswers({})}>Zurücksetzen</Button><Button size="sm" onClick={() => setCheck((c) => !c)}>{check ? 'Auswertung ausblenden' : 'Auswerten'}</Button></span>}>
        {d.instructions && <p className="mb-2 whitespace-pre-wrap text-sm text-muted">{d.instructions}</p>}
        <p className="text-xs text-muted">So sehen Teilnehmer die Fragen (ohne Mischen). Nichts wird gespeichert.</p>
        {check && <p role="status" className="mt-2 text-sm font-medium">{pts(Math.round(got * 100) / 100)} von {pts(max)} · {max ? Math.round((got / max) * 100) : 0} % · {max && (got / max) * 100 >= d.passPercent ? '🟢 bestanden' : '🔴 nicht bestanden'}{scores.some((s) => s === null) ? ' (ohne Freitext-Fragen für Prüfer)' : ''}</p>}
      </Card>
      {!qs.length && <p className="text-center text-sm text-muted">Noch keine Fragen.</p>}
      {qs.map((q, i) => {
        const aq = asAttempt(q);
        return (
          <Card key={q.id} title={<span>Frage {i + 1} <span className="font-normal text-muted">· {pts(q.points)}</span></span>}>
            <QuestionImage src={q.image} />
            {q.type !== 'GAP' && <p className="mb-3 whitespace-pre-wrap text-sm font-medium">{q.text || <span className="text-muted">Ohne Text</span>}</p>}
            {check ? <AnswerReview q={aq} answer={answers[q.id]} /> : <QuestionInput q={aq} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />}
            {check && <p className="mt-2 text-xs text-muted">{scores[i] === null ? 'Bewertung durch Prüfer' : `${pts(scores[i]!)} von ${pts(q.points)}`}{q.explanation ? ` · ${q.explanation}` : ''}</p>}
          </Card>
        );
      })}
    </div>
  );
}
