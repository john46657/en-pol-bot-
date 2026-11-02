import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName, COMMANDS } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import { commandsForServer } from '@enrp/shared';

const ME = '123456789012345678';
type Call = { method: string; path: string; body?: unknown };
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
    async asUser(_d, method, path, body) { calls.push({ method, path, body }); return resolve(method, path, body) as never; },
    async service(method, path, body) { calls.push({ method, path, body }); return resolve(method, path, body) as never; },
  };
  return { api, calls };
}
const ctx = (api: Api, opts: Record<string, string | number | boolean | undefined>): Ctx => ({ discordId: ME, opts, api });
const H = 3_600_000;
const SID = '11111111-1111-4111-8111-111111111111', SID2 = '22222222-2222-4222-8222-222222222222';
const shift = (id: string, o: Record<string, unknown> = {}) => ({ id, name: 'Frühschicht', startsAt: new Date(Date.now() + 2 * H).toISOString(), endsAt: new Date(Date.now() + 6 * H).toISOString(), department: 'Polizei', unit: null, leaderName: 'Chef', status: 'PUBLISHED', statusLabel: 'Veröffentlicht', coverage: { assigned: 1, min: 2, max: 3, state: 'UNDER' }, assignees: [{ userId: 'u', name: 'Max' }], mine: false, ...o });

describe('/schichtplan', () => {
  const cmd = byName('schichtplan')!;
  it('ist registriert, gehört zum Modul Dienstplanung und ist bei abgeschaltetem Modul weg', () => {
    expect(cmd).toBeDefined();
    expect(commandsForServer(COMMANDS, ['planning']).some((c) => c.name === 'schichtplan')).toBe(false);
    expect(commandsForServer(COMMANDS, []).some((c) => c.name === 'schichtplan')).toBe(true);
  });
  it('anzeigen: Liste mit Auswahl zum Anmelden (offen) und Abmelden (eigene), privat', async () => {
    const { api } = fakeApi({ 'GET /shiftplan?': { items: [shift(SID), shift(SID2, { name: 'Spät', mine: true })] } });
    const r = await cmd.run(ctx(api, { _sub: 'anzeigen' }));
    expect(r.ephemeral).toBe(true);
    expect(r.embeds?.[0]?.description).toMatch(/Frühschicht/);
    expect(r.selects?.map((s) => s.id)).toEqual(['splan:signup', 'splan:withdraw']);
    expect(r.selects?.[0]?.options.map((o) => o.value)).toEqual([SID]);
  });
  it('anmelden über Auswahlmenü ruft die API; Konflikt wird verständlich angezeigt', async () => {
    const { api, calls } = fakeApi({ [`POST /shiftplan/${SID}/signup`]: shift(SID, { mine: true }) });
    const hit = interactionFor('splan:signup')!;
    const r = await hit.def.run({ ...ctx(api, {}), args: hit.args, values: [SID] } as never);
    expect(r.embeds?.[0]?.description ?? r.content).toMatch(/angemeldet/);
    expect(calls[0]).toMatchObject({ method: 'POST', path: `/shiftplan/${SID}/signup` });
    const { api: api2 } = fakeApi({ [`POST /shiftplan/${SID}/signup`]: new BotApiError(409, 'CONFLICT', 'Du bist für diese Schicht schon angemeldet.') });
    const r2 = await cmd.run(ctx(api2, { _sub: 'anmelden', schicht: SID }));
    expect(JSON.stringify(r2)).toMatch(/schon angemeldet/);
  });
  it('ungültige Schicht-ID wird gar nicht erst an die API geschickt', async () => {
    const { api, calls } = fakeApi({});
    const r = await cmd.run(ctx(api, { _sub: 'abmelden', schicht: '../../users' }));
    expect(JSON.stringify(r)).toMatch(/aus der Liste/);
    expect(calls).toHaveLength(0);
  });
  it('abmelden mit Grund und melden', async () => {
    const { api, calls } = fakeApi({ [`POST /shiftplan/${SID}/withdraw`]: shift(SID), [`POST /shiftplan/${SID}/report`]: { delivered: 1 } });
    await cmd.run(ctx(api, { _sub: 'abmelden', schicht: SID, grund: 'krank' }));
    expect(calls[0]?.body).toEqual({ reason: 'krank' });
    const r = await cmd.run(ctx(api, { _sub: 'melden', schicht: SID, nachricht: 'Komme später' }));
    expect(JSON.stringify(r)).toMatch(/Schichtleitung/);
  });
  it('fehlende Berechtigung → verständliche Meldung', async () => {
    const { api } = fakeApi({ 'GET /shiftplan/mine': new BotApiError(403, 'PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.') });
    const r = await cmd.run(ctx(api, { _sub: 'meine' }));
    expect(JSON.stringify(r)).toMatch(/Berechtigung/);
  });
  it('Autocomplete: anmelden nur offene, abmelden nur eigene', async () => {
    const { api } = fakeApi({ 'GET /shiftplan?': { items: [shift(SID), shift(SID2, { name: 'Spät', mine: true })] } });
    expect((await cmd.complete!(ctx(api, { _sub: 'anmelden' }), 'schicht', '')).map((x) => x.value)).toEqual([SID]);
    expect((await cmd.complete!(ctx(api, { _sub: 'abmelden' }), 'schicht', '')).map((x) => x.value)).toEqual([SID2]);
  });
});

