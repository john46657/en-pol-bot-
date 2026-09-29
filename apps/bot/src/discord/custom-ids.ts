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

export function parseCustomId(customId: string | undefined): ParsedCustomId | null {
  if (!customId) return null;
  const parts = customId.split(':');
  if (parts[0] !== PREFIX || parts.length < 2) return null;
  return { action: parts[1] as CustomIdAction, args: parts.slice(2) };
}

const SNOWFLAKE_PATTERN = /^\d{17,20}$/;

export function isValidSnowflake(value: string | undefined): boolean {
  return !!value && SNOWFLAKE_PATTERN.test(value);
}
