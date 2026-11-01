import { describe, expect, it, vi } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import type { Reply } from '../src/format';

const ME = '123456789012345678', GUILD = '323456789012345678', CH = '423456789012345678', TARGET = '523456789012345678', ROLE = '623456789012345678';
const TID = '11111111-1111-4111-8111-111111111111', CAT = '22222222-2222-4222-8222-222222222222';
type Call = { kind: 'user' | 'service'; method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) throw new BotApiError(404, 'NOT_FOUND', 'no route');
    const r = routes[key];
    if (r instanceof BotApiError) throw r;
    return typeof r === 'function' ? (r as (b: unknown) => unknown)(body) : r;
  };
  const api: Api = {
    async asUser(_d, method, path, body) { calls.push({ kind: 'user', method, path, body }); return resolve(method, path, body) as never; },
    async service(method, path, body) { calls.push({ kind: 'service', method, path, body }); return resolve(method, path, body) as never; },
  };
  return { api, calls };
}
const run = (customId: string, api: Api, extra: Partial<Ctx> & { values?: string[]; modal?: { values: Record<string, unknown>; files: Record<string, unknown> } } = {}) => {
  const hit = interactionFor(customId)!;
  return hit.def.run({ discordId: ME, opts: {}, api, guildId: GUILD, channelId: CH, userName: 'Max', ...extra, args: hit.args } as never) as Promise<Reply>;
};
const slash = (opts: Record<string, unknown>, api: Api, extra: Partial<Ctx> = {}) => byName('ticket')!.run({ discordId: ME, opts: opts as Ctx['opts'], api, guildId: GUILD, channelId: CH, applyEffects: vi.fn(async () => ({})), ...extra });
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title ?? ''} ${e.description ?? ''}`).join(' ') ?? ''}`;
const MODAL = { id: `tk:closefm:${TID}`, title: 'Ticket schließen', fields: [{ id: 'reason', label: 'Was wurde gelöst?', kind: 'text', required: true }] };

describe('new ticket buttons', () => {
  it('remind, forward (member/role/category) and automation run as staff actions with their own permission check in the system', async () => {
    const { api, calls } = fakeApi({ [`POST /support-tickets/${TID}/actions`]: { message: 'ok', effects: [] }, [`GET /support-tickets/${TID}/options`]: { categories: [{ id: CAT, name: 'Technik', emoji: null }] } });
    await run(`tk:remind:${TID}`, api);
    const picker = await run(`tk:forward:${TID}`, api);
    expect(picker.selects!.map((s) => s.id)).toEqual([`tk:fwu:${TID}`, `tk:fwr:${TID}`, `tk:fwc:${TID}`]);
    expect(picker.selects![0]!.kind).toBe('user');
    expect(picker.selects![1]!.kind).toBe('role');
    await run(`tk:fwu:${TID}`, api, { values: [TARGET] });
    await run(`tk:fwr:${TID}`, api, { values: [ROLE] });
    await run(`tk:fwc:${TID}`, api, { values: [CAT] });
    const auto = await run(`tk:automation:${TID}`, api);
    expect(auto.buttons!.map((b) => b.id)).toEqual([`tk:auto:${TID}:pause:60`, `tk:auto:${TID}:pause:1440`, `tk:auto:${TID}:disable`, `tk:auto:${TID}:enable`]);
    await run(`tk:auto:${TID}:pause:1440`, api);
    await run(`tk:auto:${TID}:disable`, api);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { action: 'remind' },
      { action: 'forward', target: 'USER', targetId: TARGET }, { action: 'forward', target: 'ROLE', targetId: ROLE }, { action: 'forward', target: 'CATEGORY', targetId: CAT },
      { action: 'automation', mode: 'pause', minutes: 1440 }, { action: 'automation', mode: 'disable' },
    ]);
    expect(calls.every((c) => c.kind === 'user' || c.path.includes('options'))).toBe(true);
  });

  it('close form: the close button opens the category form; submitting sends the answers (staff, else creator)', async () => {
    const def = interactionFor('tk:x')!.def;
    expect(def.opensModal!(['close', TID, 'f'])).toBe(true);
    expect(def.opensModal!(['closefo', TID])).toBe(true);
    const { api, calls } = fakeApi({ [`GET /bot/support-tickets/${TID}/close-form`]: { modal: MODAL }, [`POST /support-tickets/${TID}/actions`]: new BotApiError(403, 'PERMISSION_DENIED', 'nein'), [`POST /bot/support-tickets/${TID}/creator-close`]: { message: 'Ticket geschlossen.', effects: [] } });
    const r = await run(`tk:close:${TID}:f`, api);
    expect(r.modal?.id).toBe(`tk:closefm:${TID}`);
    const done = await run(`tk:closefm:${TID}`, api, { modal: { values: { reason: 'Gelöst' }, files: {} } });
    expect(text(done)).toContain('geschlossen');
    expect(calls.at(-1)).toMatchObject({ kind: 'service', path: `/bot/support-tickets/${TID}/creator-close`, body: { discordId: ME, answers: { reason: 'Gelöst' } } });
  });

  it('rating with a rating form: a click opens the form; the rating is stored with the answers', async () => {
    const def = interactionFor('tk:x')!.def;
    expect(def.opensModal!(['rate', TID, '8', 'f'])).toBe(true);
    expect(def.opensModal!(['rate', TID, '8'])).toBe(false);
    const { api, calls } = fakeApi({ [`GET /bot/support-tickets/${TID}/rating-form`]: { modal: { id: `tk:ratefm:${TID}:8`, title: 'Bewertung 8/10', fields: [{ id: 'comment', label: 'Begründung', kind: 'paragraph', required: false }] } }, [`POST /bot/support-tickets/${TID}/rating`]: { thanks: 'Danke!' } });
    expect((await run(`tk:rate:${TID}:8:f`, api)).modal?.id).toBe(`tk:ratefm:${TID}:8`);
    expect(text(await run(`tk:ratefm:${TID}:8`, api, { modal: { values: { comment: 'Top' }, files: {} } }))).toContain('Danke');
    expect(calls.at(-1)).toMatchObject({ body: { discordId: ME, stars: 8, values: { comment: 'Top' } } });
  });
});

