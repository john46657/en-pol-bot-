import { SubmissionStatus } from '@nexus/types';

/**
 * Submission State Machine (§62).
 *
 * Nur erlaubte Transitionen dürfen ausgeführt werden – ungültige Übergänge
 * werden abgewiesen. Das schützt vor kaputten States bei Race Conditions
 * (§19) und doppelten Aktionen (§95).
 */
export const SUBMISSION_TRANSITIONS: Readonly<Record<SubmissionStatus, SubmissionStatus[]>> = {
  STARTED: [
    SubmissionStatus.IN_PROGRESS,
    SubmissionStatus.PAUSED,
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.CANCELLED,
    SubmissionStatus.EXPIRED,
  ],
  IN_PROGRESS: [
    SubmissionStatus.PAUSED,
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.CANCELLED,
    SubmissionStatus.EXPIRED,
  ],
  PAUSED: [SubmissionStatus.IN_PROGRESS, SubmissionStatus.CANCELLED, SubmissionStatus.EXPIRED],
  // Eine Entscheidung ist direkt nach dem Absenden möglich; UNDER_REVIEW kennzeichnet „wird bearbeitet“
  // (Ansehen, Rückfrage, Gespräch).
  SUBMITTED: [
    SubmissionStatus.UNDER_REVIEW,
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.DENIED,
    SubmissionStatus.WITHDRAWN,
    SubmissionStatus.ARCHIVED,
  ],
  UNDER_REVIEW: [
    SubmissionStatus.ACCEPTED,
    SubmissionStatus.DENIED,
    SubmissionStatus.WITHDRAWN,
    SubmissionStatus.ARCHIVED,
  ],
  ACCEPTED: [SubmissionStatus.ARCHIVED],
  DENIED: [SubmissionStatus.UNDER_REVIEW, SubmissionStatus.ARCHIVED],
  EXPIRED: [SubmissionStatus.CANCELLED, SubmissionStatus.ARCHIVED],
  CANCELLED: [SubmissionStatus.ARCHIVED],
  WITHDRAWN: [SubmissionStatus.ARCHIVED],
  ARCHIVED: [],
};

/** Status, in denen die Bewerbung für den Bewerber nicht mehr aktiv ist. */
export const TERMINAL_SUBMISSION_STATUSES: ReadonlySet<SubmissionStatus> = new Set([
  SubmissionStatus.ACCEPTED,
  SubmissionStatus.DENIED,
  SubmissionStatus.EXPIRED,
  SubmissionStatus.CANCELLED,
  SubmissionStatus.WITHDRAWN,
  SubmissionStatus.ARCHIVED,
]);

/** Status, in denen Staff eine finale Entscheidung treffen kann. */
export const REVIEWABLE_STATUSES: ReadonlySet<SubmissionStatus> = new Set([
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.UNDER_REVIEW,
]);

export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return SUBMISSION_TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: SubmissionStatus,
    public readonly to: SubmissionStatus,
  ) {
    super(`Ungültiger Statusübergang: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export function assertTransition(from: SubmissionStatus, to: SubmissionStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(status: SubmissionStatus): boolean {
  return TERMINAL_SUBMISSION_STATUSES.has(status);
}

export function isReviewable(status: SubmissionStatus): boolean {
  return REVIEWABLE_STATUSES.has(status);
}
