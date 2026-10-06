import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import { teamlistEmbed, type Reply } from '../src/format';
import { createLive } from '../src/live';
import { dutyRoleChanges, pollOnce } from '../src/outbox';
import type { Platform } from '../src/platform';
import { robloxLookup } from '../src/roblox';
import { parseGermanDate } from '../src/commands/sek';
import { applicationEmbeds, outboxButtons, renderOutbox, renderOutboxEmbeds } from '../src/format';
import { APPLICATION_MS, handleDirectMessage, panelEmbed, resetSessions } from '../src/commands/qualifications';

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
    async sendDm(u, m) { log.push(`dmEmbed ${u} ${m.embed.title} ${(m.buttons ?? []).map((b) => b.id).join(',')}`); return { channelId: 'DM1', messageId: 'M1' }; },
    async postOrEdit(a) { log.push(`post ${a.channelId} ${a.messageId ?? 'new'}`); return a.messageId ?? 'M-new'; },
    async postPanel(a) { log.push(`panel ${a.channelId} ${(a.buttons ?? []).map((b) => b.id).join(',')}${a.select ? ` select:${a.select.id}:${a.select.options.map((o) => o.value).join(',')}` : ''}`); },
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

describe('/bewerbung (Polizei-Bewerbung per Direktnachricht)', () => {
  beforeEach(() => resetSessions());
  const form = [{ key: 'age', label: 'Wie alt bist du?', required: true, maxLength: 3 }, { key: 'extra', label: 'Noch etwas?', required: false, maxLength: 100 }];
  it('/bewerbung and the panel button send the confirmation DM; the panel needs server rights', async () => {
    const { api } = fakeApi({ 'GET /applications/form': form, 'GET /bot/application/open': { open: false, number: null } });
    const { p, log } = fakePlatform();
    const r = await byName('bewerbung')!.run(ctx(api, { platform: p }));
    expect(byName('bewerbung')!.opensModal).toBeFalsy();
    expect(log).toEqual([`dmEmbed ${ME} Bewerbung – EN Polizei quali:start:@polizei,quali:cancel`]);
    expect(r.buttons?.[0]?.url).toContain('/channels/@me/DM1/M1');
    expect(text(await byName('bewerbungspanel')!.run(ctx(api, { platform: p })))).toContain('Server verwalten');
    await byName('bewerbungspanel')!.run(ctx(api, { platform: p, isGuildAdmin: true }));
    expect(log.at(-1)).toBe(`panel ${CHANNEL} quali:pick:@polizei`);
    const posted: string[] = [];
    const withTexts = fakeApi({ 'GET /bot/qualifications': { title: 'Q', intro: '', units: [], police: { title: 'Komm zu uns!', description: 'Jetzt bewerben.' } } });
    await byName('bewerbungspanel')!.run(ctx(withTexts.api, { platform: { ...p, postPanel: async (a) => { posted.push(a.embed.title); } }, isGuildAdmin: true }));
    expect(posted).toEqual(['Komm zu uns!']);
    const open = fakeApi({ 'GET /applications/form': form, 'GET /bot/application/open': { open: true, number: 'APP-9' } });
    expect(text(await byName('bewerbung')!.run(ctx(open.api, { platform: p })))).toContain('APP-9');
  });
  it('asks Roblox name + form questions one by one, optional ones can be skipped, then submits', async () => {
    const { api, calls } = fakeApi({ 'GET /applications/form': form, 'GET /bot/application/open': { open: false }, 'POST /bot/application': { number: 'APP-1' } });
    const { p } = fakePlatform();
    const start = interactionFor('quali:start:@polizei')!;
    await start.def.run({ ...ctx(api, { platform: p }), args: start.args });
    const out: { embed: { description?: string } }[] = [];
    const say = { api, sendDm: async (_u: string, m: { embed: { description?: string } }) => { out.push(m); }, robloxLookup: async () => ({ id: 156, name: 'Builderman' }) };
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: ' builderman ', ...say });
    expect(out[0]!.embed.description).toContain('**2/3.** Wie alt bist du?');
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: '1234', ...say });
    expect(out[1]!.embed.description).toContain('zu lang');
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: '18', ...say });
    expect(out[2]!.embed.description).toContain('„-“');
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: '-', ...say });
    expect(out[3]!.embed.description).toContain('APP-1');
    expect(calls.at(-1)).toMatchObject({ kind: 'service', path: '/bot/application', body: { robloxUsername: 'Builderman', robloxUserId: '156', discordId: ME, answers: { age: '18' } } });
  });
});

