import { QuestionType } from '@nexus/types';
import type { AnswerValue, Question } from '@nexus/types';
import { renderTemplate } from '@nexus/core';

/**
 * Darstellung der DM-Bewerbung (reine Funktionen, ohne Discord/Datenbank).
 * Discord erlaubt höchstens 2000 Zeichen pro Nachricht – alles hier bleibt darunter.
 */
export const DISCORD_LIMIT = 1900;
const LINE = '━━━━━━━━━━━━━━━━━━';

export const DISPLAY_ONLY: ReadonlySet<string> = new Set([
  QuestionType.PARAGRAPH,
  QuestionType.INFO,
  QuestionType.SEPARATOR,
]);
export const isDisplayOnly = (q: Pick<Question, 'type'>): boolean => DISPLAY_ONLY.has(q.type);

const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;

/** Kurzer Antwort-Hinweis je Fragetyp (Format, Optionen, Grenzen). */
export function questionHint(q: Question): string[] {
  const v = q.validation ?? {};
  const lines: string[] = [];
  const options = (q.options ?? []).filter((o) => o.enabled);
  switch (q.type) {
    case QuestionType.SINGLE_SELECT:
    case QuestionType.MULTI_SELECT:
    case QuestionType.MULTI_CHECKBOX:
      options.forEach((o, i) =>
        lines.push(
          `**${i + 1}.** ${o.emoji ? `${o.emoji} ` : ''}${o.label}${o.description ? ` – ${o.description}` : ''}`,
        ),
      );
      lines.push(
        q.type === QuestionType.SINGLE_SELECT
          ? '_Antworte mit der Nummer oder dem Namen der Option._'
          : `_Antworte mit Nummern oder Namen, durch Komma getrennt${
              v.minSelections || v.maxSelections
                ? ` (${[v.minSelections ? `mind. ${v.minSelections}` : '', v.maxSelections ? `max. ${v.maxSelections}` : ''].filter(Boolean).join(', ')})`
                : ''
            }._`,
      );
      break;
    case QuestionType.YES_NO:
    case QuestionType.CONFIRMATION:
    case QuestionType.CHECKBOX:
      lines.push('_Antworte mit **Ja** oder **Nein**._');
      break;
    case QuestionType.NUMBER:
    case QuestionType.DECIMAL:
      lines.push(
        `_Antworte mit einer ${q.type === QuestionType.NUMBER ? 'ganzen ' : ''}Zahl${
          v.min !== undefined || v.max !== undefined ? ` (${v.min ?? '…'} bis ${v.max ?? '…'})` : ''
        }._`,
      );
      break;
    case QuestionType.RATING:
    case QuestionType.SLIDER:
      lines.push(
        `_Antworte mit einer Zahl von ${v.min ?? 1} bis ${v.max ?? (q.type === QuestionType.RATING ? 5 : 10)}._`,
      );
      break;
    case QuestionType.DATE:
      lines.push('_Format: TT.MM.JJJJ (z. B. 24.09.2026)._');
      break;
    case QuestionType.TIME:
      lines.push('_Format: HH:mm (z. B. 18:30)._');
      break;
    case QuestionType.DATETIME:
      lines.push('_Format: TT.MM.JJJJ HH:mm (z. B. 24.09.2026 18:30)._');
      break;
    case QuestionType.URL:
      lines.push('_Antworte mit einem Link (https://…)._');
      break;
    case QuestionType.EMAIL:
      lines.push('_Antworte mit einer E-Mail-Adresse._');
      break;
    case QuestionType.DISCORD_USER:
      lines.push('_Antworte mit der Discord-ID oder einer @Erwähnung._');
      break;
    case QuestionType.LONG_TEXT:
    case QuestionType.TEXT:
    case QuestionType.USERNAME:
      if (v.minLength || v.maxLength) {
        lines.push(
          `_Länge: ${[v.minLength ? `mind. ${v.minLength}` : '', v.maxLength ? `max. ${v.maxLength}` : ''].filter(Boolean).join(', ')} Zeichen._`,
        );
      }
      break;
    default:
      break;
  }
  return lines;
}

export interface QuestionMessageInput {
  applicationName: string;
  question: Question;
  number: number;
  total: number;
  messages?: Record<string, string>;
  expiresAt?: Date | undefined;
  /** Zusatzzeile, z. B. „Du bearbeitest …“. */
  note?: string | undefined;
}

/** Text der Frage-Nachricht (≤ 2000 Zeichen; die Beschreibung wird bei Bedarf gekürzt). */
export function formatQuestionMessage(i: QuestionMessageInput): string {
  const q = i.question;
  const hint = questionHint(q);
  const marker = q.required
    ? '⚠️ _Pflichtfrage_'
    : '_Optional – du kannst die Frage überspringen._';
  const head = [LINE, i.applicationName, LINE, '', `Frage ${i.number} von ${i.total}`, ''];
  if (i.note) head.push(i.note, '');
  const tail = ['', ...hint, ...(hint.length ? [''] : []), marker];
  if (i.expiresAt)
    tail.push('', `⏱️ Zeit verbleibend: <t:${Math.floor(i.expiresAt.getTime() / 1000)}:R>`);
  const template = i.messages?.['question'] ?? '**{title}**\n\n{description}';
  const render = (description: string) =>
    renderTemplate(template, {
      applicationName: i.applicationName,
      title: q.title,
      description,
    }).trim();
  const fixed = head.join('\n').length + tail.join('\n').length + 2;
  let body = render(q.description ?? '');
  if (fixed + body.length > DISCORD_LIMIT) {
    const room = DISCORD_LIMIT - fixed - render('').length - 1;
    body = render(cut(q.description ?? '', Math.max(0, room)));
  }
  return cut([...head, body, ...tail].join('\n'), DISCORD_LIMIT);
}

/** Text einer Anzeige-Frage (Hinweis/Absatz): wird gezeigt, ohne Antwort zu verlangen. */
export function formatInfoMessage(q: Question): string {
  return cut(`ℹ️ **${q.title}**${q.description ? `\n\n${q.description}` : ''}`, DISCORD_LIMIT);
}

export function formatAnswer(value: AnswerValue | undefined, q?: Question): string {
  if (value === null || value === undefined || value === '') return '–';
  const label = (v: string) => (q?.options ?? []).find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(', ') || '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  return label(String(value));
}

/** Teilt Text an Zeilengrenzen in Nachrichten ≤ `max` Zeichen (lange Zusammenfassungen gehen nicht verloren). */
export function chunkLines(lines: string[], max = DISCORD_LIMIT): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const raw of lines) {
    const line = cut(raw, max);
    if (current && current.length + line.length + 1 > max) {
      chunks.push(current);
      current = '';
    }
    current += (current ? '\n' : '') + line;
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

export function formatSummary(
  questions: Question[],
  answers: Record<string, AnswerValue | undefined>,
): string[] {
  const lines = [LINE, '📋 DEINE BEWERBUNG', LINE, ''];
  let n = 0;
  for (const q of questions) {
    if (isDisplayOnly(q)) continue;
    n++;
    lines.push(`**${n}. ${q.title}**`, cut(formatAnswer(answers[q.id], q), 400), '');
  }
  lines.push('Prüfe deine Antworten. Mit dem Menü kannst du einzelne Antworten ändern.');
  return chunkLines(lines);
}
