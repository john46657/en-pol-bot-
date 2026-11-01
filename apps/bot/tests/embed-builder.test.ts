import { describe, expect, it } from 'vitest';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Api } from '../src/api';
import { guildInfo } from '../src/guilds';
import { MB_INTERACTION, runMbFetch, runMbSend, type MbDiscord, type MbPayload } from '../src/message-builder';
import { mbDiscord, mbFetchDiscord } from '../src/message-builder-discord';
import { pollOnce } from '../src/outbox';

const ID = '11111111-2222-3333-4444-555555555555';
const GUILD = '480000000000000001', CH = '481000000000000001', FORUM = '481000000000000002', THREAD = '481000000000000003';
const p = (content: string): MbPayload => ({ content, embeds: [], components: [], allowed_mentions: { parse: ['users'] } });
function fakeApi(reply: (path: string) => unknown) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const api: Api = { asUser: async () => { throw new Error('nope'); }, service: async <T,>(method: string, path: string, body?: unknown) => { calls.push({ method, path, body }); return reply(path) as T; } };
  return { api, calls };
}
function fakeDiscord() {
  const log: string[] = [];
  const targets: unknown[] = [];
  const d: MbDiscord = {
    missingPerms: async (_g, _c, _p, t) => { targets.push(t); return []; },
    send: async (c, x) => { log.push(`send ${c} ${x.content}`); return { id: `49000000000000000${log.length}` }; },
    createPost: async (f, name, x) => { log.push(`post ${f} „${name}“ ${x.content}`); return { id: '490000000000000077', channelId: '481000000000000077' }; },
    edit: async (c, m, x) => { log.push(`edit ${c} ${m} ${x.content}`); return { id: m }; },
  };
  return { d, log, targets };
}
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ position: i, payload: p(`N${i + 1}`) }));

describe('Embed Builder im Bot – Ziele und Bearbeiten', () => {
  it('in bestehenden Thread senden: alle Nachrichten in den Thread, Kanal wird gemeldet', async () => {
    const { api, calls } = fakeApi((path) => (path.endsWith('/start') ? { proceed: true, kind: 'SEND', guildId: GUILD, channelId: CH, threadId: THREAD, items: items(2) } : undefined));
    const { d, log, targets } = fakeDiscord();
    await runMbSend(api, ID, d, () => undefined);
    expect(log).toEqual([`send ${THREAD} N1`, `send ${THREAD} N2`]);
    expect(targets[0]).toEqual({ threadId: THREAD, threadName: null, edit: false });
    expect(calls[1]!.body).toEqual({ ok: true, messageId: '490000000000000001', channelId: THREAD });
  });
  it('Forum: erste Nachricht eröffnet den Beitrag, die weiteren gehen hinein', async () => {
    const { api, calls } = fakeApi((path) => (path.endsWith('/start') ? { proceed: true, kind: 'SEND', guildId: GUILD, channelId: FORUM, threadName: 'Dienstanweisung', items: items(2) } : undefined));
    const { d, log } = fakeDiscord();
    await runMbSend(api, ID, d, () => undefined);
    expect(log).toEqual([`post ${FORUM} „Dienstanweisung“ N1`, 'send 481000000000000077 N2']);
    expect(calls[1]!.body).toEqual({ ok: true, messageId: '490000000000000077', channelId: '481000000000000077' });
    expect(calls[2]!.body).toMatchObject({ ok: true, channelId: '481000000000000077' });
  });
  it('EDIT: bearbeitet die gespeicherte Nachricht statt neu zu senden', async () => {
    const { api, calls } = fakeApi((path) => (path.endsWith('/start') ? { proceed: true, kind: 'EDIT', guildId: GUILD, channelId: CH, messageId: '490000000000000555', items: items(1) } : undefined));
    const { d, log, targets } = fakeDiscord();
    await runMbSend(api, ID, d, () => undefined);
    expect(log).toEqual([`edit ${CH} 490000000000000555 N1`]);
    expect(targets[0]).toMatchObject({ edit: true });
    expect(calls[1]!.body).toEqual({ ok: true, messageId: '490000000000000555' });
  });
  it('ältere Discord-Seite ohne Bearbeiten → ehrlicher Fehler, nichts gesendet', async () => {
    const { api, calls } = fakeApi((path) => (path.endsWith('/start') ? { proceed: true, kind: 'EDIT', guildId: GUILD, channelId: CH, messageId: '490000000000000555', items: items(1) } : undefined));
    const { d, log } = fakeDiscord();
    delete d.edit;
    await runMbSend(api, ID, d, () => undefined);
    expect(log).toEqual([]);
    expect(calls[1]!.body).toEqual({ ok: false, error: expect.stringMatching(/nicht unterstützt/) });
  });
});

