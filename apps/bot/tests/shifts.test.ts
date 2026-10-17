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
const run = (api: Api, sub: string, opts: Record<string, string | number> = {}) => byName('schicht')!.run({ discordId: ME, api, opts: { _sub: sub, ...opts } } as Ctx);
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''} ${e.fields?.map((f) => `${f.name} ${f.value}`).join(' ') ?? ''}`).join(' ') ?? ''}`;
const shift = (o: Record<string, unknown> = {}) => ({ id: 's1', userId: UID, name: 'Max', callsign: 'ADAM-1', shiftType: 'SEK', startedAt: '2026-10-17T10:00:00Z', endedAt: null, active: true, status: 'ON_DUTY', minutes: 90, breakMinutes: 15, breaks: 1, startedBy: null, endedBy: null, ...o });
const types = { enabled: true, types: [{ id: 'streife', name: 'Streife', isDefault: true }, { id: 'sek', name: 'SEK', isDefault: false }] };

describe('/schicht', () => {
  it('start: with a type sends it; without one asks when there are several types', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': types, 'PUT /team/me/status': {} });
    expect(text(await run(api, 'start', { art: 'sek' }))).toContain('**SEK** gestartet');
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { status: 'ON_DUTY', shiftType: 'sek' } });
    expect(text(await run(api, 'start', { art: 'gibtsnicht' }))).toContain('Unbekannte Schichtart');
    expect((await run(api, 'start')).select?.id).toBe('duty:type');
  });
  it('start without shift types goes straight on duty; already on duty is not an error', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': { enabled: false, types: [] }, 'PUT /team/me/status': {} });
    expect(text(await run(api, 'start'))).toContain('im Dienst');
    expect(calls.at(-1)).toMatchObject({ body: { status: 'ON_DUTY' } });
    const busy = fakeApi({ 'GET /bot/shifts': { enabled: false, types: [] }, 'PUT /team/me/status': new BotApiError(409, 'CONFLICT', 'x') });
    expect(text(await run(busy.api, 'start'))).toContain('bereits');
  });
  it('pause toggles between on duty and break; off duty gets a hint', async () => {
    const on = fakeApi({ 'GET /team/me': { status: 'ON_DUTY' }, 'PUT /team/me/status': {} });
    await run(on.api, 'pause');
    expect(on.calls.at(-1)).toMatchObject({ body: { status: 'BREAK' } });
    const brk = fakeApi({ 'GET /team/me': { status: 'BREAK' }, 'PUT /team/me/status': {} });
    await run(brk.api, 'pause');
    expect(brk.calls.at(-1)).toMatchObject({ body: { status: 'ON_DUTY' } });
    const off = fakeApi({ 'GET /team/me': undefined });
    expect(text(await run(off.api, 'pause'))).toContain('nicht im Dienst');
  });
  it('ende ends the shift', async () => {
    const { api, calls } = fakeApi({ 'PUT /team/me/status': {} });
    expect(text(await run(api, 'ende'))).toContain('außer Dienst');
    expect(calls.at(-1)).toMatchObject({ body: { status: 'OFF_DUTY' } });
  });
  it('status/verlauf show the running shift and the total without breaks', async () => {
    const { api, calls } = fakeApi({ 'GET /team/me/shifts': { days: 30, items: [shift(), shift({ id: 's2', active: false, endedAt: '2026-10-16T12:00:00Z', status: 'OFF_DUTY', minutes: 60, breakMinutes: 0, breaks: 0 })] } });
    const t = text(await run(api, 'verlauf', { tage: 30 }));
    expect(calls.at(-1)!.path).toBe('/team/me/shifts?days=30');
    expect(t).toContain('Aktuelle Schicht');
    expect(t).toContain('2 h 15 min'); // 75 + 60 Minuten
    expect(t).toContain('2 Schichten');
    const empty = fakeApi({ 'GET /team/me/shifts': { days: 7, items: [] } });
    expect(text(await run(empty.api, 'status'))).toContain('keine Schicht');
  });
  it('aktiv lists who is on shift', async () => {
    const { api } = fakeApi({ 'GET /team/overview': [
      { userId: 'a', name: 'Max', callsign: 'ADAM-1', dutyStatus: 'ON_DUTY', onDutySince: '2026-10-17T10:00:00Z', shiftType: 'SEK' },
      { userId: 'b', name: 'Eva', callsign: null, dutyStatus: 'BREAK', onDutySince: '2026-10-17T11:00:00Z', shiftType: null },
      { userId: 'c', name: 'Tom', callsign: null, dutyStatus: 'OFF_DUTY', onDutySince: null, shiftType: null },
    ] });
    const r = await run(api, 'aktiv');
    expect(r.embeds?.[0]?.title).toContain('(2)');
    expect(text(r)).toContain('ADAM-1');
    expect(text(r)).not.toContain('Tom');
    expect(r.embeds?.[0]?.footer).toContain('1 davon in der Pause');
  });
  it('admin shows a member and can end the running shift', async () => {
    const { api, calls } = fakeApi({ 'GET /team/shifts': { days: 7, member: { userId: UID, name: 'Max' }, items: [shift()] }, [`PUT /team/${UID}/status`]: {} });
    const r = await run(api, 'admin', { mitglied: OTHER });
    expect(calls.at(-1)!.path).toBe(`/team/shifts?discordId=${OTHER}&days=7`);
    expect(r.buttons?.[0]?.id).toBe(`shift:end:${UID}:${OTHER}`);
    const btn = interactionFor(r.buttons![0]!.id)!;
    const done = await btn.def.run({ discordId: ME, api, opts: {}, args: btn.args });
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: `/team/${UID}/status`, body: { status: 'OFF_DUTY' } });
    expect(done.content).toContain('Schicht beendet');
    const unlinked = fakeApi({ 'GET /team/shifts': { days: 7, member: null, items: [] } });
    expect(text(await run(unlinked.api, 'admin', { mitglied: OTHER }))).toContain('keinem Konto');
  });
});
