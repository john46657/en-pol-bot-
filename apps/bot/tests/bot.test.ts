import { describe, expect, it, vi } from 'vitest';
import { BotApiError, HttpApi, type Api } from '../src/api';
import { byName, COMMANDS, mapError } from '../src/commands';
import { loadConfig } from '../src/config';
import { clip, plain, renderOutbox } from '../src/format';
import { pollOnce, startOutboxLoop } from '../src/outbox';

type Call = { kind: 'user' | 'service'; discordId?: string; method: string; path: string; body?: unknown };
/** Fake-API: antwortet anhand (Methode Pfad-Präfix) und protokolliert Aufrufe. */
function fakeApi(routes: Record<string, unknown | ((b: unknown) => unknown)>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) throw new BotApiError(404, 'NOT_FOUND', 'no route');
    const r = routes[key];
    if (r instanceof BotApiError) throw r;
    return typeof r === 'function' ? (r as (b: unknown) => unknown)(body) : r;
  };
  const api: Api = {
    async asUser(discordId, method, path, body) { calls.push({ kind: 'user', discordId, method, path, body }); return resolve(method, path, body) as never; },
    async service(method, path, body) { calls.push({ kind: 'service', method, path, body }); return resolve(method, path, body) as never; },
  };
  return { api, calls };
}
const run = (name: string, opts: Record<string, string | number | undefined>, api: Api) => byName(name)!.run({ discordId: '123456789012345678', opts, api });
const text = (r: { content?: string; embeds?: { title: string; description?: string }[] }) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''}`).join(' ') ?? ''}`;

describe('command definitions', () => {
  it('names are unique, lowercase, within Discord limits', () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of COMMANDS) {
      expect(c.name).toMatch(/^[a-z0-9_-]{1,32}$/);
      expect(c.description.length).toBeLessThanOrEqual(100);
      expect((c.options ?? []).length).toBeLessThanOrEqual(25);
      for (const o of c.options ?? []) { expect(o.name).toMatch(/^[a-z0-9_-]{1,32}$/); expect(o.description.length).toBeLessThanOrEqual(100); }
    }
  });
});

describe('error mapping', () => {
  it('explains unlinked accounts, permission problems and hides internals', () => {
    expect(text(mapError(new BotApiError(401, 'UNAUTHENTICATED', 'x', 'r1', 'NOT_LINKED')))).toContain('/verknuepfen');
    expect(text(mapError(new BotApiError(403, 'PERMISSION_DENIED', 'secret internal detail')))).toContain('keine Berechtigung');
    expect(text(mapError(new BotApiError(403, 'PERMISSION_DENIED', 'secret internal detail')))).not.toContain('secret');
    expect(text(mapError(new BotApiError(500, 'INTERNAL_ERROR', 'stack trace here', 'req-9')))).toContain('req-9');
    expect(text(mapError(new BotApiError(500, 'INTERNAL_ERROR', 'stack trace here', 'req-9')))).not.toContain('stack trace');
    expect(text(mapError(new BotApiError(0, 'UNREACHABLE', 'down')))).toContain('nicht erreichbar');
    expect(text(mapError(new Error('boom')))).toContain('Unerwarteter Fehler');
  });
});

