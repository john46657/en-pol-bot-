import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SubmissionStatus } from '@nexus/types';
import type { EmbedConfig, Question, SubmissionStatsConfig } from '@nexus/types';

/**
 * Embed-Builder (§26/§27/§40).
 *
 * Felder, Farben und Statistiken sind vollständig konfigurierbar; Antworten
 * können anonymisiert oder gekürzt ausgegeben werden (§28).
 */

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  STARTED: '🟡 Gestartet',
  IN_PROGRESS: '🟡 In Bearbeitung',
  PAUSED: '⏸️ Pausiert',
  SUBMITTED: '📨 Eingereicht',
  UNDER_REVIEW: '🔵 In Prüfung',
  ACCEPTED: '🟢 Angenommen',
  DENIED: '🔴 Abgelehnt',
  EXPIRED: '⚫ Abgelaufen',
  CANCELLED: '✖️ Abgebrochen',
  ARCHIVED: '🗄️ Archiviert',
};

export function colorToInt(color?: string): number | undefined {
  if (!color) return undefined;
  const hex = color.replace('#', '');
  return /^[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex, 16) : undefined;
}

export function buildPanelEmbed(input: {
  title: string;
  description?: string;
  embed?: EmbedConfig;
  applicationNames: string[];
}): EmbedBuilder {
  const embed = new EmbedBuilder();
  embed.setTitle(input.title);
  if (input.description) embed.setDescription(input.description);
  if (input.embed?.color) {
    const color = colorToInt(input.embed.color);
    if (color !== undefined) embed.setColor(color);
  }
  if (input.embed?.imageUrl) embed.setImage(input.embed.imageUrl);
  if (input.embed?.thumbnailUrl) embed.setThumbnail(input.embed.thumbnailUrl);
  if (input.embed?.footer) embed.setFooter({ text: input.embed.footer });
  embed.addFields({
    name: 'Verfügbare Bewerbungen',
    value: input.applicationNames.map((n) => `• **${n}**`).join('\n'),
    inline: false,
  });
  return embed;
}

export function buildSubmissionEmbed(input: {
  applicantName: string;
  applicationName: string;
  applicationVersion: number;
  status: SubmissionStatus;
  embedConfig?: EmbedConfig;
  statsConfig?: SubmissionStatsConfig;
  questions: Question[];
  answers: Record<string, unknown>;
  userId: string;
  username: string;
  durationSeconds?: number;
  guildJoinedAt?: Date;
  accountCreatedAt?: Date;
  submittedAt?: Date;
}): EmbedBuilder {
  const { embedConfig, statsConfig, questions, answers } = input;

  const embed = new EmbedBuilder();
  const title = embedConfig?.title ?? `📋 ${input.applicantName} – ${input.applicationName}`;
  embed.setTitle(title);
  embed.setDescription(STATUS_LABEL[input.status] ?? 'Bewerbung');

  const color = colorToInt(embedConfig?.color ?? '5865F2');
  if (color !== undefined) embed.setColor(color);

  // Antworten (§49: strukturiert, expand/collapse vorbereitet über Kürzung)
  const truncate = embedConfig?.answerTruncate ?? 1024;
  for (const question of questions) {
    const value = answers[question.id];
    if (value === undefined || value === null) continue;
    if (embedConfig?.answerDisplay === 'paragraph') {
      embed.addFields({
        name: question.title,
        value: formatAnswer(value, truncate, embedConfig?.anonymizeAnswers),
        inline: false,
      });
    } else {
      embed.addFields({
        name: question.title.slice(0, 256),
        value: formatAnswer(value, truncate, embedConfig?.anonymizeAnswers),
        inline: false,
      });
    }
  }

  // Submission Stats (§28: steuerbar)
  if (statsConfig && Object.values(statsConfig).some(Boolean)) {
    const stats: string[] = [];
    if (statsConfig.userId) stats.push(`User ID: \`${input.userId}\``);
    if (statsConfig.username) stats.push(`Username: ${input.username}`);
    if (statsConfig.mention) stats.push(`User: <@${input.userId}>`);
    if (statsConfig.accountCreated && input.accountCreatedAt) {
      stats.push(`Account erstellt: <t:${Math.floor(input.accountCreatedAt.getTime() / 1000)}:R>`);
    }
    if (statsConfig.guildJoinDate && input.guildJoinedAt) {
      stats.push(`Server beigetreten: <t:${Math.floor(input.guildJoinedAt.getTime() / 1000)}:R>`);
    }
    if (statsConfig.duration && input.durationSeconds) {
      stats.push(`Dauer: ${formatDuration(input.durationSeconds)}`);
    }
    if (statsConfig.submittedAt && input.submittedAt) {
      stats.push(`Eingereicht: <t:${Math.floor(input.submittedAt.getTime() / 1000)}:R>`);
    }
    if (statsConfig.applicationVersion) {
      stats.push(`Application-Version: v${input.applicationVersion}`);
    }
    if (statsConfig.questionCount) stats.push(`Fragen: ${questions.length}`);
    if (statsConfig.answerCount) {
      stats.push(`Antworten: ${Object.keys(answers).length}`);
    }
    if (stats.length > 0) {
      embed.addFields({ name: 'Submission Stats', value: stats.join('\n'), inline: false });
    }
  }

  if (embedConfig?.footer) {
    embed.setFooter({ text: embedConfig.footer });
  }
  if (embedConfig?.showTimestamp !== false) {
    embed.setTimestamp(input.submittedAt ?? new Date());
  }
  return embed;
}

export function buildReviewActions(submissionId: string): ActionRowBuilder<ButtonBuilder>[] {
  const primary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`nexus:review:accept:${submissionId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`nexus:review:deny:${submissionId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('✖️'),
    new ButtonBuilder()
      .setCustomId(`nexus:review:accept_r:${submissionId}`)
      .setLabel('Accept mit Grund')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`nexus:review:deny_r:${submissionId}`)
      .setLabel('Deny mit Grund')
      .setStyle(ButtonStyle.Secondary),
  );

  const secondary = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`nexus:review:history:${submissionId}`)
      .setLabel('History')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📜'),
    new ButtonBuilder()
      .setCustomId(`nexus:review:ticket:${submissionId}`)
      .setLabel('Ticket mit User')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🎫'),
    new ButtonBuilder()
      .setCustomId(`nexus:review:note:${submissionId}`)
      .setLabel('Notiz')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId(`nexus:review:dashboard:${submissionId}`)
      .setLabel('Im Dashboard öffnen')
      .setStyle(ButtonStyle.Link)
      .setURL(process.env['DASHBOARD_URL'] ?? 'http://localhost:3001'),
  );

  return [primary, secondary];
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
