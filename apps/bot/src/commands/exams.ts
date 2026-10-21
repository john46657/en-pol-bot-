import { EXAM_QUESTION_TYPE_HINT, EXAM_QUESTION_TYPE_LABEL, EXAM_REVIEW_LABEL, examSchema, isAnswered, type ExamQuestionType, type ExamReviewMode } from '@enrp/shared';
import { guard } from '../access';
import { brand, type Tone } from '../branding';
import { clip, errorReply, plain, type ButtonSpec, type EmbedData, type Reply, type SelectSpec } from '../format';
import type { GuildConfig } from '../guild-config';
import { withRetry } from '../safety';
import { mapError } from './errors';
import type { CommandDef, Ctx, InteractionDef } from './types';

/**
 * Prüfungszentrum in Discord – nutzt ausschließlich die vorhandenen Prüfungs-Routen des Systems (`/hr/exams`, `/hr/attempts`)
 * mit den Rechten des verknüpften Kontos. Bewertet wird im System nach den in der Prüfung hinterlegten Kriterien
 * (Punkte je Frage, Teilpunkte, Stichworte, Toleranz, Bestehensgrenze) – die Kriterien werden vorher offen angezeigt.
 * Versuche werden nie gelöscht; Annullieren markiert einen Versuch nur (bleibt mit Grund erhalten).
 * Neue Prüfungen/Ausbildungsaufgaben legt der Bot nicht an.
 */
type State = 'NO_PROFILE' | 'IN_PROGRESS' | 'PASSED' | 'PENDING' | 'INACTIVE' | 'NO_QUESTIONS' | 'NOT_YET' | 'CLOSED' | 'LOCKED' | 'NO_ATTEMPTS' | 'WAITING' | 'AVAILABLE';
interface ExamItem {
  id: string; title: string; description: string | null; instructions: string | null; category: string | null; active: boolean;
  questionTotal: number; questionsPerAttempt: number; passPercent: number; timeLimitMin: number | null; maxAttempts: number; retryHours: number;
  reviewMode: ExamReviewMode; showResult: boolean; trainingName: string | null; requiredExamTitle: string | null; canEdit: boolean; canGrade: boolean;
  me: { state: State; reason: string | null; attemptsUsed: number; attemptsLeft: number; openAttemptId: string | null; bestPercent: number | null; last: { status: string; passed: boolean | null; percent: number | null; at: string } | null };
  stats: { participants: number; attempts: number; passed: number; pending: number; running: number; avgPercent: number | null; passRate: number | null } | null;
}
interface ViewOption { i: number; text: string }
interface ViewQuestion { id: string; type: ExamQuestionType; text: string; image: string | null; points: number; partial: boolean; options: ViewOption[]; matches: ViewOption[]; earned?: number; correctAnswer?: boolean; correct?: string[]; gaps?: string[][]; tolerance?: number; explanation?: string | null; auto?: number | null }
interface AttemptView {
  id: string; examId: string; title: string; instructions: string | null; status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'VOIDED';
  startedAt: string; deadline: string | null; passPercent: number; reviewMode: ExamReviewMode; name: string; owner: boolean; grader: boolean;
  answers: Record<string, unknown> | null; flagged: string[]; questions: ViewQuestion[];
  result: { score?: number | null; maxScore?: number | null; percent?: number | null; passed: boolean | null; feedback: string | null } | null;
  voided: { reason: string | null } | null;
}
interface AttemptRow { id: string; examId: string; status: string; percent: number | null; submittedAt: string | null; startedAt: string; exam: { title: string }; personnel: { rank: string | null; user: { displayName: string } }; own: boolean }

const UUID = /^[0-9a-f-]{36}$/;
const LETTERS = 'ABCDEFGHIJKL';
const STATE_ICON: Record<State, string> = { AVAILABLE: '🟢', IN_PROGRESS: '✏️', PASSED: '✅', PENDING: '⏳', WAITING: '⏱️', NO_ATTEMPTS: '⛔', LOCKED: '🔒', NOT_YET: '📅', CLOSED: '📅', INACTIVE: '⏸️', NO_QUESTIONS: '⚪', NO_PROFILE: '👤' };
const STATE_LABEL: Record<State, string> = { AVAILABLE: 'verfügbar', IN_PROGRESS: 'läuft', PASSED: 'bestanden', PENDING: 'wird bewertet', WAITING: 'Wartezeit', NO_ATTEMPTS: 'keine Versuche mehr', LOCKED: 'gesperrt', NOT_YET: 'noch nicht verfügbar', CLOSED: 'abgelaufen', INACTIVE: 'nicht freigegeben', NO_QUESTIONS: 'ohne Fragen', NO_PROFILE: 'keine Personalakte' };
const pts = (n: number | null | undefined) => (n === null || n === undefined ? '—' : String(Math.round(n * 100) / 100).replace('.', ','));
const t = (iso: string | null | undefined, f = 'R') => (iso && !Number.isNaN(Date.parse(iso)) ? `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>` : '—');
const list = (a: unknown): string[] => (Array.isArray(a) ? a.map((x) => String(x ?? '')) : a == null || a === '' ? [] : [String(a)]);
const gapCount = (text: string) => (text.match(/\{\{[^{}]*\}\}/g) ?? []).length;
const gapText = (text: string) => { let n = 0; return text.replace(/\{\{[^{}]*\}\}/g, () => `［Lücke ${++n}］`); };

async function cfgOf(c: Ctx): Promise<GuildConfig | null> { return c.guildId && c.runtime ? c.runtime.guildConfig.get(c.guildId).catch(() => null) : null; }
const b = (cfg: GuildConfig | null, e: EmbedData, tone: Tone = 'primary') => brand(cfg, e, tone);

// ───────────── Kriterien (transparent) ─────────────

