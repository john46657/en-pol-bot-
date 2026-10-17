import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import { parseDuration, parseLeaveDate } from '../src/commands/leave';
import type { Ctx } from '../src/commands/types';
import { humanDuration, leaveDecisionText, leaveDirectEmbed, outboxButtons, renderOutboxEmbeds, type Reply } from '../src/format';
import { pollOnce } from '../src/outbox';

const ME = '123456789012345678', GUILD = '323456789012345678';
type Call = { kind: 'user' | 'service'; method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    const key = Object.keys(routes).find((k) => `${method} ${path}` === k) ?? Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
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
const ctx = (api: Api, extra: Partial<Ctx> = {}): Ctx => ({ discordId: ME, opts: {}, api, guildId: GUILD, ...extra });
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''}`).join(' ') ?? ''}`;

describe('dates for /abmeldung (German time)', () => {
  const now = new Date('2026-07-10T10:00:00Z'); // Sommerzeit (UTC+2)
  it('understands today/tomorrow, dates with and without year, and times', () => {
    expect(parseLeaveDate('heute', false, now)?.toISOString()).toBe('2026-07-09T22:00:00.000Z');
    expect(parseLeaveDate('morgen', true, now)?.toISOString()).toBe('2026-07-11T21:59:00.000Z');
    expect(parseLeaveDate('24.12.', false, now)?.toISOString()).toBe('2026-12-23T23:00:00.000Z'); // Winterzeit
    expect(parseLeaveDate('01.02.', false, now)?.toISOString()).toBe('2027-01-31T23:00:00.000Z'); // schon vorbei → nächstes Jahr
    expect(parseLeaveDate('24.12.2026 18:00', false, now)?.toISOString()).toBe('2026-12-24T17:00:00.000Z');
    expect(parseLeaveDate('morgen 20 uhr', false, now)?.toISOString()).toBe('2026-07-11T18:00:00.000Z');
    for (const bad of ['31.02.2026', 'irgendwann', '12/24', '24.12.2026 25:00']) expect(parseLeaveDate(bad, false, now)).toBeNull();
  });
});

