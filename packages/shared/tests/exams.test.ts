import { describe, expect, it } from 'vitest';
import { examProblems, gapAnswers, gradeAnswer, isAnswered, maskGaps, parseQuestions, questionSchema, splitGaps, type Question } from '../src/exams';

const q = (p: Partial<Question> & Pick<Question, 'type'>): Question => questionSchema.parse({ id: 'q', text: 'Frage', points: 4, ...p });

describe('Prüfungen: automatische Bewertung', () => {
  it('Single Choice, Ja/Nein', () => {
    expect(gradeAnswer(q({ type: 'SINGLE', options: ['a', 'b'], correct: ['1'] }), '1')).toBe(4);
    expect(gradeAnswer(q({ type: 'SINGLE', options: ['a', 'b'], correct: ['1'] }), '0')).toBe(0);
    expect(gradeAnswer(q({ type: 'YESNO', correct: ['ja'] }), 'Ja')).toBe(4);
  });

  it('Multiple Choice: genau oder mit Teilpunkten (falsche Kreuze ziehen ab)', () => {
    const exact = q({ type: 'MULTI', options: ['a', 'b', 'c', 'd'], correct: ['0', '2'] });
    expect(gradeAnswer(exact, ['0', '2'])).toBe(4);
    expect(gradeAnswer(exact, ['0'])).toBe(0);
    const part = { ...exact, partial: true };
    expect(gradeAnswer(part, ['0'])).toBe(2);
    expect(gradeAnswer(part, ['0', '1'])).toBe(0);
    expect(gradeAnswer(part, ['0', '2', '3'])).toBe(2);
  });

  it('Zahl mit Toleranz und Komma', () => {
    expect(gradeAnswer(q({ type: 'NUMBER', correct: ['50'] }), '50')).toBe(4);
    expect(gradeAnswer(q({ type: 'NUMBER', correct: ['3,5'], tolerance: 0.5 }), '3.9')).toBe(4);
    expect(gradeAnswer(q({ type: 'NUMBER', correct: ['3,5'], tolerance: 0.5 }), '4.1')).toBe(0);
    expect(gradeAnswer(q({ type: 'NUMBER', correct: ['0'] }), '')).toBe(0);
  });

  it('Freitext: ohne Stichworte → Prüfer, sonst Stichworte (optional anteilig)', () => {
    expect(gradeAnswer(q({ type: 'TEXT' }), 'egal')).toBeNull();
    expect(gradeAnswer(q({ type: 'TEXT', correct: ['Blaulicht', 'Martinshorn'] }), 'blaulicht und  martinshorn')).toBe(4);
    expect(gradeAnswer(q({ type: 'TEXT', correct: ['Blaulicht', 'Martinshorn'] }), 'blaulicht')).toBe(0);
    expect(gradeAnswer(q({ type: 'TEXT', correct: ['Blaulicht', 'Martinshorn'], partial: true }), 'blaulicht')).toBe(2);
  });

  it('Reihenfolge und Zuordnung', () => {
    const order = q({ type: 'ORDER', options: ['eins', 'zwei', 'drei', 'vier'] });
    expect(gradeAnswer(order, ['0', '1', '2', '3'])).toBe(4);
    expect(gradeAnswer(order, ['1', '0', '2', '3'])).toBe(0);
    expect(gradeAnswer({ ...order, partial: true }, ['1', '0', '2', '3'])).toBe(2);
    const match = q({ type: 'MATCH', options: ['A', 'B'], matches: ['1', '2'] });
    expect(gradeAnswer(match, ['0', '1'])).toBe(4);
    expect(gradeAnswer(match, ['1', '0'])).toBe(0);
    expect(isAnswered(match, ['0'])).toBe(false);
    expect(isAnswered(match, ['0', '1'])).toBe(true);
  });

  it('Lückentext mit Alternativen', () => {
    const gap = q({ type: 'GAP', text: 'Innerorts {{50|fünfzig}} km/h, außerorts {{100}} km/h.', partial: true });
    expect(gapAnswers(gap.text)).toEqual([['50', 'fünfzig'], ['100']]);
    expect(maskGaps(gap.text)).toBe('Innerorts {{}} km/h, außerorts {{}} km/h.');
    expect(splitGaps(maskGaps(gap.text))).toEqual(['Innerorts ', 0, ' km/h, außerorts ', 1, ' km/h.']);
    expect(gradeAnswer(gap, [' Fünfzig ', '100'])).toBe(4);
    expect(gradeAnswer(gap, ['50', '80'])).toBe(2);
    expect(isAnswered(gap, ['50'])).toBe(false);
  });
});

describe('Prüfungen: Prüfung der Fragen', () => {
  it('meldet unvollständige Fragen', () => {
    const problems = examProblems({ title: '', questionCount: 0, questions: [
      q({ id: 'a', type: 'SINGLE', options: ['x', 'y'] }),
      q({ id: 'b', type: 'GAP', text: 'ohne Lücke' }),
      q({ id: 'c', type: 'MATCH', options: ['x', 'y'], matches: ['1'] }),
    ] });
    expect(problems).toEqual(['Titel fehlt', 'Frage 1: richtige Antwort wählen', 'Frage 2: mindestens eine Lücke {{…}} im Text', 'Frage 3: jedes Paar braucht beide Seiten']);
  });

  it('liest ältere gespeicherte Fragen mit Standardwerten', () => {
    const [old] = parseQuestions([{ id: 'x', type: 'SINGLE', text: 'Alt', options: ['a', 'b'], correct: ['0'], points: 1 }, { kaputt: true }]);
    expect(old).toMatchObject({ partial: false, tolerance: 0, matches: [], explanation: null, image: null });
  });
});
