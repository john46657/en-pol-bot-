import type { AnswerMap } from '@nexus/types';

/**
 * Variablen-Renderer (§59).
 *
 * Ersetzt `{variable}` in Texten (Nachrichten, Embeds, Automations-Konfigs).
 * Unbekannte Variablen bleiben unverändert stehen – niemals werfen.
 *
 * Unterstützt:
 *   {applicationId} {submissionId} {applicationName}
 *   {user} {userId} {username} {displayName}
 *   {guild} {guildId}
 *   {duration} {submittedAt} {startedAt} {status} {reviewer} {reason}
 *   {answer.<questionId>}  bzw.  {answers.<stableKey>}
 */

export interface VariableContext {
  applicationId?: string;
  submissionId?: string;
  applicationName?: string;
  userId?: string;
  username?: string;
  displayName?: string;
  /** {user} → Mention (<@id>) falls vorhanden, sonstUsername. */
  userMention?: string;
  guildId?: string;
  guildName?: string;
  duration?: string;
  submittedAt?: string;
  startedAt?: string;
  status?: string;
  reviewer?: string;
  reason?: string;
  answers?: AnswerMap;
  [key: string]: unknown;
}

const VARIABLE_PATTERN = /\{([a-zA-Z0-9_.]+)\}/g;

export function renderTemplate(template: string | undefined, ctx: VariableContext): string {
  if (!template) return '';
  return template.replace(VARIABLE_PATTERN, (raw, name: string) => {
    const value = resolveVariable(name, ctx);
    return value === null ? raw : value;
  });
}

function resolveVariable(name: string, ctx: VariableContext): string | null {
  const lower = name.toLowerCase();

  // {user} → Mention, Fallback: username/displayName
  if (lower === 'user') {
    if (ctx.userMention) return ctx.userMention;
    if (ctx.username) return ctx.username;
    if (ctx.displayName) return ctx.displayName;
    return null;
  }
  if (lower === 'guild' && ctx.guildName) return ctx.guildName;

  // {answer.<questionId>} / {answers.<key>}
  if (lower.startsWith('answer.') || lower.startsWith('answers.')) {
    const key = name.slice(name.indexOf('.') + 1);
    if (!ctx.answers) return null;
    const value = ctx.answers[key];
    if (value === undefined || value === null) return null;
    return formatValue(value);
  }

  const direct = ctx[name];
  if (typeof direct === 'string') return direct;
  if (typeof direct === 'number' || typeof direct === 'boolean') return String(direct);
  return null;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => formatValue(v)).join(', ');
  return String(value);
}
