/**
 * Bewertungsregeln der Ausbildung (reine Funktionen).
 *
 * Ein Teil (Theorie/Praxis/Prüfung) existiert, wenn sein Maximum > 0 ist. Das Ergebnis liegt vor, sobald **alle**
 * vorhandenen Teile bewertet sind. Bestanden = Gesamtprozent ≥ Bestehensgrenze **und** (falls es eine Prüfung gibt)
 * die Prüfung für sich ≥ Bestehensgrenze.
 */
export const PARTS = ['THEORY', 'PRACTICE', 'EXAM'] as const;
export type Part = (typeof PARTS)[number];
export const PART_LABEL: Record<Part, string> = { THEORY: 'Theorie', PRACTICE: 'Praxis', EXAM: 'Prüfung' };

export interface CourseRules {
  theoryMax: number;
  practiceMax: number;
  examMax: number;
  passPercent: number;
}
export interface Points {
  theoryPoints: number | null;
  practicePoints: number | null;
  examPoints: number | null;
}

export const maxOf = (c: CourseRules, part: Part) => ({ THEORY: c.theoryMax, PRACTICE: c.practiceMax, EXAM: c.examMax })[part];
export const pointsOf = (p: Points, part: Part) => ({ THEORY: p.theoryPoints, PRACTICE: p.practicePoints, EXAM: p.examPoints })[part];
export const activeParts = (c: CourseRules): Part[] => PARTS.filter((p) => maxOf(c, p) > 0);

export interface Evaluation {
  complete: boolean;
  missing: Part[];
  percent: number | null;
  passed: boolean | null;
  examPercent: number | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function evaluate(c: CourseRules, p: Points): Evaluation {
  const parts = activeParts(c);
  const missing = parts.filter((x) => pointsOf(p, x) === null);
  if (missing.length > 0) return { complete: false, missing, percent: null, passed: null, examPercent: null };
  const max = parts.reduce((a, x) => a + maxOf(c, x), 0);
  const got = parts.reduce((a, x) => a + (pointsOf(p, x) ?? 0), 0);
  const percent = round1((got / max) * 100);
  const examPercent = c.examMax > 0 ? round1(((p.examPoints ?? 0) / c.examMax) * 100) : null;
  const passed = percent >= c.passPercent && (examPercent === null || examPercent >= c.passPercent);
  return { complete: true, missing: [], percent, passed, examPercent };
}
