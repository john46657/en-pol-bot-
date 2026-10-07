import { describe, expect, it, vi } from 'vitest';
import { BotApiError, HttpApi, type Api } from '../src/api';
import { byName, COMMANDS, mapError } from '../src/commands';
import { guildIds, loadConfig, parseDotEnv } from '../src/config';
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
const run = (name: string, opts: Record<string, string | number | boolean | undefined>, api: Api) => byName(name)!.run({ discordId: '123456789012345678', opts, api });
const text = (r: { content?: string; embeds?: { title: string; description?: string; fields?: { name: string; value: string }[] }[] }) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''} ${e.fields?.map((f) => `${f.name} ${f.value}`).join(' ') ?? ''}`).join(' ') ?? ''}`;

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
  it('/dienststunden shows own hours, or the team list with „alle“', async () => {
    const { api, calls } = fakeApi({
      'GET /team/me/hours': { users: [{ name: 'Oscar', callsign: 'A-1', minutes: 185, byStatus: { ON_DUTY: 125, BREAK: 60 }, sessions: 2 }] },
      'GET /team/hours': { users: [{ name: 'Oscar', callsign: 'A-1', minutes: 185, byStatus: { ON_DUTY: 125 }, sessions: 2 }, { name: 'Bea', callsign: null, minutes: 30, byStatus: {}, sessions: 1 }] },
    });
    const own = text(await run('dienststunden', {}, api));
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/team/me/hours?days=7' });
    expect(own).toContain('Gesamt: 3 h 05 min');
    expect(own).toContain('ON DUTY: 2 h 05 min');
    const team = text(await run('dienststunden', { tage: 30, alle: true }, api));
    expect(calls[1]).toMatchObject({ path: '/team/hours?days=30' });
    expect(team).toContain('**A-1** (Oscar)');
    expect(team).toContain('**Bea** — 0 h 30 min');
    const none = fakeApi({ 'GET /team/me/hours': { users: [] } });
    expect(text(await run('dienststunden', { tage: 1 }, none.api))).toContain('nicht im Dienst');
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
  it('/ticket legt eine unbekannte Person nach Roblox-Prüfung an – nur mit Recht und nur wenn Roblox sie kennt', async () => {
    const lookup = async (n: string) => (n === 'john150210' ? { id: 4242, name: 'john150210', displayName: 'John' } : null);
    const runWith = (opts: Record<string, string | number>, api: Api, withRoblox = true) => byName('ticket')!.run({ discordId: '123456789012345678', opts, api, ...(withRoblox ? { robloxLookup: lookup } : {}) });
    // 1) unbekannt + bei Roblox vorhanden → angelegt, Ticket ausgestellt
    const ok = fakeApi({ 'GET /persons': { items: [], total: 0 }, 'POST /persons': { id: 'pNew', robloxUsername: 'john150210', robloxUserId: '4242' }, 'POST /tickets': { number: 'T-1' } });
    const r = text(await runWith({ person: 'john150210', grund: 'Speeding' }, ok.api));
    expect(r).toContain('T-1');
    expect(r).toContain('neu angelegt');
    expect(ok.calls.find((c) => c.method === 'POST' && c.path === '/persons')!.body).toEqual({ robloxUsername: 'john150210', robloxUserId: '4242' });
    expect(ok.calls.find((c) => c.path === '/tickets')!.body).toMatchObject({ personId: 'pNew' });
    // 2) bei Roblox unbekannt (Tippfehler) → nichts angelegt
    const typo = fakeApi({ 'GET /persons': { items: [], total: 0 } });
    expect(text(await runWith({ person: 'johnn150210', grund: 'Speeding' }, typo.api))).toContain('bei Roblox gibt es keinen');
    expect(typo.calls.some((c) => c.method === 'POST')).toBe(false);
    // 3) ohne Recht zum Anlegen → verständliche Meldung, kein Ticket
    const denied = fakeApi({ 'GET /persons': { items: [], total: 0 }, 'POST /persons': new BotApiError(403, 'FORBIDDEN', 'no') });
    const d = text(await runWith({ person: 'john150210', grund: 'Speeding' }, denied.api));
    expect(d).toContain('Recht');
    expect(denied.calls.some((c) => c.path === '/tickets')).toBe(false);
    // 4) ohne Roblox-Suche (z. B. nicht verfügbar) bleibt es bei „nicht gefunden“
    const none = fakeApi({ 'GET /persons': { items: [], total: 0 } });
    expect(text(await runWith({ person: 'john150210', grund: 'Speeding' }, none.api, false))).toContain('Keine Person');
    // 5) vorhandene Person wird nicht doppelt angelegt
    const have = fakeApi({ 'GET /persons': { items: [{ id: 'p1', robloxUsername: 'john150210', robloxUserId: '4242' }], total: 1 }, 'POST /tickets': { number: 'T-2' } });
    expect(text(await runWith({ person: 'john150210', grund: 'Speeding' }, have.api))).not.toContain('neu angelegt');
    expect(have.calls.some((c) => c.method === 'POST' && c.path === '/persons')).toBe(false);
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
    const wf = renderOutbox('workflow.message', { title: 'Hoher Einsatz @everyone', text: 'Bank **raub**', color: '#ff0000', workflow: 'Alarm' })!;
    expect(wf.title).not.toMatch(/@everyone/);
    expect(wf.color).toBe(0xff0000);
    expect(wf.footer).toBe('Workflow: Alarm');
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
    expect(acks[1]!.body.error).toBe('C2: Missing Access');
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
      async service(_m, path) { if (!up) throw new BotApiError(0, 'UNREACHABLE', 'The EN Polizei API is not reachable.'); return (path === '/bot/config' ? {} : []) as never; },
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

describe('Discord registration rules', () => {
  it('required options come before optional ones (Discord rejects otherwise) and choices are valid', () => {
    for (const c of COMMANDS) {
      const opts = c.options ?? [];
      const firstOptional = opts.findIndex((o) => !o.required);
      if (firstOptional >= 0) expect(opts.slice(firstOptional).every((o) => !o.required), `${c.name}: required option after optional`).toBe(true);
      for (const o of opts) for (const ch of o.choices ?? []) { expect(ch.name.length).toBeLessThanOrEqual(100); expect(ch.value.length).toBeLessThanOrEqual(100); }
      expect(opts.flatMap((o) => (o.choices ? [o.choices.length] : [])).every((n) => n <= 25)).toBe(true);
    }
  });
  it('/hilfe mentions every command', async () => {
    const { api } = fakeApi({});
    const r = await run('hilfe', {}, api);
    const all = JSON.stringify(r.embeds);
    for (const c of COMMANDS.filter((x) => x.name !== 'hilfe')) expect(all, `/hilfe lacks /${c.name}`).toContain(`/${c.name}`);
    expect(COMMANDS.length).toBeGreaterThanOrEqual(24);
  });
});

describe('extended commands', () => {
  const INC = { id: 'i1', number: 'I-2026-ABC123', title: 'Bank', priority: 'HIGH', status: 'NEW', location: 'Main' };
  it('/profil and /entverknuepfen', async () => {
    const a = fakeApi({ 'GET /auth/me': { displayName: 'Oscar', username: 'officer1', robloxUserId: '9000002', roles: ['Police Member'], permissions: ['a', 'b'], lastLogin: null }, 'DELETE /discord/link': {} });
    expect(text(await run('profil', {}, a.api))).toContain('Oscar');
    expect(text(await run('entverknuepfen', {}, a.api))).toContain('Verknüpfung gelöst');
    expect(a.calls[1]).toMatchObject({ method: 'DELETE', path: '/discord/link' });
  });
  it('/team lists only people who are on duty', async () => {
    const { api } = fakeApi({ 'GET /team/overview': [{ name: 'Oscar', callsign: 'A-11', dutyStatus: 'ON_DUTY', unit: { callsign: 'ADAM-1' }, currentIncident: { number: 'I-1' } }, { name: 'Dina', callsign: 'D-4', dutyStatus: 'OFF_DUTY' }] });
    const t = text(await run('team', {}, api));
    expect(t).toContain('Oscar'); expect(t).toContain('ADAM-1'); expect(t).not.toContain('Dina'); expect(t).toContain('1 von 2');
  });
  it('/einsatzinfo resolves the number and shows details', async () => {
    const { api } = fakeApi({ 'GET /incidents?q=': { items: [INC], total: 1 }, 'GET /incidents/i1': { incident: { ...INC, units: [{ clearedAt: null, unit: { callsign: 'ADAM-1' } }, { clearedAt: 'x', unit: { callsign: 'OLD-9' } }] }, timeline: [{ summary: 'Incident created' }] } });
    const r = text(await run('einsatzinfo', { nummer: 'i-2026-abc123' }, api));
    expect(r).toContain('ADAM-1'); expect(r).not.toContain('OLD-9'); expect(r).toContain('Incident created');
  });
  it('/einsatzstatus uses the close endpoint for "geschlossen" and the status endpoint otherwise', async () => {
    const a = fakeApi({ 'GET /incidents?q=': { items: [INC], total: 1 }, 'POST /dispatch/incidents/i1/close': {}, 'PUT /dispatch/incidents/i1/status': {} });
    await run('einsatzstatus', { nummer: INC.number, status: 'geschlossen' }, a.api);
    expect(a.calls.at(-1)).toMatchObject({ method: 'POST', path: '/dispatch/incidents/i1/close' });
    await run('einsatzstatus', { nummer: INC.number, status: 'vor_ort' }, a.api);
    expect(a.calls.at(-1)).toMatchObject({ method: 'PUT', path: '/dispatch/incidents/i1/status', body: { status: 'ON_SCENE' } });
    expect(text(await run('einsatzstatus', { nummer: INC.number, status: 'quatsch' }, a.api))).toContain('Unbekannter Status');
  });
  it('/einsatzstatus reports unknown/ambiguous incident numbers instead of guessing', async () => {
    const none = fakeApi({ 'GET /incidents?q=': { items: [], total: 0 } });
    expect(text(await run('einsatzstatus', { nummer: 'I-0', status: 'vor_ort' }, none.api))).toContain('nicht gefunden');
    const many = fakeApi({ 'GET /incidents?q=': { items: [INC, { ...INC, id: 'i2', number: 'I-2026-ABC124' }], total: 2 } });
    expect(text(await run('einsatzstatus', { nummer: 'I-2026-ABC', status: 'vor_ort' }, many.api))).toContain('Nicht eindeutig');
    expect(many.calls.some((c) => c.method === 'PUT')).toBe(false);
  });
  it('/einsatzzuweisen assigns the unit', async () => {
    const a = fakeApi({ 'GET /incidents?q=': { items: [INC], total: 1 }, 'GET /dispatch/units': [{ id: 'u1', callsign: 'ADAM-1' }], 'POST /dispatch/incidents/i1/assign': {} });
    expect(text(await run('einsatzzuweisen', { nummer: INC.number, rufzeichen: 'adam-1' }, a.api))).toContain('zugewiesen');
    expect(a.calls.at(-1)).toMatchObject({ path: '/dispatch/incidents/i1/assign', body: { unitId: 'u1' } });
    expect(text(await run('einsatzzuweisen', { nummer: INC.number, rufzeichen: 'zulu' }, a.api))).toContain('Einheit nicht gefunden');
  });
  it('/bericht saves a draft or submits it when requested', async () => {
    const a = fakeApi({ 'POST /reports/r1/submit': {}, 'POST /reports': { id: 'r1', number: 'R-2026-XYZ' } });
    expect(text(await run('bericht', { titel: 'Nachtstreife', text: 'Alles ruhig', typ: 'patrouille' }, a.api))).toContain('Entwurf');
    expect(a.calls[0]!.body).toEqual({ type: 'PATROL', title: 'Nachtstreife', content: { body: 'Alles ruhig' } });
    expect(a.calls.some((c) => c.path.endsWith('/submit'))).toBe(false);
    expect(text(await run('bericht', { titel: 'Nachtstreife', text: 'x', einreichen: true }, a.api))).toContain('eingereicht');
    expect(a.calls.at(-1)!.path).toBe('/reports/r1/submit');
    expect(text(await run('bericht', { titel: 'ab', text: 'x' }, a.api))).toContain('zu kurz');
  });
  it('/beschwerde validates, optionally resolves the person, and creates the complaint', async () => {
    const a = fakeApi({ 'GET /persons': { items: [{ id: 'p1', robloxUsername: 'Bella', robloxUserId: '2' }], total: 1 }, 'POST /complaints': { number: 'C-2026-AAA' } });
    expect(text(await run('beschwerde', { kategorie: 'Verhalten', beschreibung: 'kurz' }, a.api))).toContain('zu kurz');
    expect(text(await run('beschwerde', { kategorie: 'Verhalten', beschreibung: 'Der Beamte war unhöflich.', person: 'bella' }, a.api))).toContain('C-2026-AAA');
    expect(a.calls.at(-1)!.body).toMatchObject({ category: 'Verhalten', subjectId: 'p1' });
  });
  it('/ermittlung, /beweis, /fahndung create records', async () => {
    const a = fakeApi({ 'POST /investigations': { caseNumber: 'CASE-2026-AAA' }, 'POST /evidence': { number: 'E-2026-AAA' }, 'GET /persons': { items: [{ id: 'p1', robloxUsername: 'Cody', robloxUserId: '3' }], total: 1 }, 'POST /wanted': {} });
    expect(text(await run('ermittlung', { titel: 'Bankraub-Serie' }, a.api))).toContain('CASE-2026-AAA');
    expect(text(await run('beweis', { typ: 'Waffe', beschreibung: 'Pistole', fall: 'case-2026-aaa' }, a.api))).toContain('E-2026-AAA');
    expect(a.calls.at(-1)!.body).toMatchObject({ caseRef: 'CASE-2026-AAA' });
    expect(text(await run('fahndung', { person: 'Cody', grund: 'Raub', prioritaet: 'dringend' }, a.api))).toContain('Fahndung');
    expect(a.calls.at(-1)!.body).toEqual({ personId: 'p1', reason: 'Raub', priority: 'URGENT' });
  });
  it('write commands surface permission errors as friendly messages', async () => {
    const a = fakeApi({ 'GET /persons': { items: [{ id: 'p1', robloxUsername: 'Cody', robloxUserId: '3' }], total: 1 }, 'POST /wanted': new BotApiError(403, 'PERMISSION_DENIED', 'x') });
    expect(text(await run('fahndung', { person: 'Cody', grund: 'Raub' }, a.api))).toContain('keine Berechtigung');
  });
  it('/funk sends to the mapped channel; /benachrichtigungen lists unread', async () => {
    const a = fakeApi({ 'POST /communication/channels/DISPATCH/messages': {}, 'GET /notifications': { items: [{ title: 'Assigned to I-1' }], unread: 3 } });
    await run('funk', { kanal: 'dispatch', text: 'Einheit 5 verfügbar' }, a.api);
    expect(a.calls[0]).toMatchObject({ path: '/communication/channels/DISPATCH/messages', body: { body: 'Einheit 5 verfügbar' } });
    expect(text(await run('funk', { kanal: 'announcement', text: 'x' }, a.api))).toContain('Unbekannter Kanal');
    expect(text(await run('benachrichtigungen', {}, a.api))).toContain('Assigned to I-1');
  });
});

describe('.env support', () => {
  it('parses KEY=VALUE lines, comments and quotes', () => {
    expect(parseDotEnv('# c\nDISCORD_TOKEN="abc"\nAPI_URL=https://x.y\n  BAD LINE\nOUTBOX_POLL_SECONDS = 7\n')).toEqual({ DISCORD_TOKEN: 'abc', API_URL: 'https://x.y', OUTBOX_POLL_SECONDS: '7' });
  });
  it('rejects template placeholders with a clear message instead of a Discord error', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 'HIER_BOT_TOKEN_EINFUEGEN', DISCORD_GUILD_ID: 'HIER_SERVER_ID_EINFUEGEN', BOT_API_TOKEN: 'y'.repeat(32) })).toThrow(/DISCORD_TOKEN, DISCORD_GUILD_ID.*HIER_/);
  });
});

