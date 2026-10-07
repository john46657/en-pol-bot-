import { describe, expect, it } from 'vitest';
import type { Api } from '../src/api';
import { interactionFor } from '../src/commands/features';
import { dutyReminderDm } from '../src/format';

const ME = '123456789012345678';
const api = (onDuty: boolean, calls: string[]): Api => ({
  async asUser(_d, m, p) { calls.push(`${m} ${p}`); return { onDuty } as never; },
  async service() { return {} as never; },
});

describe('reminder when on duty but inactive', () => {
  it('DM with „still on duty“ / „off duty“ buttons, or the auto-off notice', () => {
    const r = dutyReminderDm({ kind: 'reminder', idleMinutes: 35, autoOffMinutes: 15 });
    expect(r.embed.description).toContain('35 Minuten');
    expect(r.embed.description).toContain('15 Minuten');
    expect(r.buttons?.map((b) => b.id)).toEqual(['duty:still', 'duty:OFF_DUTY']);
    const e = dutyReminderDm({ kind: 'ended', idleMinutes: 50, shiftMinutes: 120 });
    expect(e.embed.title).toContain('automatisch beendet');
    expect(e.buttons).toBeUndefined();
  });
  it('„Bin noch im Dienst“ reports activity', async () => {
    const calls: string[] = [];
    const hit = interactionFor('duty:still')!;
    const r = await hit.def.run({ discordId: ME, opts: {}, api: api(true, calls), args: hit.args });
    expect(calls).toEqual(['POST /team/me/active']);
    expect(r.content).toContain('läuft weiter');
    expect((await hit.def.run({ discordId: ME, opts: {}, api: api(false, []), args: hit.args })).content).toContain('nicht im Dienst');
  });
});