describe('/antrag', () => {
  const cmd = byName('antrag')!;
  const RID = '33333333-3333-4333-8333-333333333333';
  it('Beförderung beantragen schickt nur eigene Angaben; Voraussetzungen fehlen → Hinweis', async () => {
    const { api, calls } = fakeApi({ 'POST /hr/requests/self': { number: 'BF-2026-ABC' } });
    const r = await cmd.run(ctx(api, { _sub: 'befoerderung', rang: RID, begruendung: 'Ich habe genug Erfahrung.' }));
    expect(JSON.stringify(r)).toMatch(/BF-2026-ABC/);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/hr/requests/self', body: { kind: 'PROMOTION', to: RID, reason: 'Ich habe genug Erfahrung.' } });
    const { api: a2 } = fakeApi({ 'POST /hr/requests/self': new BotApiError(409, 'CONFLICT', 'Die Voraussetzungen für „X“ sind noch nicht erfüllt (0/1): 30 Tage im aktuellen Rang') });
    expect(JSON.stringify(await cmd.run(ctx(a2, { _sub: 'befoerderung', rang: RID, begruendung: 'Ich habe genug Erfahrung.' })))).toMatch(/Voraussetzungen/);
  });
  it('Status zeigt Rückfrage; antworten nur mit gültiger ID', async () => {
    const { api, calls } = fakeApi({ 'GET /hr/requests/mine': [{ id: RID, number: 'BF-1', kind: 'PROMOTION', status: 'NEEDS_INFO', statusLabel: 'Rückfrage erforderlich', fromLabel: 'A', toLabel: 'B', createdAt: new Date().toISOString(), openQuery: { question: 'Warum?', askedByName: 'Chef' }, decisions: [], canWithdraw: true }], [`POST /hr/requests/${RID}/answer`]: { status: 'IN_REVIEW' } });
    expect(JSON.stringify(await cmd.run(ctx(api, { _sub: 'status' })))).toMatch(/Rückfrage von Chef/);
    expect(JSON.stringify(await cmd.run(ctx(api, { _sub: 'antworten', antrag: 'x', antwort: 'y' })))).toMatch(/aus der Liste/);
    await cmd.run(ctx(api, { _sub: 'antworten', antrag: RID, antwort: 'Darum.' }));
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: `/hr/requests/${RID}/answer`, body: { answer: 'Darum.' } });
    expect((await cmd.complete!(ctx(api, { _sub: 'antworten' }), 'antrag', '')).map((x) => x.value)).toEqual([RID]);
  });
});

describe('/termine und Besprechungs-Buttons', () => {
  const EID = '44444444-4444-4444-8444-444444444444';
  const ev = { id: EID, title: 'Führungsrunde', categoryLabel: 'Dienstbesprechung', startsAt: new Date(Date.now() + 3 * H).toISOString(), endsAt: new Date(Date.now() + 4 * H).toISOString(), allDay: false, location: null, status: 'SCHEDULED', myStatus: 'INVITED', mandatory: true, counts: { accepted: 0 }, maxParticipants: null, openSignup: true };
  it('Liste mit Zusage-Auswahl; ohne offene Termine keine leere Auswahl', async () => {
    const { api } = fakeApi({ 'GET /calendar/upcoming': [ev] });
    const r = await byName('termine')!.run(ctx(api, { _sub: 'liste' }));
    expect(r.embeds?.[0]?.description).toMatch(/Pflicht/);
    expect(r.select?.id).toBe('cal:accept');
    const { api: a2 } = fakeApi({ 'GET /calendar/upcoming': [{ ...ev, myStatus: 'ACCEPTED' }] });
    expect((await byName('termine')!.run(ctx(a2, { _sub: 'liste' }))).select).toBeUndefined();
  });
  it('Buttons unter der Ankündigung: zusagen/absagen/abwesend über die API', async () => {
    const { api, calls } = fakeApi({ [`POST /calendar/${EID}/respond`]: ev });
    for (const [btn, status] of [['accept', 'ACCEPTED'], ['decline', 'DECLINED'], ['excuse', 'EXCUSED']] as const) {
      const hit = interactionFor(`meet:${btn}:${EID}`)!;
      await hit.def.run({ ...ctx(api, {}), args: hit.args } as never);
      expect(calls.at(-1)).toMatchObject({ path: `/calendar/${EID}/respond`, body: { status } });
    }
    const bad = interactionFor('meet:accept:../../x')!;
    expect(JSON.stringify(await bad.def.run({ ...ctx(api, {}), args: bad.args } as never))).toMatch(/aus der Liste/);
  });
  it('Module: /antrag gehört zu Personal, /termine zu Dienstplanung', () => {
    expect(commandsForServer(COMMANDS, ['personnel']).some((c) => c.name === 'antrag')).toBe(false);
    expect(commandsForServer(COMMANDS, ['planning']).some((c) => c.name === 'termine')).toBe(false);
  });
});
