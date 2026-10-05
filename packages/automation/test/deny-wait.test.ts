import { describe, expect, it } from 'vitest';
import { denyWaitVariables } from '../src/application-review.js';

const NOW = new Date('2026-10-05T10:00:00Z');
describe('Wartezeit nach Ablehnung als Platzhalter', () => {
  it('nimmt die längere Wartezeit und formuliert verständlich', () => {
    expect(denyWaitVariables({ requirements: { denyCooldown: { days: 14 }, cooldown: { days: 3 } } }, NOW)).toEqual({ wartezeit: '14 Tagen', wiederAb: '19.10.26, 12:00' });
    expect(denyWaitVariables({ requirements: { cooldown: { days: 1, hours: 12 } } }, NOW).wartezeit).toBe('1 Tag und 12 Stunden');
    expect(denyWaitVariables({ requirements: { denyCooldown: { minutes: 30 } } }, NOW).wartezeit).toBe('30 Minuten');
  });
  it('ohne Wartezeit leer', () => {
    expect(denyWaitVariables({}, NOW)).toEqual({ wartezeit: '', wiederAb: '' });
    expect(denyWaitVariables(null, NOW)).toEqual({ wartezeit: '', wiederAb: '' });
  });
});

describe('Wartezeit – Zusammensetzung', () => {
  it('Tage, Stunden und Minuten', () => {
    expect(denyWaitVariables({ requirements: { denyCooldown: { days: 2, hours: 3, minutes: 1 } } }, NOW).wartezeit).toBe('2 Tagen, 3 Stunden und 1 Minute');
  });
});