describe('application ticket channels', () => {
  it('the close button of an application ticket deletes the channel', async () => {
    const { api } = fakeApi({});
    const { p, log } = fakePlatform();
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

describe('SEK', () => {
  it('/sek liste and berichte show roster and reports; mein status explains next steps', async () => {
    const { api } = fakeApi({ 'GET /sek/members': [{ displayName: 'Oscar', callsign: 'S-1', rank: 'Officer' }], 'GET /sek/reports': [{ number: 'SEK-2026-AB', occurredAt: '2026-10-01T20:00:00Z', missionType: 'Zugriff', authorName: 'Oscar', authorCallsign: 'S-1' }], 'GET /sek/me': { member: false } });
    expect(text(await byName('sek')!.run(ctx(api)))).toContain('**S-1** Oscar · Officer');
    expect(text(await byName('sek')!.run(ctx(api, { opts: { aktion: 'berichte' } })))).toContain('SEK-2026-AB');
    expect(text(await byName('sek')!.run(ctx(api, { opts: { aktion: 'mein_status' } })))).toContain('Qualifikations-Panel');
  });
  it('/sek hinzufuegen adds by Discord id and syncs the optional SEK role', async () => {
    const { api, calls } = fakeApi({ 'POST /sek/members': { displayName: 'Bea' } });
    const { p, log } = fakePlatform();
    const r = await byName('sek')!.run(ctx(api, { opts: { aktion: 'hinzufuegen', mitglied: OTHER }, platform: p, config: async () => ({ sekRole: '523456789012345678' }) }));
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/sek/members', body: { discordId: OTHER } });
    expect(log).toContain(`role ${GUILD} ${OTHER} 523456789012345678 true`);
    expect(text(r)).toContain('Mitglied im SEK');
    expect(text(await byName('sek')!.run(ctx(api, { opts: { aktion: 'entfernen' } })))).toContain('Bitte ein Mitglied');
  });
  it('/sek-bericht opens a form; the report goes to the API as the user', async () => {
    expect(byName('sek-bewerbung')).toBeUndefined();
    expect((await byName('sek-bericht')!.run(ctx(fakeApi({}).api))).modal?.id).toBe('sek:report');
    const { api, calls } = fakeApi({ 'POST /sek/reports': { number: 'SEK-1' } });
    const rep = interactionFor('sek:report')!;
    expect(text(await rep.def.run({ ...ctx(api), args: rep.args, fields: { datum: '32.13.2026', einsatzart: 'Zugriff', beschreibung: 'Lagerhalle gestürmt' } }))).toContain('Ungültiges Datum');
    expect(text(await rep.def.run({ ...ctx(api), args: rep.args, fields: { datum: '01.10.2026 21:30', einsatzart: 'Zugriff', beschreibung: 'Lagerhalle gestürmt' } }))).toContain('SEK-1');
    expect(calls[0]).toMatchObject({ path: '/sek/reports', body: { missionType: 'Zugriff' } });
    const denied = fakeApi({ 'POST /sek/reports': new BotApiError(403, 'PERMISSION_DENIED', 'x') });
    expect(text(await rep.def.run({ ...ctx(denied.api), args: rep.args, fields: { datum: '', einsatzart: 'Zugriff', beschreibung: 'Lagerhalle gestürmt' } }))).toContain('nur SEK-Mitglieder');
  });
  it('parses German dates and rejects invalid or future ones', () => {
    const now = new Date(2026, 9, 6, 12, 0);
    expect(parseGermanDate('', now)).toBe(now);
    expect(parseGermanDate('5.10.26 21:30', now)?.getHours()).toBe(21);
    expect(parseGermanDate('31.02.2026', now)).toBeNull();
    expect(parseGermanDate('01.01.2030', now)).toBeNull();
    expect(parseGermanDate('gestern', now)).toBeNull();
  });
  it('renders SEK report posts', () => {
    expect(renderOutbox('sek.report', { number: 'SEK-1', missionType: 'Zugriff', description: 'd', occurredAt: '2026-10-01T20:00:00Z', author: 'S-1' })?.title).toContain('SEK-1');
  });
});

describe('Qualifikationen (Panel → Fragen per DM)', () => {
  const CFG = { title: 'Qualifikationen', intro: 'Bildet euch weiter!', units: [
    { key: 'flugstaffel', name: 'Flugstaffel', description: 'Aus der Luft!', questions: ['Roblox- und Discord-Name?', 'Warum?'] },
    { key: 'sek', name: 'SEK', description: 'Zugriff!', questions: ['Q1', 'Q2', 'Q3'] }] };
  beforeEach(() => resetSessions());
  const dmLog = () => { const out: { embed: { title: string; description?: string }; buttons?: { id: string }[] }[] = []; return { out, sendDm: async (_u: string, m: (typeof out)[number]) => { out.push(m); } }; };

  it('/qualipanel posts embed + select menu (admins only)', async () => {
    const { api } = fakeApi({ 'GET /bot/qualifications': CFG });
    const { p, log } = fakePlatform();
    expect(text(await byName('qualipanel')!.run(ctx(api, { platform: p })))).toContain('Server verwalten');
    await byName('qualipanel')!.run(ctx(api, { platform: p, isGuildAdmin: true, config: async () => ({}) }));
    expect(log).toEqual([`panel ${CHANNEL}  select:quali:pick:flugstaffel,sek`]);
    expect(panelEmbed(CFG).description).toContain('**__Flugstaffel:__**\nAus der Luft!');
  });

  it('selecting a unit sends a DM with Start/Abbrechen and answers with a jump link', async () => {
    const { api } = fakeApi({ 'GET /bot/qualifications/open': { open: false, number: null }, 'GET /bot/qualifications': CFG });
    const { p, log } = fakePlatform();
    const hit = interactionFor('quali:pick')!;
    const r = await hit.def.run({ ...ctx(api, { platform: p }), args: hit.args, values: ['flugstaffel'] });
    expect(log).toEqual([`dmEmbed ${ME} Flugstaffel quali:start:flugstaffel,quali:cancel`]);
    expect(r.buttons?.[0]?.url).toBe('https://discord.com/channels/@me/DM1/M1');
    const open = fakeApi({ 'GET /bot/qualifications/open': { open: true, number: 'Q-1' }, 'GET /bot/qualifications': CFG });
    expect(text(await hit.def.run({ ...ctx(open.api, { platform: p }), args: hit.args, values: ['sek'] }))).toContain('bereits eine offene Bewerbung');
    const dmClosed = { ...p, sendDm: async () => { throw new Error('Cannot send messages to this user'); } };
    expect(text(await hit.def.run({ ...ctx(api, { platform: dmClosed }), args: hit.args, values: ['sek'] }))).toContain('Direktnachrichten');
  });

  it('asks the questions one by one via DM and submits the answers', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/qualifications/open': { open: false }, 'GET /bot/qualifications': CFG, 'POST /bot/qualifications/applications': { number: 'Q-2026-AB' } });
    const { p, log } = fakePlatform();
    const start = interactionFor('quali:start:flugstaffel')!;
    await start.def.run({ ...ctx(api, { platform: p }), args: start.args });
    expect(log[0]).toBe(`dmEmbed ${ME} Flugstaffel quali:cancel`);
    // zweite Auswahl während der laufenden Bewerbung wird abgewiesen
    const pick = interactionFor('quali:pick')!;
    expect(text(await pick.def.run({ ...ctx(api, { platform: p }), args: pick.args, values: ['sek'] }))).toContain('laufende Bewerbung');
    const d = dmLog();
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: '   ', api, sendDm: d.sendDm });
    expect(d.out[0]!.embed.description).toContain('mit Text');
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: 'x'.repeat(1001), api, sendDm: d.sendDm });
    expect(d.out[1]!.embed.description).toContain('zu lang');
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: 'Oscar / oscar#1', api, sendDm: d.sendDm });
    expect(d.out[2]!.embed.description).toContain('**2/2.** Warum?');
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: 'Weil ich fliegen will.', api, sendDm: d.sendDm });
    expect(d.out[3]!.embed.description).toContain('Q-2026-AB');
    expect(calls.find((c) => c.path === '/bot/qualifications/applications')!.body).toMatchObject({ unit: 'flugstaffel', discordId: ME, discordName: 'oscar', durationSec: expect.any(Number), answers: [{ question: 'Roblox- und Discord-Name?', answer: 'Oscar / oscar#1' }, { question: 'Warum?', answer: 'Weil ich fliegen will.' }] });
    await handleDirectMessage({ userId: ME, userName: 'oscar', content: 'noch was', api, sendDm: d.sendDm });
    expect(d.out[4]!.embed.description).toContain('keine laufende Bewerbung');
  });

  it('cancel, 3-hour timeout and retry when the system is down', async () => {
    const down = fakeApi({ 'GET /bot/qualifications/open': { open: false }, 'GET /bot/qualifications': CFG, 'POST /bot/qualifications/applications': new BotApiError(0, 'UNREACHABLE', 'down') });
    const { p } = fakePlatform();
    const start = interactionFor('quali:start:sek')!;
    await start.def.run({ ...ctx(down.api, { platform: p }), args: start.args });
    const cancel = interactionFor('quali:cancel')!;
    expect(text(await cancel.def.run({ ...ctx(down.api), args: cancel.args }))).toContain('abgebrochen');
    const d = dmLog();
    await start.def.run({ ...ctx(down.api, { platform: p }), args: start.args });
    await handleDirectMessage({ userId: ME, userName: 'o', content: 'a', api: down.api, sendDm: d.sendDm, now: Date.now() + APPLICATION_MS + 1 });
    expect(d.out[0]!.embed.description).toContain('abgelaufen');
    await start.def.run({ ...ctx(down.api, { platform: p }), args: start.args });
    for (const a of ['a', 'b', 'c']) await handleDirectMessage({ userId: ME, userName: 'o', content: a, api: down.api, sendDm: d.sendDm });
    expect(d.out.at(-1)!.embed.description).toContain('letzte Antwort');
  });

  it('posts applications like Appy: bold numbered questions, applicant info, decision/history/ticket/dashboard buttons', () => {
    const p = { id: 'abc', number: 'Q-1', unitName: 'Flugstaffel', discordId: OTHER, discordName: 'bea', linkedName: null, durationSec: 66, joinedAt: '2025-10-01T10:00:00Z', createdAt: '2026-10-06T10:00:00Z', dashboardUrl: 'https://x.example/qualifications?id=abc', answers: [{ question: 'Warum?', answer: 'Darum' }, { question: 'Erfahrung?', answer: 'Viel' }] };
    const [e, ...more] = renderOutboxEmbeds('qualification.submitted', p)!;
    expect(more).toEqual([]);
    expect(e!.title).toBe('📋 Flugstaffel – Bewerbung Q-1');
    expect(e!.description).toContain('**1. Warum?**\nDarum\n\n**2. Erfahrung?**\nViel');
    for (const x of [`Discord-ID: \`${OTHER}\``, 'Benutzername: `bea`', `Benutzer: <@${OTHER}>`, 'Dauer: `1 min 6s`', 'Server beigetreten: <t:1759312800:R>', 'Eingereicht: <t:']) expect(e!.description).toContain(x);
    expect(outboxButtons('qualification.submitted', p)?.map((b) => b.url ?? b.id)).toEqual(['quali:decide:q:abc:ACCEPTED', 'quali:decide:q:abc:REJECTED', 'quali:reason:q:abc:ACCEPTED', 'quali:reason:q:abc:REJECTED', `quali:history:${OTHER}`, 'quali:ticket:q:abc', 'https://x.example/qualifications?id=abc']);
    // Web-Bewerbung (ohne Discord): keine Verlauf-/Ticket-Buttons
    expect(outboxButtons('application.submitted', { id: 'p1', robloxUsername: 'x' })?.map((b) => b.id)).toEqual(['quali:decide:p:p1:ACCEPTED', 'quali:decide:p:p1:REJECTED', 'quali:reason:p:p1:ACCEPTED', 'quali:reason:p:p1:REJECTED']);
    // sehr lange Bewerbungen: gekürzt, innerhalb der Discord-Limits
    const long = renderOutboxEmbeds('application.submitted', { ...p, robloxUsername: 'Bea', answers: Array.from({ length: 15 }, (_, i) => ({ question: `Frage ${i}`, answer: 'x'.repeat(1000) })) })!;
    expect(long.reduce((n, x) => n + x.title.length + (x.description ?? '').length, 0)).toBeLessThan(5000);
    expect(long.every((x) => (x.description ?? '').length <= 4096)).toBe(true);
    expect(long.map((x) => x.description).join('')).toContain('gekürzt');
  });

  it('team decides via buttons as the clicking user (with optional reason via form); the message gets updated', async () => {
    const { api, calls } = fakeApi({ 'POST /qualifications/applications': { number: 'Q-1', unitName: 'SEK', addedToSek: true, decidedByName: 'Lead' }, 'POST /applications': { number: 'APP-1', decidedByName: 'Lead' } });
    const ID = '11111111-1111-4111-8111-111111111111';
    const hit = interactionFor(`quali:decide:q:${ID}:ACCEPTED`)!;
    const r = await hit.def.run({ ...ctx(api), args: hit.args });
    expect(text(r)).toContain('ins SEK aufgenommen');
    expect(r.decided?.text).toContain(`✅ Angenommen von <@${ME}> (Lead)`);
    expect(calls[0]).toMatchObject({ kind: 'user', path: `/qualifications/applications/${ID}/decision`, body: { status: 'ACCEPTED' } });
    // alte Buttons (ohne Art) funktionieren weiter
    const old = interactionFor(`quali:decide:${ID}:REJECTED`)!;
    await old.def.run({ ...ctx(api), args: old.args });
    expect(calls[1]).toMatchObject({ path: `/qualifications/applications/${ID}/decision`, body: { status: 'REJECTED' } });
    // mit Grund: erst Formular, dann Entscheidung (Polizei-Bewerbung)
    const reason = interactionFor(`quali:reason:p:${ID}:REJECTED`)!;
    expect(reason.def.opensModal?.(reason.args)).toBe(true);
    const modal = (await reason.def.run({ ...ctx(api), args: reason.args })).modal!;
    const submit = interactionFor(modal.id)!;
    const r2 = await submit.def.run({ ...ctx(api), args: submit.args, fields: { reason: 'Zu wenig Erfahrung' } });
    expect(calls[2]).toMatchObject({ path: `/applications/${ID}/discord-decision`, body: { status: 'REJECTED', reason: 'Zu wenig Erfahrung' } });
    expect(r2.decided?.text).toContain('**Grund:** Zu wenig Erfahrung');
    const done = fakeApi({ 'POST /qualifications/applications': new BotApiError(409, 'CONFLICT', 'x') });
    expect(text(await hit.def.run({ ...ctx(done.api), args: hit.args }))).toContain('bereits entschieden');
  });

  it('history shows earlier applications; ticket opens a channel with applicant, staff and the clicking user', async () => {
    const { api } = fakeApi({
      'GET /qualifications/history': [{ number: 'Q-1', unitName: 'SEK', status: 'REJECTED', createdAt: '2026-01-01T00:00:00Z', decisionReason: 'Zu früh' }],
      'GET /applications/history': new BotApiError(403, 'PERMISSION_DENIED', 'x'),
      'GET /qualifications/applications/': { number: 'Q-2', discordId: OTHER, discordName: 'bea', unitName: 'Flugstaffel' },
    });
    const h = interactionFor(`quali:history:${OTHER}`)!;
    const hist = text(await h.def.run({ ...ctx(api), args: h.args }));
    expect(hist).toContain('**Q-1** · SEK · ❌ abgelehnt');
    expect(hist).toContain('Zu früh');
    const { p, log } = fakePlatform();
    const t = interactionFor('quali:ticket:q:22222222-2222-4222-8222-222222222222')!;
    const r = await t.def.run({ ...ctx(api, { platform: p, config: async () => ({ tickets: 'CAT', staffRole: 'STAFF' }) }), args: t.args });
    expect(log[0]).toBe(`ticket ${OTHER} CAT STAFF`);
    expect(text(r)).toContain('Ticket geöffnet');
  });

  it('decision DM gives the role first and includes the reason', async () => {
    const box = fakeApi({ 'GET /bot/config': {}, 'GET /bot/outbox': [{ id: 'o1', type: 'qualification.decided', channelKey: 'qualifications', payload: { discordId: OTHER, status: 'ACCEPTED', number: 'Q-1', unitName: 'SEK', roleId: '623456789012345678', reason: 'Top Bewerbung' } }], 'POST /bot/outbox/o1/ack': {} });
    const order: string[] = [];
    await pollOnce(box.api, async () => undefined, () => undefined, async (u, t) => { order.push(`dm ${u} ${t}`); }, async (u, r) => { order.push(`role ${u} ${r}`); });
    expect(order[0]).toBe(`role ${OTHER} 623456789012345678`);
    expect(order[1]).toContain('angenommen');
    expect(order[1]).toContain('**Begründung:** Top Bewerbung');
  });
});