describe('Embed Builder im Bot – discord.js-Seite', () => {
  const me = { id: 'bot' };
  const perms = (allow: bigint[]) => ({ has: (f: bigint) => allow.includes(f) });
  const all = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ReadMessageHistory];
  const client = (channels: Record<string, unknown>) => ({ user: me, channels: { fetch: async (id: string) => channels[id] ?? null } }) as never;
  const text = { id: CH, guildId: GUILD, type: ChannelType.GuildText, isDMBased: () => false, isSendable: () => true, isThread: () => false, permissionsFor: () => perms(all) };
  const forum = { id: FORUM, guildId: GUILD, type: ChannelType.GuildForum, isDMBased: () => false, isSendable: () => false, isThread: () => false, permissionsFor: () => perms([PermissionFlagsBits.ViewChannel]) };
  it('Rechte: Thread muss zum Kanal gehören; Forum braucht Titel und „Nachrichten senden“; fremder Server', async () => {
    const thread = { id: THREAD, parentId: '489999999999999999', isThread: () => true, archived: false, locked: false, permissionsFor: () => perms(all) };
    const d = mbDiscord(client({ [CH]: text, [FORUM]: forum, [THREAD]: thread }));
    await expect(d.missingPerms(GUILD, CH, [p('x')], { threadId: THREAD })).rejects.toThrow(/gehört nicht zu diesem Kanal/);
    await expect(d.missingPerms(GUILD, FORUM, [p('x')], {})).rejects.toThrow(/Forum-Kanal/);
    expect(await d.missingPerms(GUILD, FORUM, [p('x')], { threadName: 'Neu' })).toEqual(['Beiträge erstellen (Nachrichten senden)']);
    await expect(d.missingPerms('480000000000000099', CH, [p('x')], {})).rejects.toThrow(/nicht zu dem Discord-Server/);
    expect(await d.missingPerms(GUILD, CH, [p('x')], { edit: true })).toEqual([]);
  });
  it('bearbeitet nur eigene Nachrichten des Bots; leerer Text leert den bisherigen', async () => {
    const edits: unknown[] = [];
    const own = { author: { id: 'bot' }, edit: async (b: unknown) => { edits.push(b); return { id: 'm1' }; } };
    const foreign = { author: { id: 'someone' }, edit: async () => ({ id: 'm2' }) };
    const ch = { ...text, isTextBased: () => true, messages: { fetch: async (id: string) => (id === 'm1' ? own : foreign) } };
    const d = mbDiscord(client({ [CH]: ch }));
    await d.edit!(CH, 'm1', { content: undefined, embeds: [{ title: 'T' }], components: [], allowed_mentions: { parse: [] } });
    expect(edits[0]).toMatchObject({ content: '', embeds: [{ title: 'T' }] });
    await expect(d.edit!(CH, 'm2', p('x'))).rejects.toThrow(/nicht vom Bot/);
  });
  it('Nachricht laden: Absender Bot/Webhook/fremd, Discord-JSON, Thread-Elternkanal', async () => {
    const mk = (author: string, webhookId: string | null) => ({ author: { id: author }, webhookId, content: 'Hallo', embeds: [{ toJSON: () => ({ title: 'T', color: 1 }) }], components: [{ toJSON: () => ({ type: 1, components: [{ type: 2, style: 1, custom_id: 'x', label: 'X' }] }) }] });
    const msgs: Record<string, unknown> = { a: mk('bot', null), b: mk('hook', '493000000000000001'), c: mk('user', null) };
    const thread = { ...text, id: THREAD, name: 'Besprechung', isTextBased: () => true, isThread: () => true, parentId: CH, messages: { fetch: async (id: string) => msgs[id] } };
    const f = mbFetchDiscord(client({ [THREAD]: thread }));
    expect(await f.fetch(GUILD, THREAD, 'a')).toEqual({ author: 'bot', channelId: THREAD, parentId: CH, channelName: 'Besprechung', message: { content: 'Hallo', embeds: [{ title: 'T', color: 1 }], components: [{ type: 1, components: [{ type: 2, style: 1, custom_id: 'x', label: 'X' }] }] } });
    expect(await f.fetch(GUILD, THREAD, 'b')).toMatchObject({ author: 'webhook', webhookId: '493000000000000001' });
    expect((await f.fetch(GUILD, THREAD, 'c')).author).toBe('other');
  });
  it('runMbFetch meldet Inhalt bzw. verständlichen Fehler; Outbox kennt mb.fetch', async () => {
    const { api, calls } = fakeApi((path) => (path.startsWith('/bot/message-builder/messages/') && !path.endsWith('/loaded') ? { proceed: true, guildId: GUILD, channelId: CH, messageId: '490000000000000001' } : undefined));
    await runMbFetch(api, ID, { fetch: async () => ({ author: 'bot', channelId: CH, parentId: null, message: { content: 'x', embeds: [], components: [] } }) }, () => undefined);
    expect(calls[1]).toEqual({ method: 'POST', path: `/bot/message-builder/messages/${ID}/loaded`, body: { ok: true, author: 'bot', channelId: CH, parentId: null, message: { content: 'x', embeds: [], components: [] } } });
    const { api: api2, calls: calls2 } = fakeApi((path) => (path.endsWith('/loaded') ? undefined : { proceed: true, guildId: GUILD, channelId: CH, messageId: '1' }));
    await runMbFetch(api2, ID, { fetch: async () => { throw Object.assign(new Error('Unknown Message'), { status: 404, code: 10008 }); } }, () => undefined);
    expect(calls2[1]!.body).toEqual({ ok: false, error: 'Die Nachricht gibt es nicht (mehr).' });
    const tasks: unknown[] = [];
    const ob: Api = { asUser: async () => undefined as never, service: async <T,>(_m: string, path: string) => (path.startsWith('/bot/outbox?') ? [{ id: 'o1', type: 'mb.fetch', channelKey: 'announcements', payload: { id: ID } }] : path === '/bot/config' ? {} : undefined) as T };
    expect(await pollOnce(ob, async () => undefined, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, async (type, payload) => { tasks.push({ type, payload }); return true; })).toBe(1);
    expect(tasks).toEqual([{ type: 'mb.fetch', payload: { id: ID } }]);
  });
});

