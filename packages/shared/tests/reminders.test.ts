import { describe, expect, it } from 'vitest';
import { formatReminderDuration, parseBool, parseReminderDuration } from '../src';

const ms = (s: string) => { const r = parseReminderDuration(s); return r.ok ? r.ms : r.error; };

describe('parseReminderDuration', () => {
  it('understands the common formats', () => {
    expect(ms('10m')).toBe(600_000);
    expect(ms('30 min')).toBe(1_800_000);
    expect(ms('1h')).toBe(3_600_000);
    expect(ms('1 Stunde 30 Minuten')).toBe(5_400_000);
    expect(ms('1h30m')).toBe(5_400_000);
    expect(ms('1,5 h')).toBe(5_400_000);
    expect(ms('1d')).toBe(86_400_000);
    expect(ms('2 Tage')).toBe(172_800_000);
    expect(ms('45')).toBe(2_700_000); // bloße Zahl = Minuten
    expect(ms('in 2 std und 5 min')).toBe(7_500_000);
  });
  it('rejects invalid, too short and too long times with a clear message', () => {
    expect(ms('')).toMatch(/Bitte angeben/);
    expect(ms('bald')).toMatch(/keine gültige Zeitangabe/);
    expect(ms('10 jahre')).toMatch(/„jahre“ verstehe ich nicht/);
    expect(ms('10m xyz')).toMatch(/keine gültige Zeitangabe/);
    expect(ms('0m')).toMatch(/mindestens 1 Minute/);
    expect(ms('-5m')).toMatch(/keine gültige Zeitangabe/);
    expect(ms('400d')).toMatch(/365 Tage/);
  });
});

describe('parseBool (dm)', () => {
  it('accepts booleans and True/False strings without errors', () => {
    expect(parseBool(true)).toBe(true);
    expect(parseBool(false, true)).toBe(false);
    expect(parseBool('True')).toBe(true);
    expect(parseBool('False', true)).toBe(false);
    expect(parseBool('ja')).toBe(true);
    expect(parseBool('nein', true)).toBe(false);
    expect(parseBool(undefined)).toBe(false);
    expect(parseBool('vielleicht', true)).toBe(true);
  });
});

describe('formatReminderDuration', () => {
  it('formats in German', () => {
    expect(formatReminderDuration(600_000)).toBe('10 Minuten');
    expect(formatReminderDuration(90_000_000)).toBe('1 Tag 1 Stunde');
    expect(formatReminderDuration(60_000)).toBe('1 Minute');
  });
});
