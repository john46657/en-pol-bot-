import type { DiscordComponents, DiscordEmbed, MessagePayload } from '@nexus/discord';
import { QuestionType, SubmissionStatus } from '@nexus/types';
import type { Question } from '@nexus/types';

/** Darstellung der Bewerbung für das Bearbeitungsteam (reine Funktionen, rohes Discord-JSON). */
export const STATUS_LABEL: Record<string, string> = {
  STARTED: '🟡 Gestartet',
  IN_PROGRESS: '🟡 In Bearbeitung durch den Bewerber',
  PAUSED: '⏸️ Pausiert',
  SUBMITTED: '📨 Offen (PENDING)',
  UNDER_REVIEW: '🔵 In Prüfung',
  ACCEPTED: '🟢 Angenommen',
  DENIED: '🔴 Abgelehnt',
  WITHDRAWN: '↩️ Vom Bewerber zurückgezogen',
  EXPIRED: '⚫ Abgelaufen',
  CANCELLED: '✖️ Abgebrochen',
  ARCHIVED: '🗄️ Archiviert',
};

const FINAL: ReadonlySet<string> = new Set([
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.DENIED,
  SubmissionStatus.WITHDRAWN,
  SubmissionStatus.ARCHIVED,
]);
export const isFinal = (status: string): boolean => FINAL.has(status);

const DISPLAY: ReadonlySet<string> = new Set([
  QuestionType.PARAGRAPH,
  QuestionType.INFO,
  QuestionType.SEPARATOR,
]);
const cut = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function formatValue(value: unknown, q?: Question): string {
  if (value === null || value === undefined || value === '') return '–';
  const label = (v: string) => (q?.options ?? []).find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(value)) return value.map((v) => label(String(v))).join(', ') || '–';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nein';
  return label(String(value));
}

/** Antworten als Textblöcke ≤ `max` Zeichen – nichts wird abgeschnitten, lange Bewerbungen laufen über mehrere Nachrichten. */
export function answerBlocks(
  questions: Question[],
  answers: Record<string, unknown>,
  max = 3800,
): string[] {
  const blocks: string[] = [];
  let current = '';
  let n = 0;
  for (const q of [...questions].sort((a, b) => a.order - b.order)) {
    if (DISPLAY.has(q.type) || answers[q.id] === undefined) continue;
    n++;
    // Eine einzelne Antwort darf höchstens `max` Zeichen belegen (Discord-Limit je Embed).
    const entry = `**${n}. ${cut(q.title, 200)}**\n${cut(formatValue(answers[q.id], q), max - 260)}`;
    if (current && current.length + entry.length + 2 > max) {
      blocks.push(current);
      current = '';
    }
    current += (current ? '\n\n' : '') + entry;
  }
  if (current) blocks.push(current);
  return blocks;
}

export interface ReviewMessageInput {
  submissionId: string;
  applicantId: string;
  applicantName: string;
  applicationName: string;
  version: number;
  status: string;
  submittedAt?: Date | null;
  answerCount: number;
  isTest?: boolean;
  decision?: { by: string; reason?: string | null; note?: string | null } | undefined;
  dashboardUrl?: string | undefined;
  /** Rollen, die über die neue Bewerbung informiert werden. */
  pingRoleIds?: string[] | undefined;
  /** Menschenlesbare ID (z. B. POL-00152). */
  number?: string | null | undefined;
  /** Bearbeiter, der die Bewerbung übernommen hat. */
  assigneeId?: string | null | undefined;
}

const COLOR: Record<string, number> = {
  SUBMITTED: 0xfee75c,
  UNDER_REVIEW: 0x5865f2,
  ACCEPTED: 0x57f287,
  DENIED: 0xed4245,
  WITHDRAWN: 0x95a5a6,
};

