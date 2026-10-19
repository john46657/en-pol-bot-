import { describe, expect, it } from 'vitest';
import { DEFAULT_HR_CONFIG, withHrDefaults } from '../src/hr';

const sev = (key: string, defaultDays: number) => ({ key, label: key, emoji: '⚠️', color: '#f59e0b', defaultDays });

describe('Schweregrad, der nicht abläuft', () => {
  it('ist in den Standardwerten dabei', () => {
    expect(DEFAULT_HR_CONFIG.warningSeverities.find((s) => s.key === 'PERMANENT')).toMatchObject({ defaultDays: 0 });
  });
  it('wird bei eigenen Schweregraden einmalig ergänzt; danach gelöscht bleibt gelöscht', () => {
    const once = withHrDefaults({ warningSeverities: [sev('WARNING', 30)] });
    expect(once.warningSeverities.map((s) => s.key)).toEqual(['WARNING', 'PERMANENT']);
    expect(once.addedDefaults).toContain('severity.PERMANENT');
    // gespeichert ohne PERMANENT (gelöscht) → kommt nicht zurück
    const removed = withHrDefaults({ ...once, warningSeverities: [sev('WARNING', 30)] });
    expect(removed.warningSeverities.map((s) => s.key)).toEqual(['WARNING']);
  });
});
