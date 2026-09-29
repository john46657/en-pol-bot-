/**
 * NEXUS Domain-Enumerationen (shared, runtime-frei).
 *
 * Alles als const-Objekte + abgeleitete Union-Types, damit Zod-Schemas,
 * Prisma-Enums und UI den selben Typ-Quell nutzen.
 */

/** Status einer Application (§98: Dashboard zeigt zusätzlich READY/ERROR als berechnete Zustände). */
export const ApplicationStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  PAUSED: 'PAUSED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

/**
 * Status einer Submission (§62: echte State Machine mit erlaubten Transitionen).
 * STARTED      – Bewerbung wurde begonnen (Intro verschickt, noch keine Antwort)
 * IN_PROGRESS  – mindestens eine Frage beantwortet
 * PAUSED       – vom User pausiert
 * SUBMITTED    – eingereicht
 * UNDER_REVIEW – in aktiver Bearbeitung durch Staff
 * ACCEPTED     – angenommen
 * DENIED       – abgelehnt
 * EXPIRED      – Zeitlimit abgelaufen
 * CANCELLED    – vom User abgebrochen
 * ARCHIVED     – archiviert (Read-only)
 */
export const SubmissionStatus = {
  STARTED: 'STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACCEPTED: 'ACCEPTED',
  DENIED: 'DENIED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus];

/** Fragetypen (§9). Neue Typen müssen später über die Component Registry ergänzt werden. */
export const QuestionType = {
  TEXT: 'TEXT',
  LONG_TEXT: 'LONG_TEXT',
  NUMBER: 'NUMBER',
  DECIMAL: 'DECIMAL',
  DATE: 'DATE',
  TIME: 'TIME',
  DATETIME: 'DATETIME',
  YES_NO: 'YES_NO',
  SINGLE_SELECT: 'SINGLE_SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
  RATING: 'RATING',
  SLIDER: 'SLIDER',
  DISCORD_USER: 'DISCORD_USER',
  DISCORD_ROLE: 'DISCORD_ROLE',
  DISCORD_CHANNEL: 'DISCORD_CHANNEL',
  URL: 'URL',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  USERNAME: 'USERNAME',
  CONFIRMATION: 'CONFIRMATION',
  CHECKBOX: 'CHECKBOX',
  MULTI_CHECKBOX: 'MULTI_CHECKBOX',
  FILE: 'FILE',
  IMAGE: 'IMAGE',
  ATTACHMENT: 'ATTACHMENT',
  PARAGRAPH: 'PARAGRAPH',
  INFO: 'INFO',
  SEPARATOR: 'SEPARATOR',
} as const;
export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

/** Operatoren für Bedingungen (§13). */
export const ConditionOperator = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  STARTS_WITH: 'starts_with',
  ENDS_WITH: 'ends_with',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  GREATER_OR_EQUAL: 'greater_or_equal',
  LESS_OR_EQUAL: 'less_or_equal',
  IS_EMPTY: 'is_empty',
  IS_NOT_EMPTY: 'is_not_empty',
  IN: 'in',
  NOT_IN: 'not_in',
} as const;
export type ConditionOperator = (typeof ConditionOperator)[keyof typeof ConditionOperator];

/** Logikverknüpfung für Bedingungsgruppen (§13). */
export const ConditionCombinator = {
  AND: 'AND',
  OR: 'OR',
  NOT: 'NOT',
} as const;
export type ConditionCombinator = (typeof ConditionCombinator)[keyof typeof ConditionCombinator];

/** Match-Modi für Rollenregeln (§38). */
export const RoleMatchMode = {
  HAS_ALL: 'HAS_ALL',
  HAS_ANY: 'HAS_ANY',
  HAS_NONE: 'HAS_NONE',
} as const;
export type RoleMatchMode = (typeof RoleMatchMode)[keyof typeof RoleMatchMode];

