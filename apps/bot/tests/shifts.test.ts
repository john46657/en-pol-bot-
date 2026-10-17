import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import type { Reply } from '../src/format';

const ME = '123456789012345678', OTHER = '223456789012345678', UID = '0b6f8c1e-2d4a-4c3b-9a7e-1f2e3d4c5b6a';
type Call = { method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    calls.push({ method, path, body });
    const key = Object.keys(routes).find((k) => `${method} ${path}` === k) ?? Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) throw new BotApiError(404, 'NOT_FOUND', 'no route');
    const r = routes[key];
    if (r instanceof BotApiError) throw r;
    return r;
  };
  const api: Api = {
    async asUser(_d, method, path, body) { return resolve(method, path, body) as never; },
    async service(method, path, body) { return resolve(method, path, body) as never; },
  };
  return { api, calls };
}
const run = (api: Api, sub: string, opts: Record<string, string | number> = {}) => byName('shift')!.run({ discordId: ME, api, opts: { _sub: sub, ...opts } } as Ctx);
const click = async (api: Api, id: string, values?: string[]) => { const hit = interactionFor(id)!; return hit.def.run({ discordId: ME, api, opts: {}, args: hit.args, ...(values ? { values } : {}) }); };
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''} ${e.fields?.map((f) => `${f.name} ${f.value}`).join(' ') ?? ''}`).join(' ') ?? ''}`;
const shift = (o: Record<string, unknown> = {}) => ({ id: 's1', userId: UID, name: 'Max', callsign: 'ADAM-1', shiftType: 'SEK', startedAt: '2026-10-17T10:00:00Z', endedAt: null, active: true, status: 'ON_DUTY', minutes: 90, breakMinutes: 15, breaks: 1, startedBy: null, endedBy: null, ...o });
const types = { enabled: true, types: [{ id: 'streife', name: 'Streife', isDefault: true }, { id: 'sek', name: 'SEK', isDefault: false }] };

