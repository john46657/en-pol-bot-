import { describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import type { TicketEffect } from '@enrp/shared';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import type { Reply } from '../src/format';
import { componentsOf, createTicketRuntime, payloadOf } from '../src/discord-tickets';
import { pollOnce } from '../src/outbox';

const ME = '123456789012345678', GUILD = '323456789012345678', CH = '423456789012345678';
const TID = '11111111-1111-4111-8111-111111111111', CAT = '22222222-2222-4222-8222-222222222222', PANEL = '33333333-3333-4333-8333-333333333333';
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
const run = (customId: string, api: Api, extra: Partial<Ctx> & { values?: string[]; fields?: Record<string, string> } = {}) => {
  const hit = interactionFor(customId)!;
  return hit.def.run({ discordId: ME, opts: {}, api, guildId: GUILD, channelId: CH, userName: 'Max', memberRoleIds: ['R1'], ...extra, args: hit.args } as never) as Promise<Reply>;
};
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title ?? ''} ${e.description ?? ''}`).join(' ') ?? ''}`;

describe('ticket interactions (tk:…)', () => {
  it('opening from a panel button sends roles/name to the system and reports the new channel', async () => {
    const effects: TicketEffect[] = [{ type: 'post', channelId: CH, message: { content: 'x' } }];
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/open': { effects } });
    const applyEffects = vi.fn(async () => ({ channelId: '999' }));
    const r = await run(`tk:open:${PANEL}:${CAT}`, api, { applyEffects });
    expect(text(r)).toContain('<#999>');
    expect(calls[0]).toMatchObject({ kind: 'service', body: { categoryId: CAT, panelId: PANEL, guildId: GUILD, discordId: ME, discordName: 'Max', memberRoleIds: ['R1'] } });
    expect(applyEffects).toHaveBeenCalledWith(effects);
    // Dropdown-Panel: Kategorie kommt aus der Auswahl
    await run(`tk:open:${PANEL}`, api, { applyEffects, values: [CAT] });
    expect(calls[1]!.body).toMatchObject({ categoryId: CAT });
    // ungültige Auswahl
    expect(text(await run(`tk:open:${PANEL}`, api, { applyEffects, values: ['nope'] }))).toContain('Ticket-Art');
  });

  it('shows the German reason when the system refuses (limits, cooldown, missing role)', async () => {
    const { api } = fakeApi({ 'POST /bot/support-tickets/open': new BotApiError(409, 'CONFLICT', 'Du hast bereits 1 offene(s) Ticket(s) in dieser Kategorie.') });
    const r = await run(`tk:open:${PANEL}:${CAT}`, api, { applyEffects: async () => ({}) });
    expect(text(r)).toContain('bereits 1 offene');
  });

  it('questions: text answers open a form; buttons/selects answer directly and update the question message', async () => {
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/': (b: { values: string[] | null }) => ({ answer: b.values?.join(', ') ?? '—', done: false, effects: [] }) });
    const modal = await run(`tk:ans:${TID}:q1:l`, api);
    expect(modal.modal).toMatchObject({ id: `tk:ansm:${TID}:q1` });
    expect(modal.modal!.fields[0]!.paragraph).toBe(true);
    const typed = await run(`tk:ansm:${TID}:q1`, api, { fields: { value: 'Mein Problem' } });
    expect(typed.update?.embeds?.[0]?.description).toContain('Mein Problem');
    await run(`tk:ansv:${TID}:q2:Ja`, api);
    await run(`tk:anss:${TID}:q3`, api, { values: ['A', 'B'] });
    await run(`tk:skip:${TID}:q4`, api);
    expect(calls.map((c) => c.body)).toEqual([
      { discordId: ME, questionId: 'q1', values: ['Mein Problem'] }, { discordId: ME, questionId: 'q2', values: ['Ja'] },
      { discordId: ME, questionId: 'q3', values: ['A', 'B'] }, { discordId: ME, questionId: 'q4', values: null },
    ]);
  });

  it('closing: without reason, with preset reasons or a form; the creator may close when staff rights are missing', async () => {
    const applied: TicketEffect[][] = [];
    const applyEffects = async (e: TicketEffect[]) => { applied.push(e); return {}; };
    const staff = fakeApi({ [`POST /support-tickets/${TID}/actions`]: { message: 'Ticket geschlossen.', effects: [{ type: 'rename', channelId: CH, name: 'closed-0001' }] } });
    expect(text(await run(`tk:close:${TID}:n`, staff.api, { applyEffects }))).toContain('geschlossen');
    expect(staff.calls[0]).toMatchObject({ kind: 'user', body: { action: 'close' } });
    expect(applied).toHaveLength(1);
    // Modus „m“: Formular
    expect((await run(`tk:close:${TID}:m`, staff.api)).modal?.id).toBe(`tk:closemodal:${TID}`);
    await run(`tk:closemodal:${TID}`, staff.api, { fields: { reason: ' Erledigt ' }, applyEffects });
    expect(staff.calls.at(-1)!.body).toEqual({ action: 'close', reason: 'Erledigt' });
    // Modus „s“: vorgefertigte Gründe + eigener Grund + ohne Grund
    const sel = fakeApi({ [`GET /bot/support-tickets/${TID}/close-options`]: { mode: 'OPTIONAL', source: 'BOTH', reasons: ['Gelöst', 'Spam'], closed: false } });
    const pick = await run(`tk:close:${TID}:s`, sel.api);
    expect(pick.select?.options.map((o) => o.value)).toEqual(['Gelöst', 'Spam']);
    expect(pick.buttons?.map((b) => b.id)).toEqual([`tk:closem:${TID}`, `tk:closen:${TID}`]);
    // Ersteller ohne Mitarbeiter-Rechte
    const creator = fakeApi({ [`POST /support-tickets/${TID}/actions`]: new BotApiError(403, 'FORBIDDEN', 'Missing permission'), [`POST /bot/support-tickets/${TID}/creator-close`]: { message: 'Dein Ticket wurde geschlossen.' } });
    expect(text(await run(`tk:closer:${TID}`, creator.api, { values: ['Gelöst'] }))).toContain('Dein Ticket');
    expect(creator.calls.at(-1)).toMatchObject({ kind: 'service', body: { discordId: ME, reason: 'Gelöst' } });
  });

  it('staff actions run with the clicking user\'s rights; pickers come from the system', async () => {
    const { api, calls } = fakeApi({
      [`GET /support-tickets/${TID}/options`]: { closed: false, statuses: [{ id: 's1', name: 'Wartend', emoji: '⏳' }], priorities: [{ id: 'p1', name: 'Hoch', emoji: '🔴' }], categories: [] },
      [`POST /support-tickets/${TID}/actions`]: { message: 'OK', effects: [] },
    });
    for (const a of ['claim', 'unclaim', 'lock', 'unlock', 'escalate', 'transcript', 'reopen']) await run(`tk:${a}:${TID}`, api);
    expect(calls.map((c) => (c.body as { action: string }).action)).toEqual(['claim', 'unclaim', 'lock', 'unlock', 'escalate', 'transcript', 'reopen']);
    expect(calls.every((c) => c.kind === 'user')).toBe(true);
    expect((await run(`tk:priority:${TID}`, api)).select).toMatchObject({ id: `tk:prio:${TID}`, options: [{ value: 'p1', label: 'Hoch', emoji: '🔴' }] });
    expect(text(await run(`tk:category:${TID}`, api))).toContain('Keine Auswahl');
    await run(`tk:stat:${TID}`, api, { values: ['s1'] });
    expect(calls.at(-1)!.body).toEqual({ action: 'status', statusId: 's1' });
    // Verschieben: Discord-Kategorien vom Server
    const moved = await run(`tk:move:${TID}`, api, { listCategories: async () => [{ id: '77', name: 'Archiv' }] });
    expect(moved.select?.options.map((o) => o.value)).toEqual(['none', '77']);
    await run(`tk:movesel:${TID}`, api, { values: ['none'] });
    expect(calls.at(-1)!.body).toEqual({ action: 'move', parentId: null });
    // Löschen nur nach Bestätigung
    expect((await run(`tk:delete:${TID}`, api)).buttons?.[0]?.id).toBe(`tk:delyes:${TID}`);
    await run(`tk:delyes:${TID}`, api);
    expect(calls.at(-1)!.body).toEqual({ action: 'delete' });
    // Notiz und Umbenennen per Formular
    await run(`tk:notem:${TID}`, api, { fields: { text: 'intern' } });
    expect(calls.at(-1)!.body).toEqual({ action: 'note', text: 'intern' });
    await run(`tk:renm:${TID}`, api, { fields: { name: 'support-{username}' } });
    expect(calls.at(-1)!.body).toEqual({ action: 'rename', name: 'support-{username}' });
  });

  it('add/remove users and roles, optionally for a limited time', async () => {
    const { api, calls } = fakeApi({ [`POST /support-tickets/${TID}/actions`]: { effects: [] } });
    const picker = await run(`tk:add_user:${TID}`, api);
    expect(picker.selects?.map((s) => [s.id, s.kind])).toEqual([[`tk:addu:${TID}:0`, 'user'], [`tk:addr:${TID}:0`, 'role']]);
    const timed = await run(`tk:addt:${TID}:60`, api);
    expect(timed.selects?.[0]?.id).toBe(`tk:addu:${TID}:60`);
    expect(text(await run(`tk:addu:${TID}:60`, api, { values: ['5', '6'] }))).toContain('2 Benutzer');
    await run(`tk:addr:${TID}:0`, api, { values: ['9'] });
    await run(`tk:rmu:${TID}`, api, { values: ['5'] });
    expect(calls.map((c) => c.body)).toEqual([
      { action: 'add_access', targetId: '5', kind: 'USER', minutes: 60 }, { action: 'add_access', targetId: '6', kind: 'USER', minutes: 60 },
      { action: 'add_access', targetId: '9', kind: 'ROLE' }, { action: 'remove_access', targetId: '5' },
    ]);
  });

  it('rating via DM: stars, then an optional comment', async () => {
    const { api, calls } = fakeApi({ [`POST /bot/support-tickets/${TID}/rating`]: { thanks: 'Danke!' }, [`POST /bot/support-tickets/${TID}/rating-comment`]: {} });
    const r = await run(`tk:rate:${TID}:4`, api);
    expect(text(r)).toContain('Danke!');
    expect(r.update?.embeds?.[0]?.title).toContain('bewertet');
    expect((await run(`tk:ratec:${TID}`, api)).modal?.id).toBe(`tk:ratecm:${TID}`);
    await run(`tk:ratecm:${TID}`, api, { fields: { comment: 'Super' } });
    expect(calls.map((c) => c.body)).toEqual([{ discordId: ME, stars: 4 }, { discordId: ME, comment: 'Super' }]);
  });

  it('declares which actions open a form', () => {
    const def = interactionFor('tk:x')!.def;
    expect(['ans', 'rename', 'note', 'ratec', 'closem'].every((a) => def.opensModal!([a]))).toBe(true);
    expect(def.opensModal!(['close', TID, 'm'])).toBe(true);
    expect(def.opensModal!(['close', TID, 's'])).toBe(false);
    expect(def.opensModal!(['claim'])).toBe(false);
  });
});

