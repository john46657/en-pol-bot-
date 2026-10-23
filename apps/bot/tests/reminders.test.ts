import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import { deliverReminder, reminderMessage } from '../src/commands/reminders';
import type { Ctx } from '../src/commands/types';
import type { Platform } from '../src/platform';

const ME = '900000000000000021', G = '111111111111111111', CH = '222222222222222222';
const ID = '3f1c2a4e-1111-4222-8333-944455556666';
type Call = { method: string; path: string; body?: unknown };
function fakeApi(handler: (c: Call) => unknown = () => ({})) {
  const calls: Call[] = [];
  const api: Api = {
    async asUser() { throw new Error('not linked – must not be used'); },
    async service(method, path, body) { const c = { method, path, body }; calls.push(c); const r = handler(c); if (r instanceof Error) throw r; return r as never; },
  };
  return { api, calls };
}
const view = (o: Record<string, unknown> = {}) => ({ id: ID, text: 'Streife', dm: false, dueAt: new Date(Date.now() + 600_000).toISOString(), status: 'PENDING', fireCount: 0, channelId: CH, duplicate: false, ...o });
const platform = (dmFails = false) => {
  const dms: string[] = [];
  const p = { async sendDm(u: string) { if (dmFails) throw new Error('Cannot send messages to this user'); dms.push(u); return { channelId: 'x', messageId: 'y' }; } } as unknown as Platform;
  return { p, dms };
};
const run = (api: Api, opts: Record<string, string | boolean | undefined>, o: Partial<Ctx> = {}) => byName('remind-me')!.run({ discordId: ME, api, opts, guildId: G, channelId: CH, ...o });

describe('/remind-me', () => {
  it('validates the time and the text before saving', async () => {
    const { api, calls } = fakeApi();
    expect((await run(api, { in: 'bald', what: 'x' })).content).toMatch(/keine gültige Zeitangabe/);
    expect((await run(api, { in: '0m', what: 'x' })).content).toMatch(/mindestens 1 Minute/);
    expect((await run(api, { in: '10m', what: '   ' })).content).toMatch(/woran ich dich erinnern/);
    expect(calls).toHaveLength(0);
  });

  it('dm as a real boolean or as "True"/"False" text – no validation error', async () => {
    for (const [dm, expected] of [[true, true], [false, false], ['True', true], ['False', false], [undefined, false]] as const) {
      const { api, calls } = fakeApi((c) => view({ dm: (c.body as { dm: boolean }).dm }));
      const r = await run(api, { in: '1h30m', what: 'Streife', dm }, { platform: platform().p });
      expect(r.content).toMatch(/^✅ Ich erinnere dich/);
      expect(calls[0]).toMatchObject({ method: 'POST', path: '/bot/reminders', body: { discordId: ME, guildId: G, channelId: CH, text: 'Streife', dm: expected, delayMs: 5_400_000 } });
    }
  });

  it('when DMs are closed, it saves the reminder for the channel and says so', async () => {
    const { api, calls } = fakeApi((c) => view({ dm: (c.body as { dm: boolean }).dm }));
    const r = await run(api, { in: '10m', what: 'Streife', dm: true }, { platform: platform(true).p });
    expect((calls[0]!.body as { dm: boolean }).dm).toBe(false);
    expect(r.content).toContain('keine Direktnachricht schicken');
    expect(r.content).toContain('hier im **Kanal**');
  });

  it('used in a DM (no server) → always by DM; works without a linked account', async () => {
    const { api, calls } = fakeApi((c) => view({ dm: (c.body as { dm: boolean }).dm, channelId: null }));
    await run(api, { in: '10m', what: 'x', dm: false }, { guildId: undefined, channelId: 'dmchannel' });
    expect(calls[0]!.body).toMatchObject({ dm: true, channelId: null, guildId: null });
  });

  it('shows API errors (e.g. too many reminders) clearly', async () => {
    const { api } = fakeApi(() => new BotApiError(409, 'CONFLICT', 'Du hast schon 25 offene Erinnerungen. Lösche zuerst eine mit /erinnerungen.'));
    expect((await run(api, { in: '10m', what: 'x' })).content).toContain('25 offene Erinnerungen');
  });
});

describe('Erinnerung zustellen und verschieben', () => {
  const p = { id: ID, discordId: ME, channelId: CH, dm: true, text: 'Streife fahren', fire: 2, createdAt: new Date().toISOString(), dueAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), lateMinutes: 180 };
  it('has the four snooze options and "Erledigt", bound to this firing', () => {
    const m = reminderMessage(p);
    expect(m.embed.title).toBe('⏰ Erinnerung');
    expect(m.embed.description).toContain('Verspätet zugestellt');
    expect(m.buttons.map((b) => b.label)).toEqual(['10 Minuten', '30 Minuten', '1 Stunde', '1 Tag', 'Erledigt']);
    expect(m.buttons[2]!.id).toBe(`remind:snooze:${ID}:2:60`);
  });
  it('DM → channel fallback with mention; never crashes, throws only if nothing works', async () => {
    const sent: string[] = [];
    const ok = { dm: async () => { sent.push('dm'); }, channel: async (_c: string, m: { content: string }) => { sent.push(m.content); } };
    expect(await deliverReminder(p, ok)).toBe('dm');
    const noDm = { ...ok, dm: async () => { throw new Error('Cannot send messages to this user'); } };
    expect(await deliverReminder(p, noDm)).toBe('channel-fallback');
    expect(sent.at(-1)).toContain(`<@${ME}>`);
    expect(await deliverReminder({ ...p, dm: false }, ok)).toBe('channel');
    await expect(deliverReminder({ ...p, channelId: null }, noDm)).rejects.toThrow(/reminder DM failed/);
  });
  it('snooze: removes the buttons; a second click gets a clear message', async () => {
    const hit = interactionFor(`remind:snooze:${ID}:2:30`)!;
    const { api, calls } = fakeApi(() => view());
    const r = await hit.def.run({ discordId: ME, api, opts: {}, args: hit.args });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/bot/reminders/${ID}/snooze`, body: { discordId: ME, fire: 2, minutes: 30 } });
    expect(r.update?.buttons).toEqual([]);
    const again = fakeApi(() => new BotApiError(409, 'CONFLICT', 'Diese Erinnerung wurde bereits verschoben.'));
    expect((await hit.def.run({ discordId: ME, api: again.api, opts: {}, args: hit.args })).content).toContain('bereits verschoben');
    const other = fakeApi(() => new BotApiError(403, 'PERMISSION_DENIED', 'Das ist nicht deine Erinnerung.'));
    expect((await hit.def.run({ discordId: '900000000000000099', api: other.api, opts: {}, args: hit.args })).content).toContain('nicht deine Erinnerung');
    const bad = interactionFor(`remind:snooze:${ID}:2:7`)!;
    expect((await bad.def.run({ discordId: ME, api, opts: {}, args: bad.args })).content).toContain('Ungültige Zeit');
  });
  it('/erinnerungen lists own reminders with delete buttons', async () => {
    const { api, calls } = fakeApi(() => [view()]);
    const r = await byName('erinnerungen')!.run({ discordId: ME, api, opts: {} });
    expect(calls[0]!.path).toBe(`/bot/reminders?discordId=${ME}`);
    expect(r.buttons?.[0]).toMatchObject({ id: `remind:cancel:${ID}` });
  });
});