/** Wie wird eine Frage bewertet? (für Teilnehmende vor der Antwort) */
export function criteriaText(q: Pick<ViewQuestion, 'type' | 'points' | 'partial'>): string {
  const p = `${pts(q.points)} Punkt${q.points === 1 ? '' : 'e'}`;
  const how: Record<ExamQuestionType, string> = {
    SINGLE: 'volle Punkte nur für die richtige Antwort', YESNO: 'volle Punkte nur für die richtige Antwort', NUMBER: 'volle Punkte, wenn die Zahl (ggf. mit Toleranz) stimmt',
    MULTI: q.partial ? 'Teilpunkte: richtige Kreuze zählen, falsche ziehen ab' : 'volle Punkte nur, wenn genau alle richtigen gewählt sind',
    TEXT: q.partial ? 'Teilpunkte je gefundenem Stichwort bzw. Bewertung durch Prüfer' : 'alle Stichworte nötig bzw. Bewertung durch Prüfer',
    ORDER: q.partial ? 'Teilpunkte je Eintrag an der richtigen Stelle' : 'volle Punkte nur bei komplett richtiger Reihenfolge',
    MATCH: q.partial ? 'Teilpunkte je richtiger Zuordnung' : 'volle Punkte nur, wenn alle Zuordnungen stimmen',
    GAP: q.partial ? 'Teilpunkte je richtig gefüllter Lücke' : 'volle Punkte nur, wenn alle Lücken stimmen',
  };
  return `${p} · ${how[q.type]}`;
}

/** Antwort lesbar machen (für Teilnehmende und Prüfer). */
export function answerText(q: ViewQuestion, a: unknown): string {
  const l = list(a);
  if (!isAnswered(q, a)) return '— (noch keine Antwort)';
  const opt = (i: string) => { const pos = q.options.findIndex((o) => String(o.i) === i); return pos >= 0 ? `${LETTERS[pos]}) ${q.options[pos]!.text}` : i; };
  switch (q.type) {
    case 'SINGLE': return opt(l[0]!);
    case 'MULTI': return l.map(opt).join(', ');
    case 'YESNO': return l[0] === 'ja' ? 'Ja' : 'Nein';
    case 'ORDER': return l.map((i, n) => `${n + 1}. ${q.options.find((o) => String(o.i) === i)?.text ?? i}`).join(' · ');
    case 'MATCH': return q.options.map((o, row) => { const m = q.matches.findIndex((x) => String(x.i) === l[o.i]); return `${row + 1}) ${o.text} → ${m >= 0 ? `${LETTERS[m]}) ${q.matches[m]!.text}` : '—'}`; }).join(' · ');
    case 'GAP': return l.map((x, n) => `Lücke ${n + 1}: ${x || '—'}`).join(' · ');
    default: return l[0]!;
  }
}

/** Lösung/Kriterium für Prüfer (aus der Prüfung, so wie das System bewertet). */
function solutionText(q: ViewQuestion): string {
  const c = q.correct ?? [];
  const opt = (i: string) => { const pos = q.options.findIndex((o) => String(o.i) === i); return pos >= 0 ? `${LETTERS[pos]}) ${q.options[pos]!.text}` : i; };
  switch (q.type) {
    case 'SINGLE': case 'MULTI': return c.map(opt).join(', ') || '—';
    case 'YESNO': return c[0] === 'ja' ? 'Ja' : 'Nein';
    case 'NUMBER': return `${c[0] ?? '—'}${q.tolerance ? ` (± ${q.tolerance})` : ''}`;
    case 'TEXT': return c.length ? `Stichworte: ${c.join(', ')}` : 'manuell durch Prüfer';
    case 'ORDER': return [...q.options].sort((x, y) => x.i - y.i).map((o) => o.text).join(' → ');
    case 'MATCH': return [...q.options].sort((x, y) => x.i - y.i).map((o) => `${o.text} → ${q.matches.find((m) => m.i === o.i)?.text ?? '?'}`).join(' · ');
    case 'GAP': return (q.gaps ?? []).map((g, n) => `Lücke ${n + 1}: ${g.join(' | ')}`).join(' · ');
  }
}

// ───────────── Ablauf: Frage anzeigen ─────────────