/** Typ einer Rollenregel (§38). */
export const RoleRuleType = {
  REQUIRED: 'REQUIRED',
  RESTRICTED: 'RESTRICTED',
  ACCEPTED: 'ACCEPTED',
  DENIED: 'DENIED',
  PENDING: 'PENDING',
  PING: 'PING',
  ACCEPTED_REMOVAL: 'ACCEPTED_REMOVAL',
  DENIED_REMOVAL: 'DENIED_REMOVAL',
  SUBMIT_REMOVAL: 'SUBMIT_REMOVAL',
} as const;
export type RoleRuleType = (typeof RoleRuleType)[keyof typeof RoleRuleType];

/** Wann eine erneute Bewerbung erlaubt ist (§53). */
export const ResubmissionMode = {
  NEVER: 'NEVER',
  AFTER_DENIAL: 'AFTER_DENIAL',
  AFTER_COOLDOWN: 'AFTER_COOLDOWN',
  AFTER_STAFF_APPROVAL: 'AFTER_STAFF_APPROVAL',
  ALWAYS: 'ALWAYS',
} as const;
export type ResubmissionMode = (typeof ResubmissionMode)[keyof typeof ResubmissionMode];

/** Aktion, wenn ein Bewerber den Server verlässt (§54). */
export const UserLeaveAction = {
  NOTHING: 'NOTHING',
  CANCEL: 'CANCEL',
  ARCHIVE: 'ARCHIVE',
  DELETE: 'DELETE',
  MARK_AS_LEFT: 'MARK_AS_LEFT',
  DENY: 'DENY',
} as const;
export type UserLeaveAction = (typeof UserLeaveAction)[keyof typeof UserLeaveAction];

/** Export-Formate (§66). */
export const ExportFormat = {
  CSV: 'CSV',
  JSON: 'JSON',
  XLSX: 'XLSX',
  PDF: 'PDF',
} as const;
export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

/** Export-Status. */
export const ExportStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;
export type ExportStatus = (typeof ExportStatus)[keyof typeof ExportStatus];

/** Art der Reviewer-Zuweisung (§36). */
export const ReviewerAssignmentType = {
  USER: 'USER',
  ROLE: 'ROLE',
} as const;
export type ReviewerAssignmentType =
  (typeof ReviewerAssignmentType)[keyof typeof ReviewerAssignmentType];

/** Phase des DM-Flows (§15/§21). */
export const DMPhase = {
  INTRO: 'INTRO',
  QUESTION: 'QUESTION',
  SUMMARY: 'SUMMARY',
  EDITING: 'EDITING',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;
export type DMPhase = (typeof DMPhase)[keyof typeof DMPhase];

/** Status eines Attachments (§50). */
export const AttachmentStatus = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
  MIRRORED: 'MIRRORED',
} as const;
export type AttachmentStatus = (typeof AttachmentStatus)[keyof typeof AttachmentStatus];

/** Integrationstypen (§103). */
export const IntegrationType = {
  WEBHOOK: 'WEBHOOK',
  DISCORD_WEBHOOK: 'DISCORD_WEBHOOK',
  NOTION: 'NOTION',
  GOOGLE_SHEETS: 'GOOGLE_SHEETS',
  REST_API: 'REST_API',
  ZAPIER: 'ZAPIER',
  MAKE: 'MAKE',
} as const;
export type IntegrationType = (typeof IntegrationType)[keyof typeof IntegrationType];

/** Datenschutz-Stufen für Antworten (§67). */
export const AnswerVisibility = {
  PUBLIC_TO_STAFF: 'PUBLIC_TO_STAFF',
  MANAGERS_ONLY: 'MANAGERS_ONLY',
  ASSIGNED_REVIEWER_ONLY: 'ASSIGNED_REVIEWER_ONLY',
} as const;
export type AnswerVisibility = (typeof AnswerVisibility)[keyof typeof AnswerVisibility];