describe('Embed Builder im Bot – Mehrfachauswahl', () => {
  it('mehrere Aktionen in einer Antwort (Text + Rolle)', async () => {
    const calls: unknown[] = [];
    const api: Api = { asUser: async () => undefined as never, service: async <T,>(_m: string, path: string, body?: unknown) => { calls.push(body); return { type: 'multi', actions: [{ type: 'reply', text: 'Info A' }, { type: 'role', roleId: '482000000000000001', mode: 'add' }] } as T; } };
    const r = await MB_INTERACTION.run({ discordId: '485000000000000001', guildId: GUILD, opts: {}, api, args: [ID], values: ['o1', 'o2'], discord: { setRole: async () => 'added' } } as never);
    expect(r).toEqual({ ephemeral: true, content: 'Info A\n\n✅ Du hast jetzt die Rolle <@&482000000000000001>.' });
    expect(calls[0]).toMatchObject({ values: ['o1', 'o2'], value: 'o1' });
  });
});

describe('Kanalverzeichnis: Foren und aktive Threads', () => {
  it('meldet Foren mit Bot-Rechten und aktive (nicht archivierte) Threads', () => {
    const coll = <T,>(xs: T[]) => ({ values: () => xs.values() });
    const allow = new Set<bigint>([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    const g = {
      id: '1', name: 'EN', iconURL: () => null, members: { me: { id: 'bot' } },
      channels: { cache: coll([
        { id: '21', name: 'forum', type: ChannelType.GuildForum, parentId: null, rawPosition: 2, isThread: () => false, permissionsFor: () => ({ has: (f: bigint) => allow.has(f) }) },
        { id: '22', name: 'Beitrag', type: ChannelType.PublicThread, parentId: '21', isThread: () => true, archived: false },
        { id: '23', name: 'Alt', type: ChannelType.PublicThread, parentId: '21', isThread: () => true, archived: true },
      ]) },
      roles: { cache: coll([]) },
    };
    const info = guildInfo(g as never);
    expect(info.channels.map((c) => c.id)).toEqual(['21']);
    expect(info.forums).toEqual([{ id: '21', bot: { view: true, send: true, embed: true, mentionEveryone: false, createThreads: true } }]);
    expect(info.threads).toEqual([{ id: '22', name: 'Beitrag', parentId: '21' }]);
  });
});
