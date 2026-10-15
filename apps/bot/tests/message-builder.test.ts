import { describe, expect, it } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Api } from '../src/api';
import { BotApiError } from '../src/api';
import { guildInfo } from '../src/guilds';
import { MB_INTERACTION, discordErrorText, runMbSend, type MbDiscord, type MbPayload } from '../src/message-builder';
import { pollOnce } from '../src/outbox';

const ID = '11111111-2222-3333-4444-555555555555';
const p = (content: string, embeds: unknown[] = []): MbPayload => ({ content, embeds, components: [], allowed_mentions: { parse: ['users'] } });
function fakeApi(start: unknown) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const api: Api = {
    asUser: async () => { throw new Error('nope'); },
    service: async <T,>(method: string, path: string, body?: unknown) => { calls.push({ method, path, body }); return (path.endsWith('/start') ? start : undefined) as T; },
  };
  return { api, calls };
}
const discordFake = (o: { missing?: string[]; failAt?: number; error?: unknown } = {}) => {
  const sent: string[] = [];
  const d: MbDiscord = {
    missingPerms: async () => o.missing ?? [],
    send: async (_c, x) => { if (sent.length === o.failAt) throw o.error ?? Object.assign(new Error('Missing Permissions'), { status: 403, code: 50013 }); sent.push(x.content ?? ''); return { id: `49000000000000000${sent.length}` }; },
  };
  return { d, sent };
};
const started = (n: number) => ({ proceed: true, guildId: '480000000000000001', channelId: '481000000000000001', items: Array.from({ length: n }, (_, i) => ({ position: i, payload: p(`N${i + 1}`) })) });

