import { describe, expect, it, vi } from 'vitest';
import { ChannelType, ComponentType, type ModalSubmitInteraction } from 'discord.js';
import { formModal, type TicketEffect, type TicketQuestion } from '@enrp/shared';
import { BotApiError, type Api } from '../src/api';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import type { Reply } from '../src/format';
import { createTicketRuntime, modalOf, modalValuesOf, payloadOf } from '../src/discord-tickets';

const ME = '123456789012345678', GUILD = '323456789012345678';
const CAT = '22222222-2222-4222-8222-222222222222', PANEL = '33333333-3333-4333-8333-333333333333', DRAFT = '44444444-4444-4444-8444-444444444444';
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
const run = (customId: string, api: Api, extra: Partial<Ctx> & { values?: string[]; modal?: { values: Record<string, unknown>; files: Record<string, unknown> } } = {}) => {
  const hit = interactionFor(customId)!;
  return hit.def.run({ discordId: ME, opts: {}, api, guildId: GUILD, userName: 'Max', memberRoleIds: ['R1'], interactionId: '999999999999999999', ...extra, args: hit.args } as never) as Promise<Reply>;
};
const FIELDS: TicketQuestion[] = [
  { id: 'subject', label: 'Betreff', type: 'SHORT', required: true, options: [], maxLength: 100 },
  { id: 'topic', label: 'Worum geht es?', type: 'SELECT', required: true, options: ['Allgemeine Frage', 'Sonstiges'], description: 'Bitte wählen' },
  { id: 'file', label: 'Anhang oder Screenshot', type: 'FILE', required: false, options: [], max: 2 },
];