export function questionReply(v: AttemptView, idx: number, cfg: GuildConfig | null, note?: string): Reply {
  const n = v.questions.length;
  const i = Math.max(0, Math.min(idx, n - 1));
  const q = v.questions[i];
  if (!q) return errorReply('Diese Prüfung hat keine Fragen.');
  const a = v.answers?.[q.id];
  const flagged = v.flagged.includes(q.id);
  const lines = [q.type === 'GAP' ? gapText(q.text) : q.text];
  if (q.type === 'SINGLE' || q.type === 'MULTI' || q.type === 'ORDER') lines.push('', ...q.options.map((o, p) => `**${LETTERS[p]})** ${o.text}`));
  if (q.type === 'MATCH') lines.push('', ...q.options.map((o, p) => `**${p + 1})** ${o.text}`), '', ...q.matches.map((m, p) => `**${LETTERS[p]})** ${m.text}`));
  const answered = v.questions.filter((x) => isAnswered(x, v.answers?.[x.id])).length;
  const embed = b(cfg, {
    title: clip(`📝 ${v.title} – Frage ${i + 1}/${n}${flagged ? ' 🚩' : ''}`, 256),
    description: clip(`${note ? `${note}\n\n` : ''}${lines.join('\n')}`, 4000),
    fields: [
      { name: 'Typ', value: `${EXAM_QUESTION_TYPE_LABEL[q.type]} – ${EXAM_QUESTION_TYPE_HINT[q.type]}`.slice(0, 1024) },
      { name: 'Bewertung', value: criteriaText(q) },
      { name: 'Deine Antwort', value: clip(plain(answerText(q, a)), 1024) },
      { name: 'Fortschritt', value: `${answered}/${n} beantwortet${v.deadline ? ` · Abgabe spätestens ${t(v.deadline)}` : ''}`, inline: true },
    ],
    ...(q.image && /^https:\/\//.test(q.image) ? { image: q.image } : {}),
    footer: 'Antworten werden sofort im System zwischengespeichert.',
  });
  const base = `${v.id}:${i}`;
  const selects: SelectSpec[] = [];
  const buttons: ButtonSpec[] = [];
  if (q.type === 'SINGLE' || q.type === 'MULTI') selects.push({
    id: `exam:a:${base}`, placeholder: q.type === 'MULTI' ? 'Antworten wählen (mehrere möglich) …' : 'Antwort wählen …', min: q.type === 'MULTI' ? 0 : 1, max: q.type === 'MULTI' ? q.options.length : 1,
    options: q.options.map((o, p) => ({ label: clip(`${LETTERS[p]}) ${o.text}`, 100), value: String(o.i) })), defaults: list(a),
  });
  else if (q.type === 'YESNO') buttons.push({ id: `exam:yn:${base}:ja`, label: 'Ja', style: list(a)[0] === 'ja' ? 'success' : 'secondary' }, { id: `exam:yn:${base}:nein`, label: 'Nein', style: list(a)[0] === 'nein' ? 'success' : 'secondary' });
  else buttons.push({ id: `exam:in:${base}`, label: isAnswered(q, a) ? 'Antwort ändern' : 'Antwort eingeben', emoji: '✏️', style: 'primary' });
  buttons.push(
    { id: `exam:q:${v.id}:${i - 1}`, label: 'Zurück', emoji: '◀️', style: 'secondary', disabled: i === 0 },
    { id: `exam:q:${v.id}:${i + 1}`, label: 'Weiter', emoji: '▶️', style: 'secondary', disabled: i >= n - 1 },
    { id: `exam:flag:${base}`, label: flagged ? 'Markierung weg' : 'Markieren', emoji: '🚩', style: 'secondary' },
    { id: `exam:review:${v.id}`, label: 'Abgeben …', emoji: '📤', style: 'success' },
  );
  return { ephemeral: true, panel: true, embeds: [embed], selects, buttons };
}

/** Formular für Antworten, die man eintippt (Freitext, Zahl, Lücken, Reihenfolge, Zuordnung). */
export function answerModal(v: AttemptView, idx: number): Reply {
  const q = v.questions[idx];
  if (!q) return errorReply('Frage nicht gefunden.');
  const a = list(v.answers?.[q.id]);
  const id = `exam:m:${v.id}:${idx}`;
  const title = clip(`Frage ${idx + 1}`, 45);
  switch (q.type) {
    case 'TEXT': return { modal: { id, title, fields: [{ id: 'a', label: 'Deine Antwort', paragraph: true, required: true, maxLength: 4000, value: a[0] ?? '' }] } };
    case 'NUMBER': return { modal: { id, title, fields: [{ id: 'a', label: 'Deine Antwort (Zahl)', required: true, maxLength: 40, value: a[0] ?? '', placeholder: 'z. B. 50 oder 2,5' }] } };
    case 'GAP': {
      const n = gapCount(q.text);
      if (n > 5) return errorReply('Diese Frage hat mehr als 5 Lücken – das passt nicht in ein Discord-Formular. Bitte im Dashboard beantworten.');
      return { modal: { id, title, fields: Array.from({ length: n }, (_, k) => ({ id: `g${k}`, label: `Lücke ${k + 1}`, required: true, maxLength: 200, value: a[k] ?? '' })) } };
    }
    case 'ORDER': {
      const cur = a.length === q.options.length ? a.map((i) => LETTERS[q.options.findIndex((o) => String(o.i) === i)] ?? '').join(', ') : '';
      return { modal: { id, title, fields: [{ id: 'a', label: `Reihenfolge der Buchstaben (zuerst → zuletzt)`, required: true, maxLength: 60, value: cur, placeholder: q.options.map((_, p) => LETTERS[p]).join(', ') }] } };
    }
    case 'MATCH': {
      if (q.options.length > 5) return { modal: { id, title, fields: [{ id: 'a', label: 'Zuordnung, z. B. 1=B, 2=A, 3=C', required: true, maxLength: 120, value: q.options.map((o, row) => { const m = q.matches.findIndex((x) => String(x.i) === a[o.i]); return m >= 0 ? `${row + 1}=${LETTERS[m]}` : ''; }).filter(Boolean).join(', ') }] } };
      return { modal: { id, title, fields: q.options.map((o, row) => { const m = q.matches.findIndex((x) => String(x.i) === a[o.i]); return { id: `r${row}`, label: clip(`${row + 1}) ${o.text} → Buchstabe`, 45), required: true, maxLength: 1, value: m >= 0 ? LETTERS[m]! : '' }; }) } };
    }
    default: return errorReply('Diese Frage wird mit den Buttons beantwortet.');
  }
}

/** Formular-Eingabe → Antwort im Format des Systems (oder Fehlermeldung). */
export function parseModalAnswer(q: ViewQuestion, f: Record<string, string>): { value?: string | string[]; error?: string } {
  const letter = (s: string, max: number) => { const p = LETTERS.indexOf(s.trim().toUpperCase()); return p >= 0 && p < max ? p : -1; };
  switch (q.type) {
    case 'TEXT': return (f.a ?? '').trim() ? { value: f.a!.trim().slice(0, 4000) } : { error: 'Bitte eine Antwort eingeben.' };
    case 'NUMBER': { const s = (f.a ?? '').trim(); return /^-?\d+(?:[.,]\d+)?$/.test(s.replace(/\s/g, '')) ? { value: s.replace(/\s/g, '') } : { error: 'Bitte eine Zahl eingeben (z. B. 50 oder 2,5).' }; }
    case 'GAP': return { value: Array.from({ length: gapCount(q.text) }, (_, k) => (f[`g${k}`] ?? '').trim().slice(0, 200)) };
    case 'ORDER': {
      const parts = (f.a ?? '').split(/[\s,;>→-]+/).filter(Boolean);
      const pos = parts.map((p) => letter(p, q.options.length));
      if (pos.length !== q.options.length || pos.some((p) => p < 0) || new Set(pos).size !== pos.length) return { error: `Bitte jeden Buchstaben ${q.options.map((_, p) => LETTERS[p]).join(', ')} genau einmal angeben, z. B. „${q.options.map((_, p) => LETTERS[p]).reverse().join(', ')}“.` };
      return { value: pos.map((p) => String(q.options[p]!.i)) };
    }
    case 'MATCH': {
      const out = Array.from({ length: q.options.length }, () => '');
      const pairs: [number, string][] = f.a !== undefined
        ? (f.a.match(/(\d+)\s*[=:→-]\s*([A-Za-z])/g) ?? []).map((m) => { const x = /(\d+)\s*[=:→-]\s*([A-Za-z])/.exec(m)!; return [Number(x[1]) - 1, x[2]!]; })
        : q.options.map((_, row) => [row, f[`r${row}`] ?? '']);
      for (const [row, l] of pairs) {
        const o = q.options[row]; const m = letter(l, q.matches.length);
        if (!o || m < 0) return { error: `Ungültige Zuordnung „${row + 1}=${l}“ – bitte Zahlen 1–${q.options.length} und Buchstaben ${LETTERS[0]}–${LETTERS[q.matches.length - 1]} verwenden.` };
        out[o.i] = String(q.matches[m]!.i);
      }
      if (out.some((x) => !x)) return { error: 'Bitte jedem Eintrag einen Buchstaben zuordnen.' };
      return { value: out };
    }
    default: return { error: 'Diese Frage wird mit den Buttons beantwortet.' };
  }
}

async function viewOf(c: Ctx, attemptId: string) { return c.api.asUser<AttemptView>(c.discordId, 'GET', `/hr/attempts/${attemptId}`); }

/** Antwort speichern (ganze Antwortliste wie im Dashboard). Nach Zeitablauf gibt das System gleich das Ergebnis zurück. */
async function saveAnswer(c: Ctx, v: AttemptView, qid: string, value: unknown, flagged = v.flagged): Promise<AttemptView | Reply> {
  const answers = { ...(v.answers ?? {}), [qid]: value };
  const r = await c.api.asUser<{ saved?: boolean } & Partial<AttemptView>>(c.discordId, 'PUT', `/hr/attempts/${v.id}/answers`, { answers, flagged });
  if (r && r.status && r.status !== 'IN_PROGRESS') return resultReply(r as AttemptView, await cfgOf(c), '⏰ Die Zeit ist abgelaufen – gewertet wurde, was rechtzeitig gespeichert war.');
  return { ...v, answers, flagged };
}

function reviewReply(v: AttemptView, cfg: GuildConfig | null): Reply {
  const open = v.questions.map((q, i) => ({ q, i })).filter(({ q }) => !isAnswered(q, v.answers?.[q.id]));
  const flagged = v.questions.map((q, i) => ({ q, i })).filter(({ q }) => v.flagged.includes(q.id));
  return { ephemeral: true, panel: true, embeds: [b(cfg, {
    title: `📤 Abgabe: ${clip(v.title, 200)}`,
    description: [
      `Beantwortet: **${v.questions.length - open.length}/${v.questions.length}**`,
      open.length ? `Offen: ${open.map(({ i }) => `Frage ${i + 1}`).join(', ')}` : '✅ Alle Fragen beantwortet.',
      flagged.length ? `🚩 Markiert: ${flagged.map(({ i }) => `Frage ${i + 1}`).join(', ')}` : '',
      '', `Bestanden ab **${v.passPercent} %** der Punkte. Nach der Abgabe kannst du nichts mehr ändern.`,
    ].filter(Boolean).join('\n'),
  }, open.length ? 'warning' : 'primary')], buttons: [
    { id: `exam:q:${v.id}:${open[0]?.i ?? 0}`, label: open.length ? 'Zur ersten offenen Frage' : 'Zurück zu den Fragen', emoji: '↩️', style: 'secondary' },
    { id: `exam:submit:${v.id}`, label: 'Endgültig abgeben', emoji: '📤', style: 'danger' },
  ] };
}

export function resultReply(v: AttemptView, cfg: GuildConfig | null, note?: string): Reply {
  if (v.status === 'VOIDED') return { ephemeral: true, panel: true, embeds: [b(cfg, { title: `📝 ${clip(v.title, 200)} – annulliert`, description: `Dieser Versuch wurde annulliert${v.voided?.reason ? `: ${plain(v.voided.reason)}` : ''}. Er zählt nicht als Versuch.` }, 'warning')] };
  if (v.status === 'SUBMITTED' || !v.result) return { ephemeral: true, panel: true, embeds: [b(cfg, { title: `⏳ ${clip(v.title, 200)} – abgegeben`, description: `${note ? `${note}\n\n` : ''}Deine Antworten sind gespeichert. Einige Fragen bewertet ein Prüfer – du bekommst das Ergebnis, sobald es feststeht (\`/pruefung ergebnisse\`).` })] };
  const r = v.result;
  const head = r.passed ? '✅ Bestanden' : '❌ Nicht bestanden';
  const score = r.percent !== undefined && r.percent !== null ? ` – **${r.percent} %** (${pts(r.score)} von ${pts(r.maxScore)} Punkten, nötig: ${v.passPercent} %)` : '';
  const review = v.reviewMode !== 'NONE' ? v.questions.slice(0, 20).map((q, i) => `${q.earned !== undefined ? (q.earned >= q.points ? '✅' : q.earned > 0 ? '🟡' : '❌') : q.correctAnswer === undefined ? '•' : q.correctAnswer ? '✅' : '❌'} Frage ${i + 1}${q.earned !== undefined ? ` (${pts(q.earned)}/${pts(q.points)})` : ''}${v.reviewMode === 'SOLUTIONS' && q.correct ? ` – Lösung: ${clip(solutionText(q), 120)}` : ''}`) : [];
  return { ephemeral: true, panel: true, embeds: [b(cfg, {
    title: `📝 ${clip(v.title, 200)}`,
    description: clip([note, `**${head}**${score}`, r.feedback ? `\n💬 Rückmeldung: ${plain(r.feedback)}` : '', review.length ? `\n**Einsicht (${EXAM_REVIEW_LABEL[v.reviewMode]}):**\n${review.join('\n')}` : '', r.passed ? '\nDas Ergebnis ist in deiner Personalakte dokumentiert.' : ''].filter(Boolean).join('\n'), 4000),
  }, r.passed ? 'success' : 'danger')] };
}

// ───────────── Übersichten ─────────────

async function exams(c: Ctx) { return withRetry(() => c.api.asUser<ExamItem[]>(c.discordId, 'GET', '/hr/exams')); }

function examDetail(e: ExamItem, cfg: GuildConfig | null): Reply {
  const fields = [
    { name: '❓ Fragen', value: e.questionsPerAttempt < e.questionTotal ? `${e.questionsPerAttempt} (zufällig aus ${e.questionTotal})` : String(e.questionTotal), inline: true },
    { name: '🎯 Bestanden ab', value: `${e.passPercent} % der Punkte`, inline: true },
    { name: '⏱️ Zeit', value: e.timeLimitMin ? `${e.timeLimitMin} Min.` : 'ohne Limit', inline: true },
    { name: '🔁 Versuche', value: `${e.me.attemptsUsed}/${e.maxAttempts} genutzt${e.retryHours ? ` · ${e.retryHours} h Wartezeit` : ''}`, inline: true },
    { name: '👁️ Einsicht', value: EXAM_REVIEW_LABEL[e.reviewMode] ?? '—', inline: true },
    ...(e.trainingName ? [{ name: '🎓 Ausbildung', value: plain(e.trainingName), inline: true }] : []),
    ...(e.requiredExamTitle ? [{ name: '🔒 Voraussetzung', value: plain(e.requiredExamTitle), inline: true }] : []),
    { name: 'Status', value: `${STATE_ICON[e.me.state]} ${STATE_LABEL[e.me.state]}${e.me.reason ? ` – ${plain(e.me.reason)}` : ''}` },
  ];
  const can = e.me.state === 'AVAILABLE' || e.me.state === 'IN_PROGRESS';
  return { ephemeral: true, panel: true, embeds: [b(cfg, {
    title: clip(`📝 ${e.title}`, 256),
    description: clip([e.description, e.instructions ? `**Hinweise:**\n${e.instructions}` : '', 'Bewertet wird automatisch nach den hinterlegten Kriterien (Punkte je Frage, ggf. Teilpunkte); Freitext ohne Stichworte bewertet ein Prüfer. Die Kriterien stehen bei jeder Frage.'].filter(Boolean).join('\n\n'), 4000),
    fields,
  })], buttons: can ? [{ id: `exam:start:${e.id}`, label: e.me.state === 'IN_PROGRESS' ? 'Fortsetzen' : 'Prüfung starten', emoji: '▶️', style: 'success' }] : [] };
}

async function listReply(c: Ctx): Promise<Reply> {
  const [all, cfg] = await Promise.all([exams(c), cfgOf(c)]);
  const mine = all.filter((e) => e.active || e.me.state === 'IN_PROGRESS' || e.me.state === 'PASSED');
  if (!mine.length) return { ephemeral: true, embeds: [b(cfg, { title: '📝 Prüfungen', description: 'Für dich sind gerade keine Prüfungen freigegeben.' })] };
  return { ephemeral: true, embeds: [b(cfg, { title: '📝 Prüfungen', description: clip(mine.map((e) => `${STATE_ICON[e.me.state]} **${plain(e.title)}**${e.category ? ` · ${plain(e.category)}` : ''} – ${STATE_LABEL[e.me.state]}`).join('\n'), 4000), footer: 'Prüfung auswählen, um Kriterien und Start zu sehen.' })],
    select: { id: 'exam:open', placeholder: 'Prüfung auswählen …', options: mine.slice(0, 25).map((e) => ({ label: clip(e.title, 100), value: e.id, description: clip(STATE_LABEL[e.me.state], 100), emoji: STATE_ICON[e.me.state] })) } };
}

async function resultsReply(c: Ctx): Promise<Reply> {
  const [all, cfg] = await Promise.all([exams(c), cfgOf(c)]);
  const done = all.filter((e) => e.me.last || e.me.state === 'PASSED' || e.me.state === 'PENDING');
  const passed = done.filter((e) => e.me.state === 'PASSED');
  const line = (e: ExamItem) => {
    const last = e.me.last;
    const pct = e.me.bestPercent !== null ? ` · bestes Ergebnis ${e.me.bestPercent} %` : '';
    if (e.me.state === 'PASSED') return `✅ **${plain(e.title)}** – bestanden${pct}`;
    if (e.me.state === 'PENDING') return `⏳ **${plain(e.title)}** – wird bewertet`;
    return `${last?.passed === false ? '❌' : '•'} **${plain(e.title)}** – ${last?.passed === false ? 'nicht bestanden' : (last?.status ?? '—')}${pct} · Versuche ${e.me.attemptsUsed}/${e.maxAttempts}${last?.at ? ` · zuletzt ${t(last.at)}` : ''}`;
  };
  return { ephemeral: true, embeds: [b(cfg, {
    title: '🎓 Deine Prüfungsergebnisse',
    description: clip(done.length ? done.map(line).join('\n') : 'Du hast noch keine Prüfung abgelegt.', 3500),
    fields: [{ name: 'Qualifikationen (bestandene Prüfungen)', value: clip(passed.length ? passed.map((e) => `• ${plain(e.title)}${e.trainingName ? ` (${plain(e.trainingName)})` : ''}`).join('\n') : '—', 1024) }],
    footer: 'Alle Versuche bleiben im System erhalten; Ergebnisse stehen auch in der Personalakte.',
  })] };
}

interface Training { id: string; name: string; description: string | null; modules: string[]; passed: number; active?: boolean }
async function trainingsReply(c: Ctx): Promise<Reply> {
  const [list, cfg] = await Promise.all([withRetry(() => c.api.asUser<Training[]>(c.discordId, 'GET', '/hr/trainings')), cfgOf(c)]);
  return { ephemeral: true, embeds: [b(cfg, {
    title: '🎓 Ausbildungen',
    description: clip(list.length ? list.slice(0, 25).map((x) => `**${plain(x.name)}** – ${x.passed} bestanden${x.modules?.length ? ` · ${x.modules.length} Module: ${clip(x.modules.map(plain).join(', '), 200)}` : ''}${x.description ? `\n${clip(plain(x.description), 200)}` : ''}`).join('\n') : 'Es sind keine Ausbildungen angelegt.', 4000),
    footer: 'Termine: /ausbildung termine · Prüfungen: /pruefung liste',
  })] };
}

async function manageReply(c: Ctx): Promise<Reply> {
  const [all, cfg] = await Promise.all([exams(c), cfgOf(c)]);
  const staff = all.filter((e) => e.canGrade || e.canEdit);
  if (!staff.length) return errorReply('Du bist für keine Prüfung als Prüfer eingetragen (im System: Recht `exam.grade`/`exam.manage` oder Prüfer der Prüfung).');
  return { ephemeral: true, embeds: [b(cfg, {
    title: '🗂️ Prüfungen verwalten',
    description: clip(staff.map((e) => `${e.active ? '🟢' : '⏸️'} **${plain(e.title)}** – ${e.stats ? `${e.stats.participants} Teiln., ${e.stats.passed} bestanden${e.stats.passRate !== null ? ` (${e.stats.passRate} %)` : ''}${e.stats.pending ? ` · ⏳ ${e.stats.pending} zu bewerten` : ''}` : 'keine Daten'}`).join('\n'), 4000),
  })], select: { id: 'exam:adm', placeholder: 'Prüfung auswählen …', options: staff.slice(0, 25).map((e) => ({ label: clip(e.title, 100), value: e.id, description: e.active ? 'aktiv' : 'nicht freigegeben' })) } };
}

function adminDetail(e: ExamItem, cfg: GuildConfig | null): Reply {
  const s = e.stats;
  const buttons: ButtonSpec[] = [{ id: `exam:res:${e.id}`, label: 'Auswertung', emoji: '📊', style: 'primary' }];
  if (s?.pending) buttons.push({ id: `exam:pend:${e.id}`, label: `Zu bewerten (${s.pending})`, emoji: '⏳', style: 'primary' });
  if (e.canEdit) buttons.push({ id: `exam:post:${e.id}`, label: 'In Discord ankündigen', emoji: '📢', style: 'secondary', disabled: !e.active }, { id: `exam:toggle:${e.id}`, label: e.active ? 'Deaktivieren …' : 'Aktivieren …', emoji: e.active ? '⏸️' : '▶️', style: 'secondary' });
  return { ephemeral: true, panel: true, embeds: [b(cfg, {
    title: clip(`🗂️ ${e.title}`, 256),
    fields: [
      { name: 'Status', value: e.active ? '🟢 aktiv' : '⏸️ nicht freigegeben', inline: true },
      { name: 'Fragen', value: `${e.questionsPerAttempt}/${e.questionTotal}`, inline: true },
      { name: 'Bestanden ab', value: `${e.passPercent} %`, inline: true },
      { name: 'Teilnehmende', value: String(s?.participants ?? 0), inline: true },
      { name: 'Bestanden', value: `${s?.passed ?? 0}${s?.passRate !== null && s?.passRate !== undefined ? ` (${s.passRate} %)` : ''}`, inline: true },
      { name: 'Ø Ergebnis', value: s?.avgPercent !== null && s?.avgPercent !== undefined ? `${s.avgPercent} %` : '—', inline: true },
      { name: 'Offen', value: `⏳ ${s?.pending ?? 0} zu bewerten · ✏️ ${s?.running ?? 0} laufen`, inline: true },
    ],
    footer: 'Fragen bearbeiten und neue Prüfungen anlegen: im Dashboard.',
  })], buttons };
}

async function pendingReply(c: Ctx, examId?: string): Promise<Reply> {
  const [rows, cfg] = await Promise.all([c.api.asUser<AttemptRow[]>(c.discordId, 'GET', `/hr/attempts?status=SUBMITTED${examId ? `&examId=${examId}` : ''}`), cfgOf(c)]);
  const open = rows.filter((r) => !r.own);
  if (!open.length) return { ephemeral: true, panel: true, embeds: [b(cfg, { title: '⏳ Zu bewerten', description: 'Keine abgegebenen Versuche warten auf eine Bewertung.' }, 'success')] };
  return { ephemeral: true, panel: true, embeds: [b(cfg, { title: `⏳ Zu bewerten (${open.length})`, description: clip(open.slice(0, 25).map((r) => `• **${plain(r.personnel.user.displayName)}** – ${plain(r.exam.title)} · abgegeben ${t(r.submittedAt)}`).join('\n'), 4000) })],
    select: { id: 'exam:g', placeholder: 'Versuch zum Bewerten auswählen …', options: open.slice(0, 25).map((r) => ({ label: clip(`${r.personnel.user.displayName} – ${r.exam.title}`, 100), value: r.id, description: clip(`abgegeben ${r.submittedAt ? new Date(r.submittedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : '—'}`, 100) })) } };
}

/** Prüfer-Ansicht: Antworten, Kriterium/Lösung und automatische Punkte je Frage. */
export function gradingReply(v: AttemptView, cfg: GuildConfig | null): Reply {
  const fields = v.questions.slice(0, 20).map((q, i) => ({
    name: clip(`Frage ${i + 1} · max ${pts(q.points)} P. · ${q.auto === null || q.auto === undefined ? '✍️ manuell' : `automatisch ${pts(q.auto)} P.`}`, 256),
    value: clip(`${plain(q.type === 'GAP' ? gapText(q.text) : q.text)}\n**Antwort:** ${plain(answerText(q, v.answers?.[q.id]))}\n**Kriterium:** ${plain(solutionText(q))}${q.partial ? ' (Teilpunkte)' : ''}`, 1024),
  }));
  const manual = v.questions.filter((q) => q.auto === null || q.auto === undefined).length;
  return { ephemeral: true, panel: true, embeds: [b(cfg, {
    title: clip(`✍️ ${v.title} – ${v.name}`, 256),
    description: `Status: **${v.status === 'SUBMITTED' ? 'wartet auf Bewertung' : v.status === 'GRADED' ? 'bewertet' : v.status}** · Bestanden ab ${v.passPercent} %${v.result?.percent !== undefined && v.result?.percent !== null ? ` · aktuell ${v.result.percent} %` : ''}\n${manual ? `${manual} Frage(n) ohne automatische Bewertung – Punkte im Formular vergeben.` : 'Alle Fragen sind automatisch bewertbar – optional Rückmeldung geben.'}${v.questions.length > 20 ? `\n… ${v.questions.length - 20} weitere Fragen im Dashboard` : ''}`,
    fields,
  })], buttons: [
    ...(v.status !== 'VOIDED' ? [{ id: `exam:gin:${v.id}`, label: v.status === 'GRADED' ? 'Neu bewerten' : 'Bewerten', emoji: '✍️', style: 'success' as const }] : []),
    ...(v.status !== 'VOIDED' ? [{ id: `exam:void:${v.id}`, label: 'Annullieren …', emoji: '🚫', style: 'danger' as const }] : []),
  ] };
}

export function gradeModal(v: AttemptView): Reply {
  const manual = v.questions.map((q, i) => ({ q, i })).filter(({ q }) => q.auto === null || q.auto === undefined);
  if (manual.length > 4) return errorReply(`${manual.length} Fragen müssen von Hand bewertet werden – das passt nicht in ein Discord-Formular (höchstens 4). Bitte im Dashboard bewerten.`);
  return { modal: { id: `exam:gm:${v.id}`, title: 'Versuch bewerten', fields: [
    ...manual.map(({ q, i }) => ({ id: `s${i}`, label: clip(`Frage ${i + 1}: Punkte (0–${pts(q.points)})`, 45), required: true, maxLength: 6, placeholder: '0' })),
    { id: 'feedback', label: 'Rückmeldung an die Person (optional)', paragraph: true, maxLength: 2000 },
  ] } };
}

export function parseGrade(v: AttemptView, f: Record<string, string>): { scores?: Record<string, number>; feedback?: string; error?: string } {
  const scores: Record<string, number> = {};
  for (const [i, q] of v.questions.entries()) {
    if (!(q.auto === null || q.auto === undefined)) continue;
    const raw = (f[`s${i}`] ?? '').trim().replace(',', '.');
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0 || n > q.points) return { error: `Frage ${i + 1}: bitte eine Zahl von 0 bis ${pts(q.points)} eintragen.` };
    scores[q.id] = n;
  }
  return { scores, ...(f.feedback?.trim() ? { feedback: f.feedback.trim().slice(0, 2000) } : {}) };
}

