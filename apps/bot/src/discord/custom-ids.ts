/**
 * Discord Custom-IDs (§135).
 *
 * IDs referenzieren Submission/Application-IDs sicher, enthalten aber keine
 * vertraulichen Daten. Jede Aktion validiert die IDs serverseitig – das sind
 * nur Hinweise, niemals Autorität (§114).
 */

const PREFIX = 'nexus';

export const CustomIdAction = {
  PANEL_START: 'panel:start', // panel:start:<applicationId>
  DM_CANCEL: 'dm:cancel', // dm:cancel:<submissionId>
  DM_PAUSE: 'dm:pause', // dm:pause:<submissionId>
  DM_RESUME: 'dm:resume', // dm:resume:<submissionId>
  DM_BACK: 'dm:back', // dm:back:<submissionId>
  DM_EDIT_ANSWER: 'dm:edit', // dm:edit:<submissionId>:<questionId>
  DM_SUBMIT: 'dm:submit', // dm:submit:<submissionId>
  REVIEW_ACCEPT: 'review:accept', // review:accept:<submissionId>
  REVIEW_DENY: 'review:deny', // review:deny:<submissionId>
  REVIEW_ACCEPT_REASON: 'review:accept_r', // review:accept_r:<submissionId>
  REVIEW_DENY_REASON: 'review:deny_r', // review:deny_r:<submissionId>
  REVIEW_HISTORY: 'review:history', // review:history:<submissionId>
  REVIEW_NOTE: 'review:note', // review:note:<submissionId>
  REVIEW_TICKET: 'review:ticket', // review:ticket:<submissionId>
  REVIEW_DASHBOARD: 'review:dashboard', // review:dashboard:<submissionId>
} as const;

export type CustomIdAction = (typeof CustomIdAction)[keyof typeof CustomIdAction];

export function buildCustomId(action: CustomIdAction, ...args: (string | number)[]): string {
  return [PREFIX, action, ...args.map(String)].join(':');
}

export interface ParsedCustomId {
  action: CustomIdAction;
  args: string[];
}

/**
 * Aktionen enthalten selbst Doppelpunkte (`panel:start`). Daher wird gegen die bekannten Aktionen
 * (längste zuerst) geprüft; `extraActions` erlaubt Modulen eigene Aktionen (Registry).
 */
export function parseCustomId(
  customId: string | undefined,
  extraActions: Iterable<string> = [],
): ParsedCustomId | null {
  if (!customId || !customId.startsWith(`${PREFIX}:`)) return null;
  const rest = customId.slice(PREFIX.length + 1);
  if (!rest) return null;
  const known = [...Object.values(CustomIdAction), ...extraActions].sort(
    (a, b) => b.length - a.length,
  );
  for (const action of known) {
    if (rest === action) return { action: action as CustomIdAction, args: [] };
    if (rest.startsWith(`${action}:`)) {
      return { action: action as CustomIdAction, args: rest.slice(action.length + 1).split(':') };
    }
  }
  const parts = rest.split(':');
  return { action: parts[0] as CustomIdAction, args: parts.slice(1) };
}

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function isValidSnowflake(value: string | undefined): boolean {
  return !!value && SNOWFLAKE_PATTERN.test(value);
}

/** Datenbank-IDs (cuid) in Custom-IDs – nur Format-Hinweis, die Autorität bleibt die guild-scoped DB-Abfrage (§114). */
const DB_ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;

export function isValidId(value: string | undefined): boolean {
  return !!value && DB_ID_PATTERN.test(value);
}
