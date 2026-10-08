import { describe, expect, it } from 'vitest';
import type { Api } from '../src/api';
import { parseGermanDate, TRAINING_INTERACTION } from '../src/commands/trainings';

describe('Ausbildungen', () => {
  it('reads German date/time as Berlin time (summer and winter)', () => {
    expect(parseGermanDate('08.07.2026 18:30')).toBe('2026-07-08T16:30:00.000Z');
    expect(parseGermanDate('08.12.2026 18:30')).toBe('2026-12-08T17:30:00.000Z');
    expect(parseGermanDate('3.6.26 um 15:22 Uhr')).toBe('2026-06-03T13:22:00.000Z');
    expect(parseGermanDate('31.02.2026 18:00')).toBeNull();
    expect(parseGermanDate('morgen')).toBeNull();
  });
  it('sign-up button goes to the system as the member (also without a dashboard account)', async () => {
    const calls: unknown[] = [];
    const api = { async asUser() { throw new Error('unused'); }, async service(method: string, path: string, body?: unknown) { calls.push([method, path, body]); return { message: 'Angemeldet für „Grundausbildung“ am 08.10.2026.' } as never; } } as Api;
    const id = '11111111-1111-4111-8111-111111111111';
    const r = await TRAINING_INTERACTION.run({ discordId: '123456789012345678', userName: 'neuling', opts: {}, api, args: ['join', id] });
    expect(r.content).toContain('Angemeldet');
    expect(calls).toEqual([['POST', `/bot/training-sessions/${id}/signup`, { discordId: '123456789012345678', name: 'neuling', join: true }]]);
  });
});