/** Prüfungsfelder für das Speichern (vollständig, damit nichts verloren geht) – nur `active` wird geändert. */
export function examBodyWithActive(detail: Record<string, unknown>, active: boolean) {
  const iso = (v: unknown) => (v ? new Date(String(v)).toISOString() : null);
  const r = examSchema.safeParse({ ...detail, availableFrom: iso(detail.availableFrom), availableUntil: iso(detail.availableUntil), active });
  return r.success ? r.data : null;
}

// ───────────── Befehl ─────────────

export const EXAM_COMMANDS: CommandDef[] = [{
  name: 'pruefung', description: 'Prüfungszentrum: Prüfungen ablegen, Ergebnisse, Ausbildungen; für Ausbilder: verwalten und bewerten',
  subcommands: [
    { name: 'liste', description: 'Verfügbare Prüfungen mit Kriterien – direkt in Discord ablegen' },
    { name: 'ergebnisse', description: 'Deine Ergebnisse, Versuche und Qualifikationen' },
    { name: 'ausbildungen', description: 'Ausbildungen mit Modulen anzeigen' },
    { name: 'verwalten', description: 'Ausbilder: Prüfungen, Auswertung, Freigabe, Ankündigung' },
    { name: 'bewerten', description: 'Ausbilder: abgegebene Versuche bewerten' },
  ],
  async run(c) {
    const sub = String(c.opts._sub ?? 'liste');
    const denied = await guard(c, `pruefung ${sub}`); if (denied) return denied;
    try {
      if (sub === 'ergebnisse') return await resultsReply(c);
      if (sub === 'ausbildungen') return await trainingsReply(c);
      if (sub === 'verwalten') return await manageReply(c);
      if (sub === 'bewerten') return { ...(await pendingReply(c)), panel: false };
      return await listReply(c);
    } catch (e) { return mapError(e); }
  },
}];

