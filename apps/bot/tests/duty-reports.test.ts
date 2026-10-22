import { describe, expect, it } from 'vitest';
import { BotApiError, type Api } from '../src/api';
import { byName } from '../src/commands';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import type { Reply } from '../src/format';

const ME = '123456789012345678', OTHER = '223456789012345678';
const R1 = '11111111-1111-4111-8111-111111111111', T1 = '22222222-2222-4222-8222-222222222222';
type Call = { method: string; path: string; body?: unknown };
function fakeApi(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  const resolve = (method: string, path: string, body: unknown) => {
    calls.push({ method, path, body });
    const key = Object.keys(routes).find((k) => `${method} ${path}` === k) ?? Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    if (!key) throw new BotApiError(404, 'NOT_FOUND', 'no route');
    return routes[key];
  };
  const api: Api = { async asUser(_d, m, p, b) { return resolve(m, p, b) as never; }, async service(m, p, b) { return resolve(m, p, b) as never; } };
  return { api, calls };
}
const run = (api: Api, sub: string, opts: Record<string, string | number> = {}) => byName('dienstbericht')!.run({ discordId: ME, api, opts: { _sub: sub, ...opts } } as Ctx);
const text = (r: Reply) => `${r.content ?? ''} ${r.embeds?.map((e) => `${e.title} ${e.description ?? ''} ${e.footer ?? ''}`).join(' ') ?? ''}`;
const template = { id: T1, name: 'Tagesbericht', emoji: '📝', period: 'DAILY', fields: [{ id: 'text', label: 'Was war los?' }] };
const report = (o: Record<string, unknown> = {}) => ({ id: R1, number: 'TB-2026-AAAAAA', templateId: T1, templateName: 'Tagesbericht', period: 'DAILY', periodStart: '2026-10-16T00:00:00Z', values: { text: 'Streife' }, status: 'SUBMITTED', template, canEdit: false, canReview: true, version: 1, author: { id: 'u1', displayName: 'Max' }, ...o });

describe('/dienstbericht liste + anzeigen', () => {
  it('liste: open reports by default, filters for member, template and days; picker opens a report', async () => {
    const { api, calls } = fakeApi({ 'GET /duty-reports/templates': [template], 'GET /duty-reports?': { items: [report()], total: 3, seeAll: true }, [`GET /duty-reports/${R1}`]: report() });
    const r = await run(api, 'liste', { mitglied: OTHER, vorlage: 'tages', tage: 7 });
    const q = new URLSearchParams(calls.at(-1)!.path.split('?')[1]);
    expect(q.get('status')).toBe('SUBMITTED');
    expect(q.get('discordId')).toBe(OTHER);
    expect(q.get('templateId')).toBe(T1);
    expect(q.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(text(r)).toContain('Berichte – Offen (3)');
    expect(text(r)).toContain('Max');
    expect(text(r)).toContain('2 weitere');
    expect(r.select?.id).toBe('drep:open');
    const open = interactionFor('drep:open')!;
    const shown = await open.def.run({ discordId: ME, api, opts: {}, args: open.args, values: [R1] });
    expect(shown.buttons?.map((b) => b.id)).toEqual([`drep:rev:${R1}`, `drep:ret:${R1}`]);
    expect(text(await run(api, 'liste', { vorlage: 'gibtsnicht' }))).toContain('Keine Vorlage');
  });
  it('liste „alle“ sends no status; without view_all it says „Deine Berichte“', async () => {
    const { api, calls } = fakeApi({ 'GET /duty-reports?': { items: [report({ status: 'RETURNED' })], total: 1, seeAll: false } });
    const r = await run(api, 'liste', { status: 'alle' });
    expect(calls.at(-1)!.path).not.toContain('status=');
    expect(text(r)).toContain('Deine Berichte – Alle (1)');
    expect(text(r)).toContain('zur Nachbesserung');
  });
  it('anzeigen: author, status and the note; review buttons only for reviewers and only where they fit', async () => {
    const reviewed = fakeApi({ 'GET /duty-reports/TB-2026-AAAAAA': report({ status: 'RETURNED', reviewNote: 'Bitte ergänzen', reviewerName: 'Chef', canEdit: true }) });
    const r = await run(reviewed.api, 'anzeigen', { nummer: 'TB-2026-AAAAAA' });
    expect(text(r)).toContain('Verfasser:** Max');
    expect(text(r)).toContain('Bitte ergänzen');
    expect(r.buttons?.map((b) => b.id)).toEqual([`drep:edit:${R1}`, `drep:rev:${R1}`]);
    const member = fakeApi({ 'GET /duty-reports/TB-2026-AAAAAA': report({ canReview: false }) });
    expect((await run(member.api, 'anzeigen', { nummer: 'TB-2026-AAAAAA' })).buttons).toBeUndefined();
  });
});

describe('/dienstbericht ausfüllen – ungültige Eingaben', () => {
  it('keeps the draft when the system rejects a value and offers „Eingaben korrigieren“ with the old values', async () => {
    const tpl = { ...template, fields: [{ id: 'roblox', label: 'Roblox-Username', type: 'short', placeholder: '', required: true, maxLength: 100, options: [] }, { id: 'festnahmen', label: 'Festnahmen', type: 'number', placeholder: '', required: false, maxLength: 10, options: [] }] };
    let fail = true;
    const calls: Call[] = [];
    const api: Api = {
      async asUser(_d, method, path, body) {
        calls.push({ method, path, body });
        if (method === 'GET' && path.startsWith('/duty-reports/templates')) return [tpl] as never;
        if (method === 'POST' && path === '/duty-reports') { if (fail) throw new BotApiError(400, 'VALIDATION_FAILED', '„Festnahmen“ darf nicht negativ sein (eingegeben: -2).'); return { number: 'TB-2026-BBBBBB', merged: false } as never; }
        throw new BotApiError(404, 'NOT_FOUND', 'no route');
      },
      async service() { throw new Error('unused'); },
    };
    const sub = interactionFor(`drep:sub:n:${T1}:0`)!;
    const r = await sub.def.run({ discordId: ME, api, opts: {}, args: sub.args, fields: { roblox: 'frd_le0n', festnahmen: '-2' } });
    expect(r.content).toContain('nicht negativ');
    expect(r.buttons?.[0]?.id).toBe(`drep:next:n:${T1}:0`);
    const next = interactionFor(r.buttons![0]!.id)!;
    const again = await next.def.run({ discordId: ME, api, opts: {}, args: next.args });
    expect(again.modal?.fields.find((f) => f.id === 'roblox')?.value).toBe('frd_le0n');
    expect(again.modal?.fields.find((f) => f.id === 'festnahmen')?.placeholder).toContain('ab 0');
    fail = false;
    const ok = await sub.def.run({ discordId: ME, api, opts: {}, args: sub.args, fields: { roblox: 'frd_le0n', festnahmen: '2' } });
    expect(ok.content).toContain('TB-2026-BBBBBB');
    expect((await next.def.run({ discordId: ME, api, opts: {}, args: next.args })).content).toContain('abgelaufen');
  });
});
