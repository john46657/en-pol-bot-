import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor, modalFieldsFor, resetFormCache } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import { teamlistEmbed, type Reply } from '../src/format';
import { createLive } from '../src/live';
import { pollOnce } from '../src/outbox';
import type { Platform } from '../src/platform';
import { robloxLookup } from '../src/roblox';

const ME = '123456789012345678', OTHER = '223456789012345678', GUILD = '323456789012345678', CHANNEL = '423456789012345678';
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
function fakePlatform() {
  const log: string[] = [];
  const p: Platform = {
    async setRole(g, u, r, on) { log.push(`role ${g} ${u} ${r} ${on}`); },
    async createTicketChannel(a) { log.push(`ticket ${a.userId} ${a.categoryId ?? '-'} ${a.staffRoleId ?? '-'}`); return { channelId: 'T1', existing: false }; },
    async deleteChannel(id, ms) { log.push(`delete ${id} ${ms}`); },
    async sendDirectMessage(u, t) { log.push(`dm ${u} ${t}`); },
    async postOrEdit(a) { log.push(`post ${a.channelId} ${a.messageId ?? 'new'}`); return a.messageId ?? 'M-new'; },
    async postPanel(a) { log.push(`panel ${a.channelId} ${a.buttons.map((b) => b.id).join(',')}`); },
  };
  return { p, log };
}
const ctx = (api: Api, extra: Partial<Ctx> = {}): Ctx => ({ discordId: ME, opts: {}, api, guildId: GUILD, channelId: CHANNEL, isGuildAdmin: false, ...extra });
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''} ${e.fields?.map((f) => `${f.name} ${f.value}`).join(' ') ?? ''}`).join(' ') ?? ''}`;

describe('/gefahrenstatus', () => {
  it('shows and sets the level with the user\'s rights and redraws the panel', async () => {
    const { api, calls } = fakeApi({ 'GET /danger-level': { level: 'YELLOW', reason: 'Bankraub', setByName: 'Chief' }, 'PUT /danger-level': (b: { level: string }) => ({ level: b.level }) });
    expect(text(await byName('gefahrenstatus')!.run(ctx(api)))).toContain('Gelb');
    const refreshLive = vi.fn(async () => null);
    const r = await byName('gefahrenstatus')!.run(ctx(api, { opts: { aktion: 'setzen', stufe: 'rot', grund: 'Schüsse' }, refreshLive }));
    expect(text(r)).toContain('Rot');
    expect(calls.at(-1)).toMatchObject({ kind: 'user', method: 'PUT', body: { level: 'RED', reason: 'Schüsse' } });
    expect(refreshLive).toHaveBeenCalledWith('danger');
  });
  it('buttons set the level; unknown levels are rejected; posting the panel needs Discord server rights', async () => {
    const { api, calls } = fakeApi({ 'PUT /danger-level': (b: { level: string }) => ({ level: b.level }), 'GET /danger-level': { level: 'GREEN' } });
    const hit = interactionFor('danger:set:GREEN')!;
    expect(text(await hit.def.run({ ...ctx(api), args: hit.args }))).toContain('Grün');
    expect(text(await hit.def.run({ ...ctx(api), args: ['set', 'PURPLE'] }))).toContain('Unbekannte');
    expect(calls).toHaveLength(1);
    const refreshLive = vi.fn(async () => ({ channelId: CHANNEL, messageId: 'M' }));
    expect(text(await byName('gefahrenstatus')!.run(ctx(api, { opts: { aktion: 'panel' }, refreshLive })))).toContain('Server verwalten');
    expect(refreshLive).not.toHaveBeenCalled();
    expect(text(await byName('gefahrenstatus')!.run(ctx(api, { opts: { aktion: 'panel' }, refreshLive, isGuildAdmin: true })))).toContain('gepostet');
    expect(refreshLive).toHaveBeenCalledWith('danger', { channelId: CHANNEL, force: true });
  });
  it('maps an unlinked button user to the linking hint', async () => {
    const { api } = fakeApi({ 'PUT /danger-level': new BotApiError(401, 'UNAUTHENTICATED', 'x', undefined, 'NOT_LINKED') });
    expect(text(await interactionFor('danger:set:RED')!.def.run({ ...ctx(api), args: ['set', 'RED'] }))).toContain('/verknuepfen');
  });
});

