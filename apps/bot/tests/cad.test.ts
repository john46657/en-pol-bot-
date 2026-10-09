import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import { cadButtons, renderCadOutbox } from '../src/commands/cad';
import type { Ctx } from '../src/commands/types';
import { pollOnce } from '../src/outbox';
import type { Reply } from '../src/format';

const ME = '123456789012345678', GUILD = '323456789012345678';
const CALL = '11111111-2222-3333-4444-555555555555', UNIT = '66666666-2222-3333-4444-555555555555';
type Call = { method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    const key = `${method} ${path}`;
    if (!(key in routes)) throw new BotApiError(404, 'NOT_FOUND', `no route ${key}`);
    const r = routes[key];
    if (r instanceof BotApiError) throw r;
    return typeof r === 'function' ? (r as (b: unknown) => unknown)(body) : r;
  };
  const api: Api = {
    async asUser(_d, method, path, body) { calls.push({ method, path, body }); return resolve(method, path, body) as never; },
    async service(method, path, body) { calls.push({ method, path, body }); return resolve(method, path, body) as never; },
  };
  return { api, calls };
}
const ctx = (api: Api, opts: Ctx['opts'] = {}): Ctx => ({ discordId: ME, opts, api, guildId: GUILD });
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''}`).join(' ') ?? ''}`;
const CFG = { unitStatuses: [{ key: 'AVAILABLE', label: 'Verfügbar', emoji: '🟢' }, { key: 'ON_SCENE', label: 'Am Einsatzort', emoji: '🟠' }], incidentStatuses: [{ key: 'NEW', label: 'Neu' }], priorities: [{ key: 'HIGH', label: 'Hoch', emoji: '🔴' }] };
const UNITS = [{ id: UNIT, callsign: 'SEK-01', name: null, status: 'AVAILABLE', operational: true, crew: [{ discordId: ME }], current: null }];

describe('/cad', () => {
  it('status: by label, for the own unit; unknown status lists the options', async () => {
    const { api, calls } = fakeApi({ 'GET /cad/config': CFG, 'GET /cad/units': UNITS, [`POST /cad/units/${UNIT}/status`]: {} });
    const cmd = byName('cad')!;
    expect(text(await cmd.run(ctx(api, { _sub: 'status', status: 'irgendwas' })))).toContain('Verfügbar');
    const r = await cmd.run(ctx(api, { _sub: 'status', status: 'am einsatzort' }));
    expect(text(r)).toContain('SEK-01');
    expect(calls.at(-1)).toMatchObject({ path: `/cad/units/${UNIT}/status`, body: { status: 'ON_SCENE' } });
  });
  it('funk: sends the radio message, server-link errors are explained', async () => {
    const { api } = fakeApi({ 'POST /cad/radio': { callsign: 'SEK-01', incidentNumber: 'E-2026-00001' } });
    expect(text(await byName('cad')!.run(ctx(api, { _sub: 'funk', text: 'Am Einsatzort.' })))).toContain('E-2026-00001');
    const denied = fakeApi({ 'POST /cad/radio': new BotApiError(403, 'PERMISSION_DENIED', 'Dieser Discord-Server ist für diese Aktion nicht mit der Leitstelle verbunden.') });
    expect(text(await byName('cad')!.run(ctx(denied.api, { _sub: 'funk', text: 'x' })))).toMatch(/nicht|Recht/);
  });
  it('rueckmeldung: meldet für die eigene Einheit; ohne Einheit ein Hinweis', async () => {
    const { api, calls } = fakeApi({ 'GET /cad/units': UNITS, [`POST /cad/units/${UNIT}/feedback`]: { number: 'E-2026-00007', callsign: 'SEK-01' } });
    const r = await byName('cad')!.run(ctx(api, { _sub: 'rueckmeldung', art: 'support', notiz: 'Schüsse' }));
    expect(text(r)).toContain('Unterstützung benötigt');
    expect(text(r)).toContain('E-2026-00007');
    expect(calls.at(-1)).toMatchObject({ path: `/cad/units/${UNIT}/feedback`, body: { kind: 'support', note: 'Schüsse' } });
    const none = fakeApi({ 'GET /cad/units': [] });
    expect(text(await byName('cad')!.run(ctx(none.api, { _sub: 'rueckmeldung', art: 'accepted' })))).toContain('keiner Einheit');
  });
  it('Meldungen: Rückmeldung, Unterstützung benötigt und Schichtübergabe', () => {
    expect(renderCadOutbox('cad.incident.support', { number: 'E-1', title: 'Raub', callsign: 'SEK-01', note: 'Schüsse' })?.title).toContain('Unterstützung benötigt: SEK-01');
    expect(renderCadOutbox('cad.incident.feedback', { number: 'E-1', title: 'Raub', callsign: 'K9-01', feedback: '📍 Am Einsatzort' })?.title).toContain('K9-01: 📍 Am Einsatzort');
    const h = renderCadOutbox('cad.handover', { by: 'Dana', notes: 'B210 gesperrt', incidents: ['E-1 · Raub (Neu)'], openIncidents: 1, activeUnits: 2, openCalls: 0, dashboardUrl: 'https://x.test/cad/handover' });
    expect(h?.description).toContain('B210 gesperrt');
    expect(h?.description).toContain('E-1 · Raub');
    expect(cadButtons('cad.handover', { dashboardUrl: 'https://x.test/cad/handover' })).toHaveLength(1);
  });
});