describe('/ticket (slash command in the ticket channel)', () => {
  it('has all subcommands and resolves the ticket from the channel', async () => {
    const def = byName('ticket')!;
    expect(def.subcommands!.map((s) => s.name)).toEqual(['claim', 'unclaim', 'schliessen', 'anfrage', 'weiterleiten', 'hinzufuegen', 'entfernen', 'umbenennen', 'erinnern', 'notiz', 'automatik', 'oeffnen']);
    expect(def.subcommands!.find((s) => s.name === 'weiterleiten')!.options!.map((o) => o.type)).toEqual(['user', 'role', 'string', 'string']);
    const { api, calls } = fakeApi({ [`GET /bot/support-tickets/by-channel/${CH}`]: { id: TID }, [`POST /support-tickets/${TID}/actions`]: { message: 'ok', effects: [] }, [`GET /bot/support-tickets/${TID}/close-options`]: { closed: false, form: false } });
    for (const [sub, extra] of [['claim', {}], ['unclaim', {}], ['anfrage', {}], ['weiterleiten', { rolle: ROLE, notiz: 'bitte' }], ['hinzufuegen', { mitglied: TARGET }], ['entfernen', { mitglied: TARGET }], ['umbenennen', { name: 'neu-{username}' }], ['erinnern', {}], ['notiz', { text: 'intern' }], ['automatik', { modus: 'pause10080' }], ['schliessen', { grund: 'erledigt' }]] as const) {
      const r = await slash({ _sub: sub, ...extra }, api);
      expect(r.content ?? "", `${sub}: ${text(r)}`).not.toContain("❌");
    }
    expect(calls.filter((c) => c.path === `/support-tickets/${TID}/actions`).map((c) => c.body)).toEqual([
      { action: 'claim' }, { action: 'unclaim' }, { action: 'close_request' }, { action: 'forward', target: 'ROLE', targetId: ROLE, note: 'bitte' },
      { action: 'add_access', targetId: TARGET, kind: 'USER' }, { action: 'remove_access', targetId: TARGET }, { action: 'rename', name: 'neu-{username}' },
      { action: 'remind' }, { action: 'note', text: 'intern' }, { action: 'automation', mode: 'pause', minutes: 10080 }, { action: 'close', reason: 'erledigt' },
    ]);
  });

  it('outside a ticket channel it explains where to use it; with a close form it offers the form button', async () => {
    const none = fakeApi({ 'GET /bot/support-tickets/by-channel/': new BotApiError(404, 'NOT_FOUND', 'Dieser Kanal ist kein Ticket. Nutze den Befehl im Ticket-Kanal.') });
    expect(text(await slash({ _sub: 'claim' }, none.api))).toContain('kein Ticket');
    const form = fakeApi({ [`GET /bot/support-tickets/by-channel/${CH}`]: { id: TID }, [`GET /bot/support-tickets/${TID}/close-options`]: { closed: false, form: true } });
    const r = await slash({ _sub: 'schliessen' }, form.api);
    expect(r.buttons![0]!.id).toBe(`tk:closefo:${TID}`);
    expect(text(await slash({ _sub: 'weiterleiten' }, fakeApi({ [`GET /bot/support-tickets/by-channel/${CH}`]: { id: TID } }).api))).toContain('Ziel');
  });
});