describe('/funkfreigabe', () => {
  it('adds a member by Discord id and syncs the configured radio role', async () => {
    const { api, calls } = fakeApi({ 'POST /radio-whitelist': { displayName: 'Oscar' } });
    const { p, log } = fakePlatform();
    const r = await byName('funkfreigabe')!.run(ctx(api, { opts: { aktion: 'hinzufuegen', mitglied: OTHER }, platform: p, config: async () => ({ radioRole: '999999999999999999' }) }));
    expect(calls[0]).toMatchObject({ kind: 'user', path: '/radio-whitelist', body: { discordId: OTHER } });
    expect(log).toEqual([`role ${GUILD} ${OTHER} 999999999999999999 true`]);
    expect(text(r)).toContain('freigegeben');
  });
  it('remove/check/list hit the right routes; role errors are only a warning; a member is required', async () => {
    const { api, calls } = fakeApi({ 'POST /radio-whitelist/remove': { displayName: 'Oscar' }, 'GET /radio-whitelist/check': { whitelisted: false, displayName: 'Oscar' }, 'GET /radio-whitelist': [{ displayName: 'Oscar', callsign: 'ADAM-1' }] });
    const p = { ...fakePlatform().p, async setRole() { throw new Error('Missing Permissions'); } };
    const removed = await byName('funkfreigabe')!.run(ctx(api, { opts: { aktion: 'entfernen', mitglied: OTHER }, platform: p, config: async () => ({ radioRole: '999999999999999999' }) }));
    expect(text(removed)).toContain('entfernt');
    expect(text(removed)).toContain('Rolle konnte nicht');
    expect(text(await byName('funkfreigabe')!.run(ctx(api, { opts: { aktion: 'pruefen', mitglied: OTHER } })))).toContain('nicht');
    expect(calls.at(-1)!.path).toBe(`/radio-whitelist/check?discordId=${OTHER}`);
    expect(text(await byName('funkfreigabe')!.run(ctx(api, { opts: { aktion: 'liste' } })))).toContain('ADAM-1');
    expect(text(await byName('funkfreigabe')!.run(ctx(api, { opts: { aktion: 'hinzufuegen' } })))).toContain('Mitglied angeben');
  });
});

describe('/bewerbung', () => {
  beforeEach(() => resetFormCache());
  const form = [
    { key: 'age', label: 'Age', required: true, maxLength: 3 }, { key: 'motivation', label: 'Motivation', required: true, maxLength: 3000 },
    { key: 'extra1', label: 'Extra 1', required: false, maxLength: 100 }, { key: 'extra2', label: 'Extra 2', required: false, maxLength: 100 }, { key: 'extra3', label: 'Extra 3', required: false, maxLength: 100 },
  ];
  it('fits the configured form into a Discord modal (max 5 inputs, required fields first)', () => {
    const f = modalFieldsFor(form)!;
    expect(f.map((x) => x.id)).toEqual(['f_age', 'f_motivation', 'f_extra1', 'f_extra2']);
    expect(f[1]).toMatchObject({ paragraph: true, required: true });
    expect(modalFieldsFor(Array.from({ length: 5 }, (_, i) => ({ key: `k${i}`, label: 'x', required: true, maxLength: 10 })))).toBeNull();
  });
  it('opens a modal and submits it via the bot service route with the Discord id', async () => {
    const { api, calls } = fakeApi({ 'GET /applications/form': form, 'POST /bot/application': { number: 'APP-1' } });
    const r = await byName('bewerbung')!.run(ctx(api));
    expect(byName('bewerbung')!.opensModal).toBe(true);
    expect(r.modal!.fields.map((f) => f.id)).toEqual(['roblox', 'f_age', 'f_motivation', 'f_extra1', 'f_extra2']);
    const hit = interactionFor(r.modal!.id)!;
    const done = await hit.def.run({ ...ctx(api), args: hit.args, fields: { roblox: ' builderman ', f_age: '18', f_motivation: 'Helfen', f_extra1: '' }, robloxLookup: async () => ({ id: 156, name: 'Builderman', displayName: 'Builderman' }) });
    expect(text(done)).toContain('APP-1');
    expect(calls.at(-1)).toMatchObject({ kind: 'service', path: '/bot/application', body: { robloxUsername: 'Builderman', robloxUserId: '156', discordId: ME, answers: { age: '18', motivation: 'Helfen', extra1: '' } } });
  });
  it('explains an already open application', async () => {
    const { api } = fakeApi({ 'POST /bot/application': new BotApiError(409, 'CONFLICT', 'open') });
    expect(text(await interactionFor('bewerbung:submit')!.def.run({ ...ctx(api), args: ['submit'], fields: { roblox: 'x' } }))).toContain('bereits eine offene');
  });
});

describe('support tickets', () => {
  it('panel needs server rights; opening creates a private channel with category/staff role; closing deletes it', async () => {
    const { api } = fakeApi({});
    const { p, log } = fakePlatform();
    expect(text(await byName('supportpanel')!.run(ctx(api, { platform: p })))).toContain('Server verwalten');
    await byName('supportpanel')!.run(ctx(api, { platform: p, isGuildAdmin: true, config: async () => ({ staffRole: '5' }) }));
    expect(log).toEqual([`panel ${CHANNEL} support:open`]);
    const open = interactionFor('support:open')!;
    const r = await open.def.run({ ...ctx(api, { platform: p, config: async () => ({ tickets: 'CAT', staffRole: 'STAFF' }) }), args: open.args });
    expect(text(r)).toContain('<#T1>');
    expect(log.slice(1)).toEqual([`ticket ${ME} CAT STAFF`, 'panel T1 support:close']);
    await interactionFor('support:close')!.def.run({ ...ctx(api, { platform: p, channelId: 'T1' }), args: ['close'] });
    expect(log.at(-1)).toBe('delete T1 5000');
  });
});