/**
 * exam:open (Auswahl) · exam:start:<prüfung> · exam:q:<versuch>:<nr> · exam:a:<versuch>:<nr> (Auswahl) · exam:yn:<versuch>:<nr>:<ja|nein>
 * exam:in:<versuch>:<nr> (Formular) · exam:m:<versuch>:<nr> (Formular-Absendung) · exam:flag:<versuch>:<nr> · exam:review:<versuch> · exam:submit:<versuch>
 * Ausbilder: exam:adm (Auswahl) · exam:admv:<prüfung> · exam:res:<prüfung> · exam:pend:<prüfung> · exam:post:<prüfung> · exam:toggle:<prüfung> · exam:togglec:<prüfung>:<1|0>
 *            exam:g (Auswahl) · exam:gin:<versuch> (Formular) · exam:gm:<versuch> · exam:void:<versuch> (Formular) · exam:vm:<versuch>
 */
export const EXAM_INTERACTION: InteractionDef = {
  prefix: 'exam',
  opensModal: (args) => ['in', 'gin', 'void'].includes(args[0] ?? ''),
  panel: (args) => !['in', 'gin', 'void'].includes(args[0] ?? ''),
  async run(c): Promise<Reply> {
    const [action, id, rawIdx, extra] = c.args;
    const denied = await guard(c, `exam:${action ?? ''}`); if (denied) return denied;
    const idx = Number(rawIdx ?? 0);
    const target = action === 'open' || action === 'adm' || action === 'g' ? c.values?.[0] : id;
    if (!target || !UUID.test(target)) return errorReply('Ungültige Anfrage.');
    try {
      const cfg = await cfgOf(c);
      switch (action) {
        case 'open': { const e = (await exams(c)).find((x) => x.id === target); return e ? examDetail(e, cfg) : errorReply('Prüfung nicht verfügbar.'); }
        case 'start': {
          const v = await c.api.asUser<AttemptView>(c.discordId, 'POST', `/hr/exams/${target}/start`);
          const first = v.questions.findIndex((q) => !isAnswered(q, v.answers?.[q.id]));
          return questionReply(v, first < 0 ? 0 : first, cfg, v.instructions ? `**Hinweise:** ${clip(v.instructions, 800)}` : undefined);
        }
        case 'q': { const v = await viewOf(c, target); return v.status === 'IN_PROGRESS' ? questionReply(v, idx, cfg) : resultReply(v, cfg); }
        case 'a': case 'yn': case 'flag': case 'm': {
          const v = await viewOf(c, target);
          if (v.status !== 'IN_PROGRESS') return resultReply(v, cfg, 'Dieser Versuch ist schon abgegeben.');
          const q = v.questions[idx];
          if (!q) return errorReply('Frage nicht gefunden.');
          let r: AttemptView | Reply;
          if (action === 'flag') r = await saveAnswer(c, v, q.id, v.answers?.[q.id] ?? '', v.flagged.includes(q.id) ? v.flagged.filter((x) => x !== q.id) : [...v.flagged, q.id]);
          else if (action === 'a') r = await saveAnswer(c, v, q.id, q.type === 'MULTI' ? [...(c.values ?? [])].sort() : (c.values?.[0] ?? ''));
          else if (action === 'yn') r = await saveAnswer(c, v, q.id, extra === 'ja' ? 'ja' : 'nein');
          else {
            const p = parseModalAnswer(q, c.fields ?? {});
            if (p.error) return errorReply(p.error);
            r = await saveAnswer(c, v, q.id, p.value);
          }
          return 'questions' in r ? questionReply(r, idx, cfg, action === 'flag' ? undefined : '💾 Antwort gespeichert.') : r;
        }
        case 'in': { const v = await viewOf(c, target); return v.status === 'IN_PROGRESS' ? answerModal(v, idx) : errorReply('Dieser Versuch ist schon abgegeben.'); }
        case 'review': { const v = await viewOf(c, target); return v.status === 'IN_PROGRESS' ? reviewReply(v, cfg) : resultReply(v, cfg); }
        case 'submit': {
          const v = await viewOf(c, target);
          if (v.status !== 'IN_PROGRESS') return resultReply(v, cfg, 'Dieser Versuch ist schon abgegeben.');
          return resultReply(await c.api.asUser<AttemptView>(c.discordId, 'POST', `/hr/attempts/${target}/submit`, { answers: v.answers ?? {} }), cfg);
        }
        // ── Ausbilder ──
        case 'adm': case 'admv': { const e = (await exams(c)).find((x) => x.id === target && (x.canGrade || x.canEdit)); return e ? adminDetail(e, cfg) : errorReply('Prüfung nicht gefunden oder du bist dafür kein Prüfer.'); }
        case 'res': {
          const r = await c.api.asUser<{ exam: { title: string; passPercent: number }; stats: { participants: number; attempts: number; passed: number; pending: number; voided: number; avgPercent: number | null; passRate: number | null; avgMinutes: number | null }; people: { name: string; rank: string | null; attempts: number; bestPercent: number | null; passed: boolean; pending: boolean }[]; questions: { text: string; correctRate: number | null; asked: number }[] }>(c.discordId, 'GET', `/hr/exams/${target}/results`);
          const hard = r.questions.filter((q) => q.asked && q.correctRate !== null).sort((a, z) => a.correctRate! - z.correctRate!).slice(0, 5);
          return { ephemeral: true, panel: true, embeds: [b(cfg, {
            title: clip(`📊 Auswertung: ${r.exam.title}`, 256),
            description: clip(r.people.slice(0, 20).map((p) => `${p.passed ? '✅' : p.pending ? '⏳' : '❌'} **${plain(p.name)}**${p.rank ? ` (${plain(p.rank)})` : ''} – ${p.bestPercent !== null ? `${p.bestPercent} %` : '—'} · ${p.attempts} Versuch(e)`).join('\n') || 'Noch keine Versuche.', 4000),
            fields: [
              { name: 'Kennzahlen', value: `${r.stats.participants} Teilnehmende · ${r.stats.attempts} Versuche · ${r.stats.passed} bestanden${r.stats.passRate !== null ? ` (${r.stats.passRate} %)` : ''} · Ø ${r.stats.avgPercent ?? '—'} %${r.stats.avgMinutes !== null ? ` · Ø ${r.stats.avgMinutes} Min.` : ''} · ${r.stats.voided} annulliert` },
              ...(hard.length ? [{ name: 'Schwierigste Fragen', value: clip(hard.map((q) => `• ${q.correctRate} % richtig – ${plain(q.text)}`).join('\n'), 1024) }] : []),
            ],
          })], buttons: [{ id: `exam:pend:${target}`, label: `Zu bewerten (${r.stats.pending})`, emoji: '⏳', style: 'primary', disabled: !r.stats.pending }] };
        }
        case 'pend': return await pendingReply(c, target);
        case 'post': {
          const channelId = cfg?.channels.exams ?? c.channelId;
          if (!channelId) return errorReply('Kein Kanal für Prüfungs-Ankündigungen eingestellt (`/setup` → Kanäle).');
          await c.api.asUser(c.discordId, 'POST', `/hr/exams/${target}/discord`, { channelId, pingRoleIds: [] });
          return { ephemeral: true, panel: true, embeds: [b(cfg, { title: '📢 Angekündigt', description: `Die Prüfung wird gleich in <#${channelId}> angekündigt.` }, 'success')] };
        }
        case 'toggle': {
          const e = (await exams(c)).find((x) => x.id === target);
          if (!e?.canEdit) return errorReply('Dafür fehlt dir im System das Recht `exam.manage`.');
          return { ephemeral: true, panel: true, embeds: [b(cfg, { title: e.active ? '⏸️ Prüfung deaktivieren?' : '▶️ Prüfung aktivieren?', description: e.active ? `**${plain(e.title)}** wird nicht mehr zum Ablegen angeboten. Laufende und frühere Versuche, Ergebnisse und Fragen **bleiben vollständig erhalten**.` : `**${plain(e.title)}** wird wieder zum Ablegen angeboten.` }, 'warning')],
            buttons: [{ id: `exam:togglec:${target}:${e.active ? 0 : 1}`, label: e.active ? 'Ja, deaktivieren' : 'Ja, aktivieren', style: e.active ? 'danger' : 'success' }, { id: `exam:admv:${target}`, label: 'Abbrechen', style: 'secondary' }] };
        }
        case 'togglec': {
          const detail = await c.api.asUser<Record<string, unknown>>(c.discordId, 'GET', `/hr/exams/${target}`);
          const body = examBodyWithActive(detail, rawIdx === '1');
          if (!body) return errorReply('Die Prüfung konnte nicht vollständig gelesen werden – zur Sicherheit wurde nichts geändert. Bitte im Dashboard ändern.');
          await c.api.asUser(c.discordId, 'PUT', `/hr/exams/${target}`, body);
          return { ephemeral: true, panel: true, embeds: [b(cfg, { title: rawIdx === '1' ? '▶️ Aktiviert' : '⏸️ Deaktiviert', description: `${plain(String(detail.title ?? ''))} – alle Versuche und Ergebnisse bleiben erhalten.` }, 'success')] };
        }
        case 'g': return gradingReply(await viewOf(c, target), cfg);
        case 'gin': return gradeModal(await viewOf(c, target));
        case 'gm': {
          const v = await viewOf(c, target);
          const g = parseGrade(v, c.fields ?? {});
          if (g.error) return errorReply(g.error);
          const r = await c.api.asUser<AttemptView>(c.discordId, 'POST', `/hr/attempts/${target}/grade`, { scores: g.scores, ...(g.feedback ? { feedback: g.feedback } : {}) });
          const res = gradingReply(r, cfg);
          res.embeds![0]!.description = `✅ Bewertet: **${r.result?.passed ? 'bestanden' : 'nicht bestanden'}**${r.result?.percent !== undefined && r.result?.percent !== null ? ` (${r.result.percent} %)` : ''} – die Person wird benachrichtigt, das Ergebnis steht in der Personalakte.\n\n${res.embeds![0]!.description ?? ''}`;
          return res;
        }
        case 'void': return { modal: { id: `exam:vm:${target}`, title: 'Versuch annullieren', fields: [{ id: 'reason', label: 'Grund (wird dokumentiert, mind. 3 Zeichen)', paragraph: true, required: true, minLength: 3, maxLength: 500 }] } };
        case 'vm': {
          const reason = (c.fields?.reason ?? '').trim();
          if (reason.length < 3) return errorReply('Bitte einen Grund angeben.');
          const r = await c.api.asUser<AttemptView>(c.discordId, 'POST', `/hr/attempts/${target}/void`, { reason });
          const res = gradingReply(r, cfg);
          res.embeds![0]!.description = `🚫 Annulliert – der Versuch bleibt mit Grund erhalten, zählt aber nicht.\n\n${res.embeds![0]!.description ?? ''}`;
          return res;
        }
        default: return errorReply('Unbekannte Aktion.');
      }
    } catch (e) { return mapError(e); }
  },
};
