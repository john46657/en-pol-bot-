import { SubmissionStatus } from '@nexus/types';
import type { EmbedConfig, Question } from '@nexus/types';
import type { DiscordComponents, DiscordEmbed } from './types.js';

/**
 * Embed-Builder als reines JSON (§26/§27/§40).
 *
 * API und Bot nutzen dieselben Render-Funktionen → keine zwei Optiken und
 * keine doppelte Logik (§33). Discord akzeptiert rohe Embed-JSON.
 */

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  STARTED: '🟡 Gestartet',
  IN_PROGRESS: '🟡 In Bearbeitung',
  PAUSED: '⏸️ Pausiert',
  SUBMITTED: '📨 Eingereicht',
  UNDER_REVIEW: '🔵 In Prüfung',
  ON_HOLD: '🟠 Zurückgestellt',
  ACCEPTED: '🟢 Angenommen',
  DENIED: '🔴 Abgelehnt',
  EXPIRED: '⚫ Abgelaufen',
  CANCELLED: '✖️ Abgebrochen',
  WITHDRAWN: '↩️ Zurückgezogen',
  ARCHIVED: '🗄️ Archiviert',
};

export function colorToInt(color?: string): number | undefined {
  if (!color) return undefined;
  const hex = color.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex, 16) : undefined;
}

export interface PanelEmbedInput {
  title: string;
  description?: string | null;
  embed?: Record<string, unknown>;
  applicationNames: string[];
}

export function buildPanelEmbed(input: PanelEmbedInput): DiscordEmbed {
  const embed: DiscordEmbed = { title: input.title };
  if (input.description) embed.description = input.description;

  const config = (input.embed ?? {}) as Partial<EmbedConfig>;
  if (config.color) {
    const color = colorToInt(config.color);
    if (color !== undefined) embed.color = color;
  }
  if (config.imageUrl) embed.image = { url: config.imageUrl };
  if (config.thumbnailUrl) embed.thumbnail = { url: config.thumbnailUrl };
  if (config.footer) embed.footer = { text: config.footer };
  if (config.authorName) embed.author = { name: config.authorName };

  embed.fields = [
    {
      name: 'Verfügbare Bewerbungen',
      value: input.applicationNames.map((n) => `• **${n}**`).join('\n') || '—',
      inline: false,
    },
  ];
  return embed;
}

export interface SubmissionEmbedInput {
  applicantName: string;
  applicationName: string;
  applicationVersion: number;
  status: SubmissionStatus;
  embedConfig?: Partial<EmbedConfig>;
  statsConfig?: Record<string, boolean>;
  questions: Question[];
  answers: Record<string, unknown>;
  userId: string;
  username: string;
  durationSeconds?: number;
  submittedAt?: Date;
}

export function buildSubmissionEmbed(input: SubmissionEmbedInput): DiscordEmbed {
  const { embedConfig, statsConfig, questions, answers } = input;

  const embed: DiscordEmbed = {
    title: embedConfig?.title ?? `📋 ${input.applicantName} – ${input.applicationName}`,
    description: STATUS_LABEL[input.status] ?? 'Bewerbung',
  };

  const color = colorToInt(embedConfig?.color ?? '5865F2');
  if (color !== undefined) embed.color = color;

  const truncate = embedConfig?.answerTruncate ?? 1024;
  const fields = questions
    .filter((q) => answers[q.id] !== undefined && answers[q.id] !== null)
    .map((q) => ({
      name: q.title.slice(0, 256),
      value: formatAnswer(answers[q.id], truncate, embedConfig?.anonymizeAnswers),
      inline: false,
    }));
  if (fields.length > 0) embed.fields = fields;

  if (statsConfig && Object.values(statsConfig).some(Boolean)) {
    const stats: string[] = [];
    if (statsConfig.userId) stats.push(`User ID: \`${input.userId}\``);
    if (statsConfig.username) stats.push(`Username: ${input.username}`);
    if (statsConfig.mention) stats.push(`User: <@${input.userId}>`);
    if (statsConfig.duration && input.durationSeconds) {
      stats.push(`Dauer: ${formatDuration(input.durationSeconds)}`);
    }
    if (statsConfig.submittedAt && input.submittedAt) {
      stats.push(`Eingereicht: <t:${Math.floor(input.submittedAt.getTime() / 1000)}:R>`);
    }
    if (statsConfig.applicationVersion)
      stats.push(`Application-Version: v${input.applicationVersion}`);
    if (statsConfig.questionCount) stats.push(`Fragen: ${questions.length}`);
    if (statsConfig.answerCount) stats.push(`Antworten: ${Object.keys(answers).length}`);

    if (stats.length > 0) {
      embed.fields = [
        ...(embed.fields ?? []),
        { name: 'Submission Stats', value: stats.join('\n'), inline: false },
      ];
    }
  }

  if (embedConfig?.footer) embed.footer = { text: embedConfig.footer };
  if (embedConfig?.showTimestamp !== false) {
    embed.timestamp = (input.submittedAt ?? new Date()).toISOString();
  }
  return embed;
}

/** Review-Action-Row für eine Submission-Nachricht (§29). */
export function buildReviewActions(
  submissionId: string,
  dashboardUrl?: string,
): DiscordComponents[] {
  const rows: DiscordComponents[] = [
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 3,
          label: 'Accept',
          emoji: { name: '✅' },
          custom_id: `nexus:review:accept:${submissionId}`,
        },
        {
          type: 2,
          style: 4,
          label: 'Deny',
          emoji: { name: '✖️' },
          custom_id: `nexus:review:deny:${submissionId}`,
        },
        {
          type: 2,
          style: 2,
          label: 'Accept mit Grund',
          custom_id: `nexus:review:accept_r:${submissionId}`,
        },
        {
          type: 2,
          style: 2,
          label: 'Deny mit Grund',
          custom_id: `nexus:review:deny_r:${submissionId}`,
        },
      ],
    },
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          label: 'History',
          emoji: { name: '📜' },
          custom_id: `nexus:review:history:${submissionId}`,
        },
        {
          type: 2,
          style: 2,
          label: 'Ticket mit User',
          emoji: { name: '🎫' },
          custom_id: `nexus:review:ticket:${submissionId}`,
        },
        {
          type: 2,
          style: 2,
          label: 'Notiz',
          emoji: { name: '📝' },
          custom_id: `nexus:review:note:${submissionId}`,
        },
        ...(dashboardUrl
          ? [
              {
                type: 2 as const,
                style: 5 as const,
                label: 'Im Dashboard öffnen',
                url: `${dashboardUrl}/submissions/${submissionId}`,
              },
            ]
          : []),
      ],
    },
  ];
  return rows;
}

function formatAnswer(value: unknown, truncate: number, anonymize?: boolean): string {
  if (anonymize) return '*anonymisiert*';
  let text: string;
  if (Array.isArray(value)) text = value.join(', ');
  else if (typeof value === 'boolean') text = value ? 'Ja' : 'Nein';
  else text = String(value);
  return text.length > truncate ? `${text.slice(0, truncate - 3)}...` : text;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 1) return `${rest}s`;
  return `${minutes}m ${rest}s`;
}
