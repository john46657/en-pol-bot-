import { describe, expect, it } from 'vitest';
import {
  automationActive, closeRequestComplete, effectiveAutomation, loadLevel, median, normalizeRating, parseAutomation, percentile, ratingLabel, ratingTone, ticketDayKey, ticketWeekKey, weekdayHour,
  DEFAULT_AUTOMATION, LOAD_DOT, MODULES, OFF_MODULES, TICKET_ACTIONS, ALL_PERMISSIONS, BOT_COMMAND_MODULES,
} from '../src';

describe('ticket load (Auslastung)', () => {
  it('normal below 80 %, warning from 80 %, full from 100 %', () => {
    expect(loadLevel(0, 0)).toBe('none');
    expect(loadLevel(7, 10)).toBe('normal');
    expect(loadLevel(8, 10)).toBe('warn');
    expect(loadLevel(9, 10)).toBe('warn');
    expect(loadLevel(10, 10)).toBe('full');
    expect(loadLevel(12, 10)).toBe('full');
    expect(LOAD_DOT[loadLevel(3, 4)]).toBe('🟢'); // 75 %
    expect(LOAD_DOT[loadLevel(4, 5)]).toBe('🟡'); // 80 %
  });
});

describe('automations', () => {
  it('category values or panel defaults; broken stored values fall back safely', () => {
    const cat = { ...DEFAULT_AUTOMATION, autoCloseMinutes: 60, automationSource: 'CATEGORY' };
    expect(effectiveAutomation(cat, { autoCloseMinutes: 5 }).autoCloseMinutes).toBe(60);
    expect(effectiveAutomation({ ...cat, automationSource: 'PANEL' }, { autoCloseMinutes: 5, creatorReminderMinutes: 30 })).toMatchObject({ autoCloseMinutes: 5, creatorReminderMinutes: 30, closeRequestCloses: true });
    // ohne Panel (z. B. /support) gelten die Werte der Kategorie
    expect(effectiveAutomation({ ...cat, automationSource: 'PANEL' }, undefined).autoCloseMinutes).toBe(60);
    expect(parseAutomation({ autoCloseMinutes: -5, staffAlertMinutes: 'x', autoClaimOnMessage: 'yes' })).toEqual(DEFAULT_AUTOMATION);
  });
  it('paused or disabled per ticket', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(automationActive({}, now)).toBe(true);
    expect(automationActive({ automationDisabled: true }, now)).toBe(false);
    expect(automationActive({ automationPausedUntil: new Date('2026-11-01T13:00:00Z') }, now)).toBe(false);
    expect(automationActive({ automationPausedUntil: '2026-11-01T11:00:00Z' }, now)).toBe(true);
  });
});

describe('close request confirmations', () => {
  it.each([
    ['CREATOR', { creator: true, staff: false }, true], ['CREATOR', { creator: false, staff: true }, false],
    ['STAFF', { creator: true, staff: false }, false], ['STAFF', { creator: false, staff: true }, true],
    ['BOTH', { creator: true, staff: false }, false], ['BOTH', { creator: true, staff: true }, true],
    ['ANY', { creator: false, staff: true }, true], ['ANY', { creator: false, staff: false }, false],
  ] as const)('%s with %o → %s', (mode, a, done) => expect(closeRequestComplete(mode, a)).toBe(done));
});

describe('ratings', () => {
  it('stars up to 5, numbers above; normalization and tone are scale independent', () => {
    expect(ratingLabel(3, 5)).toBe('⭐⭐⭐');
    expect(ratingLabel(7, 10)).toBe('7/10');
    expect(normalizeRating(8, 10)).toBe(4);
    expect(normalizeRating(3, 5, 10)).toBe(6);
    expect(ratingTone(4, 5)).toBe('positive');
    expect(ratingTone(2, 5)).toBe('negative');
    expect(ratingTone(5, 10)).toBe('neutral');
  });
});

describe('statistics helpers', () => {
  it('median and p90 with interpolation', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBeCloseTo(91);
    expect(percentile([7], 90)).toBe(7);
  });
  it('weekday/hour, day and week keys in a time zone (Europe/Berlin, summer/winter time)', () => {
    // Sonntag 22:30 UTC = Montag 00:30 in Berlin (Winterzeit +1)
    expect(weekdayHour(new Date('2026-11-01T23:30:00Z'), 'Europe/Berlin')).toEqual({ weekday: 0, hour: 0 });
    expect(weekdayHour(new Date('2026-07-05T21:30:00Z'), 'Europe/Berlin')).toEqual({ weekday: 6, hour: 23 });
    expect(ticketDayKey(new Date('2026-11-01T23:30:00Z'), 'Europe/Berlin')).toBe('2026-11-02');
    expect(ticketWeekKey(new Date('2026-11-05T10:00:00Z'), 'Europe/Berlin')).toBe('2026-11-02');
    expect(ticketWeekKey(new Date('2026-11-01T10:00:00Z'), 'Europe/Berlin')).toBe('2026-10-26');
  });
});

describe('catalog', () => {
  it('ticket module is on, new actions have permissions in the catalog, /ticket belongs to the ticket module', () => {
    expect(OFF_MODULES).not.toContain('support');
    expect(MODULES.find((m) => m.key === 'support')).toBeTruthy();
    for (const a of ['remind', 'forward', 'automation'] as const) expect(ALL_PERMISSIONS).toContain(TICKET_ACTIONS[a].permission);
    expect(BOT_COMMAND_MODULES.ticket).toBe('support');
  });
});