describe('ticket messages in Discord', () => {
  it('builds buttons/selects in rows and never pings anyone who was not asked for', () => {
    const rows = componentsOf(Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, label: `B${i}`, style: 'secondary' as const })), [{ id: 's', placeholder: 'Wahl', kind: 'string', max: 5, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }] }]);
    expect(rows.map((r) => r.components.length)).toEqual([1, 5, 2]);
    expect(rows[0]!.toJSON().components[0]).toMatchObject({ custom_id: 's', max_values: 2 }); // nicht mehr als Optionen
    const user = componentsOf([], [{ id: 'u', placeholder: 'Benutzer', kind: 'user', max: 10 }]);
    expect(user[0]!.toJSON().components[0]).toMatchObject({ type: 5, max_values: 10 });
    const p = payloadOf({ content: '<@1> @everyone', embeds: [{ title: 'T' }], mentionUsers: ['1'] });
    expect(p.allowedMentions).toEqual({ parse: [], users: ['1'], roles: [] });
  });
});

describe('ticket runtime', () => {
  function fakeClient() {
    const log: string[] = [];
    const channel = {
      id: CH, type: ChannelType.GuildText,
      send: vi.fn(async (m: { content?: string }) => { log.push(`send ${m.content ?? '(embed)'}`); return { id: `M${log.length}` }; }),
      setName: vi.fn(async (n: string) => { log.push(`rename ${n}`); }),
      delete: vi.fn(async () => { log.push('delete'); }),
      permissionOverwrites: { edit: vi.fn(async (id: string, p: Record<string, boolean>) => { log.push(`perm ${id} view=${p.ViewChannel}`); }), delete: vi.fn(async (id: string) => { log.push(`perm-del ${id}`); }) },
      messages: { fetch: vi.fn(async () => null) },
    };
    const guild = {
      roles: { everyone: { id: GUILD } },
      channels: { create: vi.fn(async (o: { name: string; parent?: string }) => { log.push(`create ${o.name} ${o.parent ?? '-'}`); return channel; }), fetch: vi.fn(async () => null) },
    };
    const client = { user: { id: 'BOT' }, guilds: { fetch: async () => guild }, channels: { fetch: async () => channel }, users: { fetch: async () => ({ send: async () => undefined }) } };
    return { client: () => client as never, log, guild, channel };
  }

  it('creates the channel, posts the control message and reports it back', async () => {
    const { client, log } = fakeClient();
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/': {}, 'GET /bot/support-tickets/channels': [] });
    const rt = createTicketRuntime(client, api, () => undefined);
    const res = await rt.apply([{ type: 'create', ticketId: TID, guildId: GUILD, parentId: null, name: 'support-max', topic: 'Ticket #0001', viewers: [{ id: ME, kind: 'user', send: true }], control: { content: '<@1>', embeds: [{ title: 'Ticket' }] }, messages: [{ content: 'Frage 1' }] }]);
    expect(res.channelId).toBe(CH);
    expect(log).toEqual(['create support-max -', 'send <@1>', 'send Frage 1']);
    expect(calls.at(-1)).toMatchObject({ path: `/bot/support-tickets/${TID}/channel`, body: { channelId: CH, controlMessageId: 'M2' } });
    expect(rt.isTicketChannel(CH)).toBe(true);
  });

  it('a failed creation aborts the ticket in the system and explains the missing bot rights', async () => {
    const { client, guild } = fakeClient();
    guild.channels.create.mockRejectedValueOnce(new Error('Missing Permissions'));
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/': {} });
    const rt = createTicketRuntime(client, api, () => undefined);
    await expect(rt.apply([{ type: 'create', ticketId: TID, guildId: GUILD, parentId: null, name: 'x', topic: '', viewers: [], control: {}, messages: [] }])).rejects.toThrow('Kanäle verwalten');
    expect(calls.at(-1)).toMatchObject({ path: `/bot/support-tickets/${TID}/abort` });
  });

  it('applies access/rename effects, keeps going after a failing effect, and only deletes known ticket channels', async () => {
    const { client, log, channel } = fakeClient();
    channel.setName.mockRejectedValueOnce(new Error('rate limited'));
    const { api } = fakeApi({ 'GET /bot/support-tickets/channels': [] });
    const logs: string[] = [];
    const rt = createTicketRuntime(client, api, (m) => logs.push(m));
    await rt.apply([
      { type: 'rename', channelId: CH, name: 'closed-0001' },
      { type: 'access', channelId: CH, targetId: ME, kind: 'user', view: false },
      { type: 'access', channelId: CH, targetId: 'R', kind: 'role', view: null },
      { type: 'delete', channelId: CH, delayMs: 0 },
    ]);
    expect(log).toEqual([`perm ${ME} view=false`, 'perm-del R']);
    expect(logs.some((l) => l.includes('rename fehlgeschlagen'))).toBe(true);
    expect(logs.some((l) => l.includes('verweigert'))).toBe(true);
  });

  it('records messages only in ticket channels', async () => {
    const { client } = fakeClient();
    const { api, calls } = fakeApi({ 'GET /bot/support-tickets/channels': [CH], 'POST /bot/support-tickets/messages': {} });
    const rt = createTicketRuntime(client, api, () => undefined);
    await rt.refresh();
    const msg = (channelId: string) => ({ inGuild: () => true, channelId, id: 'm1', content: 'Hallo', author: { id: ME, bot: false, username: 'max', globalName: 'Max', displayAvatarURL: () => 'https://cdn/a.png' }, member: null, attachments: new Map([['a', { name: 'bild.png', url: 'https://cdn/b.png', size: 10, contentType: 'image/png' }]]), embeds: [] });
    await rt.onMessage(msg('other') as never);
    await rt.onMessage(msg(CH) as never);
    const posts = calls.filter((c) => c.path === '/bot/support-tickets/messages');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.body).toMatchObject({ channelId: CH, authorName: 'Max', content: 'Hallo', attachments: [{ name: 'bild.png', contentType: 'image/png' }] });
  });
});

