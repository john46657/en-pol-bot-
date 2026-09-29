import { describe, it, expect } from 'vitest';
import { SubmissionStatus } from '@nexus/types';
import {
  SUBMISSION_TRANSITIONS,
  assertTransition,
  canTransition,
  IllegalTransitionError,
  isReviewable,
  isTerminal,
} from '../src/index.js';

describe('Submission State Machine (§62)', () => {
  it('erlaubt Start → Fortschritt → Pause → Fortschritt → Einreichung', () => {
    expect(canTransition(SubmissionStatus.STARTED, SubmissionStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(SubmissionStatus.IN_PROGRESS, SubmissionStatus.PAUSED)).toBe(true);
    expect(canTransition(SubmissionStatus.PAUSED, SubmissionStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(SubmissionStatus.IN_PROGRESS, SubmissionStatus.SUBMITTED)).toBe(true);
  });

  it('erlaubt Einreichung → Review → Accept/Deny', () => {
    expect(canTransition(SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW)).toBe(true);
    expect(canTransition(SubmissionStatus.UNDER_REVIEW, SubmissionStatus.ACCEPTED)).toBe(true);
    expect(canTransition(SubmissionStatus.UNDER_REVIEW, SubmissionStatus.DENIED)).toBe(true);
  });

  it('verbietet Deny → Accept und Accept → Deny', () => {
    expect(canTransition(SubmissionStatus.ACCEPTED, SubmissionStatus.DENIED)).toBe(false);
    expect(canTransition(SubmissionStatus.DENIED, SubmissionStatus.ACCEPTED)).toBe(false);
  });

  it('verbietet Sprünge STARTED → ACCEPTED', () => {
    expect(canTransition(SubmissionStatus.STARTED, SubmissionStatus.ACCEPTED)).toBe(false);
    expect(canTransition(SubmissionStatus.STARTED, SubmissionStatus.UNDER_REVIEW)).toBe(false);
  });

  it('Terminal-Status erlauben nur noch Aufräumen/Reopen (§62)', () => {
    // ACCEPTED und CANCELLED können nur noch archiviert werden
    expect(SUBMISSION_TRANSITIONS[SubmissionStatus.ACCEPTED]).toEqual([SubmissionStatus.ARCHIVED]);
    expect(SUBMISSION_TRANSITIONS[SubmissionStatus.CANCELLED]).toEqual([SubmissionStatus.ARCHIVED]);
    // DENIED darf wiedereröffnet werden (application.reopened, §57)
    expect(SUBMISSION_TRANSITIONS[SubmissionStatus.DENIED]).toContain(
      SubmissionStatus.UNDER_REVIEW,
    );
    // ARCHIVED ist endgültig
    expect(SUBMISSION_TRANSITIONS[SubmissionStatus.ARCHIVED]).toHaveLength(0);
  });

  it('wirft IllegalTransitionError bei ungültigem Übergang', () => {
    expect(() => assertTransition(SubmissionStatus.ACCEPTED, SubmissionStatus.DENIED)).toThrow(
      IllegalTransitionError,
    );
  });

  it('kennt Terminal- und Review-Status', () => {
    expect(isTerminal(SubmissionStatus.ACCEPTED)).toBe(true);
    expect(isTerminal(SubmissionStatus.SUBMITTED)).toBe(false);
    expect(isReviewable(SubmissionStatus.SUBMITTED)).toBe(true);
    expect(isReviewable(SubmissionStatus.ACCEPTED)).toBe(false);
  });
});
