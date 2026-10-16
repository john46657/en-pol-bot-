import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { RADIO_WHITELIST_COMMANDS, RADIO_WHITELIST_INTERACTION } from '../src/commands/radio-whitelist';
import { interactionFor } from '../src/commands/features';
import { createRadioRoleSync } from '../src/radio-roles';

const ME = '123456789012345678', G = '870000000000000001', ROLE = '871000000000000002';
function fakeApi(routes: Record<string, unknown | ((body: unknown) => unknown)>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const api: Api = {
    async asUser() { throw new Error('nicht benutzt'); },
    async service<T>(method: string, path: string, body?: unknown) {
      calls.push({ method, path, body });
      const r = routes[`${method} ${path}`];
      if (r === undefined) throw new Error(`unexpected ${method} ${path}`);
      const v = typeof r === 'function' ? (r as (b: unknown) => unknown)(body) : r;
      if (v instanceof Error) throw v;
      return v as T;
    },
  };
  return { api, calls };
}
const status = (o: object = {}) => ({ status: null, authorized: false, expiresAt: null, suspendedUntil: null, pendingSince: null, requestsEnabled: true, ...o });
const cmd = (n: string) => RADIO_WHITELIST_COMMANDS.find((c) => c.name === n)!;

describe('/funkantrag', () => {
  it('öffnet das Formular und reicht den Antrag mit Discord-ID ein (auch ohne Dashboard-Konto)', async () => {
    const { api, calls } = fakeApi({ [`GET /bot/radio-whitelist/status/${ME}`]: status(), 'POST /bot/radio-whitelist/requests': { id: 'x', status: 'PENDING' } });
    const r = await cmd('funkantrag').run({ discordId: ME, guildId: G, opts: {}, api });
    expect(r.modal?.id).toBe('rwreq:submit');
    expect(r.modal?.fields.map((f) => f.id)).toEqual(['reason', 'rank', 'department']);
    expect(interactionFor('rwreq:submit')?.def).toBe(RADIO_WHITELIST_INTERACTION);
    const done = await RADIO_WHITELIST_INTERACTION.run({ discordId: ME, guildId: G, userDisplayName: 'Max', opts: {}, api, args: ['submit'], fields: { reason: 'Ich bin neu bei der Streife.', rank: 'PM', department: '' } });
    expect(done.content).toContain('eingegangen');
    expect(calls.at(-1)).toEqual({ method: 'POST', path: '/bot/radio-whitelist/requests', body: { guildId: G, discordId: ME, discordName: 'Max', rank: 'PM', department: null, reason: 'Ich bin neu bei der Streife.' } });
  });
  it('kein Formular bei aktiver Freigabe, Sperre, abgeschalteten Anträgen oder in DMs; Fehler der API verständlich', async () => {
    expect((await cmd('funkantrag').run({ discordId: ME, opts: {}, api: fakeApi({}).api })).content).toContain('Server');
    for (const [s, text] of [[{ authorized: true, status: 'ACTIVE' }, 'bereits'], [{ status: 'SUSPENDED' }, 'gesperrt'], [{ requestsEnabled: false }, 'deaktiviert']] as const) {
      const r = await cmd('funkantrag').run({ discordId: ME, guildId: G, opts: {}, api: fakeApi({ [`GET /bot/radio-whitelist/status/${ME}`]: status(s) }).api });
      expect(r.modal).toBeUndefined();
      expect(r.content ?? r.embeds?.[0]?.description).toContain(text);
    }
    const dup = fakeApi({ 'POST /bot/radio-whitelist/requests': new BotApiError(409, 'CONFLICT', 'Du hast bereits einen offenen Antrag (seit 16.10.2026).') });
    expect((await RADIO_WHITELIST_INTERACTION.run({ discordId: ME, guildId: G, opts: {}, api: dup.api, args: ['submit'], fields: { reason: 'Bitte um Freigabe für den Funk' } })).content).toContain('offenen Antrag');
    const off = fakeApi({ 'POST /bot/radio-whitelist/requests': new BotApiError(503, 'CAPABILITY_UNAVAILABLE', 'Anträge auf Funkfreigabe sind derzeit deaktiviert.') });
    expect((await RADIO_WHITELIST_INTERACTION.run({ discordId: ME, guildId: G, opts: {}, api: off.api, args: ['submit'], fields: { reason: 'Bitte um Freigabe für den Funk' } })).content).toContain('deaktiviert');
    expect((await RADIO_WHITELIST_INTERACTION.run({ discordId: ME, guildId: G, opts: {}, api: off.api, args: ['submit'], fields: { reason: 'kurz' } })).content).toContain('ausführlicher');
  });
  it('/funkstatus zeigt Status und Ablaufdatum', async () => {
    const r = await cmd('funkstatus').run({ discordId: ME, opts: {}, api: fakeApi({ [`GET /bot/radio-whitelist/status/${ME}`]: status({ status: 'ACTIVE', authorized: true, expiresAt: '2026-12-01T00:00:00Z' }) }).api });
    expect(r.embeds?.[0]?.description).toContain('aktiv');
    expect(r.embeds?.[0]?.description).toContain('<t:1796083200:D>');
  });
});

describe('Rollenabgleich (Bot meldet, System entscheidet)', () => {
  const targets = { enabled: true, guildId: G, roleIds: [ROLE], discordIds: ['200000000000000001', '200000000000000009'] };
  it('meldet nur relevante Änderungen; Verlassen des Servers als roleIds = null', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/radio-whitelist/sync-targets': targets, 'POST /bot/radio-whitelist/roles': { changed: 1, failed: 0 } });
    const sync = createRadioRoleSync(api, { members: async () => [] }, () => undefined);
    expect(await sync.memberChanged(G, '300000000000000001', 'X', ['999'], [])).toBe(false); // keine relevante Rolle, nicht gelistet
    expect(await sync.memberChanged('870000000000000099', '300000000000000001', 'X', [ROLE], [])).toBe(false); // anderer Server
    expect(await sync.memberChanged(G, '300000000000000001', 'X', [ROLE], [])).toBe(true);
    expect(await sync.memberChanged(G, '200000000000000001', null, null)).toBe(true);
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { guildId: G, full: false, members: [{ discordId: '300000000000000001', name: 'X', roleIds: [ROLE] }] },
      { guildId: G, full: false, members: [{ discordId: '200000000000000001', name: null, roleIds: null }] },
    ]);
  });
  it('vollständiger Abgleich: relevante Mitglieder + gelistete, die fehlen; aus → nichts', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/radio-whitelist/sync-targets': targets, 'POST /bot/radio-whitelist/roles': { changed: 2, failed: 0 } });
    const sync = createRadioRoleSync(api, { members: async () => [{ id: '200000000000000001', name: 'Anna', roleIds: [] }, { id: '300000000000000002', name: 'Bert', roleIds: [ROLE] }, { id: '300000000000000003', name: 'Cem', roleIds: ['1'] }] }, () => undefined);
    expect(await sync.full()).toMatchObject({ checked: 3, changed: 2 });
    expect(calls.at(-1)!.body).toEqual({ guildId: G, full: true, members: [
      { discordId: '200000000000000001', name: 'Anna', roleIds: [] }, { discordId: '300000000000000002', name: 'Bert', roleIds: [ROLE] }, { discordId: '200000000000000009', roleIds: null },
    ] });
    const off = fakeApi({ 'GET /bot/radio-whitelist/sync-targets': { ...targets, enabled: false } });
    expect(await createRadioRoleSync(off.api, { members: async () => { throw new Error('nicht aufrufen'); } }).full()).toMatchObject({ checked: 0 });
  });
});
