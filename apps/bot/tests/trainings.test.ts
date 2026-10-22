import { describe, expect, it } from 'vitest';
import type { Api } from '../src/api';
import { checkTrainingTime, parseGermanDate, TRAINING_INTERACTION } from '../src/commands/trainings';

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
  it('validates the time with concrete hints: format, impossible date, past, too far ahead; no year → next occurrence', () => {
    const now = new Date('2026-12-20T12:00:00Z');
    expect(checkTrainingTime('', now)).toEqual({ error: expect.stringContaining('wann') });
    expect(checkTrainingTime('morgen abend', now)).toEqual({ error: expect.stringContaining('TT.MM.JJJJ HH:MM') });
    expect(checkTrainingTime('31.02.2027 18:00', now)).toEqual({ error: expect.stringContaining('kein gültiges Datum') });
    expect(checkTrainingTime('08.10.2027 25:00', now)).toEqual({ error: expect.stringContaining('kein gültiges Datum') });
    expect(checkTrainingTime('01.12.2026 18:00', now)).toEqual({ error: expect.stringContaining('Vergangenheit') });
    expect(checkTrainingTime('01.12.2029 18:00', now)).toEqual({ error: expect.stringContaining('Jahr') });
    expect(checkTrainingTime('05.01. 18:30', now)).toEqual({ startsAt: '2027-01-05T17:30:00.000Z' });
    expect(checkTrainingTime('22.12.2026 18:30', now)).toEqual({ startsAt: '2026-12-22T17:30:00.000Z' });
  });
  it('/ausbildung ansetzen: invalid input is rejected before anything is saved; valid input is confirmed with time and duration', async () => {
    const calls: unknown[][] = [];
    const api = { async asUser(_d: string, method: string, path: string, body?: unknown) { calls.push([method, path, body]); return { number: 'AS-1' } as never; }, async service() { throw new Error('unused'); } } as Api;
    const ctx = (fields: Record<string, string>) => ({ discordId: '123456789012345678', opts: {}, api, args: ['new'], fields, channelId: '323456789012345678', guildId: '423456789012345678' });
    expect((await TRAINING_INTERACTION.run(ctx({ title: 'Grundausbildung', when: 'bald' }))).content).toContain('verstehe ich nicht');
    expect((await TRAINING_INTERACTION.run(ctx({ title: ' ', when: '08.10.2099 18:30' }))).content).toContain('Titel');
    expect(calls).toHaveLength(0);
    const future = new Date(Date.now() + 7 * 86_400_000);
    const when = `${future.getUTCDate()}.${future.getUTCMonth() + 1}.${future.getUTCFullYear()} 18:30`;
    const r = await TRAINING_INTERACTION.run(ctx({ title: 'Grundausbildung', when, duration: ' 90 Minuten ', rank: '' }));
    expect(r.content).toContain('**AS-1**');
    expect(r.content).toMatch(/<t:\d+:F>/);
    expect(r.content).toContain('Dauer: 90 Minuten');
    expect(calls[0]![2]).toMatchObject({ title: 'Grundausbildung', duration: '90 Minuten', forRank: null, startsAt: parseGermanDate(when) });
  });
});