describe('live messages', () => {
  it('posts once, stores where, then only edits when the content changed', async () => {
    let level = 'GREEN';
    const state: Record<string, unknown> = {};
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(method, path, body) {
        if (path === '/bot/danger') return { level } as never;
        if (path.startsWith('/bot/state/')) { const k = path.slice(11); if (method === 'PUT') { state[k] = (body as { value: unknown }).value; return undefined as never; } return { value: state[k] ?? null } as never; }
        throw new Error(path);
      },
    };
    const { p, log } = fakePlatform();
    const live = createLive(api, p);
    expect(await live.refresh('danger')).toBeNull(); // noch kein Ort bekannt
    await live.refresh('danger', { channelId: 'C' });
    expect(state['danger-panel']).toEqual({ channelId: 'C', messageId: 'M-new' });
    await live.refresh('danger');
    expect(log).toEqual(['post C new']); // unverändert → nichts bearbeitet
    level = 'RED';
    await live.refresh('danger');
    expect(log).toEqual(['post C new', 'post C M-new']);
  });
  it('teamlist prefers the configured channel and groups members by rank order', async () => {
    const state: Record<string, unknown> = {};
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(method, path, body) {
        if (path === '/bot/config') return { teamlist: 'TL' } as never;
        if (path === '/bot/team') return { rankOrder: ['Chief', 'Officer'], members: [{ name: 'Bob', rank: 'Officer', callsign: 'A-2', team: null, dutyStatus: 'ON_DUTY', unit: null }, { name: 'Ann', rank: 'Chief', callsign: 'A-1', team: null, dutyStatus: 'OFF_DUTY', unit: null }] } as never;
        if (path.startsWith('/bot/state/')) { const k = path.slice(11); if (method === 'PUT') { state[k] = (body as { value: unknown }).value; return undefined as never; } return { value: state[k] ?? null } as never; }
        throw new Error(path);
      },
    };
    const { p, log } = fakePlatform();
    await createLive(api, p).refresh('teamlist');
    expect(log).toEqual(['post TL new']);
    const e = teamlistEmbed([{ name: 'Bob', rank: 'Officer', callsign: 'A-2', team: null, dutyStatus: 'ON_DUTY', unit: null }, { name: 'Ann', rank: 'Chief', callsign: 'A-1', team: null, dutyStatus: 'OFF_DUTY', unit: null }], ['Chief', 'Officer']);
    expect(e.fields!.map((f) => f.name)).toEqual(['Chief (1)', 'Officer (1)']);
    expect(e.footer).toContain('1 im Dienst');
  });
});

describe('application decision DM', () => {
  it('sends the decision as a direct message (without the internal reason) and acknowledges', async () => {
    const acks: boolean[] = [];
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(_m, path, body) {
        if (path === '/bot/config') return {} as never;
        if (path.startsWith('/bot/outbox?')) return [{ id: 'd1', type: 'application.decided', channelKey: 'applications', payload: { discordId: OTHER, status: 'ACCEPTED', number: 'APP-7' } }, { id: 'd2', type: 'application.decided', channelKey: 'applications', payload: { discordId: OTHER, status: 'REJECTED', number: 'APP-8' } }] as never;
        acks.push((body as { ok: boolean }).ok); return undefined as never;
      },
    };
    const dms: string[] = [];
    const n = await pollOnce(api, async () => { throw new Error('no channel sends expected'); }, () => undefined, async (u, t) => { if (t.includes('APP-8')) throw new Error('Cannot send messages to this user'); dms.push(`${u} ${t}`); });
    expect(n).toBe(1);
    expect(dms[0]).toContain('angenommen');
    expect(acks).toEqual([true, false]);
  });
});

describe('roblox lookup', () => {
  it('returns the user, null for invalid names, and null on errors', async () => {
    const ok = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 1, name: 'Roblox', displayName: 'Roblox' }] }) }));
    expect(await robloxLookup('Roblox', ok as never)).toEqual({ id: 1, name: 'Roblox', displayName: 'Roblox' });
    expect(await robloxLookup('no spaces allowed', ok as never)).toBeNull();
    expect(ok).toHaveBeenCalledTimes(1);
    expect(await robloxLookup('Roblox', (async () => { throw new Error('down'); }) as never)).toBeNull();
  });
});
