import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import type { Reply } from '../src/format';
import { createVerify, type VerifyActions } from '../src/verify';

const ME = '123456789012345678', OTHER = '223456789012345678', GUILD = '323456789012345678';
type Call = { method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    calls.push({ method, path, body });
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) throw new BotApiError(404, 'NOT_FOUND', 'no route');
    const r = routes[key];
    if (r instanceof BotApiError) throw r;
    return typeof r === 'function' ? (r as (b: unknown) => unknown)(body) : r;
  };
  const api: Api = { async asUser(_d, m, p, b) { return resolve(m, p, b) as never; }, async service(m, p, b) { return resolve(m, p, b) as never; } };
  return { api, calls };
}
const text = (r: Reply) => [r.content ?? '', ...(r.embeds ?? []).map((e) => `${e.title} ${e.description ?? ''} ${(e.fields ?? []).map((f) => f.value).join(' ')}`)].join(' ');
const link = { discordId: ME, discordName: 'me', robloxId: '156', robloxName: 'builderman', displayName: 'Builder', verifiedAt: new Date().toISOString(), profileUrl: 'https://www.roblox.com/users/156/profile' };
const actions: VerifyActions = { add: ['R1'], remove: ['R0'], nickname: 'Builder (@builderman)' };

describe('Roblox verification in Discord', () => {
  it('panel button / command open the form; name → code with steps and check button', async () => {
    const start = interactionFor('verify:start')!;
    expect(start.def.opensModal?.(start.args)).toBe(true);
    const modal = await start.def.run({ discordId: ME, opts: {}, api: fakeApi({}).api, args: start.args });
    expect(modal.modal).toMatchObject({ id: 'verify:name', fields: [{ id: 'roblox' }] });
    expect((await byName('verifizieren')!.run({ discordId: ME, opts: {}, api: fakeApi({}).api })).modal?.id).toBe('verify:name');
    const { api, calls } = fakeApi({ 'POST /bot/verify/start': { code: 'apple blue tiger moon star', expiresAt: new Date(Date.now() + 900_000).toISOString(), roblox: { id: '156', name: 'builderman', displayName: 'Builder', avatarUrl: null, profileUrl: '' } } });
    const name = interactionFor('verify:name')!;
    const r = await name.def.run({ discordId: ME, opts: {}, api, guildId: GUILD, args: name.args, fields: { roblox: ' builderman ' } });
    expect(calls[0]!.body).toEqual({ guildId: GUILD, discordId: ME, roblox: 'builderman' });
    expect(text(r)).toContain('apple blue tiger moon star');
    expect(r.buttons?.map((b) => b.id)).toEqual(['verify:check', 'verify:start']);
    // fachliche Fehler (z. B. Konto nicht gefunden) im Klartext
    const nf = fakeApi({ 'POST /bot/verify/start': new BotApiError(404, 'NOT_FOUND', 'Kein Roblox-Konto „xy“ gefunden.') });
    expect(text(await name.def.run({ discordId: ME, opts: {}, api: nf.api, args: name.args, fields: { roblox: 'xy' } }))).toContain('Kein Roblox-Konto');
  });

  it('check: verified → roles and nickname on this server, problems shown', async () => {
    const { api } = fakeApi({ 'POST /bot/verify/check': { enabled: true, link, actions } });
    const applied: unknown[] = [];
    const c: Ctx & { args: string[] } = { discordId: ME, opts: {}, api, guildId: GUILD, userName: 'me', args: ['check'], verifyApply: async (g, u, a) => { applied.push([g, u, a]); return ['Rolle „Admin“ steht über der Bot-Rolle']; } };
    const r = await interactionFor('verify:check')!.def.run(c);
    expect(applied).toEqual([[GUILD, ME, actions]]);
    expect(text(r)).toContain('Verifiziert als builderman');
    expect(text(r)).toContain('<@&R1>');
    expect(text(r)).toContain('steht über der Bot-Rolle');
    const missing = fakeApi({ 'POST /bot/verify/check': new BotApiError(400, 'VALIDATION_FAILED', 'Die Wörter stehen (noch) nicht in deinem Roblox-Profil.') });
    expect(text(await interactionFor('verify:check')!.def.run({ ...c, api: missing.api }))).toContain('Wörter stehen');
  });

  it('/aktualisieren (others only with Manage Server) and /whois', async () => {
    const { api, calls } = fakeApi({ 'POST /bot/verify/status': { enabled: true, link, actions }, 'GET /bot/verify/whois': { link } });
    const base = { discordId: ME, api, guildId: GUILD, verifyApply: async () => [] };
    expect(text(await byName('aktualisieren')!.run({ ...base, opts: {} }))).toContain('builderman');
    expect(text(await byName('aktualisieren')!.run({ ...base, opts: { mitglied: OTHER } }))).toContain('Server verwalten');
    expect(text(await byName('aktualisieren')!.run({ ...base, opts: { mitglied: OTHER }, isGuildAdmin: true }))).toContain(`<@${OTHER}>`);
    expect(calls.at(-1)!.body).toMatchObject({ discordId: OTHER });
    expect(text(await byName('whois')!.run({ ...base, opts: { mitglied: ME } }))).toContain('156');
    const none = fakeApi({ 'POST /bot/verify/status': { enabled: true, link: null, actions: { add: [], remove: [], nickname: null } } });
    expect((await byName('aktualisieren')!.run({ ...base, api: none.api, opts: {} })).buttons?.[0]?.id).toBe('verify:start');
  });

  it('on join: only when enabled + auto; refresh everywhere after dashboard changes', async () => {
    let cfg = { enabled: true, autoOnJoin: true };
    const { api, calls } = fakeApi({ 'GET /bot/verify/config': () => cfg, 'POST /bot/verify/status': { enabled: true, link: null, actions: { add: ['U'], remove: [], nickname: null } } });
    const applied: string[] = [];
    const v = createVerify(api, { async apply(g, u, a) { applied.push(`${g} ${u} ${a.add.join(',')}`); return []; }, async guildsOf() { return [{ guildId: 'G1', displayName: 'x' }, { guildId: 'G2', displayName: 'x' }]; } }, () => undefined);
    await v.joined({ guildId: GUILD, id: ME, bot: false });
    await v.joined({ guildId: GUILD, id: OTHER, bot: true });
    expect(applied).toEqual([`${GUILD} ${ME} U`]);
    cfg = { enabled: true, autoOnJoin: false }; v.clear();
    await v.joined({ guildId: GUILD, id: ME, bot: false });
    expect(applied).toHaveLength(1);
    await v.refreshEverywhere(ME);
    expect(applied.slice(1)).toEqual([`G1 ${ME} U`, `G2 ${ME} U`]);
    expect(calls.filter((x) => x.path === '/bot/verify/status')).toHaveLength(3);
  });
});
