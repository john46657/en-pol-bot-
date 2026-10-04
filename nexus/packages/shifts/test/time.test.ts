import { describe, expect, it } from 'vitest';
import { aggregate, computeDuration, formatSeconds, isOverlong, validateCorrection } from '../src/index.js';

const t = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + m * 60_000);

describe('Schichtzeit', () => {
  it('Nettodauer = brutto − Pausen', () => {
    const d = computeDuration({ startedAt: t(0), endedAt: t(100), pausedSeconds: 600 });
    expect(d).toEqual({ grossSeconds: 6000, pausedSeconds: 600, netSeconds: 5400 });
  });
  it('laufende Pause zählt bis jetzt', () => {
    const d = computeDuration({ startedAt: t(0), pausedAt: t(30), pausedSeconds: 0 }, t(50));
    expect(d.pausedSeconds).toBe(1200);
    expect(d.netSeconds).toBe(1800);
  });
  it('wird nie negativ', () => {
    expect(computeDuration({ startedAt: t(10), endedAt: t(5), pausedSeconds: 0 }).netSeconds).toBe(0);
  });
  it('Aggregation', () => {
    expect(aggregate([])).toEqual({ count: 0, totalSeconds: 0, averageSeconds: 0 });
    expect(aggregate([60, 120, 180])).toEqual({ count: 3, totalSeconds: 360, averageSeconds: 120 });
  });
  it('Formatierung', () => {
    expect(formatSeconds(3725)).toBe("1 Std 02 Min");
  });
  it('Überlänge', () => {
    expect(isOverlong({ startedAt: t(0), pausedSeconds: 0 }, 60, t(61))).toBe(true);
    expect(isOverlong({ startedAt: t(0), pausedSeconds: 0 }, 60, t(59))).toBe(false);
  });
  it('Korrektur-Validierung', () => {
    expect(validateCorrection({ startedAt: t(10), endedAt: t(5), pausedSeconds: 0 }, t(100)).length).toBeGreaterThan(0);
    expect(validateCorrection({ startedAt: t(0), endedAt: t(10), pausedSeconds: 9999 }, t(100)).length).toBeGreaterThan(0);
    expect(validateCorrection({ startedAt: t(0), endedAt: t(10), pausedSeconds: 60 }, t(100))).toEqual([]);
    expect(validateCorrection({ startedAt: t(0), endedAt: t(500), pausedSeconds: 0 }, t(100)).length).toBeGreaterThan(0);
  });
});