describe('outbox: ticket effects from the dashboard', () => {
  it('runs the effects and acknowledges; a failure is reported instead of stopping the loop', async () => {
    const acks: unknown[] = [];
    const items = [
      { id: 'o1', type: 'ticket.effects', channelKey: 'tickets', payload: { effects: [{ type: 'rename', channelId: CH, name: 'a' }] } },
      { id: 'o2', type: 'ticket.effects', channelKey: 'tickets', payload: { effects: [{ type: 'rename', channelId: CH, name: 'boom' }] } },
    ];
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(_m, path, body) {
        if (path === '/bot/config') return {} as never;
        if (path.startsWith('/bot/outbox?')) return items as never;
        acks.push({ path, ...(body as object) }); return undefined as never;
      },
    };
    const seen: string[] = [];
    const n = await pollOnce(api, async () => { throw new Error('no channel posts'); }, () => undefined, undefined, undefined, undefined, undefined, async (effects) => {
      const name = (effects[0] as { name: string }).name;
      if (name === 'boom') throw new Error('Missing Access');
      seen.push(name);
    });
    expect(n).toBe(1);
    expect(seen).toEqual(['a']);
    expect(acks).toEqual([{ path: '/bot/outbox/o1/ack', ok: true }, { path: '/bot/outbox/o2/ack', ok: false, error: 'Missing Access' }]);
  });
});