describe('Message Builder im Bot – Versand', () => {
  it('sendet in Reihenfolge und meldet jede Nachricht mit ID', async () => {
    const { api, calls } = fakeApi(started(3));
    const { d, sent } = discordFake();
    await runMbSend(api, ID, d, () => undefined);
    expect(sent).toEqual(['N1', 'N2', 'N3']);
    expect(calls.map((c) => c.path)).toEqual([`/bot/message-builder/sends/${ID}/start`, ...[0, 1, 2].map((i) => `/bot/message-builder/sends/${ID}/items/${i}`), `/bot/message-builder/sends/${ID}/finish`]);
    expect(calls[2]!.body).toEqual({ ok: true, messageId: '490000000000000002' });
    expect(calls.at(-1)!.body).toEqual({});
  });
  it('Fehler bei Nachricht 2: verständlicher Fehler, Rest nicht gesendet', async () => {
    const { api, calls } = fakeApi(started(3));
    const { d, sent } = discordFake({ failAt: 1 });
    await runMbSend(api, ID, d, () => undefined);
    expect(sent).toEqual(['N1']);
    expect(calls.find((c) => c.path.endsWith('/items/1'))!.body).toEqual({ ok: false, error: expect.stringMatching(/fehlen Rechte/) });
    expect(calls.some((c) => c.path.endsWith('/items/2'))).toBe(false);
    expect(calls.at(-1)!.body).toEqual({ error: expect.stringMatching(/vorherige Nachricht/) });
  });
  it('fehlende Bot-Rechte: nichts senden, Grund melden', async () => {
    const { api, calls } = fakeApi(started(2));
    const { d, sent } = discordFake({ missing: ['Links einbetten'] });
    await runMbSend(api, ID, d, () => undefined);
    expect(sent).toEqual([]);
    expect(calls[1]!.body).toEqual({ ok: false, error: 'Dem Bot fehlen in diesem Kanal Rechte: Links einbetten.' });
  });
  it('Auftrag schon abgeholt (proceed=false) → nichts senden', async () => {
    const { api, calls } = fakeApi({ proceed: false });
    const { d, sent } = discordFake();
    await runMbSend(api, ID, d, () => undefined);
    expect(sent).toEqual([]);
    expect(calls).toHaveLength(1);
  });
  it('Discord-Fehler verständlich (Rate-Limit, unbekannter Kanal, ungültig)', () => {
    expect(discordErrorText(Object.assign(new Error('x'), { name: 'RateLimitError' }))).toMatch(/Anfragelimit/);
    expect(discordErrorText({ status: 404, code: 10003, message: 'Unknown Channel' })).toMatch(/Kanal gibt es nicht/);
    expect(discordErrorText({ status: 400, code: 50035, message: 'Invalid Form Body embeds[0].image.url: Not a well formed URL.' })).toMatch(/ungültig abgelehnt \(Invalid Form Body/);
  });
  it('Outbox: mb.send wird als Aufgabe ausgeführt und quittiert', async () => {
    const acks: unknown[] = [];
    const api: Api = { asUser: async () => undefined as never, service: async <T,>(m: string, path: string, body?: unknown) => {
      if (path === '/bot/config') return {} as T;
      if (path.startsWith('/bot/outbox?')) return [{ id: 'o1', type: 'mb.send', channelKey: 'announcements', payload: { sendId: ID } }] as T;
      acks.push({ path, body }); return undefined as T;
    } };
    const tasks: unknown[] = [];
    expect(await pollOnce(api, async () => undefined, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, async (type, payload) => { tasks.push({ type, payload }); return true; })).toBe(1);
    expect(tasks).toEqual([{ type: 'mb.send', payload: { sendId: ID } }]);
    expect(acks).toEqual([{ path: '/bot/outbox/o1/ack', body: { ok: true } }]);
  });
});

describe('Message Builder im Bot – Buttons/Menüs', () => {
  const ctx = (resolved: unknown, extra: Record<string, unknown> = {}) => {
    const calls: unknown[] = [];
    const api: Api = { asUser: async () => undefined as never, service: async <T,>(_m: string, path: string, body?: unknown) => { calls.push({ path, body }); if (resolved instanceof Error) throw resolved; return resolved as T; } };
    return { calls, c: { discordId: '485000000000000001', guildId: '480000000000000001', opts: {}, api, args: [ID], ...extra } };
  };
  it('Antwort nur für die Person', async () => {
    const { c, calls } = ctx({ type: 'reply', text: 'Nur für dich' }, { values: ['o1'] });
    expect(await MB_INTERACTION.run(c as never)).toEqual({ ephemeral: true, content: 'Nur für dich' });
    expect(calls[0]).toEqual({ path: '/bot/message-builder/interactions', body: { actionId: ID, guildId: '480000000000000001', discordId: '485000000000000001', value: 'o1' } });
  });
  it('Rolle umschalten; Fehler verständlich; veraltete Aktion', async () => {
    const changes: unknown[] = [];
    const setRole = async (...a: unknown[]) => { changes.push(a); return 'added' as const; };
    const { c } = ctx({ type: 'role', roleId: '482000000000000001', mode: 'toggle' }, { discord: { setRole } });
    expect((await MB_INTERACTION.run(c as never)).content).toMatch(/Du hast jetzt die Rolle <@&482000000000000001>/);
    expect(changes).toEqual([['480000000000000001', '485000000000000001', '482000000000000001', 'toggle']]);
    const { c: c2 } = ctx({ type: 'role', roleId: '482000000000000001', mode: 'toggle' }, { discord: { setRole: async () => { throw Object.assign(new Error('Missing Permissions'), { status: 403, code: 50013 }); } } });
    expect(JSON.stringify(await MB_INTERACTION.run(c2 as never))).toMatch(/Rolle konnte nicht geändert werden/);
    const { c: c3 } = ctx({ type: 'gone' });
    expect(JSON.stringify(await MB_INTERACTION.run(c3 as never))).toMatch(/nicht mehr verfügbar/);
    const { c: c4 } = ctx(new BotApiError(403, 'PERMISSION_DENIED', 'Dieser Discord-Server gehört nicht zum System.'));
    expect(JSON.stringify(await MB_INTERACTION.run(c4 as never))).toMatch(/keine Berechtigung/);
  });
});

describe('Kanalverzeichnis mit Bot-Rechten', () => {
  it('meldet je Textkanal, ob der Bot sehen/senden/einbetten darf', () => {
    const coll = <T extends { id: string }>(xs: T[]) => ({ values: () => xs.values() });
    const allow = new Set<bigint>([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
    const g = {
      id: '1', name: 'EN', iconURL: () => null, members: { me: { id: 'bot' } },
      channels: { cache: coll([
        { id: '11', name: 'news', type: ChannelType.GuildText, parentId: null, rawPosition: 1, isThread: () => false, permissionsFor: () => ({ has: (f: bigint) => allow.has(f) }) },
        { id: '12', name: 'cat', type: ChannelType.GuildCategory, parentId: null, rawPosition: 0, isThread: () => false, permissionsFor: () => ({ has: () => true }) },
      ]) },
      roles: { cache: coll([]) },
    };
    expect(guildInfo(g as never).channels).toEqual([
      { id: '11', name: 'news', type: 'text', parentId: null, position: 1, bot: { view: true, send: true, embed: false, mentionEveryone: false } },
      { id: '12', name: 'cat', type: 'category', parentId: null, position: 0 },
    ]);
  });
});
