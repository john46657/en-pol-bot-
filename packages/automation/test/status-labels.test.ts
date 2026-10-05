import { describe, expect, it } from 'vitest';
import { reviewButtons, reviewMessage, statusDisplay, statusLabelsOf } from '../src/review-format.js';

describe('Eigene Statusnamen und -farben', () => {
  it('eigener Name und eigene Farbe; fehlende Einträge = Standard', () => {
    const labels = statusLabelsOf({ statusLabels: { UNDER_REVIEW: { label: '🟣 Wird geprüft', color: '#8e44ad' }, DENIED: { label: 'Leider nein' } } });
    expect(statusDisplay('UNDER_REVIEW', labels)).toEqual({ label: '🟣 Wird geprüft', color: 0x8e44ad });
    expect(statusDisplay('DENIED', labels)).toEqual({ label: 'Leider nein', color: 0xed4245 });
    expect(statusDisplay('ACCEPTED', labels).label).toBe('🟢 Angenommen');
    expect(statusDisplay('ON_HOLD').label).toBe('🟠 Zurückgestellt');
  });
  it('ungültige Einträge werden ignoriert, nicht übernommen', () => {
    const labels = statusLabelsOf({ statusLabels: { SUBMITTED: { label: '   ', color: 'rot' }, ACCEPTED: 'falsch', X: { label: 'y'.repeat(80) } } });
    expect(statusDisplay('SUBMITTED', labels)).toEqual(statusDisplay('SUBMITTED'));
    expect(labels['X']?.label).toHaveLength(40);
    expect(statusLabelsOf(null)).toEqual({});
  });
  it('Prüf-Nachricht zeigt den eigenen Namen und die eigene Farbe', () => {
    const m = reviewMessage({ submissionId: 's1', applicantId: '1', applicantName: 'Max', applicationName: 'Moderation', version: 1, status: 'SUBMITTED', answerCount: 3, statusLabels: { SUBMITTED: { label: '🟠 Eingereicht – wartet', color: '#123456' } } });
    expect(m.embeds?.[0]?.description).toBe('🟠 Eingereicht – wartet');
    expect(m.embeds?.[0]?.color).toBe(0x123456);
  });
  it('Knopf wechselt zwischen „Zurückstellen“ und „Fortsetzen“', () => {
    const labels = (status: string) => reviewButtons('s1', undefined, status).flatMap((r) => r.components.map((c) => (c as { label?: string }).label));
    expect(labels('SUBMITTED')).toContain('Zurückstellen');
    expect(labels('ON_HOLD')).toContain('Fortsetzen');
  });
});
