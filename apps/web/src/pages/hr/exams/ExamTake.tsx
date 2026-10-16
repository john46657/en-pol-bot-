import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BarChart3, Ban, CheckCircle2, Flag, ListChecks, Pencil, Play, Send } from 'lucide-react';
import { EXAM_LAYOUT_LABEL, EXAM_QUESTION_TYPE_LABEL, EXAM_REVIEW_LABEL, isAnswered } from '@enrp/shared';
import { api } from '../../../lib/api';
import { errText } from '../../../lib/tickets';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, SkeletonRows, Textarea } from '../../../components/ui';
import { L } from '../trainingCommon';
import { ATTEMPT_TONE, AnswerReview, attemptLabel, Meter, plural, pts, QuestionImage, QuestionInput, STATE_INFO, useExams, type Answer, type AttemptQuestion, type AttemptView } from './common';

const back = '/trainings?tab=Prüfungen';
const BackLink = ({ to = back, label = 'Prüfungen' }: { to?: string; label?: string }) => <Link to={to} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft size={14} />{label}</Link>;
const minutes = (a: string, b: string | null) => (b ? Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000)) : null);

// ───────────── Startseite ─────────────

/** Startseite einer Prüfung: Eckdaten, Hinweise, Starten/Fortsetzen. */
export function ExamStartPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useExams();
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string>();
  const start = useMutation({
    mutationFn: () => api<AttemptView>(`/hr/exams/${id}/start`, { method: 'POST' }),
    onSuccess: (v) => { qc.setQueryData(['hr-attempt', v.id], v); void qc.invalidateQueries({ queryKey: ['hr-exams'] }); nav(`/trainings/attempts/${v.id}`); },
    onError: (e) => setErr(errText(e)),
  });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data?.find((x) => x.id === id);
  if (!e) return <div><BackLink /><EmptyState text="Prüfung nicht gefunden" hint="Sie wurde gelöscht oder ist für dich nicht freigegeben." /></div>;
  const st = e.active ? STATE_INFO[e.me.state] : STATE_INFO.INACTIVE;
  const running = e.me.state === 'IN_PROGRESS';
  const canStart = e.active && (e.me.state === 'AVAILABLE' || running);
  const facts: [string, string][] = [
    ['Fragen', e.questionsPerAttempt < e.questionTotal ? `${e.questionsPerAttempt} (zufällig aus ${e.questionTotal})` : String(e.questionTotal)],
    ['Zeitlimit', e.timeLimitMin ? `${e.timeLimitMin} Minuten` : 'keins'],
    ['Bestanden ab', `${e.passPercent} %`],
    ['Versuche', `${e.me.attemptsUsed} von ${e.maxAttempts} genutzt`],
    ['Darstellung', EXAM_LAYOUT_LABEL[e.layout]],
    ['Einsicht danach', EXAM_REVIEW_LABEL[e.reviewMode]],
  ];
  return (
    <div className="mx-auto max-w-3xl">
      <BackLink />
      <Card>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {e.category && <p className="text-xs font-semibold uppercase tracking-wide text-muted">{e.category}</p>}
              <h1 className="text-2xl font-semibold">📝 {e.title}</h1>
              {e.trainingName && <p className="text-sm text-muted">Teil der Ausbildung „{e.trainingName}“</p>}
            </div>
            <Badge tone={st.tone} icon={st.emoji}>{st.label}</Badge>
          </div>
          {e.description && <p className="whitespace-pre-wrap text-sm text-muted">{e.description}</p>}
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {facts.map(([k, v]) => <div key={k} className="rounded-md border border-line bg-panel-2/60 px-3 py-2"><dt className="text-xs text-muted">{k}</dt><dd className="text-sm font-medium">{v}</dd></div>)}
          </dl>
          {e.me.bestPercent !== null && (
            <div className="grid gap-1">
              <div className="flex justify-between text-xs"><span className="text-muted">Dein bestes Ergebnis</span><span className="font-medium">{e.me.bestPercent} %</span></div>
              <Meter value={e.me.bestPercent} pass={e.passPercent} label={`Bestes Ergebnis ${e.me.bestPercent} Prozent`} />
            </div>
          )}
          {e.instructions && <div className="rounded-md border border-info/30 bg-info/10 p-3 text-sm"><p className="mb-1 font-medium">Hinweise</p><p className="whitespace-pre-wrap">{e.instructions}</p></div>}
          <ul className="grid gap-1 text-xs text-muted">
            <li>💾 Antworten werden automatisch gespeichert – du kannst später fortsetzen.</li>
            {e.timeLimitMin && <li>⏱️ Die Zeit läuft ab dem Start weiter, auch wenn du die Seite verlässt. Bei Ablauf wird automatisch abgegeben.</li>}
            <li>🚩 Unsichere Fragen kannst du markieren und vor der Abgabe noch einmal ansehen.</li>
          </ul>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          {e.me.state === 'PASSED' ? <p role="status" className="rounded-md border border-success/40 bg-success/10 p-3 text-sm">🏅 Du hast diese Prüfung bestanden{e.me.bestPercent !== null ? ` (${e.me.bestPercent} %)` : ''}.</p>
            : !canStart ? <p role="status" className="rounded-md border border-line bg-panel-2 p-3 text-sm">{st.emoji} {e.me.reason ?? 'Die Prüfung kann gerade nicht gestartet werden.'}</p>
            : (
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                {!running && e.timeLimitMin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(x) => setOk(x.target.checked)} />Ich habe die Hinweise gelesen und bin bereit.</label>}
                <Button className="ml-auto" disabled={start.isPending || (!running && !!e.timeLimitMin && !ok)} onClick={() => start.mutate()}><Play size={14} />{running ? 'Prüfung fortsetzen' : 'Prüfung starten'}</Button>
              </div>
            )}
          {(e.canGrade || e.canEdit) && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {e.canGrade && <Button size="sm" variant="secondary" onClick={() => nav(`/trainings/exams/${e.id}/results`)}><BarChart3 size={14} />Ergebnisse</Button>}
              {e.canEdit && <Button size="sm" variant="secondary" onClick={() => nav(`/trainings/exams/${e.id}/edit`)}><Pencil size={14} />Bearbeiten</Button>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ───────────── Versuch ─────────────

/** Versuch: läuft (eigener) → Durchführung; sonst Ergebnis bzw. Bewertung (Prüfer). */
export function AttemptPage() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hr-attempt', id], queryFn: () => api<AttemptView>(`/hr/attempts/${id}`), staleTime: 0 });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <div><BackLink /><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>;
  const v = q.data!;
  const done = (r: AttemptView) => { qc.setQueryData(['hr-attempt', id], r); void qc.invalidateQueries({ queryKey: ['hr-exams'] }); void qc.invalidateQueries({ queryKey: ['hr-attempts'] }); };
  if (v.status === 'IN_PROGRESS' && v.owner) return <Runner key={v.id} initial={v} onDone={done} />;
  if (v.grader) return <GradeView key={`${v.id}-${v.status}-${v.gradedAt ?? ''}`} v={v} onDone={done} />;
  return <ResultView v={v} />;
}

const normAnswers = (raw: Record<string, unknown> | null | undefined): Record<string, Answer> => {
  const out: Record<string, Answer> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = Array.isArray(v) ? v.map(String) : v == null ? '' : String(v);
  return out;
};
const backupKey = (id: string) => `exam.${id}`;
const readBackup = (id: string): Record<string, Answer> | null => { try { const r = localStorage.getItem(backupKey(id)); return r ? normAnswers(JSON.parse(r) as Record<string, unknown>) : null; } catch { return null; } };
const writeBackup = (id: string, a: Record<string, Answer>) => { try { localStorage.setItem(backupKey(id), JSON.stringify(a)); } catch { /* privater Modus */ } };
const dropBackup = (id: string) => { try { localStorage.removeItem(backupKey(id)); } catch { /* egal */ } };
const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`; };

function Runner({ initial, onDone }: { initial: AttemptView; onDone: (v: AttemptView) => void }) {
  const nav = useNavigate();
  const qs = initial.questions;
  const paged = initial.layout === 'PAGED';
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => ({ ...normAnswers(initial.answers), ...(readBackup(initial.id) ?? {}) }));
  const [flagged, setFlagged] = useState<string[]>(initial.flagged);
  const [idx, setIdx] = useState(() => Math.max(0, qs.findIndex((q) => !isAnswered(q, initial.answers?.[q.id]))));
  const [review, setReview] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  const latest = useRef({ answers, flagged });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);
  const finished = useRef(false);

  const persist = () => {
    dirty.current = false;
    setSaveState('saving');
    api<{ saved: true } | AttemptView>(`/hr/attempts/${initial.id}/answers`, { method: 'PUT', body: latest.current }).then((r) => {
      if ('questions' in r) { finished.current = true; dropBackup(initial.id); onDone(r); } // Zeit abgelaufen → automatisch abgegeben
      setSaveState('saved');
    }, () => setSaveState('error'));
  };
  const schedule = () => { dirty.current = true; clearTimeout(timer.current); timer.current = setTimeout(persist, 1200); };
  const change = (qid: string, v: Answer) => {
    const next = { ...latest.current.answers, [qid]: v };
    latest.current = { ...latest.current, answers: next };
    setAnswers(next); writeBackup(initial.id, next); schedule();
  };
  const toggleFlag = (qid: string) => {
    const next = latest.current.flagged.includes(qid) ? latest.current.flagged.filter((f) => f !== qid) : [...latest.current.flagged, qid];
    latest.current = { ...latest.current, flagged: next };
    setFlagged(next); schedule();
  };
  // Beim Verlassen ausstehende Antworten sofort senden
  useEffect(() => () => { clearTimeout(timer.current); if (dirty.current && !finished.current) void api(`/hr/attempts/${initial.id}/answers`, { method: 'PUT', body: latest.current }).catch(() => undefined); }, [initial.id]);

  const submit = useMutation({
    mutationFn: () => { clearTimeout(timer.current); dirty.current = false; return api<AttemptView>(`/hr/attempts/${initial.id}/submit`, { method: 'POST', body: { answers: latest.current.answers } }); },
    onSuccess: (r) => { finished.current = true; dropBackup(initial.id); setConfirm(false); window.scrollTo({ top: 0 }); onDone(r); },
    onError: (e) => { setConfirm(false); setErr(errText(e)); },
  });

  // Zeit: Server-Uhr als Referenz (falsch gehende PC-Uhren)
  const skew = useMemo(() => new Date(initial.serverNow).getTime() - Date.now(), [initial.serverNow]);
  const deadline = initial.deadline ? new Date(initial.deadline).getTime() : null;
  const [now, setNow] = useState(() => Date.now() + skew);
  useEffect(() => { if (!deadline) return; const t = setInterval(() => setNow(Date.now() + skew), 1000); return () => clearInterval(t); }, [deadline, skew]);
  const left = deadline ? Math.max(0, deadline - now) : null;
  const autoSent = useRef(false);
  useEffect(() => { if (left === 0 && !autoSent.current && !submit.isPending) { autoSent.current = true; submit.mutate(); } }, [left, submit]);

  const done = qs.filter((q) => isAnswered(q, answers[q.id]));
  const open = qs.filter((q) => !isAnswered(q, answers[q.id]));
  const go = (i: number) => {
    setReview(false);
    if (paged) { setIdx(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else document.getElementById(`exam-q-${qs[i]?.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const q = qs[idx];

  return (
    <div className="mx-auto grid max-w-4xl gap-4 pb-10">
      <div className="sticky top-0 z-10 -mx-1 rounded-lg border border-line bg-panel/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">📝 {initial.title}</h1>
            <p className="text-xs text-muted">{done.length} von {qs.length} beantwortet · bestanden ab {initial.passPercent} %</p>
          </div>
          <span className="text-xs text-muted" role="status" aria-live="polite">{saveState === 'saving' ? '🔄 Speichert …' : saveState === 'saved' ? '✅ Gespeichert' : saveState === 'error' ? '⚠️ Nur lokal gespeichert' : ''}</span>
          {left !== null && <span role="timer" aria-label="Verbleibende Zeit" className={`rounded-md border px-2.5 py-1 font-mono text-base tabular-nums ${left < 60_000 ? 'animate-pulse border-danger text-danger' : left < 300_000 ? 'border-warning text-warning' : 'border-line'}`}>⏱️ {mmss(left)}</span>}
          <Button size="sm" variant="secondary" onClick={() => nav(back)}>Später fortsetzen</Button>
        </div>
        <div className="mt-2"><Meter value={qs.length ? Math.round((done.length / qs.length) * 100) : 0} label={`Fortschritt: ${done.length} von ${qs.length} Fragen beantwortet`} /></div>
        <nav aria-label="Fragenübersicht" className="mt-2 flex flex-wrap gap-1">
          {qs.map((x, i) => {
            const ans = isAnswered(x, answers[x.id]); const fl = flagged.includes(x.id); const cur = paged && !review && i === idx;
            return (
              <button key={x.id} type="button" onClick={() => go(i)} aria-current={cur ? 'step' : undefined} aria-label={`Frage ${i + 1}${ans ? ', beantwortet' : ', offen'}${fl ? ', markiert' : ''}`}
                className={`relative h-8 min-w-8 rounded-md border px-1.5 text-xs font-medium tabular-nums transition ${cur ? 'border-primary ring-2 ring-primary/40' : 'border-line'} ${ans ? 'bg-primary/20 text-fg' : 'bg-panel-2 text-muted hover:text-fg'}`}>
                {i + 1}{fl && <span aria-hidden className="absolute -right-1 -top-1.5 text-[10px]">🚩</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => setReview(true)} className={`h-8 rounded-md border px-2 text-xs transition ${review ? 'border-primary ring-2 ring-primary/40' : 'border-line text-muted hover:text-fg'}`}><ListChecks size={13} className="mr-1 inline" aria-hidden />Abgabe</button>
        </nav>
      </div>

      {review ? (
        <Card title="Übersicht vor der Abgabe">
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-md border border-line p-2"><div className="text-xl font-semibold">{done.length}</div><div className="text-xs text-muted">beantwortet</div></div>
              <div className={`rounded-md border p-2 ${open.length ? 'border-warning/50' : 'border-line'}`}><div className="text-xl font-semibold">{open.length}</div><div className="text-xs text-muted">offen</div></div>
              <div className={`rounded-md border p-2 ${flagged.length ? 'border-warning/50' : 'border-line'}`}><div className="text-xl font-semibold">{flagged.length}</div><div className="text-xs text-muted">markiert</div></div>
            </div>
            {(open.length > 0 || flagged.length > 0) && (
              <ul className="grid gap-1 text-sm">
                {qs.map((x, i) => (!isAnswered(x, answers[x.id]) || flagged.includes(x.id)) && (
                  <li key={x.id}><button type="button" onClick={() => go(i)} className="flex w-full items-center gap-2 rounded-md border border-line px-3 py-2 text-left hover:bg-panel-2">
                    <span className="font-medium">Frage {i + 1}</span><span className="min-w-0 flex-1 truncate text-muted">{x.text.replace(/\{\{\}\}/g, '___')}</span>
                    {!isAnswered(x, answers[x.id]) && <Badge tone="warning">offen</Badge>}{flagged.includes(x.id) && <Badge tone="warning" icon="🚩">markiert</Badge>}
                  </button></li>
                ))}
              </ul>
            )}
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-3">
              <Button variant="secondary" onClick={() => go(paged ? idx : 0)}><ArrowLeft size={14} />Zurück zu den Fragen</Button>
              <Button disabled={submit.isPending} onClick={() => setConfirm(true)}><Send size={14} />Prüfung abgeben</Button>
            </div>
          </div>
        </Card>
      ) : paged && q ? (
        <>
          <QuestionCard q={q} n={idx + 1} total={qs.length} value={answers[q.id]} flagged={flagged.includes(q.id)} onFlag={() => toggleFlag(q.id)} onChange={(v) => change(q.id, v)} />
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="secondary" disabled={idx === 0} onClick={() => go(idx - 1)}><ArrowLeft size={14} />Zurück</Button>
            {idx < qs.length - 1 ? <Button onClick={() => go(idx + 1)}>Weiter<ArrowRight size={14} /></Button> : <Button onClick={() => setReview(true)}><ListChecks size={14} />Zur Abgabe</Button>}
          </div>
        </>
      ) : (
        <>
          {qs.map((x, i) => <div key={x.id} id={`exam-q-${x.id}`} className="scroll-mt-48"><QuestionCard q={x} n={i + 1} total={qs.length} value={answers[x.id]} flagged={flagged.includes(x.id)} onFlag={() => toggleFlag(x.id)} onChange={(v) => change(x.id, v)} /></div>)}
          <div className="flex justify-end"><Button onClick={() => { setReview(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><ListChecks size={14} />Zur Abgabe</Button></div>
        </>
      )}
      <ConfirmDialog open={confirm} title="Prüfung abgeben?" message={open.length ? `Du hast ${plural(open.length, 'Frage', 'Fragen')} noch nicht beantwortet. Nach dem Abgeben sind keine Änderungen mehr möglich.` : 'Nach dem Abgeben sind keine Änderungen mehr möglich.'} confirmLabel="Abgeben" busy={submit.isPending} onConfirm={() => submit.mutate()} onClose={() => setConfirm(false)} />
    </div>
  );
}

function QuestionCard({ q, n, total, value, flagged, onFlag, onChange }: { q: AttemptQuestion; n: number; total: number; value: Answer | undefined; flagged: boolean; onFlag: () => void; onChange: (v: Answer) => void }) {
  return (
    <Card title={<span>Frage {n} <span className="font-normal text-muted">von {total} · {pts(q.points)}{q.partial ? ' · Teilpunkte' : ''}</span></span>}
      actions={<Button size="sm" variant={flagged ? 'secondary' : 'ghost'} aria-pressed={flagged} onClick={onFlag}><Flag size={13} className={flagged ? 'text-warning' : ''} />{flagged ? 'Markiert' : 'Markieren'}</Button>}>
      <QuestionImage src={q.image} />
      {q.type !== 'GAP' && <p className="mb-4 whitespace-pre-wrap font-medium">{q.text}</p>}
      <QuestionInput q={q} value={value} onChange={onChange} />
    </Card>
  );
}

// ───────────── Ergebnis (Teilnehmer) ─────────────

function ResultHero({ v }: { v: AttemptView }) {
  const r = v.result;
  if (v.status === 'VOIDED') return <div role="status" className="rounded-lg border border-line bg-panel-2 p-5"><p className="text-lg font-semibold">⚫ Versuch annulliert</p><p className="text-sm text-muted">{v.voided?.reason ?? ''} – dieser Versuch zählt nicht.</p></div>;
  if (!r || r.passed == null) return <div role="status" className="rounded-lg border border-info/40 bg-info/10 p-5"><p className="text-lg font-semibold">⏳ Abgegeben – wird bewertet</p><p className="text-sm text-muted">Ein Prüfer bewertet deine Antworten. Du bekommst eine Benachrichtigung, sobald das Ergebnis da ist.</p></div>;
  return (
    <div role="status" className={`grid gap-3 rounded-lg border p-5 ${r.passed ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-2xl font-semibold">{r.passed ? '🏅 Bestanden' : '🔴 Nicht bestanden'}</p>{r.score != null && r.maxScore != null && <p className="text-sm">{pts(r.score)} von {pts(r.maxScore)} · bestanden ab {v.passPercent} %</p>}</div>
        {r.percent != null && <p className="text-4xl font-bold tabular-nums">{r.percent} %</p>}
      </div>
      {r.percent != null && <Meter value={r.percent} pass={v.passPercent} label={`Ergebnis ${r.percent} Prozent`} />}
      {r.feedback && <p className="whitespace-pre-wrap rounded-md bg-panel/60 p-3 text-sm"><span className="font-medium">Rückmeldung: </span>{r.feedback}</p>}
    </div>
  );
}

function ResultView({ v }: { v: AttemptView }) {
  const nav = useNavigate();
  const reviewable = v.questions.some((q) => q.earned !== undefined || q.correctAnswer !== undefined);
  const dur = minutes(v.startedAt, v.submittedAt);
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div><BackLink /><h1 className="text-xl font-semibold">📝 {v.title}</h1><p className="text-xs text-muted">Begonnen {fmt(v.startedAt)}{v.submittedAt && ` · abgegeben ${fmt(v.submittedAt)}`}{dur !== null && ` · ${dur} Min.`}</p></div>
      <ResultHero v={v} />
      {reviewable && (
        <Card title="Deine Antworten">
          <ol className="grid gap-3">
            {v.questions.map((q, i) => <ReviewItem key={q.id} q={q} n={i + 1} answer={v.answers?.[q.id]} />)}
          </ol>
        </Card>
      )}
      {!reviewable && v.status === 'GRADED' && <p className="text-center text-xs text-muted">Für diese Prüfung ist keine Einsicht in die Antworten vorgesehen.</p>}
      <div className="flex justify-center gap-2"><Button variant="secondary" onClick={() => nav(`/trainings/exams/${v.examId}`)}>Zur Prüfung</Button><Button onClick={() => nav(back)}>Zur Übersicht</Button></div>
    </div>
  );
}

function ReviewItem({ q, n, answer }: { q: AttemptQuestion; n: number; answer: unknown }) {
  const full = q.earned != null ? q.earned >= q.points : q.correctAnswer;
  const part = q.earned != null && q.earned > 0 && q.earned < q.points;
  return (
    <li className={`grid gap-2 rounded-md border p-3 ${full ? 'border-success/40' : part ? 'border-warning/40' : 'border-danger/40'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><span className="text-xs text-muted">Frage {n} · {EXAM_QUESTION_TYPE_LABEL[q.type]}</span>{q.type !== 'GAP' && <p className="whitespace-pre-wrap text-sm font-medium">{q.text}</p>}</div>
        <Badge tone={full ? 'success' : part ? 'warning' : 'danger'}>{q.earned != null ? `${pts(q.earned)} / ${q.points}` : full ? 'richtig' : 'falsch'}</Badge>
      </div>
      <QuestionImage src={q.image} />
      <AnswerReview q={q} answer={answer} />
      {q.explanation && <p className="rounded bg-info/10 px-2 py-1.5 text-xs">💡 {q.explanation}</p>}
    </li>
  );
}

// ───────────── Bewertung (Prüfer) ─────────────

function GradeView({ v, onDone }: { v: AttemptView; onDone: (v: AttemptView) => void }) {
  const nav = useNavigate();
  const answers = v.answers ?? {};
  const [scores, setScores] = useState<Record<string, number>>(() => Object.fromEntries(v.questions.map((q) => [q.id, q.earned ?? q.auto ?? 0])));
  const [feedback, setFeedback] = useState(v.result?.feedback ?? '');
  const [err, setErr] = useState<string>();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const total = Math.round(v.questions.reduce((n, q) => n + Math.min(q.points, scores[q.id] ?? 0), 0) * 100) / 100;
  const max = v.questions.reduce((n, q) => n + q.points, 0);
  const p = max ? Math.round((total / max) * 100) : 0;
  const editable = v.status === 'SUBMITTED' || v.status === 'GRADED';
  const grade = useMutation({
    mutationFn: () => api<AttemptView>(`/hr/attempts/${v.id}/grade`, { method: 'POST', body: { scores, ...(feedback.trim() ? { feedback: feedback.trim() } : {}) } }),
    onSuccess: (r) => { setErr(undefined); onDone(r); },
    onError: (e) => setErr(errText(e)),
  });
  const voidIt = useMutation({
    mutationFn: () => api<AttemptView>(`/hr/attempts/${v.id}/void`, { method: 'POST', body: { reason: reason.trim() } }),
    onSuccess: (r) => { setVoiding(false); onDone(r); },
    onError: (e) => { setVoiding(false); setErr(errText(e)); },
  });
  const dur = minutes(v.startedAt, v.submittedAt);
  const manual = v.questions.filter((q) => q.auto === null).length;
  return (
    <div className="mx-auto grid max-w-4xl gap-4 pb-24">
      <div>
        <BackLink to={`/trainings/exams/${v.examId}/results`} label="Ergebnisse der Prüfung" />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h1 className="text-xl font-semibold">{v.name}{v.rank && <span className="font-normal text-muted"> · {v.rank}</span>}</h1><p className="text-sm text-muted">📝 {v.title}</p></div>
          <Badge tone={ATTEMPT_TONE[v.status]}>{attemptLabel(v.status)}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">Begonnen {fmt(v.startedAt)}{v.submittedAt && ` · abgegeben ${fmt(v.submittedAt)}`}{dur !== null && ` · ${dur} Min.`}{v.gradedBy && ` · bewertet von ${v.gradedBy} ${fmt(v.gradedAt)}`}{manual > 0 && ` · ${plural(manual, 'Frage', 'Fragen')} manuell zu bewerten`}</p>
      </div>
      {v.voided && <p role="status" className="rounded-md border border-line bg-panel-2 p-3 text-sm">⚫ Annulliert{v.voided.by && ` von ${v.voided.by}`} {fmt(v.voided.at)}: {v.voided.reason}</p>}
      {v.status === 'IN_PROGRESS' && <p role="status" className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">✏️ Dieser Versuch läuft noch. Bewerten geht erst nach der Abgabe; abbrechen kannst du ihn über „Annullieren“.</p>}
      <ol className="grid gap-3">
        {v.questions.map((q, i) => {
          const s = scores[q.id] ?? 0;
          return (
            <li key={q.id} className={`grid gap-2 rounded-lg border bg-panel-2/40 p-3 ${q.auto === null && editable ? 'border-primary/50' : 'border-line'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0"><span className="text-xs text-muted">Frage {i + 1} · {EXAM_QUESTION_TYPE_LABEL[q.type]}{q.auto === null ? ' · manuell' : ` · automatisch ${pts(q.auto ?? 0)}`}</span>{q.type !== 'GAP' && <p className="whitespace-pre-wrap text-sm font-medium">{q.text}</p>}</div>
                <div className="flex items-center gap-1 text-xs text-muted">
                  {editable && <Button size="sm" variant="ghost" onClick={() => setScores({ ...scores, [q.id]: 0 })}>0</Button>}
                  <Input aria-label={`Punkte für Frage ${i + 1}`} type="number" min={0} max={q.points} step={0.5} className="w-20 py-1" disabled={!editable} value={s} onChange={(e) => setScores({ ...scores, [q.id]: Math.max(0, Math.min(q.points, Number(e.target.value) || 0)) })} />
                  / {q.points}
                  {editable && <Button size="sm" variant="ghost" onClick={() => setScores({ ...scores, [q.id]: q.points })}><CheckCircle2 size={13} />voll</Button>}
                </div>
              </div>
              <QuestionImage src={q.image} />
              <AnswerReview q={q} answer={answers[q.id]} />
              {q.explanation && <p className="text-xs text-muted">💡 {q.explanation}</p>}
            </li>
          );
        })}
      </ol>
      {editable && <L label="Rückmeldung an die Person (optional)"><Textarea aria-label="Rückmeldung" rows={3} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} /></L>}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="min-w-48 flex-1">
            <p className="text-sm"><b>{pts(total)}</b> von {pts(max)} · <b>{p} %</b> → {p >= v.passPercent ? '🟢 bestanden' : '🔴 nicht bestanden'} <span className="text-xs text-muted">(ab {v.passPercent} %)</span></p>
            <Meter value={p} pass={v.passPercent} label={`Summe ${p} Prozent`} />
          </div>
          {v.status !== 'VOIDED' && <Button variant="secondary" onClick={() => setVoiding(true)}><Ban size={14} />Annullieren</Button>}
          <Button variant="secondary" onClick={() => nav(-1)}>Zurück</Button>
          {editable && <Button disabled={grade.isPending} onClick={() => grade.mutate()}>{v.status === 'GRADED' ? 'Neu bewerten' : 'Bewertung speichern'}</Button>}
        </div>
      </div>
      <Modal open={voiding} title="Versuch annullieren?" onClose={() => setVoiding(false)}>
        <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); if (reason.trim().length >= 3) voidIt.mutate(); }}>
          <p className="text-sm text-muted">Der Versuch zählt danach nicht mehr – die Person kann es (ohne Wartezeit aus diesem Versuch) erneut versuchen. Der Vorgang wird in der Personalakte vermerkt.</p>
          <L label="Begründung *"><Input aria-label="Begründung" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. technische Probleme, Täuschungsversuch" /></L>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setVoiding(false)}>Abbrechen</Button><Button type="submit" variant="danger" disabled={reason.trim().length < 3 || voidIt.isPending}>Annullieren</Button></div>
        </form>
      </Modal>
    </div>
  );
}
