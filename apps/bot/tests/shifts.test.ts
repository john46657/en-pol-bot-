import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import { parseShiftDuration } from '../src/commands/shifts';
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
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.author?.name ?? ''} ${e.title} ${e.description ?? ''} ${e.fields?.map((f) => `${f.name} ${f.value}`).join(' ') ?? ''}`).join(' ') ?? ''}`;
const shift = (o: Record<string, unknown> = {}) => ({ id: 's1', userId: UID, name: 'Max', callsign: 'ADAM-1', shiftType: 'SEK', startedAt: '2026-10-17T10:00:00Z', endedAt: null, active: true, status: 'ON_DUTY', minutes: 90, breakMinutes: 15, breaks: 1, startedBy: null, endedBy: null, ...o });
const types = { enabled: true, types: [{ id: 'streife', name: 'Streife', isDefault: true }, { id: 'sek', name: 'SEK', isDefault: false }] };

describe('/shift', () => {
  const none = { days: 1, items: [] };
  const stats = { count: 4, minutes: 250 };
  const ids = (r: Reply) => r.buttons?.map((b) => `${b.id}${b.disabled ? ' (aus)' : ''}`);
  it('manage while off duty: all-time overview, default shift type and only Start clickable', async () => {
    const { api, calls } = fakeApi({ 'GET /team/me/shifts': none, 'GET /team/me/shift-stats': stats, 'GET /bot/shifts': types });
    const r = await run(api, 'manage');
    expect(calls.map((x) => x.path)).toContain('/team/me/shifts?days=1');
    expect(r.embeds?.[0]).toMatchObject({ author: { name: 'Shift Management' }, title: '' });
    expect(r.panel).toBe(true); // Buttons zeichnen das Panel an Ort und Stelle neu
    const t = text(r);
    expect(t).toContain('### 📋 All Time Information');
    expect(t).toContain('**Shift Count**: 4');
    expect(t).toContain('**Total Duration**: 4 hours, 10 minutes');
    expect(t).toContain('**Average Duration**: 1 hour, 2 minutes, 30 seconds');
    expect(t).toContain('-# Shift Type: Streife');
    expect(ids(r)).toEqual([`shift:on:streife:${ME}`, `shift:break:${ME} (aus)`, `shift:off:${ME} (aus)`]);
    expect(r.ephemeral).toBe(false); // für alle im Channel sichtbar
    expect(byName('shift')!.publicReply?.({ _sub: 'manage' })).toBe(true);
    for (const sub of ['active', 'leaderboard', 'admin']) expect(byName('shift')!.publicReply?.({ _sub: sub })).toBe(true);
    expect((await run(api, 'manage', { type: 'SEK' })).buttons?.[0]?.id).toBe(`shift:on:sek:${ME}`);
    expect(text(await run(api, 'manage', { type: 'gibtsnicht' }))).toContain('Unbekannte Schichtart');
    const fresh = fakeApi({ 'GET /team/me/shifts': none, 'GET /team/me/shift-stats': { count: 0, minutes: 0 }, 'GET /bot/shifts': { enabled: false, types: [] } });
    const f = text(await run(fresh.api, 'manage'));
    expect(f).toContain('**Total Duration**: 0 seconds');
    expect(f).toContain('Shift Type: default');
  });
  it('manage while on duty shows the running shift; Start is greyed out, Pause/Beenden clickable', async () => {
    const on = fakeApi({ 'GET /team/me/shifts': { days: 1, items: [shift()] }, 'GET /team/me/shift-stats': stats, 'GET /bot/shifts': types });
    const r = await run(on.api, 'manage');
    expect(text(r)).toContain('Current Shift');
    expect(text(r)).toContain('**Status**: On Shift');
    expect(text(r)).toContain('**Breaks**: 1 (15 minutes)');
    expect(text(r)).toContain('Shift Type: SEK');
    expect(ids(r)).toEqual([`shift:on::${ME} (aus)`, `shift:break:${ME}`, `shift:off:${ME}`]);
    const brk = fakeApi({ 'GET /team/me/shifts': { days: 1, items: [shift({ status: 'BREAK' })] }, 'GET /team/me/shift-stats': stats, 'GET /bot/shifts': types });
    expect((await run(brk.api, 'manage')).buttons?.[1]?.label).toBe('Resume');
  });
  it('buttons update the panel in place and set the status', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': types, 'GET /team/me/shifts': none, 'GET /team/me/shift-stats': stats, 'GET /team/me': { status: 'ON_DUTY' }, 'PUT /team/me/status': {} });
    const start = interactionFor('shift:on:sek')!;
    expect(start.def.updatesMessage?.(start.args)).toBe(true);
    const r = await click(api, 'shift:on:sek');
    expect(calls.find((x) => x.method === 'PUT')).toMatchObject({ body: { status: 'ON_DUTY', shiftType: 'sek' } });
    expect(text(r)).toContain('Shift **SEK** started');
    expect(r.panel).toBe(true);
    await click(api, 'shift:break');
    expect(calls.filter((x) => x.method === 'PUT').at(-1)).toMatchObject({ body: { status: 'BREAK' } });
    expect(text(await click(api, 'shift:off'))).toContain('Your shift has **ended**');
    expect(calls.filter((x) => x.method === 'PUT').at(-1)).toMatchObject({ body: { status: 'OFF_DUTY' } });
  });
  it('public panel: only its owner can use the buttons; old panels without owner still work', async () => {
    const { api, calls } = fakeApi({ 'GET /bot/shifts': types, 'GET /team/me/shifts': none, 'GET /team/me/shift-stats': stats, 'GET /team/me': { status: 'ON_DUTY' }, 'PUT /team/me/status': {} });
    for (const id of [`shift:on:sek:${OTHER}`, `shift:break:${OTHER}`, `shift:off:${OTHER}`]) {
      const r = await click(api, id);
      expect(r.ephemeral).toBe(true);
      expect(r.embeds).toBeUndefined(); // kein Kasten → Panel bleibt unverändert, Hinweis nur für den Klickenden
      expect(text(r)).toContain(`Schichtverwaltung von <@${OTHER}>`);
    }
    expect(calls.filter((x) => x.method === 'PUT')).toEqual([]);
    const own = await click(api, `shift:on::${ME}`);
    expect(own.panel).toBe(true);
    expect(calls.find((x) => x.method === 'PUT')!.body).toEqual({ status: 'ON_DUTY' });
    await click(api, `shift:off:${ME}`);
    expect(calls.filter((x) => x.method === 'PUT').at(-1)!.body).toEqual({ status: 'OFF_DUTY' });
  });
  it('pause button ends a break; without types start goes on duty; 409 is shown as a hint', async () => {
    const brk = fakeApi({ 'GET /bot/shifts': { enabled: false, types: [] }, 'GET /team/me/shifts': none, 'GET /team/me/shift-stats': stats, 'GET /team/me': { status: 'BREAK' }, 'PUT /team/me/status': {} });
    await click(brk.api, 'shift:break');
    expect(brk.calls.find((x) => x.method === 'PUT')!.body).toEqual({ status: 'ON_DUTY' });
    await click(brk.api, 'shift:on');
    expect(brk.calls.filter((x) => x.method === 'PUT').at(-1)!.body).toEqual({ status: 'ON_DUTY' });
    const busy = fakeApi({ 'GET /bot/shifts': { enabled: false, types: [] }, 'GET /team/me/shifts': none, 'GET /team/me/shift-stats': stats, 'PUT /team/me/status': new BotApiError(409, 'CONFLICT', 'x') });
    expect(text(await click(busy.api, 'shift:on'))).toContain('bereits');
  });
  it('type autocomplete suggests the configured shift types', async () => {
    const { api } = fakeApi({ 'GET /bot/shifts': types });
    const def = byName('shift')!;
    expect(await def.complete!({ discordId: ME, api, opts: {} } as Ctx, 'type', '')).toEqual([{ name: 'Streife', value: 'streife' }, { name: 'SEK', value: 'sek' }]);
    expect(await def.complete!({ discordId: ME, api, opts: {} } as Ctx, 'type', 'se')).toEqual([{ name: 'SEK', value: 'sek' }]);
  });
  it('shift types with permitted roles: only offered to members who have one of them', async () => {
    const SEK_ROLE = '600000000000000001';
    const restricted = { enabled: true, types: [{ id: 'streife', name: 'Streife', isDefault: true, permittedRoleIds: [SEK_ROLE] }, { id: 'sek', name: 'SEK', isDefault: false, permittedRoleIds: [SEK_ROLE] }, { id: 'buero', name: 'Büro', isDefault: false, permittedRoleIds: [] }] };
    const { api } = fakeApi({ 'GET /bot/shifts': restricted, 'GET /team/me/shifts': { days: 1, items: [] }, 'GET /team/me/shift-stats': { count: 0, minutes: 0 } });
    const def = byName('shift')!;
    const member = (roles: string[]) => ({ discordId: ME, api, opts: {}, memberRoleIds: roles }) as unknown as Ctx;
    expect((await def.complete!(member([]), 'type', '')).map((t) => t.value)).toEqual(['buero']);
    expect((await def.complete!(member([SEK_ROLE]), 'type', '')).map((t) => t.value)).toEqual(['streife', 'sek', 'buero']);
    // ohne die Rolle: Standard (Streife) ist gesperrt → erste erlaubte Art; ausdrücklich gewählte gesperrte Art → Hinweis
    const r = await def.run({ ...member([]), opts: { _sub: 'manage' } });
    expect(r.buttons?.[0]?.id).toBe(`shift:on:buero:${ME}`);
    expect(text(await def.run({ ...member([]), opts: { _sub: 'manage', type: 'sek' } }))).toContain('fehlt dir die passende Rolle');
  });
  it('leaderboard like Trident: server header, @members with time, all time by default, Raw Shift Data as CSV', async () => {
    const OTHER_D = '223456789012345678';
    const board = { days: null, shiftType: null, me: 'b', users: [{ userId: 'a', name: 'Lorenzo', callsign: 'ADAM-1', discordId: OTHER_D, shifts: 2, seconds: 13 * 3600 + 33 * 60 + 52 }, { userId: 'b', name: 'Eva', callsign: null, discordId: null, shifts: 1, seconds: 1 }] };
    const { api, calls } = fakeApi({ 'GET /team/leaderboard': board, 'GET /bot/shifts': types });
    const r = await byName('shift')!.run({ discordId: ME, api, opts: { _sub: 'leaderboard' }, guildName: 'ENRP | Polizei', guildIcon: 'https://cdn.example/icon.png' } as Ctx);
    expect(calls[0]!.path).toBe('/team/leaderboard');
    expect(r.embeds?.[0]).toMatchObject({ title: 'Shift Leaderboard', author: { name: 'ENRP | Polizei', iconUrl: 'https://cdn.example/icon.png' }, footer: 'Showing All Shift Types' });
    expect(r.embeds?.[0]?.description).toBe(`\`1.\` <@${OTHER_D}> • 13 hours, 33 minutes, 52 seconds\n\`2.\` **Eva** • 1 second`);
    expect(r.buttons).toEqual([{ id: 'shift:raw:0:', label: 'Raw Shift Data', style: 'secondary' }]);
    const sek = await run(api, 'leaderboard', { type: 'SEK', days: 30 });
    expect(calls.at(-1)!.path).toBe('/team/leaderboard?days=30&shiftType=sek');
    expect(sek.embeds?.[0]?.footer).toBe('Showing Shift Type: SEK · last 30 days');
    const raw = await click(api, 'shift:raw:0:');
    expect(raw.ephemeral).toBe(true);
    expect(raw.files?.[0]?.name).toBe('shift-data.csv');
    expect(raw.files?.[0]?.data.split('\n')[1]).toBe(`1,"Lorenzo","ADAM-1","${OTHER_D}",2,48832,"13 hours, 33 minutes, 52 seconds"`);
  });
  it('active like Trident: server header, @members with shift time; empty text', async () => {
    const OTHER_D = '223456789012345678';
    const { api } = fakeApi({ 'GET /team/active-shifts': [
      { userId: 'a', name: 'Max', discordId: OTHER_D, status: 'ON_DUTY', shiftType: 'SEK', startedAt: '2026-10-17T10:00:00Z', seconds: 3725 },
      { userId: 'b', name: 'Eva', discordId: null, status: 'BREAK', shiftType: null, startedAt: '2026-10-17T11:00:00Z', seconds: 60 },
    ] });
    const r = await byName('shift')!.run({ discordId: ME, api, opts: { _sub: 'active' }, guildName: 'ENRP | Polizei' } as Ctx);
    expect(r.embeds?.[0]).toMatchObject({ title: '🕒 Active Shifts', author: { name: 'ENRP | Polizei' } });
    expect(r.embeds?.[0]?.description).toBe(`\`1.\` <@${OTHER_D}> • 1 hour, 2 minutes, 5 seconds • SEK\n\`2.\` **Eva** • 1 minute (On Break)`);
    const empty = fakeApi({ 'GET /team/active-shifts': [] });
    expect((await run(empty.api, 'active')).embeds?.[0]?.description).toBe('There are no active shifts.');
  });
  it('admin like Trident: header with member, all time + last shift, Shift Actions menu and Start/Pause/End for the member', async () => {
    const stats = { count: 2, minutes: 1703, seconds: 102_185, last: { shiftId: '1508566299347784460', status: 'ENDED', seconds: 102_177, shiftType: null } };
    const { api, calls } = fakeApi({ 'GET /team/shifts': { days: 1, member: { userId: UID, name: 'Max' }, items: [] }, [`GET /team/${UID}/shift-stats`]: stats, [`PUT /team/${UID}/status`]: {} });
    const ctx = { discordId: ME, api, opts: { _sub: 'admin', member: OTHER }, userNameOf: async () => 'jujus_ogg', userAvatarOf: async () => 'https://cdn.example/a.png' } as unknown as Ctx;
    const r = await byName('shift')!.run(ctx);
    expect(r.embeds?.[0]?.author).toEqual({ name: 'Shift Management: @jujus_ogg', iconUrl: 'https://cdn.example/a.png' });
    const t = text(r);
    expect(t).toContain('**Shift Count**: 2');
    expect(t).toContain('**Total Duration**: 1 day, 4 hours, 23 minutes');
    expect(t).toContain('**Average Duration**: 14 hours, 11 minutes, 33 seconds');
    expect(t).toContain('### 🕒 Last Shift');
    expect(t).toContain('**Status**: ⚫ Ended');
    expect(t).toContain('**Total Time**: 1 day, 4 hours, 22 minutes');
    expect(t).toContain('-# Shift Type: default');
    expect(r.panel).toBe(true);
    expect(r.select?.id).toBe(`shift:act:${UID}:${OTHER}`);
    expect(r.select?.options.map((o) => o.label)).toEqual(['View Shift List', 'Modify Shift', 'Delete Shift', 'Clear User Shifts']);
    expect(r.buttons?.map((b) => `${b.label}${b.disabled ? ' (aus)' : ''}`)).toEqual(['Start', 'Pause (aus)', 'End (aus)']);
    // Start für das Mitglied → Status über die Schichtleitung, Panel neu
    const start = interactionFor(r.buttons![0]!.id)!;
    expect(start.def.panel?.(start.args)).toBe(true);
    const after = await start.def.run({ ...ctx, opts: {}, args: start.args });
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({ path: `/team/${UID}/status`, body: { status: 'ON_DUTY' } });
    expect(text(after)).toContain('Shift started');
    // Menü: Modify/Delete öffnen Formulare (letzte Schicht vorausgefüllt), Clear fragt nach
    const act = interactionFor(r.select!.id)!;
    expect(act.def.opensModal?.(act.args, ['modify'])).toBe(true);
    expect(act.def.opensModal?.(act.args, ['list'])).toBe(false);
    const modal = await act.def.run({ ...ctx, opts: {}, args: act.args, values: ['modify'] });
    expect(modal.modal?.id).toBe(`shift:mod:${UID}:${OTHER}`);
    expect(modal.modal?.fields[0]?.value).toBe('1508566299347784460');
    expect((await act.def.run({ ...ctx, opts: {}, args: act.args, values: ['clear'] })).buttons?.[0]?.id).toBe(`shift:clear:${UID}:${OTHER}`);
    const unlinked = fakeApi({ 'GET /team/shifts': { days: 1, member: null, items: [] } });
    expect(text(await run(unlinked.api, 'admin', { member: OTHER }))).toContain('keinem Konto');
  });
  it('admin actions: modify (add/remove/set time), delete and clear shifts', async () => {
    const stats = { count: 1, minutes: 60, seconds: 3600, last: { shiftId: '42', status: 'ENDED', seconds: 3600, shiftType: 'SEK' } };
    const { api, calls } = fakeApi({ 'GET /team/shifts': { days: 1, member: { userId: UID, name: 'Max' }, items: [] }, [`GET /team/${UID}/shift-stats`]: stats,
      'PATCH /team/shifts/42': { seconds: 9000 }, 'DELETE /team/shifts/42': { deleted: true }, [`DELETE /team/${UID}/shifts`]: { deleted: 3 } });
    const go = async (id: string, extra: object) => { const hit = interactionFor(id)!; return hit.def.run({ discordId: ME, api, opts: {}, args: hit.args, ...extra }); };
    const mod = await go(`shift:mod:${UID}:${OTHER}`, { fields: { shift: '42', duration: '1h 30m' }, modal: { values: { shift: '42', action: ['add'], duration: '1h 30m' }, files: {} } });
    expect(calls.find((c) => c.method === 'PATCH')).toMatchObject({ path: '/team/shifts/42', body: { action: 'add', seconds: 5400 } });
    expect(text(mod)).toContain('new total time: 2 hours, 30 minutes');
    expect(mod.panel).toBe(true);
    expect(text(await go(`shift:mod:${UID}:${OTHER}`, { fields: { shift: '42', duration: 'viel' }, modal: { values: { action: ['set'] }, files: {} } }))).toContain('Ungültige Dauer');
    expect(text(await go(`shift:del:${UID}:${OTHER}`, { fields: { shift: '42' } }))).toContain('Shift `42` deleted');
    expect(text(await go(`shift:clear:${UID}:${OTHER}`, {}))).toContain('3 entries');
    expect(parseShiftDuration('1d 2h')).toBe(93_600);
    expect(parseShiftDuration('45')).toBe(2700);
    expect(parseShiftDuration('90s')).toBe(90);
  });
});
