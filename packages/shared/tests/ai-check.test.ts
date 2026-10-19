import { describe, expect, it } from 'vitest';
import { aiCheck } from '../src';

const human = [
  { answer: 'hab auf nem anderen server schon polizei gemacht so 3 monate, war ganz lustig' },
  { answer: 'meistens abends und am wochenende' },
  { answer: 'weil ich bock hab und eure leitstelle gut ist xD' },
];
const ai = [
  { answer: 'Ich verfüge über umfangreiche Erfahrung im Polizei-Roleplay. Darüber hinaus habe ich auf mehreren Servern gelernt, wie wichtig Professionalität und Respekt im Umgang mit anderen Spielern sind. Es ist mir besonders wichtig, ein immersives Erlebnis für alle Beteiligten zu schaffen.' },
  { answer: 'Ich bin von Montag bis Freitag in den Abendstunden aktiv und kann am Wochenende zusätzlich mehrere Stunden investieren, um das Team zuverlässig zu unterstützen.' },
  { answer: 'Ich möchte zur EN Polizei, weil ich davon überzeugt bin, dass ich hier einen positiven Beitrag leisten kann. Kommunikation ist der Schlüssel — nicht nur im Funk, sondern auch im Umgang mit Kollegen. Zusammenfassend möchte ich meine Fähigkeiten einbringen.' },
];

describe('aiCheck', () => {
  it('lockere, kurze Antworten → gering', () => {
    const r = aiCheck(human, 400);
    expect(r.level).toBe('LOW');
    expect(r.flagged).toEqual([]);
  });
  it('KI-typischer Text → hoch, mit Gründen und markierten Antworten', () => {
    const r = aiCheck(ai, 600);
    expect(r.level).toBe('HIGH');
    expect(r.reasons.join(' ')).toMatch(/KI-Formulierungen/);
    expect(r.flagged).toContain(0);
    expect(r.flagged).toContain(2);
  });
  it('viel Text in sehr kurzer Zeit → Kopier-Verdacht', () => {
    const r = aiCheck(ai, 30);
    expect(r.reasons.some((x) => /Zeichen\/Min.*kopiert/.test(x))).toBe(true);
    expect(r.score).toBeGreaterThan(aiCheck(ai, 600).score);
  });
  it('eindeutige Chat-Spur reicht allein für hoch', () => {
    expect(aiCheck([{ answer: 'Gerne! Hier ist eine mögliche Antwort für deine Bewerbung: Ich bin motiviert.' }]).level).toBe('HIGH');
    expect(aiCheck([{ answer: 'Hallo, ich heiße [Dein Name] und spiele gern Roleplay auf eurem Server.' }]).level).toBe('HIGH');
  });
  it('leere Bewerbung → 0', () => {
    expect(aiCheck([{ answer: '' }], 10)).toEqual({ score: 0, level: 'LOW', reasons: [], flagged: [] });
  });
});
