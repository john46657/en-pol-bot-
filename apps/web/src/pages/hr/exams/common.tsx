import { type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react';
import { EXAM_ATTEMPT_STATUS_LABEL, splitGaps, type ExamAttemptStatus, type ExamInput, type ExamLayout, type ExamQuestionType, type ExamReviewMode } from '@enrp/shared';
import { api } from '../../../lib/api';
import { Button, Input, Select, Textarea, type Tone } from '../../../components/ui';

// ───────────── Typen (Antworten der API) ─────────────

export type ExamState = 'AVAILABLE' | 'IN_PROGRESS' | 'PASSED' | 'PENDING' | 'WAITING' | 'NO_ATTEMPTS' | 'LOCKED' | 'NOT_YET' | 'CLOSED' | 'INACTIVE' | 'NO_QUESTIONS' | 'NO_PROFILE';
export interface ExamStats { participants: number; attempts: number; passed: number; pending: number; running: number; avgPercent: number | null; passRate: number | null }
export interface ExamListItem {
  id: string; title: string; description: string | null; instructions: string | null; category: string | null; active: boolean; questionTotal: number; questionsPerAttempt: number;
  passPercent: number; timeLimitMin: number | null; maxAttempts: number; retryHours: number; layout: ExamLayout; reviewMode: ExamReviewMode; showResult: boolean;
  availableFrom: string | null; availableUntil: string | null; trainingId: string | null; trainingName: string | null; requiredExamId: string | null; requiredExamTitle: string | null; updatedAt: string;
  canEdit: boolean; canGrade: boolean;
  me: { state: ExamState; reason: string | null; nextTryAt: string | null; openAttemptId: string | null; attemptsUsed: number; attemptsLeft: number; bestPercent: number | null; last: { status: string; passed: boolean | null; percent: number | null; at: string } | null };
  stats: ExamStats | null;
}
export interface ExamDetail extends ExamInput { id: string; createdAt: string; updatedAt: string; attemptCount: number }
export interface Opt { i: number; text: string }
export interface AttemptQuestion {
  id: string; type: ExamQuestionType; text: string; image: string | null; points: number; partial: boolean; options: Opt[]; matches: Opt[];
  earned?: number | null; correctAnswer?: boolean; correct?: string[]; gaps?: string[][]; tolerance?: number; explanation?: string | null; auto?: number | null;
}
export interface AttemptView {
  id: string; examId: string; title: string; description: string | null; instructions: string | null; status: ExamAttemptStatus; startedAt: string; submittedAt: string | null; serverNow: string;
  deadline: string | null; timeLimitMin: number | null; passPercent: number; layout: ExamLayout; reviewMode: ExamReviewMode; name: string; rank: string | null; owner: boolean; grader: boolean;
  answers: Record<string, unknown> | null; flagged: string[]; questions: AttemptQuestion[];
  result: { score?: number | null; maxScore?: number | null; percent?: number | null; passed: boolean | null; feedback: string | null } | null;
  gradedBy: string | null; gradedAt: string | null; voided: { reason: string | null; at: string | null; by: string | null } | null;
}
export interface AttemptRow {
  id: string; examId: string; personnelId: string; status: ExamAttemptStatus; score: number | null; maxScore: number | null; percent: number | null; passed: boolean | null; startedAt: string; submittedAt: string | null;
  gradedAt: string | null; voidReason: string | null; own: boolean; exam: { title: string; passPercent: number }; personnel: { rank: string | null; user: { displayName: string } };
}
export type Answer = string | string[];

export const useExams = (enabled = true) => useQuery({ queryKey: ['hr-exams'], queryFn: () => api<ExamListItem[]>('/hr/exams'), enabled });

// ───────────── Anzeige ─────────────

export const STATE_INFO: Record<ExamState, { label: string; emoji: string; tone: Tone }> = {
  AVAILABLE: { label: 'Verfügbar', emoji: '🟢', tone: 'success' }, IN_PROGRESS: { label: 'In Bearbeitung', emoji: '✏️', tone: 'info' }, PASSED: { label: 'Bestanden', emoji: '🏅', tone: 'success' },
  PENDING: { label: 'Wird bewertet', emoji: '⏳', tone: 'info' }, WAITING: { label: 'Wartezeit', emoji: '⏱️', tone: 'warning' }, NO_ATTEMPTS: { label: 'Keine Versuche mehr', emoji: '⛔', tone: 'danger' },
  LOCKED: { label: 'Gesperrt', emoji: '🔒', tone: 'neutral' }, NOT_YET: { label: 'Demnächst', emoji: '📅', tone: 'neutral' }, CLOSED: { label: 'Beendet', emoji: '📕', tone: 'neutral' },
  INACTIVE: { label: 'Entwurf', emoji: '📝', tone: 'neutral' }, NO_QUESTIONS: { label: 'Ohne Fragen', emoji: '❔', tone: 'warning' }, NO_PROFILE: { label: 'Keine Personalakte', emoji: '🪪', tone: 'warning' },
};
export const ATTEMPT_TONE: Record<ExamAttemptStatus, Tone> = { IN_PROGRESS: 'warning', SUBMITTED: 'info', GRADED: 'success', VOIDED: 'neutral' };
export const attemptLabel = (s: string) => EXAM_ATTEMPT_STATUS_LABEL[s as ExamAttemptStatus] ?? s;
export const resultText = (passed: boolean | null | undefined) => (passed === true ? '🟢 Bestanden' : passed === false ? '🔴 Nicht bestanden' : '—');

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'primary' }) {
  const color = tone ? { success: 'text-success', warning: 'text-warning', danger: 'text-danger', primary: 'text-primary' }[tone] : '';
  return (
    <div className="card border border-line px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Meter({ value, pass, label }: { value: number | null; pass?: number; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const tone = value === null ? 'bg-line' : pass === undefined ? 'bg-primary' : v >= pass ? 'bg-success' : 'bg-danger';
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} className="relative h-2 w-full overflow-hidden rounded-full bg-panel-2">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} />
      {pass !== undefined && <div aria-hidden className="absolute top-0 h-full w-0.5 bg-fg/60" style={{ left: `${pass}%` }} />}
    </div>
  );
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const pts = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, '').replace('.', ',')} ${n === 1 ? 'Punkt' : 'Punkte'}`;
/** Datum für <input type="datetime-local"> */
export const toLocal = (iso: string | null | undefined) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
export const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fileSafe = (s: string) => s.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'pruefung';

const list = (a: unknown): string[] => (Array.isArray(a) ? a.map((x) => String(x ?? '')) : a == null || a === '' ? [] : [String(a)]);
export const QuestionImage = ({ src }: { src: string | null }) => (src && /^https:\/\//i.test(src) ? <img src={src} alt="Abbildung zur Frage" referrerPolicy="no-referrer" className="mb-2 max-h-72 w-auto rounded-md border border-line object-contain" /> : null);

// ───────────── Eingabe (Teilnehmer) ─────────────

export function QuestionInput({ q, value, onChange, disabled }: { q: AttemptQuestion; value: Answer | undefined; onChange: (v: Answer) => void; disabled?: boolean }) {
  const single = typeof value === 'string' ? value : Array.isArray(value) ? value[0] ?? '' : '';
  const multi = list(value);
  const name = `q-${q.id}`;
  const choice = 'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition hover:bg-panel-2';
  const on = (sel: boolean) => `${choice} ${sel ? 'border-primary bg-primary/10' : 'border-line'}`;
  if (q.type === 'SINGLE') return <div className="grid gap-2">{q.options.map((o) => <label key={o.i} className={on(single === String(o.i))}><input type="radio" name={name} disabled={disabled} checked={single === String(o.i)} onChange={() => onChange(String(o.i))} />{o.text}</label>)}</div>;
  if (q.type === 'MULTI') return (
    <div className="grid gap-2">
      <p className="text-xs text-muted">Mehrere Antworten möglich.</p>
      {q.options.map((o) => { const k = String(o.i); const sel = multi.includes(k); return <label key={o.i} className={on(sel)}><input type="checkbox" disabled={disabled} checked={sel} onChange={(e) => onChange(e.target.checked ? [...multi, k].sort() : multi.filter((x) => x !== k))} />{o.text}</label>; })}
    </div>
  );
  if (q.type === 'YESNO') return <div className="flex flex-wrap gap-2">{(['ja', 'nein'] as const).map((v) => <label key={v} className={`${on(single === v)} min-w-28 justify-center`}><input type="radio" name={name} disabled={disabled} checked={single === v} onChange={() => onChange(v)} />{v === 'ja' ? 'Ja' : 'Nein'}</label>)}</div>;
  if (q.type === 'TEXT') return <div className="grid gap-1"><Textarea aria-label="Deine Antwort" rows={5} maxLength={4000} disabled={disabled} value={single} onChange={(e) => onChange(e.target.value)} placeholder="Deine Antwort …" /><span className="text-right text-xs text-muted">{single.length} / 4000</span></div>;
  if (q.type === 'NUMBER') return <Input aria-label="Deine Antwort (Zahl)" inputMode="decimal" className="max-w-xs" disabled={disabled} value={single} onChange={(e) => onChange(e.target.value.replace(/[^0-9,.\- ]/g, ''))} placeholder="Zahl eingeben" />;
  if (q.type === 'ORDER') {
    const order = multi.length === q.options.length ? multi : q.options.map((o) => String(o.i));
    const text = (k: string) => q.options.find((o) => String(o.i) === k)?.text ?? k;
    const move = (from: number, to: number) => { if (to < 0 || to >= order.length) return; const n = [...order]; [n[from], n[to]] = [n[to]!, n[from]!]; onChange(n); };
    return (
      <div className="grid gap-2">
        <p className="text-xs text-muted">Mit den Pfeilen in die richtige Reihenfolge bringen (oben = zuerst).</p>
        <ol className="grid gap-1.5">
          {order.map((k, i) => (
            <li key={k} className="flex items-center gap-2 rounded-md border border-line bg-panel-2 px-3 py-2 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{i + 1}</span>
              <span className="min-w-0 flex-1">{text(k)}</span>
              <Button size="sm" variant="ghost" aria-label={`${text(k)} nach oben`} disabled={disabled || i === 0} onClick={() => move(i, i - 1)}><ArrowUp size={14} /></Button>
              <Button size="sm" variant="ghost" aria-label={`${text(k)} nach unten`} disabled={disabled || i === order.length - 1} onClick={() => move(i, i + 1)}><ArrowDown size={14} /></Button>
            </li>
          ))}
        </ol>
        {multi.length !== q.options.length && !disabled && <div><Button size="sm" variant="secondary" onClick={() => onChange(order)}><Check size={14} />Reihenfolge so übernehmen</Button></div>}
      </div>
    );
  }
  if (q.type === 'MATCH') {
    const cur = q.options.map((o) => multi[o.i] ?? '');
    const set = (left: number, right: string) => { const n = Array.from({ length: q.options.length }, (_, i) => multi[i] ?? ''); n[left] = right; onChange(n); };
    return (
      <div className="grid gap-2">
        {q.options.map((o, row) => (
          <div key={o.i} className="grid items-center gap-2 rounded-md border border-line bg-panel-2 px-3 py-2 text-sm sm:grid-cols-[1fr_auto_1fr]">
            <span className="font-medium">{o.text}</span><span aria-hidden className="hidden text-muted sm:block">→</span>
            <Select aria-label={`Zuordnung für ${o.text}`} disabled={disabled} value={cur[row]} onChange={(e) => set(o.i, e.target.value)}>
              <option value="">— auswählen —</option>
              {q.matches.map((m) => <option key={m.i} value={String(m.i)}>{m.text}{cur.includes(String(m.i)) && cur[row] !== String(m.i) ? ' (schon vergeben)' : ''}</option>)}
            </Select>
          </div>
        ))}
      </div>
    );
  }
  // GAP
  const parts = splitGaps(q.text);
  const set = (gap: number, v: string) => { const n = Array.from({ length: parts.filter((p) => typeof p === 'number').length }, (_, i) => multi[i] ?? ''); n[gap] = v; onChange(n); };
  return (
    <p className="text-sm leading-9">
      {parts.map((p, i) => (typeof p === 'number'
        ? <input key={i} aria-label={`Lücke ${p + 1}`} disabled={disabled} value={multi[p] ?? ''} onChange={(e) => set(p, e.target.value)} className="mx-1 inline-block w-36 rounded-md border border-line bg-panel px-2 py-1 align-middle text-sm focus:border-primary" />
        : <span key={i} className="whitespace-pre-wrap">{p}</span>))}
    </p>
  );
}

// ───────────── Einsicht (Antwort mit Bewertung) ─────────────

const mark = (ok: boolean | null) => (ok === null ? null : ok ? <Check size={14} className="shrink-0 text-success" aria-label="richtig" /> : <X size={14} className="shrink-0 text-danger" aria-label="falsch" />);
const yn = (v: string) => (v.toLowerCase() === 'ja' ? 'Ja' : v.toLowerCase() === 'nein' ? 'Nein' : v || '—');

/** Antwort einer Person mit Markierung richtig/falsch; mit Lösungen, wenn der Server sie mitschickt. */
export function AnswerReview({ q, answer }: { q: AttemptQuestion; answer: unknown }) {
  const a = list(answer);
  const sol = q.correct !== undefined;
  const row = (key: string | number, text: ReactNode, chosen: boolean, right: boolean | null) => (
    <li key={key} className={`flex items-center gap-2 rounded border px-2.5 py-1.5 ${chosen ? (right === false ? 'border-danger/50 bg-danger/10' : right ? 'border-success/50 bg-success/10' : 'border-primary/50 bg-primary/10') : right ? 'border-success/40 border-dashed' : 'border-line'}`}>
      <span aria-hidden className="w-4 text-center text-xs">{chosen ? '●' : '○'}</span><span className="min-w-0 flex-1">{text}</span>{chosen && <span className="sr-only">gewählt</span>}{right && sol && <span className="text-xs text-success">richtig</span>}
    </li>
  );
  switch (q.type) {
    case 'SINGLE': case 'MULTI':
      return <ul className="grid gap-1 text-sm">{q.options.map((o) => row(o.i, o.text, a.includes(String(o.i)), sol ? q.correct!.includes(String(o.i)) : null))}</ul>;
    case 'YESNO':
      return <p className="text-sm">Antwort: <b>{yn(a[0] ?? '')}</b>{sol && <> · richtig: <b>{yn(q.correct![0] ?? '')}</b></>}</p>;
    case 'NUMBER':
      return <p className="text-sm">Antwort: <b>{a[0] || '—'}</b>{sol && <> · richtig: <b>{q.correct![0]}</b>{q.tolerance ? ` (± ${q.tolerance})` : ''}</>}</p>;
    case 'TEXT':
      return (
        <div className="grid gap-1 text-sm">
          <p className="whitespace-pre-wrap rounded border border-line bg-panel-2 p-2">{a[0] || <span className="text-muted">— keine Antwort —</span>}</p>
          {sol && <p className="text-xs text-muted">{q.correct!.length ? <>Stichworte: {q.correct!.map((k) => <span key={k} className={`mr-1 rounded px-1 ${(a[0] ?? '').toLowerCase().includes(k.toLowerCase()) ? 'bg-success/15 text-success' : 'bg-panel-2'}`}>{k}</span>)}</> : 'Bewertung durch Prüfer'}</p>}
        </div>
      );
    case 'ORDER': {
      const text = (k: string) => q.options.find((o) => String(o.i) === k)?.text ?? '—';
      return (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><p className="mb-1 text-xs text-muted">Antwort</p><ol className="grid gap-1">{(a.length ? a : []).map((k, i) => <li key={i} className="flex items-center gap-2 rounded border border-line px-2 py-1"><span className="w-5 text-xs text-muted">{i + 1}.</span><span className="flex-1">{text(k)}</span>{mark(k === String(i))}</li>)}{!a.length && <li className="text-muted">— keine Antwort —</li>}</ol></div>
          {sol && <div><p className="mb-1 text-xs text-muted">Richtige Reihenfolge</p><ol className="grid gap-1">{[...q.options].sort((x, y) => x.i - y.i).map((o) => <li key={o.i} className="flex items-center gap-2 rounded border border-dashed border-success/40 px-2 py-1"><span className="w-5 text-xs text-muted">{o.i + 1}.</span>{o.text}</li>)}</ol></div>}
        </div>
      );
    }
    case 'MATCH': {
      const right = (k: string | undefined) => q.matches.find((m) => String(m.i) === k)?.text ?? '—';
      return (
        <ul className="grid gap-1 text-sm">
          {q.options.map((o) => (
            <li key={o.i} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5">
              <b>{o.text}</b><span className="text-muted">→</span><span>{right(a[o.i])}</span>{mark(a[o.i] === String(o.i))}
              {sol && a[o.i] !== String(o.i) && <span className="text-xs text-success">richtig: {right(String(o.i))}</span>}
            </li>
          ))}
        </ul>
      );
    }
    case 'GAP': {
      let n = -1;
      return (
        <div className="grid gap-1 text-sm">
          <p className="leading-8">{splitGaps(q.text).map((p, i) => {
            if (typeof p !== 'number') return <span key={i} className="whitespace-pre-wrap">{p}</span>;
            n = p;
            const alts = q.gaps?.[p];
            const ok = alts ? alts.some((x) => x.trim().toLowerCase() === (a[p] ?? '').trim().toLowerCase()) : null;
            return <span key={i} className={`mx-0.5 rounded px-1.5 py-0.5 font-medium ${ok === null ? 'bg-panel-2' : ok ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger line-through decoration-1'}`}>{a[p] || '___'}</span>;
          })}</p>
          {q.gaps && n >= 0 && <p className="text-xs text-muted">Lösung: {q.gaps.map((g, i) => `(${i + 1}) ${g.join(' / ')}`).join(' · ')}</p>}
        </div>
      );
    }
  }
}