describe('/support command', () => {
  const CAT2 = '44444444-4444-4444-8444-444444444444';
  const cats = [{ id: CAT, name: 'Support', emoji: '🎫', description: 'Hilfe', requiredRoleIds: [], allowedUserIds: [] }, { id: CAT2, name: 'Team intern', emoji: null, description: '', requiredRoleIds: ['R-TEAM'], allowedUserIds: [] }];
  const cmd = async (api: Api, extra: Partial<Ctx> = {}) => {
    return byName('support')!.run({ discordId: ME, opts: {}, api, guildId: GUILD, channelId: CH, userName: 'Max', memberRoleIds: ['R1'], ...extra } as Ctx);
  };
  it('opens directly when only one ticket type fits; otherwise offers a menu of the allowed types', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/support-tickets/categories': cats, 'POST /bot/support-tickets/open': { effects: [] } });
    const applyEffects = vi.fn(async () => ({ channelId: '999' }));
    expect(text(await cmd(api, { applyEffects }))).toContain('<#999>'); // „Team intern“ braucht eine Rolle → nur Support
    expect(calls.at(-1)).toMatchObject({ path: '/bot/support-tickets/open', body: { categoryId: CAT, discordId: ME } });
    const menu = await cmd(api, { applyEffects, memberRoleIds: ['R-TEAM'] });
    expect(menu.select).toMatchObject({ id: 'tk:open:cmd', options: [{ value: CAT, label: 'Support', emoji: '🎫' }, { value: CAT2 }] });
    expect(text(await cmd(api, { guildId: undefined }))).toContain('nur auf einem Server');
  });
  it('staff open a ticket for another member with their own rights (no role/limit checks for the member)', async () => {
    const OTHER = '555555555555555555';
    const { api, calls } = fakeApi({ 'GET /bot/support-tickets/categories': cats, 'POST /support-tickets': { effects: [{ type: 'post', channelId: CH, message: {} }] } });
    const menu = await cmd(api, { opts: { mitglied: OTHER } });
    expect(menu.select?.id).toBe(`tk:for:${OTHER}`);
    expect(menu.select?.options).toHaveLength(2); // alle Arten
    const applyEffects = vi.fn(async () => ({ channelId: '777' }));
    const r = await run(`tk:for:${OTHER}`, api, { values: [CAT2], applyEffects, userNameOf: async () => 'Oscar' });
    expect(text(r)).toContain(`<@${OTHER}>`);
    expect(calls.at(-1)).toMatchObject({ kind: 'user', method: 'POST', path: '/support-tickets', body: { categoryId: CAT2, discordId: OTHER, discordName: 'Oscar', guildId: GUILD } });
    // ohne Recht: deutsche Meldung des Systems bzw. Standard-Fehler
    const denied = fakeApi({ 'POST /support-tickets': new BotApiError(403, 'PERMISSION_DENIED', 'Missing permission') });
    expect(text(await run(`tk:for:${OTHER}`, denied.api, { values: [CAT], applyEffects }))).not.toContain('<#');
  });
});