/** Hauptnachricht im Bearbeitungskanal: Kopf-Embed + Schaltflächen (nach der Entscheidung ohne Schaltflächen). */
export function reviewMessage(
  i: ReviewMessageInput,
): MessagePayload & { allowed_mentions?: unknown } {
  const fields: DiscordEmbed['fields'] = [
    ...(i.number ? [{ name: 'ID', value: `#${i.number}`, inline: true }] : []),
    { name: 'Bewerber', value: `<@${i.applicantId}> (\`${i.applicantId}\`)`, inline: true },
    { name: 'Bewerbung', value: `${i.applicationName} · v${i.version}`, inline: true },
    { name: 'Antworten', value: String(i.answerCount), inline: true },
  ];
  if (i.submittedAt)
    fields.push({
      name: 'Eingereicht',
      value: `<t:${Math.floor(i.submittedAt.getTime() / 1000)}:R>`,
      inline: true,
    });
  fields.push({ name: 'Bearbeiter', value: i.assigneeId ? `<@${i.assigneeId}>` : 'Noch nicht zugewiesen', inline: true });
  if (i.decision) {
    fields.push({ name: 'Entschieden von', value: `<@${i.decision.by}>`, inline: true });
    if (i.decision.reason) fields.push({ name: 'Grund', value: cut(i.decision.reason, 1000) });
    if (i.decision.note)
      fields.push({ name: 'Nachricht an den Bewerber', value: cut(i.decision.note, 1000) });
  }
  const embed: DiscordEmbed = {
    title: `📋 ${i.number ? `#${i.number} · ` : ''}${cut(i.applicantName, 120)} – ${cut(i.applicationName, 100)}${i.isTest ? ' (TEST)' : ''}`,
    description: STATUS_LABEL[i.status] ?? i.status,
    color: COLOR[i.status] ?? 0x5865f2,
    fields,
    footer: { text: `ID ${i.submissionId}` },
  };
  const payload: MessagePayload & { allowed_mentions?: unknown } = {
    ...(i.pingRoleIds?.length && !isFinal(i.status)
      ? { content: i.pingRoleIds.map((r) => `<@&${r}>`).join(' ') + ' – neue Bewerbung' }
      : {}),
    embeds: [embed],
    components: isFinal(i.status) ? [] : reviewButtons(i.submissionId, i.dashboardUrl),
    allowed_mentions: { parse: [], roles: i.pingRoleIds ?? [] },
  };
  return payload;
}

/** Ansehen · Annehmen · Ablehnen · Rückfragen · Gespräch  /  Verlauf · Notiz · Dashboard */
export function reviewButtons(submissionId: string, dashboardUrl?: string): DiscordComponents[] {
  const id = (a: string) => `nexus:review:${a}:${submissionId}`;
  const second: DiscordComponents['components'] = [
    { type: 2, style: 1, label: 'Übernehmen', emoji: { name: '👤' }, custom_id: id('claim') },
    { type: 2, style: 2, label: 'Verlauf', emoji: { name: '📜' }, custom_id: id('history') },
    { type: 2, style: 2, label: 'Notiz', emoji: { name: '📝' }, custom_id: id('note') },
  ];
  if (dashboardUrl) second.push({ type: 2, style: 5, label: 'Im Dashboard', url: dashboardUrl });
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 2, label: 'Ansehen', emoji: { name: '📖' }, custom_id: id('view') },
        { type: 2, style: 3, label: 'Annehmen', emoji: { name: '🟢' }, custom_id: id('accept') },
        { type: 2, style: 4, label: 'Ablehnen', emoji: { name: '🔴' }, custom_id: id('deny') },
        { type: 2, style: 1, label: 'Rückfrage', emoji: { name: '🟡' }, custom_id: id('ask') },
        { type: 2, style: 1, label: 'Gespräch', emoji: { name: '🎙️' }, custom_id: id('interview') },
      ],
    },
    { type: 1, components: second },
  ];
}

/** Nachrichten mit den Antworten (Folge-Nachrichten unter der Hauptnachricht). */
export function answerMessages(
  questions: Question[],
  answers: Record<string, unknown>,
): MessagePayload[] {
  return answerBlocks(questions, answers).map((description, idx, all) => ({
    embeds: [
      {
        title: idx === 0 ? 'Antworten' : `Antworten (${idx + 1}/${all.length})`,
        description,
        color: 0x2b2d31,
      },
    ],
  }));
}