describe('multiple servers', () => {
  it('accepts one or several guild ids (comma/space separated) and de-duplicates', () => {
    const cfg = loadConfig({ DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'y'.repeat(32), DISCORD_GUILD_ID: '1213940450260684801, 1213940450260684802;1213940450260684801' });
    expect(guildIds(cfg)).toEqual(['1213940450260684801', '1213940450260684802']);
    expect(guildIds(loadConfig({ DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'y'.repeat(32) }))).toEqual([]);
    expect(() => loadConfig({ DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'y'.repeat(32), DISCORD_GUILD_ID: '123,abc' })).toThrow(/DISCORD_GUILD_ID/);
  });
  it('outbox posts to every configured channel; succeeds if at least one is reachable; fails (retry) only if none is', async () => {
    const item = { id: 'o1', type: 'announcement', channelKey: 'announcements', payload: { body: 'hi', author: 'A' } };
    const acks: boolean[] = [];
    const api: Api = {
      async asUser() { throw new Error('unused'); },
      async service(_m, path, body) {
        if (path === '/bot/config') return { announcements: '111111111111111111, 222222222222222222' } as never;
        if (path.startsWith('/bot/outbox?')) return [item] as never;
        acks.push((body as { ok: boolean }).ok); return undefined as never;
      },
    };
    const sent: string[] = [];
    expect(await pollOnce(api, async (ch) => { sent.push(ch); }, () => undefined)).toBe(1);
    expect(sent).toEqual(['111111111111111111', '222222222222222222']);
    sent.length = 0;
    expect(await pollOnce(api, async (ch) => { if (ch.startsWith('2')) throw new Error('Missing Access'); sent.push(ch); }, () => undefined)).toBe(1); // ein Channel reicht
    expect(await pollOnce(api, async () => { throw new Error('Missing Access'); }, () => undefined)).toBe(0);
    expect(acks).toEqual([true, true, false]);
  });
});

describe('placeholders inside a list', () => {
  it('flags a leftover HIER_ placeholder even when it is not at the start of the value', () => {
    expect(() => loadConfig({ DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'y'.repeat(32), DISCORD_GUILD_ID: '1213940450260684801,HIER_ZWEITE_SERVER_ID_EINFUEGEN' })).toThrow(/noch ausfüllen: DISCORD_GUILD_ID/);
  });
});