describe('commands run as the linked user and reply ephemerally', () => {
  it('/verknuepfen uses the service route with the Discord id', async () => {
    const { api, calls } = fakeApi({ 'POST /bot/link': { displayName: 'Oscar', username: 'officer1' } });
    const r = await run('verknuepfen', { code: 'ABCD-EFGH' }, api);
    expect(calls[0]).toMatchObject({ kind: 'service', body: { code: 'ABCD-EFGH', discordId: '123456789012345678' } });
    expect(text(r)).toContain('Oscar');
  });
  it('/verknuepfen reports bad codes without leaking details', async () => {
    const { api } = fakeApi({ 'POST /bot/link': new BotApiError(400, 'VALIDATION_FAILED', 'Invalid or expired code.') });
    expect(text(await run('verknuepfen', { code: 'X' }, api))).toContain('Ungültiger oder abgelaufener Code');
  });
  it('/person finds a person, shows tickets and flags wanted links', async () => {
    const { api, calls } = fakeApi({
      'GET /persons?q=': { items: [{ id: 'p1', robloxUsername: 'Alex_Racer', robloxUserId: '7000001', status: 'ACTIVE', aliases: [] }], total: 1 },
      'GET /persons/p1': { person: { id: 'p1', robloxUsername: 'Alex_Racer', robloxUserId: '7000001', status: 'ACTIVE', aliases: ['AR'], notes: '**bold** @everyone' }, tickets: [{}, {}], links: [{ entityType: 'Wanted' }] },
    });
    const r = await run('person', { suche: 'alex' }, api);
    expect(r.ephemeral).toBe(true);
    expect(calls.every((c) => c.kind === 'user' && c.discordId === '123456789012345678')).toBe(true);
    const e = r.embeds![0] as { fields: { name: string; value: string }[]; footer?: string };
    expect(e.fields.find((f) => f.name === 'Tickets')?.value).toBe('2');
    expect(e.footer).toContain('Fahndung');
    expect(JSON.stringify(e)).not.toContain('@everyone'); // Pings in Nutzerdaten werden entschärft
  });
  it('/person without permission yields a friendly 403 message', async () => {
    const { api } = fakeApi({ 'GET /persons': new BotApiError(403, 'PERMISSION_DENIED', 'nope') });
    expect(text(await run('person', { suche: 'x' }, api))).toContain('keine Berechtigung');
  });
  it('/kennzeichen and /fahndungen format lists; empty states are explicit', async () => {
    const a = fakeApi({ 'GET /vehicles': { items: [{ plate: 'LC1001', model: 'Falcon', color: 'Red', status: 'ACTIVE', owner: { robloxUsername: 'Alex' } }], total: 1 } });
    expect(text(await run('kennzeichen', { kennzeichen: 'LC 1001' }, a.api))).toContain('LC1001');
    expect(a.calls[0]!.path).toContain('LC%201001');
    const b = fakeApi({ 'GET /wanted': { items: [], total: 0 } });
    expect(text(await run('fahndungen', {}, b.api))).toContain('Keine aktiven Fahndungen');
  });
  it('/dienst maps German choices to duty statuses', async () => {
    const { api, calls } = fakeApi({ 'PUT /team/me/status': {} });
    await run('dienst', { status: 'pause' }, api);
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/team/me/status', body: { status: 'BREAK' } });
    expect(text(await run('dienst', { status: 'bogus' }, api))).toContain('Unbekannter Status');
    expect(calls).toHaveLength(1);
  });
  it('/einheitstatus resolves the callsign case-insensitively and rejects unknown units', async () => {
    const { api, calls } = fakeApi({ 'GET /dispatch/units': [{ id: 'u1', callsign: 'ADAM-1', status: 'BUSY' }], 'PUT /dispatch/units/u1/status': {} });
    expect(text(await run('einheitstatus', { rufzeichen: 'adam-1', status: 'verfuegbar' }, api))).toContain('AVAILABLE');
    expect(calls.at(-1)).toMatchObject({ path: '/dispatch/units/u1/status', body: { status: 'AVAILABLE' } });
    expect(text(await run('einheitstatus', { rufzeichen: 'zulu-9', status: 'verfuegbar' }, api))).toContain('nicht gefunden');
  });
  it('/einsatz validates input and maps priorities', async () => {
    const { api, calls } = fakeApi({ 'POST /incidents': { number: 'I-2026-ABC123' } });
    expect(text(await run('einsatz', { titel: 'x' }, api))).toContain('zu kurz');
    expect(calls).toHaveLength(0);
    expect(text(await run('einsatz', { titel: 'Banküberfall', prioritaet: 'kritisch', ort: 'Main St' }, api))).toContain('I-2026-ABC123');
    expect(calls[0]!.body).toMatchObject({ title: 'Banküberfall', priority: 'CRITICAL', location: 'Main St' });
  });
  it('/ticket needs exactly one matching person (name or Roblox id)', async () => {
    const one = fakeApi({ 'GET /persons': { items: [{ id: 'p1', robloxUsername: 'Alex_Racer', robloxUserId: '7000001' }], total: 1 }, 'POST /tickets': { number: 'T-2026-XYZ' } });
    expect(text(await run('ticket', { person: 'alex_racer', grund: 'Speeding', betrag: 300 }, one.api))).toContain('T-2026-XYZ');
    expect(one.calls.at(-1)!.body).toEqual({ personId: 'p1', reason: 'Speeding', amount: 300 });
    const none = fakeApi({ 'GET /persons': { items: [], total: 0 } });
    expect(text(await run('ticket', { person: 'ghost', grund: 'Speeding' }, none.api))).toContain('Keine Person');
    const many = fakeApi({ 'GET /persons': { items: [{ id: 'a', robloxUsername: 'Alex_1', robloxUserId: '1' }, { id: 'b', robloxUsername: 'Alex_2', robloxUserId: '2' }], total: 2 } });
    const r = await run('ticket', { person: 'alex', grund: 'Speeding' }, many.api);
    expect(text(r)).toContain('Nicht eindeutig');
    expect(many.calls.some((c) => c.method === 'POST')).toBe(false); // nie raten
  });
});

describe('formatting', () => {
  it('neutralizes markdown and mass pings, and respects Discord limits', () => {
    expect(plain('@everyone @here **x**')).not.toMatch(/@everyone|@here/);
    expect(clip('a'.repeat(5000), 4096).length).toBe(4096);
    const e = renderOutbox('announcement', { body: '@everyone '.repeat(1000), author: 'Chief' })!;
    expect(e.description!.length).toBeLessThanOrEqual(4096);
    expect(e.description).not.toMatch(/@everyone/);
  });
  it('renders all outbox types and ignores unknown ones', () => {
    expect(renderOutbox('incident.created', { number: 'I-1', title: 'Bank', priority: 'CRITICAL', location: 'Main' })!.title).toContain('Neuer Einsatz');
    expect(renderOutbox('incident.assigned', { number: 'I-1', title: 'Bank', priority: 'HIGH', callsign: 'ADAM-1' })!.title).toContain('ADAM-1');
    expect(renderOutbox('wanted.created', { subject: 'Cody', reason: 'Robbery', priority: 'URGENT', kind: 'person' })!.description).toContain('Cody');
    expect(renderOutbox('mystery', {})).toBeNull();
  });
});

