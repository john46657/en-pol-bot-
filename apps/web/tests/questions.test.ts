import { describe, expect, it } from 'vitest';
import { formToText, textToForm } from '../src/lib/questions';

const form = [
  { key: 'experience', label: 'Welche Erfahrung hast du?', required: true, maxLength: 2000 },
  { key: 'extra', label: 'Noch etwas?', required: false, maxLength: 100 },
];

describe('police application questions (one per line)', () => {
  it('round-trips and marks optional questions', () => {
    expect(formToText(form)).toBe('Welche Erfahrung hast du?\nNoch etwas? (optional)');
    expect(textToForm(formToText(form), form)).toEqual(form);
  });
  it('keeps keys of unchanged questions, adds new ones with free keys, removes deleted ones', () => {
    const r = textToForm('  Wie alt bist du?\n\nWelche Erfahrung hast du?\nHast du ein Mikrofon? (Optional)', form);
    expect(r).toEqual([
      { key: 'frage1', label: 'Wie alt bist du?', required: true, maxLength: 1000 },
      { key: 'experience', label: 'Welche Erfahrung hast du?', required: true, maxLength: 2000 },
      { key: 'frage2', label: 'Hast du ein Mikrofon?', required: false, maxLength: 1000 },
    ]);
  });
  it('never produces duplicate keys', () => {
    const r = textToForm('Noch etwas?\nNoch etwas?', form);
    expect(new Set(r.map((f) => f.key)).size).toBe(2);
  });
});
