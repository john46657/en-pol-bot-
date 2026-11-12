import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';

const calls: string[] = [];
const fake = (routes: Record<string, unknown>): Api => ({
  async asUser(_d, method, path) { calls.push(`${method} ${path}`); const k = Object.keys(routes).find((x) => `${method} ${path}`.startsWith(x)); if (!k) throw new BotApiError(404, 'NOT_FOUND', 'no route'); const r = routes[k]; if (r instanceof BotApiError) throw r; return r as never; },
  async service() { throw new Error('nicht erwartet'); },
});
const run = (name: string, opts: Record<string, string>, api: Api) => byName(name)!.run({ discordId: '123456789012345678', opts, api });
const txt = (r: { embeds?: { title: string; description?: string; fields?: { name: string; value: string }[] }[]; content?: string }) => JSON.stringify(r);

describe('/lage und /vorgang', () => {
  const situation = { generatedAt: '2026-10-21T10:00:00Z', incidents: { total: 2, unassigned: 1 }, officers: { onDuty: 3, available: 1 }, units: { assigned: [{}], total: 4 }, wanted: { total: 5, hitsToReview: 0 }, reports: { incomplete: [{}], byStatus: {} }, disruptions: { items: [] }, tasks: { items: [{ label: 'Offene Bewerbungen', count: 2 }] }, critical: [{ text: 'E-2026-00001 · Raub – keine Einheit' }] };
  it('/lage zeigt nur Daten aus der API und läuft mit den Rechten des Benutzers', async () => {
    const r = await run('lage', {}, fake({ 'GET /situation': situation }));
    expect(r.ephemeral).toBe(true);
    expect(txt(r)).toContain('3 im Dienst');
    expect(txt(r)).toContain('keine Einheit');
    expect(txt(r)).toContain('Offene Bewerbungen: 2');
  });
  it('/lage ohne Recht: verständliche Absage', async () => {
    const r = await run('lage', {}, fake({ 'GET /situation': new BotApiError(403, 'PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.') }));
    expect(txt(r)).toMatch(/Berechtigung/);
  });
  it('/vorgang per Vorgangs- oder Einsatznummer', async () => {
    const detail = { number: 'V-2026-00001', title: 'Raubserie', statusLabel: 'Offen', links: [{ typeLabel: 'CAD-Einsatz', label: 'E-2026-00001 · Raub' }], events: [{ at: '2026-10-21T10:00:00Z', text: 'Vorgang angelegt' }] };
    const api = fake({ 'GET /cases?q=E-2026-00001': { items: [] }, 'GET /cases?incidentNumber=E-2026-00001': { items: [{ id: 'c1', number: 'V-2026-00001' }] }, 'GET /cases/c1': detail });
    const r = await run('vorgang', { nummer: 'E-2026-00001' }, api);
    expect(txt(r)).toContain('V-2026-00001');
    expect(txt(r)).toContain('E-2026-00001 · Raub');
    expect(txt(await run('vorgang', { nummer: 'V-9' }, fake({ 'GET /cases': { items: [] } })))).toMatch(/Kein Vorgang/);
  });
});
