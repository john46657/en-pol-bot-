import { describe, expect, it } from 'vitest';
import { isTimeZone, timeZones } from '../src';

describe('Zeitzonen', () => {
  it('erkennt gültige IANA-Zeitzonen', () => {
    expect(isTimeZone('Europe/Berlin')).toBe(true);
    expect(isTimeZone('UTC')).toBe(true);
  });
  it('lehnt halbe Eingaben und Unsinn ab', () => {
    for (const tz of ['Eur', 'Europe/Berli', 'Berlin', '', '   ', 42, null]) expect(isTimeZone(tz)).toBe(false);
  });
  it('Liste enthält häufige zuerst und nur gültige Werte', () => {
    const list = timeZones();
    expect(list[0]).toBe('Europe/Berlin');
    expect(list).toContain('UTC');
    expect(new Set(list).size).toBe(list.length);
    expect(list.every(isTimeZone)).toBe(true);
  });
});