describe('Dienststatus ↔ Discord', () => {
  it('/dienstpanel posts the buttons; a button sets the duty status as the linked user', async () => {
    const { p, log } = fakePlatform();
    expect(text(await byName('dienstpanel')!.run(ctx(fakeApi({}).api, { platform: p })))).toContain('Server verwalten');
    await byName('dienstpanel')!.run(ctx(fakeApi({}).api, { platform: p, isGuildAdmin: true, config: async () => ({}) }));
    expect(log).toEqual([`panel ${CHANNEL} duty:ON_DUTY,duty:BREAK,duty:TRAINING,duty:ADMINISTRATIVE,duty:OFF_DUTY`]);
    const { api, calls } = fakeApi({ 'PUT /team/me/status': {} });
    const hit = interactionFor('duty:ON_DUTY')!;
    expect(text(await hit.def.run({ ...ctx(api), args: hit.args }))).toContain('im Dienst');
    expect(calls[0]).toMatchObject({ kind: 'user', method: 'PUT', path: '/team/me/status', body: { status: 'ON_DUTY' } });
    const again = fakeApi({ 'PUT /team/me/status': new BotApiError(409, 'CONFLICT', 'Already') });
    expect(text(await hit.def.run({ ...ctx(again.api), args: hit.args }))).toContain('bereits');
    const unlinked = fakeApi({ 'PUT /team/me/status': new BotApiError(401, 'UNAUTHENTICATED', 'x', 'r', 'NOT_LINKED') });
    expect(text(await hit.def.run({ ...ctx(unlinked.api), args: hit.args }))).toContain('/verknuepfen');
  });

  it('maps duty statuses to the configured roles (only one duty role at a time)', () => {
    const cfg = { dutyRole: '700000000000000001', breakRole: '700000000000000002' };
    expect(dutyRoleChanges('ON_DUTY', cfg)).toEqual({ add: ['700000000000000001'], remove: ['700000000000000002'] });
    expect(dutyRoleChanges('BREAK', cfg)).toEqual({ add: ['700000000000000002'], remove: ['700000000000000001'] });
    expect(dutyRoleChanges('OFF_DUTY', cfg)).toEqual({ add: [], remove: ['700000000000000001', '700000000000000002'] });
    expect(dutyRoleChanges('TRAINING', cfg)).toEqual({ add: [], remove: ['700000000000000001', '700000000000000002'] });
  });

  it('outbox: syncs roles and posts to the duty channel; without a channel only the roles are synced', async () => {
    const item = { id: 'd1', type: 'duty.changed', channelKey: 'duty', payload: { discordId: OTHER, name: 'Oscar', callsign: 'A-11', status: 'OFF_DUTY', previous: 'ON_DUTY', previousMinutes: 135, setBy: null } };
    const roles: string[] = [], posts: string[] = [];
    const withChannel = fakeApi({ 'GET /bot/config': { duty: '800000000000000001', dutyRole: '700000000000000001' }, 'GET /bot/outbox': [item], 'POST /bot/outbox/d1/ack': {} });
    await pollOnce(withChannel.api, async (ch, embeds) => { posts.push(`${ch} ${embeds[0]!.title} | ${embeds[0]!.description}`); }, () => undefined, undefined, undefined, async (u, add, remove) => { roles.push(`${u} +${add.join(',')} -${remove.join(',')}`); });
    expect(roles).toEqual([`${OTHER} + -700000000000000001`]);
    expect(posts[0]).toContain('800000000000000001 ⚪ A-11 · Oscar ist jetzt außer Dienst');
    expect(posts[0]).toContain('Vorher: im Dienst – 2 h 15 min');
    const noChannel = fakeApi({ 'GET /bot/config': { dutyRole: '700000000000000001' }, 'GET /bot/outbox': [{ ...item, payload: { ...item.payload, status: 'ON_DUTY' } }], 'POST /bot/outbox/d1/ack': {} });
    const sent = await pollOnce(noChannel.api, async () => { throw new Error('must not post'); }, () => undefined, undefined, undefined, async (u, add) => { roles.push(`${u} +${add.join(',')}`); });
    expect(sent).toBe(1);
    expect(roles.at(-1)).toBe(`${OTHER} +700000000000000001`);
    expect(noChannel.calls.find((c) => c.path === '/bot/outbox/d1/ack')!.body).toEqual({ ok: true });
  });
});