describe('/abmeldung and the approval buttons', () => {
  it('sends the request as the member and explains bad dates', async () => {
    const { api, calls } = fakeApi({ 'POST /leave': { number: 'LOA-2026-ABC', startsAt: '2026-12-23T23:00:00Z', endsAt: '2026-12-31T22:59:00Z', days: 8 } });
    const cmd = byName('abmeldung')!;
    expect(text(await cmd.run(ctx(api, { opts: { von: 'bald', bis: '31.12.', grund: 'Urlaub' } })))).toContain('verstehe ich nicht');
    expect(calls).toHaveLength(0);
    const r = await cmd.run(ctx(api, { opts: { von: '24.12.', bis: '31.12.', grund: 'Urlaub' } }));
    expect(text(r)).toContain('LOA-2026-ABC');
    expect(calls[0]).toMatchObject({ kind: 'user', method: 'POST', path: '/leave', body: { reason: 'Urlaub', guildId: GUILD } });
  });
  it('approve / deny with reason update the request message; errors are explained', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const { api, calls } = fakeApi({ [`POST /leave/${id}/decision`]: { number: 'LOA-1', name: 'Max', decidedByName: 'Chef' } });
    const ok = interactionFor(`leave:decide:${id}:APPROVED`)!;
    const r = await ok.def.run({ ...ctx(api), args: ok.args });
    expect(r.decided).toMatchObject({ badge: { label: 'Angenommen', style: 'success' } });
    expect(r.decided?.note).toMatch(new RegExp(`^Angenommen von <@${ME}> am <t:\\d+:f>$`));
    expect(r.embeds?.[0]).toMatchObject({ title: 'Abmeldung angenommen' });
    expect(r.embeds?.[0]?.description).toContain('/leave admin');
    expect(calls[0]).toMatchObject({ path: `/leave/${id}/decision`, body: { status: 'APPROVED' } });
    const form = interactionFor(`leave:reason:${id}:DENIED`)!;
    expect(form.def.opensModal?.(form.args)).toBe(true);
    expect((await form.def.run({ ...ctx(api), args: form.args })).modal?.id).toBe(`leave:reasonsubmit:${id}:DENIED`);
    const sub = interactionFor(`leave:reasonsubmit:${id}:DENIED`)!;
    const denied = await sub.def.run({ ...ctx(api), args: sub.args, fields: { reason: 'Zu kurzfristig' } });
    expect(denied.decided?.text).toContain('Zu kurzfristig');
    const taken = fakeApi({ [`POST /leave/${id}/decision`]: new BotApiError(409, 'CONFLICT', 'Über diese Abmeldung wurde schon entschieden (APPROVED).') });
    expect(text(await ok.def.run({ ...ctx(taken.api), args: ok.args }))).toContain('schon entschieden');
    expect(text(await ok.def.run({ ...ctx(api), args: ['decide', 'x', 'APPROVED'] }))).toContain('Unbekannte');
  });
  it('messages for the channels and the DM', () => {
    const p = { id: 'abc', number: 'LOA-1', name: 'Max', discordId: ME, startsAt: '2026-12-23T23:00:00Z', endsAt: '2026-12-31T22:59:00Z', reason: 'Urlaub', dashboardUrl: 'https://x/leave?id=abc' };
    const req = renderOutboxEmbeds('leave.requested', p)![0]!;
    expect(req.footer).toBe('ID: LOA-1');
    expect(req.fields?.slice(0, 2).map((f) => f.value)).toEqual(['Urlaub', '1 Woche, 1 Tag']);
    expect(outboxButtons('leave.requested', p)?.map((b) => b.id)).toEqual(['leave:decide:abc:APPROVED', 'leave:reason:abc:DENIED', 'link']);
    const pending = leaveDirectEmbed('leave.pending', { ...p, guildName: 'ENRP | Polizei' });
    expect(pending).toMatchObject({ title: 'Abmeldung ausstehend', author: { name: 'ENRP | Polizei' }, footer: 'ID: LOA-1' });
    expect(leaveDirectEmbed('leave.decided', { ...p, status: 'DENIED', decisionReason: 'test' }).fields?.[0]).toEqual({ name: 'Grund', value: 'test' });
    expect(leaveDirectEmbed('leave.decided', { ...p, status: 'APPROVED' }).title).toBe('Abmeldung angenommen');
    expect(renderOutboxEmbeds('leave.log', { ...p, event: 'started' })![0]!.title).toContain('beginnt');
    const log = renderOutboxEmbeds('leave.log', { ...p, event: 'approved', decidedByName: 'Chef' })![0]!;
    expect(log).toMatchObject({ author: { name: '@Max' }, footer: 'ID: LOA-1' });
    expect(log.description).toMatch(/\*\*Beginn\*\*: <t:\d+:f>[\s\S]*\*\*Ende\*\*[\s\S]*\*\*Grund\*\*: Urlaub[\s\S]*\*\*Angenommen von\*\*: Chef/);
    expect(leaveDecisionText({ ...p, status: 'DENIED', decisionReason: 'Personalmangel' })).toContain('Personalmangel');
  });
});