describe('Notruf-Buttons', () => {
  it('claim, create incident, pick a unit', async () => {
    const { api, calls } = fakeApi({ [`POST /cad/calls/${CALL}/claim`]: {}, [`POST /cad/calls/${CALL}/incident`]: { number: 'E-2026-00007' }, 'GET /cad/units': UNITS, [`POST /cad/calls/${CALL}/assign`]: { incidentId: 'x' } });
    const run = async (id: string, values?: string[]) => { const h = interactionFor(id)!; return h.def.run({ ...ctx(api), args: h.args, values }); };
    expect(text(await run(`cad:call:${CALL}:claim`))).toContain('übernommen');
    expect(text(await run(`cad:call:${CALL}:incident`))).toContain('E-2026-00007');
    const pick = await run(`cad:call:${CALL}:units`);
    expect(pick.select?.options.map((o) => o.value)).toEqual([UNIT]);
    expect(text(await run(pick.select!.id, [UNIT]))).toContain('zugewiesen');
    expect(calls.at(-1)).toMatchObject({ path: `/cad/calls/${CALL}/assign`, body: { unitId: UNIT } });
  });
  it('embeds + buttons for the call and incident messages', () => {
    const p = { id: CALL, callNumber: 1182, description: 'Schussgeräusche', location: 'Park Street', startedAt: '2026-10-07T18:44:00Z', mapUrl: 'https://cad.example/cad/map?call=1' };
    expect(renderCadOutbox('cad.call.received', p)?.title).toBe('🚨 NOTRUF #1182');
    expect(cadButtons('cad.call.received', p)?.map((b) => b.label)).toEqual(['Übernehmen', 'Einsatz erstellen', 'Einheit zuweisen', 'Schließen', 'Auf Karte anzeigen']);
    expect(renderCadOutbox('cad.incident.created', { number: 'E-2026-00001', title: 'Banküberfall', priority: '🔴 Hoch', priorityColor: '#ef4444' })).toMatchObject({ color: 0xef4444 });
  });
  it('outbox sends CAD messages to every channel from the API and pings the configured roles', async () => {
    const sent: { channel: string; ping?: string[] }[] = [];
    const items = [{ id: 'o1', type: 'cad.incident.created', channelKey: 'cad', payload: { number: 'E-1', title: 'Test', channelIds: ['900000000000000001', '900000000000000002'], pingRoleIds: ['900000000000000003'] } }];
    const { api } = fakeApi({ 'GET /bot/config': {}, 'GET /bot/outbox?limit=20': items, 'POST /bot/outbox/o1/ack': {} });
    const n = await pollOnce(api, async (ch, _e, _b, o) => { sent.push({ channel: ch, ping: o?.pingRoleIds }); });
    expect(n).toBe(1);
    expect(sent).toEqual([{ channel: '900000000000000001', ping: ['900000000000000003'] }, { channel: '900000000000000002', ping: ['900000000000000003'] }]);
  });
});
