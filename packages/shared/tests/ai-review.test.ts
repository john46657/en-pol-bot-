import { describe, expect, it } from 'vitest';
import { AI_REVIEW_CRITERIA, aiReviewFingerprintSource, buildAiReviewPrompt, parseAiReview, redactPersonalData } from '../src';

const valid = {
  gesamt: { einstufung: 'solide', punkte: 6.6, begruendung: 'Antworten sind nachvollziehbar.' },
  kriterien: AI_REVIEW_CRITERIA.map((c) => ({ kriterium: c.key, bewertung: 'gut', begruendung: 'passt' })),
  staerken: ['Klare Motivation', 'Klare Motivation', '', 42], schwaechen: [], fehlende_angaben: [], widersprueche: [], rueckfragen: ['Wie oft bist du aktiv?'], unsicherheiten: [],
  empfehlung: 'geeignet', empfehlung_begruendung: 'Gespräch sinnvoll.',
};

describe('parseAiReview', () => {
  it('accepts a valid result, rounds the score and cleans lists', () => {
    const r = parseAiReview(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.gesamt.punkte).toBe(7);
    expect(r.result.staerken).toEqual(['Klare Motivation']);
    expect(r.result.kriterien).toHaveLength(10);
  });
  it('accepts JSON wrapped in a code fence', () => {
    expect(parseAiReview('```json\n' + JSON.stringify(valid) + '\n```').ok).toBe(true);
  });
  it('rejects non-JSON and incomplete answers', () => {
    expect(parseAiReview('Gerne! Hier ist meine Einschätzung …')).toEqual({ ok: false, error: 'Die KI hat kein gültiges JSON geliefert.' });
    expect(parseAiReview('[]').ok).toBe(false);
    expect(parseAiReview(JSON.stringify({ ...valid, empfehlung: 'annehmen' })).ok).toBe(false); // keine Entscheidung als Empfehlung
    expect(parseAiReview(JSON.stringify({ ...valid, gesamt: undefined })).ok).toBe(false);
    expect(parseAiReview(JSON.stringify({ ...valid, gesamt: { ...valid.gesamt, begruendung: '  ' } })).ok).toBe(false);
  });
  it('marks missing criteria explicitly as not assessable and drops unknown ones', () => {
    const r = parseAiReview(JSON.stringify({ ...valid, kriterien: [{ kriterium: 'vollstaendigkeit', bewertung: 'gut', begruendung: 'ok' }, { kriterium: 'erfunden', bewertung: 'gut', begruendung: 'x' }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.result.kriterien).toHaveLength(10);
    expect(r.result.kriterien.find((k) => k.kriterium === 'regelverstaendnis')).toMatchObject({ bewertung: 'nicht_beurteilbar', begruendung: 'Von der KI nicht bewertet.' });
  });
  it('has no score when the overall rating is not assessable', () => {
    const r = parseAiReview(JSON.stringify({ ...valid, gesamt: { einstufung: 'nicht_beurteilbar', punkte: 9, begruendung: 'zu wenig Text' } }));
    expect(r.ok && r.result.gesamt.punkte).toBeNull();
  });
  it('rejects out-of-range scores', () => {
    expect(parseAiReview(JSON.stringify({ ...valid, gesamt: { ...valid.gesamt, punkte: 97 } })).ok).toBe(false);
  });
});

describe('redactPersonalData', () => {
  it('removes contact data and ids', () => {
    const s = redactPersonalData('Schreib mir: max@example.de, <@823132981676736522>, ID 823132981676736522, https://discord.gg/abc, Tel. +49 170 1234567, 10.0.0.1');
    expect(s).not.toMatch(/max@|823132981676736522|discord\.gg|1234567|10\.0\.0\.1/);
    expect(s).toContain('[E-Mail entfernt]');
  });
  it('keeps normal numbers in answers', () => {
    expect(redactPersonalData('Ich spiele seit 3 Jahren, ca. 15 Stunden pro Woche, 10-4')).toBe('Ich spiele seit 3 Jahren, ca. 15 Stunden pro Woche, 10-4');
  });
});

describe('buildAiReviewPrompt', () => {
  const answers = [
    { question: 'Roblox User', answer: 'frd_le0n (ID 123456)' },
    { question: 'Warum möchtest du zur Polizei?', answer: 'Weil ich gern Verkehrskontrollen spiele. Kontakt: a@b.de' },
    { question: 'Wie gehst du im Discord mit Konflikten um?', answer: 'Ruhig bleiben.' },
  ];
  it('sends no identity answers and no contact data, keeps the questions', () => {
    const p = buildAiReviewPrompt({ typeName: 'EN Polizei', answers });
    expect(p.user).not.toContain('frd_le0n');
    expect(p.user).not.toContain('a@b.de');
    expect(p.user).toContain('Warum möchtest du zur Polizei?');
    expect(p.user).toContain('Ruhig bleiben.'); // Frage nennt Discord, ist aber keine Identitätsfrage
    expect(p.user).toContain('[keine Regeln hinterlegt]');
    expect(p.omitted).toBe(1);
    expect(p.system).toMatch(/nicht_beurteilbar/);
  });
  it('limits the input size', () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ question: `Frage ${i}`, answer: 'x'.repeat(3000) }));
    const p = buildAiReviewPrompt({ typeName: 'EN Polizei', answers: long }, { maxChars: 6000, maxAnswerChars: 1000 });
    expect(p.truncated).toBe(true);
    expect(p.user.length).toBeLessThan(9000);
    expect(p.user).toContain('[aus Längengründen nicht übermittelt]');
  });
  it('includes configured rules and criteria', () => {
    const p = buildAiReviewPrompt({ typeName: 'EN Polizei', answers, settings: { rules: 'Kein Fail-RP.', criteria: 'Mindestens 2 h pro Woche aktiv.' } });
    expect(p.user).toContain('Kein Fail-RP.');
    expect(p.user).toContain('Mindestens 2 h pro Woche aktiv.');
  });
});

describe('aiReviewFingerprintSource', () => {
  it('changes when an answer or a rule changes', () => {
    const base = { typeName: 'EN Polizei', answers: [{ question: 'A', answer: 'B' }] };
    const a = aiReviewFingerprintSource(base);
    expect(aiReviewFingerprintSource({ ...base })).toBe(a);
    expect(aiReviewFingerprintSource({ ...base, answers: [{ question: 'A', answer: 'C' }] })).not.toBe(a);
    expect(aiReviewFingerprintSource({ ...base, settings: { rules: 'neu' } })).not.toBe(a);
  });
});