describe('shifts in Discord', () => {
  const shifts = { enabled: true, types: [{ id: 'im-dienst', name: 'Im Dienst', isDefault: true }, { id: 'sek', name: 'SEK', isDefault: false }] };
  it('several shift types: „Im Dienst“ asks which one first; the choice is sent', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': shifts, 'PUT /team/me/status': { shiftType: 'sek' } });
    const btn = interactionFor('duty:ON_DUTY')!;
    const pick = await btn.def.run({ ...ctx(api), args: btn.args });
    expect(pick.select?.options.map((o) => o.value)).toEqual(['im-dienst', 'sek']);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    const sel = interactionFor('duty:type')!;
    const r = await sel.def.run({ ...ctx(api), args: sel.args, values: ['sek'] });
    expect(text(r)).toContain('Schicht: **SEK**');
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ body: { status: 'ON_DUTY', shiftType: 'sek' } });
    // Pause braucht keine Auswahl; /dienst fragt ebenfalls
    const brk = interactionFor('duty:BREAK')!;
    await brk.def.run({ ...ctx(api), args: brk.args });
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { status: 'BREAK' } });
    expect((await byName('dienst')!.run(ctx(api, { opts: { status: 'an' } }))).select?.id).toBe('duty:type');
  });
  it('one or no shift type: straight on duty', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': { enabled: true, types: [shifts.types[0]] }, 'PUT /team/me/status': {} });
    const btn = interactionFor('duty:ON_DUTY')!;
    expect(text(await btn.def.run({ ...ctx(api), args: btn.args }))).toContain('im Dienst');
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { status: 'ON_DUTY' } });
  });
  it('outbox: roles from the shift type and its own log channel (without a duty channel in the settings)', async () => {
    const synced: string[] = [], sent: string[] = [];
    const item = { id: 'o1', type: 'duty.changed', channelKey: 'duty', payload: { discordId: ME, name: 'Max', status: 'ON_DUTY', previous: 'OFF_DUTY', shiftType: 'SEK', channelId: '900000000000000001', roles: { add: ['800000000000000001'], remove: ['800000000000000002'] } } };
    const { api } = fakeApi({ 'GET /bot/config': { dutyRole: '700000000000000001' }, 'GET /bot/outbox?limit=20': [item], 'POST /bot/outbox/o1/ack': {} });
    const n = await pollOnce(api, async (ch, embeds) => { sent.push(`${ch} ${embeds[0]!.description}`); }, () => undefined, undefined, undefined, async (u, add, remove) => { synced.push(`${u} +${add} -${remove}`); });
    expect(n).toBe(1);
    expect(synced).toEqual([`${ME} +800000000000000001 -800000000000000002`]);
    expect(sent[0]).toContain('900000000000000001');
    expect(sent[0]).toContain('Schicht: **SEK**');
  });
  it('outbox: a new danger status replaces the previous message in the channel', async () => {
    const opts: unknown[] = [];
    const item = { id: 'd1', type: 'danger.changed', channelKey: 'danger', payload: { level: 'STATUS_2', name: 'Status 2', title: 'Mittlere Kriminalität.', text: 'x', color: '#f1c40f', previous: 'Status 4' } };
    const { api } = fakeApi({ 'GET /bot/config': { danger: '900000000000000002' }, 'GET /bot/outbox?limit=20': [item], 'POST /bot/outbox/d1/ack': {} });
    expect(await pollOnce(api, async (_ch, _e, _b, o) => { opts.push(o); }, () => undefined)).toBe(1);
    expect(opts[0]).toMatchObject({ replaceKey: 'danger' });
  });
  it('outbox: the dashboard sends the danger panel to a channel', async () => {
    const placed: string[] = [];
    const item = { id: 'p1', type: 'danger.panel', channelKey: 'danger', payload: { channelId: '900000000000000003' } };
    const { api, calls } = fakeApi({ 'GET /bot/config': {}, 'GET /bot/outbox?limit=20': [item], 'POST /bot/outbox/p1/ack': {} });
    const n = await pollOnce(api, async () => undefined, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, async (kind, ch) => { placed.push(`${kind} ${ch}`); });
    expect(n).toBe(1);
    expect(placed).toEqual(['danger 900000000000000003']);
    expect(calls.at(-1)).toMatchObject({ path: '/bot/outbox/p1/ack', body: { ok: true } });
  });
});

