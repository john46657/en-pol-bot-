import type { AttachmentStatus, SubmissionStatus } from './enums.js';
import type { EmbedConfig, SubmissionStatsConfig } from './application.js';

/** Wertform einer Antwort – vor der Typisierung durch den Validator. */
export type AnswerValue = string | string[] | number | boolean | null;

/** Map: questionId → AnswerValue. */
export type AnswerMap = Record<string, AnswerValue>;

/** Gespeicherte einzelne Antwort (§64). */
export interface SubmissionAnswer {
  id: string;
  submissionId: string;
  questionId: string;
  questionVersionId: string;
  value: AnswerValue;
  /** Normalisierter Wert für Filter/Suche (Lowercase, getrimmt). */
  normalizedValue?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** Snapshot der User-Daten zum Einreichungszeitpunkt (§25). */
export interface UserSnapshot {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  accountCreatedAt?: string;
  guildJoinedAt?: string;
}

/** DM-Session-Zustand (§94: Recovery nach Bot-Restart). */
export interface DMState {
  submissionId: string;
  userId: string;
  guildId: string;
  currentQuestionId?: string;
  currentDMMessageId?: string;
  introMessageId?: string;
  lastInteractionAt: string;
  expiresAt?: string;
}

/** Vollständige Submission (§25). */
export interface Submission {
  id: string;
  guildId: string;
  applicationId: string;
  applicationVersionId: string;
  userId: string;
  usernameSnapshot: string;
  displayNameSnapshot: string;
  avatarSnapshot?: string;
  status: SubmissionStatus;
  isTest: boolean;
  answers: AnswerMap;
  startedAt: string;
  submittedAt?: string;
  /** Sekunden zwischen startedAt und submittedAt. */
  durationSeconds?: number;
  reviewerUserId?: string;
  reviewerRoleIds?: string[];
  acceptedAt?: string;
  deniedAt?: string;
  /** Öffentlicher Grund → an den Bewerber (§31/§33). */
  publicReason?: string;
  /** Interner Grund → nur Staff (§31/§33). */
  internalReason?: string;
  submissionMessageId?: string;
  submissionChannelId?: string;
  threadId?: string;
}

/** Audit-Event (§34: nicht nachträglich manipulierbar). */
export interface AuditEvent {
  id: string;
  guildId: string;
  submissionId?: string;
  applicationId?: string;
  actorType: 'user' | 'system' | 'bot' | 'automation';
  actorId?: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** IP/Session-Metadaten, wo angemessen (§89). */
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/** Interne Notiz (§35). */
export interface InternalNote {
  id: string;
  submissionId: string;
  authorId: string;
  content: string;
  mentions?: string[];
  createdAt: string;
  updatedAt: string;
  /** Änderungen werden protokolliert, das Original bleibt erhalten. */
  edits: NoteEdit[];
}

export interface NoteEdit {
  editedAt: string;
  editedById: string;
  previousContent: string;
}

/** Attachment (§50). */
export interface Attachment {
  id: string;
  submissionId: string;
  questionId: string;
  attachmentId: string;
  filename: string;
  mimeType?: string;
  sizeBytes: number;
  url: string;
  s3Key?: string;
  status: AttachmentStatus;
  createdAt: string;
}

/** Submission Embed Versand-Kontext. */
export interface SubmissionEmbedPayload {
  submission: Submission;
  applicationName: string;
  applicationVersion: number;
  embed: EmbedConfig;
  stats: SubmissionStatsConfig;
}