describe('applications with many questions', () => {
  it('50 questions with long answers stay within Discord limits (≤ 10 embeds, ≤ 4096 per description, ≤ 6000 in total)', () => {
    const answers = Array.from({ length: 50 }, (_, i) => ({ question: `Warum möchtest du Frage ${i + 1} beantworten und was ist deine Erfahrung?`, answer: 'x'.repeat(1000) }));
    const embeds = applicationEmbeds({ number: 'Q-1', unitName: 'SEK', discordId: ME, discordName: 'max', answers, createdAt: new Date().toISOString() }, 'q');
    expect(embeds.length).toBeLessThanOrEqual(10);
    expect(embeds.every((e) => (e.description ?? '').length <= 4096)).toBe(true);
    expect(embeds.reduce((n, e) => n + e.title.length + (e.description ?? '').length, 0)).toBeLessThanOrEqual(6000);
    expect(embeds.map((e) => e.description).join('\n')).toMatch(/weitere Antworten – vollständig im Dashboard/);
    // üblicher Fall: 20 normale Antworten erscheinen vollständig
    const normal = applicationEmbeds({ number: 'Q-2', unitName: 'SEK', discordId: ME, answers: Array.from({ length: 20 }, (_, i) => ({ question: `Frage ${i + 1}?`, answer: `Antwort ${i + 1} mit etwas Text.` })) }, 'q').map((e) => e.description).join('\n');
    expect(normal).toContain('**20. Frage 20?**\nAntwort 20 mit etwas Text.');
    expect(normal).not.toContain('gekürzt');
  });
});