describe('/leave manage (wie Trident)', () => {
  it('durations: 6h, 4d, 2w, combined and German; rejects nonsense and < 1 hour', () => {
    expect(parseDuration('6h')).toBe(6 * 3_600_000);
    expect(parseDuration('4d')).toBe(4 * 86_400_000);
    expect(parseDuration('2w')).toBe(14 * 86_400_000);
    expect(parseDuration('1w 2d')).toBe(9 * 86_400_000);
    expect(parseDuration('3t')).toBe(3 * 86_400_000);
    for (const bad of ['', 'bald', '30m', '5', 'h6']) expect(parseDuration(bad)).toBeNull();
    expect(humanDuration(86_400_000)).toBe('1 Tag');
    expect(humanDuration(14 * 86_400_000)).toBe('2 Wochen');
    expect(humanDuration(6 * 3_600_000)).toBe('6 Stunden');
  });
  it('no leave yet → Start button; Start opens the form; the form creates the request starting now', async () => {
    const { api, calls } = fakeApi({ 'GET /leave?mine=true': { items: [] }, 'POST /leave': (b: { endsAt: string }) => ({ number: 'LOA-9', endsAt: b.endsAt }) });
    const r = await byName('leave')!.run(ctx(api, { userName: 'john', opts: { _sub: 'manage' } }));
    expect(r.embeds?.[0]).toMatchObject({ title: 'Abmeldungen verwalten', author: { name: '@john' } });
    expect(r.embeds?.[0]?.description).toContain('noch nie');
    expect(r.buttons?.map((b) => b.id)).toEqual(['leave:start']);
    const start = interactionFor('leave:start')!;
    expect(start.def.opensModal?.(start.args)).toBe(true);
    const modal = (await start.def.run({ ...ctx(api), args: start.args })).modal!;
    expect(modal.id).toBe('leave:create');
    expect(modal.fields.map((f) => f.id)).toEqual(['duration', 'reason']);
    const create = interactionFor('leave:create')!;
    expect(text(await create.def.run({ ...ctx(api), args: create.args, fields: { duration: 'morgen', reason: 'test' } }))).toContain('Dauer');
    const before = Date.now();
    const done = await create.def.run({ ...ctx(api), args: create.args, fields: { duration: '1d', reason: 'test' } });
    expect(text(done)).toContain('Freigabe');
    const body = calls.find((c) => c.method === 'POST')!.body as { startsAt: string; endsAt: string; guildId: string };
    expect(Date.parse(body.endsAt) - Date.parse(body.startsAt)).toBe(86_400_000);
    expect(Date.parse(body.startsAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(body.guildId).toBe(GUILD);
  });
  it('pending / active leave → withdraw / end early', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const row = { id, number: 'LOA-2', reason: 'Urlaub', startsAt: '2026-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', endedAt: null, decisionReason: null };
    const pend = fakeApi({ 'GET /leave?mine=true': { items: [{ ...row, status: 'PENDING', active: false }] } });
    const p = await byName('leave')!.run(ctx(pend.api, { opts: { _sub: 'manage' } }));
    expect(p.embeds?.[0]).toMatchObject({ box: true });
    expect(p.embeds?.[0]?.description).toContain('Wartet auf Freigabe');
    expect(p.buttons?.map((b) => b.id)).toEqual([`leave:extend:${id}`, `leave:cancel:${id}`]);
    const act = fakeApi({ 'GET /leave?mine=true': { items: [{ ...row, status: 'APPROVED', active: true }] }, [`POST /leave/${id}/cancel`]: { number: 'LOA-2', status: 'ENDED' } });
    const r = await byName('leave')!.run(ctx(act.api, { opts: { _sub: 'manage' } }));
    expect(r.embeds?.[0]?.description).toMatch(/Aktuelle Abmeldung[\s\S]*\*\*Status\*\*: 🟢 Aktiv[\s\S]*\*\*Grund\*\*: Urlaub[\s\S]*ID: LOA-2/);
    expect(r.buttons?.map((b) => b.label)).toEqual(['Verlängern', 'Vorzeitig beenden']);
    const cancel = interactionFor(`leave:cancel:${id}`)!;
    expect(text(await cancel.def.run({ ...ctx(act.api), args: cancel.args }))).toContain('beendet');
  });
  it('extend: form asks for a duration and extends by it', async () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const { api, calls } = fakeApi({ [`POST /leave/${id}/extend`]: { number: 'LOA-2', endsAt: '2099-01-03T00:00:00Z' } });
    const ext = interactionFor(`leave:extend:${id}`)!;
    expect(ext.def.opensModal?.(ext.args)).toBe(true);
    expect((await ext.def.run({ ...ctx(api), args: ext.args })).modal?.id).toBe(`leave:extendsubmit:${id}`);
    const sub = interactionFor(`leave:extendsubmit:${id}`)!;
    expect(text(await sub.def.run({ ...ctx(api), args: sub.args, fields: { duration: 'bald' } }))).toContain('verstehe ich nicht');
    const r = await sub.def.run({ ...ctx(api), args: sub.args, fields: { duration: '2d' } });
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/leave/${id}/extend`, body: { minutes: 2 * 24 * 60 } });
    expect(text(r)).toContain('um 2 Tage verlängert');
  });
});

describe('/leave admin (wie Trident)', () => {
  const MEMBER = '223456789012345678';
  const row = (n: number, extra: Record<string, unknown>) => ({ id: `11111111-2222-3333-4444-55555555555${n}`, number: `LOA-${n}`, reason: 'test', startsAt: '2026-10-06T21:09:00Z', endsAt: '2026-10-07T16:55:00Z', endedAt: null, decisionReason: null, active: false, ...extra });
  it('shows the member history as a box; Start opens the form and starts the leave for the member', async () => {
    const { api, calls } = fakeApi({ [`GET /leave?discordId=${MEMBER}`]: { items: [row(1, { status: 'ENDED', endedAt: '2026-10-07T16:55:00Z' })] }, 'POST /leave': { number: 'LOA-9' } });
    const r = await byName('leave')!.run(ctx(api, { opts: { _sub: 'admin', user: MEMBER }, userNameOf: async () => 'john45346' }));
    expect(r.embeds?.[0]).toMatchObject({ box: true, title: 'Abmeldungen verwalten', author: { name: 'Abmeldungsverwaltung: @john45346' } });
    expect(r.embeds?.[0]?.description).toMatch(/Verlauf[\s\S]*`1\.` <t:\d+:f> \[1 Tag\]/);
    expect(r.buttons?.map((b) => b.id)).toEqual([`leave:astart:${MEMBER}`, `leave:ahist:${MEMBER}`]);
    const hist = interactionFor(`leave:ahist:${MEMBER}`)!;
    const h = await hist.def.run({ ...ctx(api), args: hist.args });
    expect(h.embeds?.[0]?.description).toMatch(/`LOA-1`[\s\S]*\*\*Beginn:\*\*[\s\S]*\*\*Ende:\*\*[\s\S]*\*\*Grund:\*\* test/);
    const start = interactionFor(`leave:astart:${MEMBER}`)!;
    expect(start.def.opensModal?.(start.args)).toBe(true);
    expect((await start.def.run({ ...ctx(api), args: start.args })).modal?.id).toBe(`leave:acreate:${MEMBER}`);
    const create = interactionFor(`leave:acreate:${MEMBER}`)!;
    await create.def.run({ ...ctx(api), args: create.args, fields: { duration: '2d', reason: 'Urlaub' } });
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ forDiscordId: MEMBER, reason: 'Urlaub', guildId: GUILD });
  });
  it('a running leave can be ended by the management', async () => {
    const id = '11111111-2222-3333-4444-555555555552';
    const { api } = fakeApi({ [`GET /leave?discordId=${MEMBER}`]: { items: [row(2, { status: 'APPROVED', active: true, endsAt: '2099-01-01T00:00:00Z' })] }, [`POST /leave/${id}/cancel`]: { number: 'LOA-2', status: 'ENDED', name: 'John', discordId: MEMBER } });
    const r = await byName('leave')!.run(ctx(api, { opts: { _sub: 'admin', user: MEMBER } }));
    expect(r.buttons?.map((b) => b.id)).toEqual([`leave:extend:${id}`, `leave:cancel:${id}`, `leave:ahist:${MEMBER}`]);
    expect(r.buttons?.[1]?.label).toBe('Vorzeitig beenden');
    expect(r.embeds?.[0]?.description).toContain('🟢 Aktiv');
    const cancel = interactionFor(`leave:cancel:${id}`)!;
    expect(text(await cancel.def.run({ ...ctx(api), args: cancel.args }))).toContain('von John beendet');
  });
});

describe('/leave liste', () => {
  const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
  const row = (id: string, number: string, o: Record<string, unknown> = {}) => ({ id, number, status: 'PENDING', active: false, startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-11-04T00:00:00Z', reason: 'Urlaub', endedAt: null, decisionReason: null, name: `User ${number}`, discordId: '423456789012345678', days: 3, ...o });
  const run = (api: Api, ansicht?: string) => byName('leave')!.run(ctx(api, { opts: { _sub: 'liste', ...(ansicht ? { ansicht } : {}) } }));
  it('leadership: open requests oldest first with a picker; picking shows approve/deny', async () => {
    const pending = { all: true, items: [row(B, 'LOA-2'), row(A, 'LOA-1')] };
    const { api, calls } = fakeApi({ 'GET /leave?status=PENDING': pending });
    const r = await run(api);
    expect(calls[0]!.path).toBe('/leave?status=PENDING');
    expect(r.embeds?.[0]?.title).toContain('Offene Anträge (2)');
    expect(r.select?.id).toBe('leave:pick');
    expect(r.select?.options.map((o) => o.value)).toEqual([A, B]);
    const pick = interactionFor('leave:pick')!;
    const shown = await pick.def.run({ ...ctx(api), args: pick.args, values: [A] });
    expect(shown.buttons?.map((b) => b.id)).toEqual([`leave:decide:${A}:APPROVED`, `leave:reason:${A}:DENIED`]);
    expect(text(await pick.def.run({ ...ctx(api), args: pick.args, values: ['33333333-3333-4333-8333-333333333333'] }))).toContain('nicht mehr offen');
  });
  it('other views map to the dashboard tabs; without leave.view only own entries and no picker', async () => {
    const { api, calls } = fakeApi({ 'GET /leave?status=ACTIVE': { all: true, items: [row(A, 'LOA-1', { status: 'APPROVED', active: true })] }, 'GET /leave?status=PENDING': { all: false, items: [row(A, 'LOA-1')] } });
    expect((await run(api, 'aktiv')).embeds?.[0]?.title).toContain('Gerade abgemeldet (1)');
    expect(calls.at(-1)!.path).toBe('/leave?status=ACTIVE');
    const own = await run(api, 'offen');
    expect(own.embeds?.[0]?.title).toContain('Deine Abmeldungen');
    expect(own.select).toBeUndefined();
  });
});
