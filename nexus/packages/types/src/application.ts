import type {
  ApplicationStatus,
  ConditionCombinator,
  ConditionOperator,
  QuestionType,
  ResubmissionMode,
  RoleMatchMode,
  RoleRuleType,
  UserLeaveAction,
} from './enums.js';

/**
 * Option einer Select-/Checkbox-Frage (§12).
 */
export interface QuestionOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  enabled: boolean;
}

/**
 * Validierungs-Konfiguration je Fragetyp (§10/§11/§12).
 */
export interface QuestionValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  /** Regex-Quelltext – wird serverseitig kompiliert, niemals im Browser. */
  pattern?: string;
  allowedCharacters?: string;
  caseSensitive?: boolean;
  /** Leerzeichen vor/hinter der Antwort abschneiden. */
  trim?: boolean;
  /** z. B. 'upper' | 'lower' | 'capitalize' – Normalisierung vor der Validierung. */
  autoCase?: 'upper' | 'lower' | 'capitalize';
  minSelections?: number;
  maxSelections?: number;
  /** Liste erlaubter Werte (zusätzlich zu Optionen). */
  allowedValues?: string[];
}

/**
 * Sichtbarkeit einer Frage (§13). Null/undefined ⇒ immer sichtbar.
 * Bedingungen beziehen sich auf Antworten bereits beantworteter Fragen.
 */
export interface ConditionLeaf {
  type: 'leaf';
  questionId: string;
  operator: ConditionOperator;
  /** String-Wert; numerische Vergleiche werden serverseitig geparsed. */
  value?: string | string[];
}

export interface ConditionGroup {
  type: 'group';
  combinator: ConditionCombinator;
  children: ConditionNode[];
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

/**
 * Frage einer Application-Version (§9). Fragen sind unveränderlich, sobald eine
 * Version veröffentlicht ist (§65).
 */
export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  required: boolean;
  /** Deaktivierte Fragen bleiben im Builder erhalten, werden aber nicht gestellt. Fehlt das Feld ⇒ aktiv. */
  enabled?: boolean;
  placeholder?: string;
  defaultValue?: string;
  validation?: QuestionValidation;
  options?: QuestionOption[];
  /** Bedingung, unter der die Frage sichtbar wird (§13). */
  visibleIf?: ConditionNode;
  /** Reihenfolge im Flow (0-basiert). */
  order: number;
  /** Freie Metadaten für Builder/Erweiterungen. */
  metadata?: Record<string, unknown>;
}

/**
 * Rollenregel einer Application (§38).
 */
export interface RoleRule {
  id: string;
  type: RoleRuleType;
  roleId: string;
  matchMode: RoleMatchMode;
  /** optionale Rolle(n), die bei HAS_NONE zusätzlich geprüft werden. */
  additionalRoleIds?: string[];
}

/**
 * Dauer-Konfiguration (§20/§51).
 */
export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
}

/**
 * Nachrichten des DM-Flows (§72). Variablen gemäß §59.
 */
export interface DMFlowMessages {
  intro?: string;
  confirmation?: string;
  question?: string;
  invalidAnswer?: string;
  timeout?: string;
  completion?: string;
  cancel?: string;
  resume?: string;
  submitted?: string;
  accepted?: string;
  denied?: string;
}

/**
 * Konfigurierbares Embed (§27).
 */
export interface EmbedConfig {
  title?: string;
  description?: string;
  color?: string;
  authorName?: string;
  authorIconUrl?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footer?: string;
  showTimestamp?: boolean;
  /** Antworten: 'field' | 'paragraph'; gekürzt oder vollständig; anonymisiert. */
  answerDisplay?: 'field' | 'paragraph';
  answerTruncate?: number;
  anonymizeAnswers?: boolean;
}

/**
 * Submission-Statistiken, die im Embed optional angezeigt werden (§28).
 */
export interface SubmissionStatsConfig {
  userId?: boolean;
  username?: boolean;
  mention?: boolean;
  accountCreated?: boolean;
  guildJoinDate?: boolean;
  duration?: boolean;
  submittedAt?: boolean;
  applicationVersion?: boolean;
  questionCount?: boolean;
  answerCount?: boolean;
}

/**
 * Review-Konfiguration (§73).
 */
export interface ReviewConfig {
  submissionChannelId?: string;
  reviewRoleIds?: string[];
  allowAcceptWithReason?: boolean;
  allowDenyWithReason?: boolean;
  allowNotes?: boolean;
  createThread?: boolean;
  threadArchiveHours?: number;
  createTicket?: boolean;
  notifyApplicant?: boolean;
  notifyStaffRoleIds?: string[];
  /** Round-Robin / Workload-Balancing bei Reviewer-Zuweisung (§36). */
  reviewerAssignment?: 'manual' | 'round_robin' | 'workload';
  reviewerRoleIds?: string[];
}

/**
 * Erweiterte Einstellungen (§75).
 */
export interface AdvancedSettings {
  showSubmissionStats?: boolean;
  hideSubmissionAnswers?: boolean;
  allowResubmission?: ResubmissionMode;
  allowPause?: boolean;
  allowEdit?: boolean;
  createThread?: boolean;
  createTicket?: boolean;
  notifyApplicant?: boolean;
  notifyStaff?: boolean;
  saveAuditEvents?: boolean;
  enableAnalytics?: boolean;
  enableAttachments?: boolean;
  enableAiReviewAssistance?: boolean;
  /** Daten nach X Tagen löschen (§68); undefined = nie. */
  retentionDays?: number;
  /** Aktion beim Server-Verlassen des Bewerbers (§54). */
  userLeaveAction?: UserLeaveAction;
  /** eine aktive Bewerbung insgesamt vs. pro Application (§52). */
  multipleActiveSubmissions?: 'none' | 'per_application' | 'unlimited';
}

/**
 * Anforderungen an den Bewerber (§70).
 */
export interface Requirements {
  enabled: boolean;
  cooldown?: Duration;
  timeLimit?: Duration;
  requiredRoleIds?: string[];
  restrictedRoleIds?: string[];
  /** Mindest-Alter des Discord-Accounts in Tagen. */
  minAccountAgeDays?: number;
  /** Mindest-Mitgliedschaft im Server in Tagen. */
  minGuildMembershipDays?: number;
  /** Mindest-Anzahl vorheriger (andrer) Applications – 0 = keine Pflicht. */
  requirePreviousApproval?: string[];
}

/**
 * Gesundheit einer Application (§117). Wird berechnet, nicht gespeichert.
 */
export interface ApplicationHealth {
  panelChannelAccessible: boolean;
  canSendMessages: boolean;
  canManageRoles: boolean;
  dmFlowAvailable: boolean;
  submissionChannelAvailable: boolean;
  reviewRolesValid: boolean;
  automationHealthy: boolean;
}

/**
 * Application-Hauptobjekt (§4).
 */
export interface Application {
  id: string;
  guildId: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;
  color?: string;
  enabled: boolean;
  status: ApplicationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Panel-Konfiguration (§40/§41).
 */
export interface ApplicationPanel {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  title: string;
  description?: string;
  embed: EmbedConfig;
  applicationIds: string[];
  /** discord.js Komponenten-Layout. */
  layout: 'button' | 'select' | 'button_and_select';
  buttonLabel?: string;
  buttonEmoji?: string;
}
