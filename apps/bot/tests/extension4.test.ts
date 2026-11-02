import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { EXTENSION4_COMMANDS, helpSearch, orgLines } from '../src/commands/extension4';

const cmd = (n: string) => EXTENSION4_COMMANDS.find((c) => c.name === n)!;
const fakeApi = (handler: (method: string, path: string) => unknown, calls: string[] = []) => ({ async asUser(_d: string, method: string, path: string) { calls.push(`${method} ${path}`); return handler(method, path) as never; }, async service() { throw new Error('unused'); } }) as Api;

describe('Erweiterungspaket 4.0 – Bot', () => {
  it('/personal akte: asks the API as the linked user, answers privately without confidential fields', async () => {
    const calls: string[] = [];
    const api = fakeApi(() => ({ name: 'Max', robloxName: 'max_rbx', rank: 'Kommissar', department: 'Streife', status: 'ACTIVE', serviceNumber: '1001', callsign: 'A-1', joinDate: '2026-01-01T00:00:00Z', dutyStatus: { status: 'ON_DUTY', since: null }, units: [{ name: 'DG A', role: 'MEMBER', supervisor: 'Chef' }], qualifications: ['Verkehrskontrolle'] }), calls);
    const r = await cmd('personal').run({ discordId: '123456789012345678', opts: { _sub: 'akte', mitglied: '223456789012345678' }, api });
    expect(calls).toEqual(['GET /personnel-file/lookup?discordId=223456789012345678']);
    expect(r.ephemeral).toBe(true);
    expect(JSON.stringify(r.embeds)).toContain('Verkehrskontrolle');
    expect(JSON.stringify(r.embeds)).toContain('Im Dienst');
  });
  it('/personal akte without rights shows the missing permission', async () => {
    const api = fakeApi(() => { throw new BotApiError(403, 'PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.', undefined, undefined, 'personnel.view'); });
    const r = await cmd('personal').run({ discordId: '123456789012345678', opts: { _sub: 'akte', mitglied: '223456789012345678' }, api });
    expect(r.ephemeral).toBe(true);
    expect(JSON.stringify(r)).toMatch(/keine Berechtigung/);
  });
  it('/organigramm renders the hierarchy indented', async () => {
    const units = [{ id: 'a', parentId: null, name: 'Führung', kind: 'LEADERSHIP', active: true, leader: { name: 'Chef' }, deputy: null }, { id: 'b', parentId: 'a', name: 'DG A', kind: 'DUTY_GROUP', active: true, leader: null, deputy: { name: 'Vize' } }];
    expect(orgLines(units)).toEqual(['**Führung** – Chef', '　└ **DG A** – ohne Leitung (Stv. Vize)']);
    const r = await cmd('organigramm').run({ discordId: '1', opts: {}, api: fakeApi(() => units) });
    expect(r.embeds?.[0]?.description).toContain('DG A');
  });
  it('/hilfe: single hit shows the article, otherwise a list; no hit points to support', async () => {
    const one = fakeApi((_m, p) => (p.startsWith('/help/articles?') ? { total: 1, rows: [{ slug: 'dienst', title: 'Wie melde ich mich zum Dienst?', kind: 'GUIDE', summary: null }] } : { title: 'Wie melde ich mich zum Dienst?', summary: null, body: '/shift start' }));
    expect((await helpSearch({ discordId: '1', opts: { suche: 'dienst' }, api: one })).embeds?.[0]?.description).toContain('/shift start');
    const none = fakeApi(() => ({ total: 0, rows: [] }));
    expect((await helpSearch({ discordId: '1', opts: { suche: 'xyz' }, api: none })).content).toContain('/support');
  });
});