describe('ticket form in Discord', () => {
  it('panel entries with a form open the Discord form directly (first response); others are created after deferring', () => {
    const hit = (id: string) => interactionFor(id)!;
    expect(hit(`tk:open:${PANEL}:${CAT}:f`).def.opensModal!(hit(`tk:open:${PANEL}:${CAT}:f`).args)).toBe(true);
    expect(hit(`tk:open:${PANEL}:${CAT}`).def.opensModal!(hit(`tk:open:${PANEL}:${CAT}`).args)).toBe(false);
    expect(hit(`tk:open:${PANEL}`).def.opensModal!(hit(`tk:open:${PANEL}`).args, [`${CAT}:f`])).toBe(true);
    expect(hit(`tk:open:${PANEL}:~1`).def.opensModal!(hit(`tk:open:${PANEL}:~1`).args, [CAT])).toBe(false);
    expect(hit(`tk:formstep:${DRAFT}:1`).def.opensModal!(hit(`tk:formstep:${DRAFT}:1`).args)).toBe(true);
    expect(hit(`tk:formsub:${DRAFT}:0`).def.opensModal!(hit(`tk:formsub:${DRAFT}:0`).args)).toBe(false);
  });

  it('starts the form with the member\'s data and shows step 1', async () => {
    const modal = formModal(`tk:formsub:${DRAFT}:0`, 'Sonstiges (1/2)', FIELDS);
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/form/start': { draftId: DRAFT, steps: 2, modal } });
    const r = await run(`tk:open:${PANEL}`, api, { values: [`${CAT}:f`] });
    expect(calls[0]).toMatchObject({ path: '/bot/support-tickets/form/start', body: { categoryId: CAT, panelId: PANEL, guildId: GUILD, discordId: ME, memberRoleIds: ['R1'] } });
    expect(r.modal!.id).toBe(`tk:formsub:${DRAFT}:0`);
    expect(r.modal!.fields.map((f) => f.kind)).toEqual(['text', 'select', 'file']);
    // Kategorie braucht inzwischen kein Formular → normaler Button
    const { api: a2 } = fakeApi({ 'POST /bot/support-tickets/form/start': { open: true } });
    expect((await run(`tk:open:${PANEL}:${CAT}:f`, a2)).buttons![0]!.id).toBe(`tk:open:${PANEL}:${CAT}`);
    // abgelehnt (Limit) → deutsche Meldung
    const { api: a3 } = fakeApi({ 'POST /bot/support-tickets/form/start': new BotApiError(409, 'CONFLICT', 'Du hast bereits 1 offene Tickets – mehr als 1 gleichzeitig sind nicht möglich.') });
    expect((await run(`tk:open:${PANEL}:${CAT}:f`, a3)).content).toContain('mehr als 1');
  });

  it('opening without the form flag but a form category offers the form button; the interaction ID is sent for idempotency', async () => {
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/open': { form: { categoryId: CAT } } });
    const r = await run(`tk:open:${PANEL}:${CAT}`, api, { applyEffects: async () => ({}) });
    expect(calls[0]!.body).toMatchObject({ interactionId: '999999999999999999' });
    expect(r.buttons![0]).toMatchObject({ id: `tk:formopen:${PANEL}:${CAT}`, label: 'Formular ausfüllen' });
  });

  it('submits each step with all values and files; errors offer a retry, steps a continue button, the last step creates the ticket', async () => {
    const effects: TicketEffect[] = [{ type: 'post', channelId: '1', message: { content: 'x' } }];
    const answers = [
      { errors: [{ field: 'Betreff', message: 'Pflichtfeld – bitte ausfüllen.' }], step: 0 },
      { next: 1, steps: 2 },
      { ticket: { id: 'T', ref: 'EMD-000042' }, effects },
      { ticket: { id: 'T', ref: 'EMD-000042' }, effects: [], existing: true },
    ];
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/form/': () => answers.shift() });
    const modal = { values: { subject: '', topic: ['Sonstiges'] }, files: { file: [{ name: 'a.png', url: 'https://cdn.discordapp.com/a.png', size: 1, contentType: 'image/png' }] } };
    const e = await run(`tk:formsub:${DRAFT}:0`, api, { modal });
    expect(e.embeds![0]!.description).toContain('Betreff');
    expect(e.buttons![0]!.id).toBe(`tk:formstep:${DRAFT}:0`);
    expect(calls[0]).toMatchObject({ path: `/bot/support-tickets/form/${DRAFT}/submit`, body: { discordId: ME, step: 0, values: modal.values, files: modal.files } });
    expect((await run(`tk:formsub:${DRAFT}:0`, api, { modal })).buttons![0]!.id).toBe(`tk:formstep:${DRAFT}:1`);
    const applyEffects = vi.fn(async () => ({ channelId: '777' }));
    const done = await run(`tk:formsub:${DRAFT}:1`, api, { modal, applyEffects });
    expect(done.content).toContain('EMD-000042');
    expect(done.content).toContain('<#777>');
    expect(applyEffects).toHaveBeenCalledWith(effects);
    expect((await run(`tk:formsub:${DRAFT}:1`, api, { modal, applyEffects })).content).toContain('bereits erstellt');
    expect(applyEffects).toHaveBeenCalledTimes(1);
  });

  it('builds Discord forms: labels with select menus and file uploads; plain text forms stay as before', () => {
    const json = modalOf({ id: 'x', title: 'T', fields: [
      { id: 'subject', label: 'Betreff', kind: 'text', required: true, maxLength: 100, value: 'Alt' },
      { id: 'topic', label: 'Worum geht es?', kind: 'select', required: true, description: 'Bitte wählen', options: [{ label: 'A', value: 'A' }, { label: 'B', value: 'B', default: true }], minValues: 1, maxValues: 1 },
      { id: 'file', label: 'Anhang', kind: 'file', required: false, minValues: 0, maxValues: 2 },
    ] }).toJSON() as unknown as { components: { type: number; label: string; description?: string; component: { type: number; custom_id: string; options?: { default?: boolean }[]; max_values?: number; label?: string } }[] };
    expect(json.components.map((c) => [c.type, c.component.type])).toEqual([[ComponentType.Label, ComponentType.TextInput], [ComponentType.Label, ComponentType.StringSelect], [ComponentType.Label, ComponentType.FileUpload]]);
    expect(json.components[0]!.component.label).toBeUndefined(); // Beschriftung steht am Label
    expect(json.components[1]!.description).toBe('Bitte wählen');
    expect(json.components[1]!.component.options![1]!.default).toBe(true);
    expect(json.components[2]!.component.max_values).toBe(2);
    const plain = modalOf({ id: 'y', title: 'Notiz', fields: [{ id: 'text', label: 'Text', paragraph: true }] }).toJSON() as unknown as { components: { type: number }[] };
    expect(plain.components[0]!.type).toBe(ComponentType.ActionRow);
  });

  it('reads every kind of form input', () => {
    const fields = new Map<string, unknown>([
      ['subject', { type: ComponentType.TextInput, value: 'Hallo' }],
      ['topic', { type: ComponentType.StringSelect, values: ['Sonstiges'] }],
      ['ok', { type: ComponentType.Checkbox, value: true }],
      ['file', { type: ComponentType.FileUpload, attachments: new Map([['1', { name: 'a.png', url: 'https://cdn.discordapp.com/a.png', size: 5, contentType: 'image/png' }]]) }],
    ]);
    expect(modalValuesOf({ fields: { fields } } as unknown as ModalSubmitInteraction)).toEqual({
      values: { subject: 'Hallo', topic: ['Sonstiges'], ok: true }, files: { file: [{ name: 'a.png', url: 'https://cdn.discordapp.com/a.png', size: 5, contentType: 'image/png' }] },
    });
  });

  it('panels with more than 25 categories become several select menus', () => {
    const opt = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `K${i}`, value: `v${i}` }));
    const p = payloadOf({ embeds: [{ title: 'P' }], select: { id: 'tk:open:p', placeholder: 'a', options: opt(25) }, selects: [{ id: 'tk:open:p:~1', placeholder: 'b', options: opt(5) }] });
    expect(p.components).toHaveLength(2);
  });

  it('a panel that cannot be posted reports a readable reason to the dashboard', async () => {
    const { api, calls } = fakeApi({ 'POST /bot/support-tickets/panels/': { ok: true } });
    const channel = { id: '555555555555555555', type: ChannelType.GuildText, send: async () => { throw new Error('Missing Permissions'); }, messages: { fetch: async () => null } };
    const panel = { type: 'panel' as const, panelId: PANEL, channelId: '555555555555555555', messageId: null, message: { content: 'x' } };
    await createTicketRuntime(() => ({ channels: { fetch: async () => channel } }) as never, api, () => undefined).apply([panel]);
    expect(calls.find((c) => c.path.endsWith('/failed'))).toMatchObject({ body: { error: expect.stringContaining('fehlen') } });
    await createTicketRuntime(() => ({ channels: { fetch: async () => { throw new Error('Unknown Channel'); } } }) as never, api, () => undefined).apply([panel]);
    expect(calls.filter((c) => c.path.endsWith('/failed'))[1]).toMatchObject({ body: { error: expect.stringContaining('nicht gefunden') } });
  });
});