describe('outbox poller', () => {
  const items = [
    { id: '1', type: 'incident.created', channelKey: 'dispatch', payload: { number: 'I-1', title: 'Bank', priority: 'HIGH' } },
    { id: '2', type: 'wanted.created', channelKey: 'wanted', payload: { subject: 'Cody', reason: 'x', priority: 'URGENT', kind: 'person' } },
    { id: '3', type: 'announcement', channelKey: 'announcements', payload: { body: 'hi', author: 'A' } },
  ];
  it('sends to the configured channels and acknowledges; reports failures; skips unconfigured channels', async () => {
    const acks: { path: string; body: { ok: boolean; error?: string } }[] = [];
    const api: Api = {
      async asUser() { throw new Error('not used'); },
      async service(method, path, body) {
        if (path === '/bot/config') return { dispatch: 'C1', wanted: 'C2' } as never; // announcements fehlt
        if (path.startsWith('/bot/outbox?')) return items as never;
        acks.push({ path, body: body as never }); return undefined as never;
      },
    };
    const sent: string[] = [];
    const n = await pollOnce(api, async (ch) => { if (ch === 'C2') throw new Error('Missing Access'); sent.push(ch); }, () => undefined);
    expect(n).toBe(1);
    expect(sent).toEqual(['C1']);
    expect(acks.map((a) => [a.path, a.body.ok])).toEqual([['/bot/outbox/1/ack', true], ['/bot/outbox/2/ack', false], ['/bot/outbox/3/ack', false]]);
    expect(acks[1]!.body.error).toBe('Missing Access');
    expect(acks[2]!.body.error).toContain('not configured');
  });
});

describe('HttpApi', () => {
  it('sends the bot token and Discord id headers, parses API errors, and maps network failures', async () => {
    const fetchMock = vi.fn(async (_u: string, init: { headers: Record<string, string> }) => ({ status: 200, text: async () => JSON.stringify({ ok: init.headers['x-discord-user'] }) }));
    const api = new HttpApi('http://api', 'tok'.repeat(12), fetchMock as never);
    expect(await api.asUser('111111111111111111', 'GET', '/persons')).toEqual({ ok: '111111111111111111' });
    const h = fetchMock.mock.calls[0]![1].headers;
    expect(h.authorization).toBe(`Bot ${'tok'.repeat(12)}`);
    await api.service('GET', '/bot/config');
    expect(fetchMock.mock.calls[1]![1].headers['x-discord-user']).toBeUndefined();
    const bad = new HttpApi('http://api', 'x'.repeat(32), (async () => ({ status: 401, text: async () => JSON.stringify({ code: 'UNAUTHENTICATED', message: 'm', requestId: 'rid', details: { reason: 'NOT_LINKED' } }) })) as never);
    await expect(bad.asUser('1', 'GET', '/x')).rejects.toMatchObject({ status: 401, requestId: 'rid', reason: 'NOT_LINKED' });
    const down = new HttpApi('http://api', 'x'.repeat(32), (async () => { throw new Error('ECONNREFUSED'); }) as never);
    await expect(down.service('GET', '/x')).rejects.toMatchObject({ status: 0, code: 'UNREACHABLE' });
  });
});

describe('config', () => {
  it('requires token and a long shared secret; guild id is optional', () => {
    expect(() => loadConfig({})).toThrow(/DISCORD_TOKEN/);
    expect(() => loadConfig({ DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'short' })).toThrow(/BOT_API_TOKEN/);
    const c = loadConfig({ DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'y'.repeat(32) });
    expect(c.API_URL).toBe('http://localhost:3000');
    expect(c.DISCORD_GUILD_ID).toBeUndefined();
  });
});

describe('outbox loop log noise', () => {
  it('logs an API outage once and the recovery once, not on every poll', async () => {
    vi.useFakeTimers();
    let up = false;
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(_m, path) { if (!up) throw new BotApiError(0, 'UNREACHABLE', 'The ENRP NEXUS API is not reachable.'); return (path === '/bot/config' ? {} : []) as never; },
    };
    const lines: string[] = [];
    const stop = startOutboxLoop(api, async () => undefined, 5, (m) => lines.push(m));
    await vi.advanceTimersByTimeAsync(5000 * 6); // 7 Durchläufe, alle fehlgeschlagen
    expect(lines.filter((l) => l.includes('failed'))).toHaveLength(1);
    up = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(lines.filter((l) => l.includes('restored'))).toHaveLength(1);
    stop();
    vi.useRealTimers();
  });
});
