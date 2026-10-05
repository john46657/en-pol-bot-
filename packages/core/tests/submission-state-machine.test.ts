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

describe('Entscheidung und Zurückziehen (Phase 10)', () => {
  it('Entscheidung ist direkt nach dem Absenden möglich', () => {
    expect(canTransition(SubmissionStatus.SUBMITTED, SubmissionStatus.ACCEPTED)).toBe(true);
    expect(canTransition(SubmissionStatus.SUBMITTED, SubmissionStatus.DENIED)).toBe(true);
  });
  it('Bewerber kann zurückziehen, solange nicht entschieden ist', () => {
    expect(canTransition(SubmissionStatus.SUBMITTED, SubmissionStatus.WITHDRAWN)).toBe(true);
    expect(canTransition(SubmissionStatus.UNDER_REVIEW, SubmissionStatus.WITHDRAWN)).toBe(true);
    expect(canTransition(SubmissionStatus.ACCEPTED, SubmissionStatus.WITHDRAWN)).toBe(false);
    expect(canTransition(SubmissionStatus.DENIED, SubmissionStatus.WITHDRAWN)).toBe(false);
    expect(canTransition(SubmissionStatus.IN_PROGRESS, SubmissionStatus.WITHDRAWN)).toBe(false);
  });
  it('zurückgezogen ist endgültig; eine Entscheidung nach dem Zurückziehen ist unmöglich', () => {
    expect(canTransition(SubmissionStatus.WITHDRAWN, SubmissionStatus.ACCEPTED)).toBe(false);
    expect(canTransition(SubmissionStatus.WITHDRAWN, SubmissionStatus.UNDER_REVIEW)).toBe(false);
  });
});

describe('Zurückstellen (ON_HOLD)', () => {
  it('offene Bewerbungen lassen sich zurückstellen, zurückgestellte fortsetzen oder direkt entscheiden', () => {
    expect(canTransition(SubmissionStatus.SUBMITTED, SubmissionStatus.ON_HOLD)).toBe(true);
    expect(canTransition(SubmissionStatus.UNDER_REVIEW, SubmissionStatus.ON_HOLD)).toBe(true);
    for (const to of [SubmissionStatus.UNDER_REVIEW, SubmissionStatus.ACCEPTED, SubmissionStatus.DENIED, SubmissionStatus.WITHDRAWN])
      expect(canTransition(SubmissionStatus.ON_HOLD, to), to).toBe(true);
  });
  it('nicht eingereichte oder entschiedene Bewerbungen lassen sich nicht zurückstellen', () => {
    for (const from of [SubmissionStatus.STARTED, SubmissionStatus.IN_PROGRESS, SubmissionStatus.ACCEPTED, SubmissionStatus.DENIED, SubmissionStatus.WITHDRAWN])
      expect(canTransition(from, SubmissionStatus.ON_HOLD), from).toBe(false);
  });
});