describe('/shift', () => {
  const off = { days: 7, items: [shift({ id: 's2', active: false, endedAt: '2026-10-16T12:00:00Z', status: 'OFF_DUTY', minutes: 60, breakMinutes: 0, breaks: 0 })] };
  it('manage while off duty shows the week total and a start button (with the chosen type)', async () => {
    const { api, calls } = fakeApi({ 'GET /team/me/shifts': off, 'GET /bot/shifts': types });
    const r = await run(api, 'manage');
    expect(calls[0]!.path).toBe('/team/me/shifts?days=7');
    expect(text(r)).toContain('nicht im Dienst');
    expect(text(r)).toContain('1 h 00 min');
    expect(r.buttons?.map((b) => b.id)).toEqual(['shift:on']);
    expect((await run(api, 'manage', { type: 'SEK' })).buttons?.[0]?.id).toBe('shift:on:sek');
    expect(text(await run(api, 'manage', { type: 'gibtsnicht' }))).toContain('Unbekannte Schichtart');
  });
  it('manage while on duty offers break and end; on break offers to end the break', async () => {
    const on = fakeApi({ 'GET /team/me/shifts': { days: 7, items: [shift()] } });
    const r = await run(on.api, 'manage');
    expect(text(r)).toContain('SEK');
    expect(text(r)).toContain('1 h 15 min'); // 90 − 15 Minuten Pause
    expect(r.buttons?.map((b) => b.id)).toEqual(['shift:break', 'shift:off']);
    const brk = fakeApi({ 'GET /team/me/shifts': { days: 7, items: [shift({ status: 'BREAK' })] } });
    expect((await run(brk.api, 'manage')).buttons?.map((b) => b.id)).toEqual(['shift:on', 'shift:off']);
  });
  it('start button: with a type sends it, otherwise asks for the type when off duty and there are several', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': types, 'GET /team/me/shifts': off, 'GET /team/me': undefined, 'PUT /team/me/status': {} });
    const r = await click(api, 'shift:on:sek');
    expect(calls.find((x) => x.method === 'PUT')).toMatchObject({ body: { status: 'ON_DUTY', shiftType: 'sek' } });
    expect(r.content).toContain('**SEK** gestartet');
    expect(r.embeds?.[0]?.title).toBe('Schicht verwalten');
    const pick = await click(api, 'shift:on');
    expect(pick.select?.id).toBe('shift:type');
    await click(api, 'shift:type', ['streife']);
    expect(calls.filter((x) => x.method === 'PUT').at(-1)).toMatchObject({ body: { status: 'ON_DUTY', shiftType: 'streife' } });
  });
  it('start without shift types goes straight on duty; back from break keeps the type; already on duty is not an error', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': { enabled: false, types: [] }, 'GET /team/me/shifts': off, 'GET /team/me': undefined, 'PUT /team/me/status': {} });
    expect((await click(api, 'shift:on')).content).toContain('im Dienst');
    expect(calls.find((x) => x.method === 'PUT')).toMatchObject({ body: { status: 'ON_DUTY' } });
    const brk = fakeApi({ 'GET /bot/shifts': types, 'GET /team/me/shifts': off, 'GET /team/me': { status: 'BREAK' }, 'PUT /team/me/status': {} });
    await click(brk.api, 'shift:on');
    expect(brk.calls.find((x) => x.method === 'PUT')!.body).toEqual({ status: 'ON_DUTY' });
    const busy = fakeApi({ 'GET /bot/shifts': { enabled: false, types: [] }, 'GET /team/me/shifts': off, 'GET /team/me': { status: 'ON_DUTY' }, 'PUT /team/me/status': new BotApiError(409, 'CONFLICT', 'x') });
    expect((await click(busy.api, 'shift:on')).content).toContain('bereits');
  });
  it('break and end buttons set the status', async () => {
    const { api, calls } = fakeApi({ 'GET /team/me/shifts': off, 'PUT /team/me/status': {} });
    await click(api, 'shift:break');
    expect(calls.find((x) => x.method === 'PUT')).toMatchObject({ body: { status: 'BREAK' } });
    expect((await click(api, 'shift:off')).content).toContain('außer Dienst');
    expect(calls.filter((x) => x.method === 'PUT').at(-1)).toMatchObject({ body: { status: 'OFF_DUTY' } });
  });
  it('type autocomplete suggests the configured shift types', async () => {
    const { api } = fakeApi({ 'GET /bot/shifts': types });
    const def = byName('shift')!;
    expect(await def.complete!({ discordId: ME, api, opts: {} } as Ctx, 'type', '')).toEqual([{ name: 'Streife', value: 'streife' }, { name: 'SEK', value: 'sek' }]);
    expect(await def.complete!({ discordId: ME, api, opts: {} } as Ctx, 'type', 'se')).toEqual([{ name: 'SEK', value: 'sek' }]);
  });
  it('leaderboard ranks by time on duty and shows your place', async () => {
    const { api, calls } = fakeApi({ 'GET /team/leaderboard': { days: 30, me: 'b', users: [{ userId: 'a', name: 'Max', callsign: 'ADAM-1', minutes: 300 }, { userId: 'b', name: 'Eva', callsign: null, minutes: 120 }] } });
    const r = await run(api, 'leaderboard', { days: 30 });
    expect(calls[0]!.path).toBe('/team/leaderboard?days=30');
    expect(text(r)).toContain('🥇 **ADAM-1** (Max) · 5 h 00 min');
    expect(text(r)).toContain('Eva** · 2 h 00 min ← du');
    expect(r.embeds?.[0]?.footer).toContain('Dein Platz: 2 von 2');
  });
  it('active lists who is on shift', async () => {
    const { api } = fakeApi({ 'GET /team/overview': [
      { userId: 'a', name: 'Max', callsign: 'ADAM-1', dutyStatus: 'ON_DUTY', onDutySince: '2026-10-17T10:00:00Z', shiftType: 'SEK' },
      { userId: 'b', name: 'Eva', callsign: null, dutyStatus: 'BREAK', onDutySince: '2026-10-17T11:00:00Z', shiftType: null },
      { userId: 'c', name: 'Tom', callsign: null, dutyStatus: 'OFF_DUTY', onDutySince: null, shiftType: null },
    ] });
    const r = await run(api, 'active');
    expect(r.embeds?.[0]?.title).toContain('(2)');
    expect(text(r)).toContain('ADAM-1');
    expect(text(r)).not.toContain('Tom');
    expect(r.embeds?.[0]?.footer).toContain('1 davon in der Pause');
  });
  it('admin shows a member and can end the running shift', async () => {
    const { api, calls } = fakeApi({ 'GET /team/shifts': { days: 7, member: { userId: UID, name: 'Max' }, items: [shift()] }, [`PUT /team/${UID}/status`]: {} });
    const r = await run(api, 'admin', { member: OTHER });
    expect(calls.at(-1)!.path).toBe(`/team/shifts?discordId=${OTHER}&days=7`);
    expect(r.buttons?.[0]?.id).toBe(`shift:end:${UID}:${OTHER}`);
    const btn = interactionFor(r.buttons![0]!.id)!;
    const done = await btn.def.run({ discordId: ME, api, opts: {}, args: btn.args });
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: `/team/${UID}/status`, body: { status: 'OFF_DUTY' } });
    expect(done.content).toContain('Schicht beendet');
    const unlinked = fakeApi({ 'GET /team/shifts': { days: 7, member: null, items: [] } });
    expect(text(await run(unlinked.api, 'admin', { member: OTHER }))).toContain('keinem Konto');
  });
});