describe('GalaxyBot-like ticket features in Discord', () => {
  it('answer form uses the character limits of the question', async () => {
    const { api } = fakeApi({});
    const m = (await run(`tk:ans:${TID}:name:s:5-40`, api)).modal!;
    expect(m.fields[0]).toMatchObject({ minLength: 5, maxLength: 40, paragraph: false });
    expect((await run(`tk:ans:${TID}:why:l`, api)).modal!.fields[0]).toMatchObject({ maxLength: 2000 });
  });
  it('close request: staff asks, the creator answers with the buttons', async () => {
    const applied: TicketEffect[][] = [];
    const applyEffects = async (e: TicketEffect[]) => { applied.push(e); return {}; };
    const { api, calls } = fakeApi({ [`POST /support-tickets/${TID}/actions`]: { message: 'Der Ersteller wurde gefragt.', effects: [{ type: 'post', channelId: CH, message: { content: 'q' } }] }, [`POST /bot/support-tickets/${TID}/close-request`]: { message: 'Ticket geschlossen – danke!', effects: [{ type: 'post', channelId: CH, message: { content: 'c' } }] } });
    expect(text(await run(`tk:close_request:${TID}`, api, { applyEffects }))).toContain('gefragt');
    expect(calls[0]).toMatchObject({ kind: 'user', body: { action: 'close_request' } });
    const r = await run(`tk:creq:${TID}:yes`, api, { applyEffects });
    expect(text(r)).toContain('geschlossen');
    expect(r.update?.embeds?.[0]?.title).toContain('bestätigt');
    expect(calls[1]).toMatchObject({ kind: 'service', path: `/bot/support-tickets/${TID}/close-request`, body: { discordId: ME, accept: true } });
    expect(applied).toHaveLength(2);
  });
  it('the creator adds a person when they have no staff rights (if the ticket type allows it)', async () => {
    const { api, calls } = fakeApi({ [`POST /support-tickets/${TID}/actions`]: new BotApiError(403, 'PERMISSION_DENIED', 'nope'), [`POST /bot/support-tickets/${TID}/creator-add`]: { effects: [] } });
    expect(text(await run(`tk:addu:${TID}`, api, { values: ['923456789012345678'] }))).toContain('1 Benutzer');
    expect(calls.at(-1)).toMatchObject({ kind: 'service', body: { discordId: ME, targetId: '923456789012345678' } });
  });
});
