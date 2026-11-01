import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MB_TEMPLATE_EXPORT_FORMAT } from '@enrp/shared';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { MessageBuilderSendService } from '../src/message-builder/message-builder-send.service';
import { WebhookClient } from '../src/message-builder/webhook-client';

/** Embed Builder: Erweiterungen (Vorlagen-Import/-Export, Beispielvorlagen, Threads/Foren, Historie → Editor, gespeicherte Nachrichten, Bearbeiten, Webhook-Verwaltung). */
const TOKEN = 'test-bot-token-embedbuilder-0123456789abcdef';
const bot = () => ({ Authorization: `Bot ${TOKEN}` });
const GUILD = '490000000000000001', OTHER = '490000000000000099';
const CH = '491000000000000001', FORUM = '491000000000000002', THREAD = '491000000000000003', FOREIGN_THREAD = '491000000000000004', CH2 = '491000000000000005';
const ROLE = '492000000000000001';
const HOOK_URL = 'https://discord.com/api/webhooks/493000000000000001/zyxwvutsrqponmlkjihgfedcba_ABCDEFGHIJKLMNOP-0123456789abcdefghijk';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const started = new Date();
const prevGuild = process.env.DISCORD_GUILD_ID;
const members: string[] = [];
async function userWith(name: string, perms: string[]) {
  const u = await makeUser(prisma, name);
  await prisma.userPermissionOverride.createMany({ data: perms.map((p) => ({ userId: u.id, guildId: GUILD, permissionKey: p, effect: 'ALLOW' })) });
  members.push(u.id);
  return u;
}
async function as(name: string, guild = GUILD) { const a = (await login(app, name)).agent; a.set('X-Guild-Id', guild); return a; }
const msg = (over: Record<string, unknown> = {}) => ({ id: 'm1', content: 'Hallo **Team**', ...over });
const data = (...messages: Record<string, unknown>[]) => ({ messages: messages.length ? messages : [msg()] });
const perms = { view: true, send: true, embed: true, mentionEveryone: false };
const directory = () => ({ guilds: [{
  id: GUILD, name: 'EN | POLIZEI', icon: null, roles: [{ id: ROLE, name: 'Funk', color: 0, position: 2 }],
  channels: [
    { id: CH, name: 'ankuendigungen', type: 'text', parentId: null, position: 1, bot: perms },
    { id: CH2, name: 'infos', type: 'text', parentId: null, position: 2, bot: perms },
    { id: FORUM, name: 'dienstanweisungen', type: 'other', parentId: null, position: 3 },
  ],
  forums: [{ id: FORUM, bot: { ...perms, createThreads: true } }],
  threads: [{ id: THREAD, name: 'Besprechung', parentId: CH }, { id: FOREIGN_THREAD, name: 'Fremd', parentId: CH2 }],
}] });
/** Bot erledigt einen Auftrag vollständig (Abholen, Ergebnis, Abschluss). */
async function botDone(sendId: string, ok: { messageId?: string; error?: string; channelId?: string }[]) {
  const st = await http().post(`/api/v1/bot/message-builder/sends/${sendId}/start`).set(bot()).expect(200);
  for (const [i, r] of ok.entries()) await http().post(`/api/v1/bot/message-builder/sends/${sendId}/items/${i}`).set(bot()).send(r.messageId ? { ok: true, messageId: r.messageId, ...(r.channelId ? { channelId: r.channelId } : {}) } : { ok: false, error: r.error }).expect(204);
  await http().post(`/api/v1/bot/message-builder/sends/${sendId}/finish`).set(bot()).send({}).expect(204);
  return st.body;
}

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  process.env.DISCORD_GUILD_ID = GUILD;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'eb_admin', ['System Administrator']);
  await userWith('eb_sender', ['messagebuilder.view', 'messagebuilder.create', 'messagebuilder.send', 'messagebuilder.edit']);
  await userWith('eb_sender2', ['messagebuilder.view', 'messagebuilder.create', 'messagebuilder.send', 'messagebuilder.edit']);
  await userWith('eb_editor', ['messagebuilder.view', 'messagebuilder.edit', 'messagebuilder.edit_others']);
  await userWith('eb_viewer', ['messagebuilder.view']);
  await userWith('eb_tpl', ['messagebuilder.view', 'messagebuilder.templates_create']);
  await registerServer(prisma, GUILD, members, 'EN | POLIZEI');
  await http().put('/api/v1/bot/guilds').set(bot()).send(directory()).expect(204);
});
afterAll(async () => {
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['discord.guilds'] } } });
  if (prevGuild === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = prevGuild;
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('Embed Builder – Beispielvorlagen, Kategorien, Import/Export', () => {
  it('neuer Server: Standard-Kategorien und sechs Beispielvorlagen; erneutes Einfügen überschreibt nichts', async () => {
    const a = await as('eb_admin');
    const cats = (await a.get('/api/v1/message-builder/categories')).body as { id: string; name: string }[];
    expect(cats.map((c) => c.name)).toEqual(['Ankündigungen', 'Dienstanweisungen', 'Bewerbungen', 'Tickets', 'Ausbildung', 'Informationen', 'Berichte', 'Sonstiges']);
    const tpl = (await a.get('/api/v1/message-builder/documents?kind=TEMPLATE')).body as { id: string; name: string; categoryId: string }[];
    expect(tpl.map((t) => t.name).sort()).toEqual(['Ausbildungsankündigung', 'Bewerbungsinformationen', 'Dienstbeginn', 'Regelwerk-Hinweis', 'Ticket-Eröffnung', 'Willkommen']);
    expect(tpl.find((t) => t.name === 'Dienstbeginn')!.categoryId).toBe(cats.find((c) => c.name === 'Dienstanweisungen')!.id);
    // eigene Änderung an einer Beispielvorlage bleibt erhalten, auch wenn Beispiele erneut eingefügt werden
    const w = tpl.find((t) => t.name === 'Willkommen')!;
    const full = (await a.get(`/api/v1/message-builder/documents/${w.id}`)).body;
    await a.put(`/api/v1/message-builder/documents/${w.id}`).send({ name: 'Willkommen', categoryId: full.categoryId, channelId: null, data: data(msg({ content: 'Eigener Text' })), version: full.version }).expect(200);
    const r = await a.post('/api/v1/message-builder/templates/examples');
    expect(r.status).toBe(201);
    expect(r.body.added).toEqual([]);
    expect((await a.get(`/api/v1/message-builder/documents/${w.id}`)).body.data.messages[0].content).toBe('Eigener Text');
    // gelöschte Beispielvorlage wird nicht wieder angelegt (Name existiert archiviert)
    const d = tpl.find((t) => t.name === 'Dienstbeginn')!;
    await a.delete(`/api/v1/message-builder/documents/${d.id}`).expect(204);
    expect((await a.post('/api/v1/message-builder/templates/examples')).body.added).toEqual([]);
    expect((await (await as('eb_viewer')).post('/api/v1/message-builder/templates/examples')).status).toBe(403);
  });

  it('Export und Import: immer neue Vorlagen, Namenskonflikt → „(Import)“, Kategorie nach Name', async () => {
    const a = await as('eb_admin');
    const ex = (await a.get('/api/v1/message-builder/templates/export')).body;
    expect(ex).toMatchObject({ format: MB_TEMPLATE_EXPORT_FORMAT, version: 1 });
    expect(ex.templates.find((t: { name: string }) => t.name === 'Willkommen')).toMatchObject({ category: 'Informationen' });
    const before = (await a.get('/api/v1/message-builder/documents?kind=TEMPLATE')).body.length;
    const imp = await a.post('/api/v1/message-builder/templates/import').send({ format: MB_TEMPLATE_EXPORT_FORMAT, version: 1, templates: [
      { name: 'Willkommen', category: 'Informationen', data: data(msg({ content: 'Importiert' })) },
      { name: 'Ganz neu', category: 'Neue Kategorie', data: data() },
    ] });
    expect(imp.status).toBe(201);
    expect(imp.body.created.map((c: { name: string }) => c.name)).toEqual(['Willkommen (Import)', 'Ganz neu']);
    const list = (await a.get('/api/v1/message-builder/documents?kind=TEMPLATE')).body as { name: string }[];
    expect(list).toHaveLength(before + 2);
    expect(((await a.get('/api/v1/message-builder/categories')).body as { name: string }[]).map((c) => c.name)).toContain('Neue Kategorie');
    // ungültiges Format / Inhalt wird abgewiesen
    expect((await a.post('/api/v1/message-builder/templates/import').send({ format: 'x', version: 1, templates: [] })).status).toBe(400);
    // nur Vorlagen-Erstellen-Recht: Import ja, neue Kategorien nicht (→ ohne Kategorie)
    const t = await as('eb_tpl');
    const r2 = await t.post('/api/v1/message-builder/templates/import').send({ format: MB_TEMPLATE_EXPORT_FORMAT, version: 1, templates: [{ name: 'Nur Vorlage', category: 'Kategorie ohne Recht', data: data() }] });
    expect(r2.status).toBe(201);
    expect((await a.get(`/api/v1/message-builder/documents/${r2.body.created[0].id}`)).body.categoryId).toBeNull();
  });
});

describe('Embed Builder – Ziele: Threads und Foren', () => {
  it('Server-Info enthält Foren und Threads; Forum braucht Beitrag oder Titel; Thread muss zum Kanal gehören', async () => {
    const a = await as('eb_admin');
    const s = (await a.get('/api/v1/message-builder/server')).body;
    expect(s.channels.find((c: { id: string }) => c.id === FORUM)).toMatchObject({ type: 'forum', bot: { createThreads: true } });
    expect(s.threads).toEqual([{ id: THREAD, name: 'Besprechung', parentId: CH }, { id: FOREIGN_THREAD, name: 'Fremd', parentId: CH2 }]);
    const send = (b: Record<string, unknown>) => a.post('/api/v1/message-builder/send').send({ mode: 'bot', data: data(), confirm: true, ...b });
    expect((await send({ channelId: FORUM })).body.message).toMatch(/Forum/);
    expect((await send({ channelId: CH, threadName: 'Neu' })).body.message).toMatch(/nur in Forum-Kanälen/);
    expect((await send({ channelId: CH, threadId: FOREIGN_THREAD })).body.message).toMatch(/gehört nicht zu/);
    const t = await send({ channelId: CH, threadId: THREAD });
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ threadId: THREAD });
    const st = await botDone(t.body.id, [{ messageId: '494000000000000001' }]);
    expect(st).toMatchObject({ kind: 'SEND', channelId: CH, threadId: THREAD });
    const f = await send({ channelId: FORUM, threadName: 'Dienstanweisung 1', data: data(msg(), msg({ id: 'm2', content: 'Teil 2' })) });
    expect(f.status).toBe(201);
    expect(await botDone(f.body.id, [{ messageId: '494000000000000002', channelId: '491000000000000077' }, { messageId: '494000000000000003', channelId: '491000000000000077' }])).toMatchObject({ threadName: 'Dienstanweisung 1' });
    const done = (await a.get(`/api/v1/message-builder/sends/${f.body.id}`)).body;
    expect(done.items.map((i: { channelId: string }) => i.channelId)).toEqual(['491000000000000077', '491000000000000077']);
  });
});

describe('Embed Builder – Historie, gespeicherte Nachrichten, Bearbeiten', () => {
  let ownMsg: string; let sentId: string;
  it('Versand speichert Inhalt, verwendete Vorlage und Nachrichtenlink; Historie → neuer Entwurf', async () => {
    const s = await as('eb_sender');
    const a = await as('eb_admin');
    const tpl = ((await a.get('/api/v1/message-builder/documents?kind=TEMPLATE')).body as { id: string; name: string }[]).find((t) => t.name === 'Ticket-Eröffnung')!;
    const draft = (await s.post(`/api/v1/message-builder/documents/${tpl.id}/copy`).send({ kind: 'DRAFT' })).body;
    expect(draft.sourceTemplateId).toBe(tpl.id);
    const doc = (await s.get(`/api/v1/message-builder/documents/${draft.id}`)).body;
    const r = await s.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH, documentId: draft.id, name: 'Ticket-Info', data: doc.data, confirm: true });
    expect(r.status).toBe(201);
    sentId = r.body.id;
    expect(r.body).toMatchObject({ templateName: 'Ticket-Eröffnung', hasData: true, kind: 'SEND' });
    await botDone(sentId, [{ messageId: '494000000000000010' }]);
    const h = (await a.get('/api/v1/message-builder/sends')).body.items.find((x: { id: string }) => x.id === sentId);
    expect(h).toMatchObject({ documentName: 'Ticket-Info', templateName: 'Ticket-Eröffnung', createdByName: 'eb_sender', status: 'SENT', items: [{ messageId: '494000000000000010', channelId: CH }] });
    // erneut in den Editor laden (als neuer Entwurf mit demselben Inhalt)
    const back = await s.post(`/api/v1/message-builder/sends/${sentId}/draft`);
    expect(back.status).toBe(201);
    expect(back.body).toMatchObject({ kind: 'DRAFT', name: 'Ticket-Info' });
    expect(back.body.data.messages[0].embeds[0].title).toBe('🎫 Support-Ticket');
    // gespeicherte Nachricht mit Link
    const list = (await s.get('/api/v1/message-builder/messages')).body;
    const m = list.items.find((x: { messageId: string }) => x.messageId === '494000000000000010');
    expect(m).toMatchObject({ name: 'Ticket-Info', channelId: CH, mode: 'BOT', canEdit: true, link: `https://discord.com/channels/${GUILD}/${CH}/494000000000000010` });
    ownMsg = m.id;
    // eine andere Person ohne edit_others sieht sie nicht in ihrer Liste und darf sie nicht bearbeiten
    const s2 = await as('eb_sender2');
    expect((await s2.get('/api/v1/message-builder/messages')).body.items.map((x: { id: string }) => x.id)).not.toContain(ownMsg);
    expect((await s2.post(`/api/v1/message-builder/messages/${ownMsg}/edit`).send({ data: data(msg({ content: 'Fremd' })), confirm: true })).status).toBe(403);
    expect((await (await as('eb_viewer')).get('/api/v1/message-builder/messages')).status).toBe(403);
  });

  it('eigene Nachricht bearbeiten: Bot-Auftrag EDIT mit Nachrichten-ID; Inhalt wird aktualisiert; keine parallele Bearbeitung', async () => {
    const s = await as('eb_sender');
    const body = { data: data(msg({ content: 'Neu', rows: [{ id: 'r', type: 'buttons', buttons: [{ id: 'b', kind: 'action', label: 'Info', action: { type: 'reply', text: 'Hi' } }] }] })), confirm: true };
    expect((await s.post(`/api/v1/message-builder/messages/${ownMsg}/edit`).send({ ...body, confirm: false })).status).toBe(400);
    expect((await s.post(`/api/v1/message-builder/messages/${ownMsg}/edit`).send({ data: data(msg(), msg({ id: 'm2' })), confirm: true })).body.message).toMatch(/genau eine Nachricht/);
    const r = await s.post(`/api/v1/message-builder/messages/${ownMsg}/edit`).send(body);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ kind: 'EDIT', status: 'QUEUED', targetId: ownMsg });
    expect((await s.post(`/api/v1/message-builder/messages/${ownMsg}/edit`).send(body)).status).toBe(409);
    const st = await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/start`).set(bot()).expect(200);
    expect(st.body).toMatchObject({ proceed: true, kind: 'EDIT', messageId: '494000000000000010', channelId: CH });
    expect(st.body.items[0].payload.components[0].components[0].custom_id).toMatch(/^mb:/);
    await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/items/0`).set(bot()).send({ ok: true, messageId: '494000000000000010' }).expect(204);
    await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/finish`).set(bot()).send({}).expect(204);
    const m = (await s.get(`/api/v1/message-builder/messages/${ownMsg}`)).body;
    expect(m.data.messages[0].content).toBe('Neu');
    expect(m.lastEditedAt).not.toBeNull();
    // keine zweite gespeicherte Nachricht durch das Bearbeiten
    expect(await prisma.messageBuilderMessage.count({ where: { messageId: '494000000000000010' } })).toBe(1);
    // Bearbeitungen erscheinen in der Historie (Filter)
    const a = await as('eb_admin');
    expect((await a.get('/api/v1/message-builder/sends?kind=EDIT')).body.items[0]).toMatchObject({ id: r.body.id, kind: 'EDIT', status: 'SENT' });
  });

  it('Nachricht per Link laden: Bot liefert Inhalt; frühere Embed-Builder-Buttons bekommen ihre Aktion zurück, fremde custom_ids bleiben', async () => {
    const e = await as('eb_editor');
    expect((await e.post('/api/v1/message-builder/messages/load').send({ link: 'https://example.com/x' })).status).toBe(400);
    expect((await e.post('/api/v1/message-builder/messages/load').send({ link: `https://discord.com/channels/${OTHER}/${CH}/494000000000000020` })).body.message).toMatch(/anderen Discord-Server/);
    const r = await e.post('/api/v1/message-builder/messages/load').send({ link: `https://discord.com/channels/${GUILD}/${CH}/494000000000000020`, name: 'Panel' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'LOADING', sentById: null });
    const job = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'mb.fetch', payload: { path: ['id'], equals: r.body.id } } });
    expect(job.payload).toEqual({ id: r.body.id });
    expect((await http().get(`/api/v1/bot/message-builder/messages/${r.body.id}`).set(bot())).body).toEqual({ proceed: true, guildId: GUILD, channelId: CH, messageId: '494000000000000020' });
    const action = await prisma.messageBuilderAction.create({ data: { guildId: GUILD, kind: 'button', config: { action: { type: 'reply', text: 'Alte Antwort' } } } });
    await http().post(`/api/v1/bot/message-builder/messages/${r.body.id}/loaded`).set(bot()).send({
      ok: true, author: 'bot', channelId: CH, parentId: null,
      message: { content: 'Panel', embeds: [{ title: 'Tickets', color: 3447003 }], components: [{ type: 1, components: [
        { type: 2, style: 1, label: 'Info', custom_id: `mb:${action.id}` },
        { type: 2, style: 3, label: 'Ticket öffnen', custom_id: 'ticket:open:panel1' },
      ] }] },
    }).expect(204);
    const m = (await e.get(`/api/v1/message-builder/messages/${r.body.id}`)).body;
    expect(m).toMatchObject({ status: 'READY', mode: 'BOT', canEdit: true, foreignComponents: 1 });
    const btns = m.data.messages[0].rows[0].buttons;
    expect(btns[0]).toMatchObject({ kind: 'action', keepCustomId: '', action: { type: 'reply', text: 'Alte Antwort' } });
    expect(btns[1]).toMatchObject({ kind: 'action', keepCustomId: 'ticket:open:panel1' });
    // Bearbeiten: fremde custom_id bleibt erlaubt, eine neu erfundene nicht
    const forged = structuredClone(m.data); forged.messages[0].rows[0].buttons[1].keepCustomId = 'ticket:close:all';
    expect((await e.post(`/api/v1/message-builder/messages/${r.body.id}/edit`).send({ data: forged, confirm: true })).body.message).toMatch(/custom_id/);
    const ok = await e.post(`/api/v1/message-builder/messages/${r.body.id}/edit`).send({ data: m.data, confirm: true });
    expect(ok.status).toBe(201);
    const st = await http().post(`/api/v1/bot/message-builder/sends/${ok.body.id}/start`).set(bot()).expect(200);
    const comps = st.body.items[0].payload.components[0].components;
    expect(comps[0].custom_id).toMatch(/^mb:/);
    expect(comps[0].custom_id).not.toBe(`mb:${action.id}`);
    expect(comps[1].custom_id).toBe('ticket:open:panel1');
    // Absender ohne edit_others darf die per Link geladene (Absender unbekannt) nicht bearbeiten
    expect((await (await as('eb_sender')).post(`/api/v1/message-builder/messages/${r.body.id}/edit`).send({ data: m.data, confirm: true })).status).toBe(403);
  });

  it('fremde Nachrichten (nicht Bot/kein eingerichteter Webhook) werden abgelehnt', async () => {
    const e = await as('eb_editor');
    const r1 = (await e.post('/api/v1/message-builder/messages/load').send({ link: `https://discord.com/channels/${GUILD}/${CH}/494000000000000030` })).body;
    await http().post(`/api/v1/bot/message-builder/messages/${r1.id}/loaded`).set(bot()).send({ ok: true, author: 'other', message: { content: 'x' } }).expect(204);
    expect((await e.get(`/api/v1/message-builder/messages/${r1.id}`)).body).toMatchObject({ status: 'FAILED', canEdit: false, error: expect.stringMatching(/fremde Nachrichten/) });
    expect((await e.post(`/api/v1/message-builder/messages/${r1.id}/edit`).send({ data: data(), confirm: true })).status).toBe(409);
    const r2 = (await e.post('/api/v1/message-builder/messages/load').send({ link: `https://discord.com/channels/${GUILD}/${CH}/494000000000000031` })).body;
    await http().post(`/api/v1/bot/message-builder/messages/${r2.id}/loaded`).set(bot()).send({ ok: true, author: 'webhook', webhookId: '499999999999999999', message: { content: 'x' } }).expect(204);
    expect((await e.get(`/api/v1/message-builder/messages/${r2.id}`)).body.error).toMatch(/nicht eingerichtet/);
    const r3 = (await e.post('/api/v1/message-builder/messages/load').send({ link: `https://discord.com/channels/${GUILD}/${CH}/494000000000000032` })).body;
    await http().post(`/api/v1/bot/message-builder/messages/${r3.id}/loaded`).set(bot()).send({ ok: false, error: 'Die Nachricht gibt es nicht (mehr).' }).expect(204);
    expect((await e.get(`/api/v1/message-builder/messages/${r3.id}`)).body).toMatchObject({ status: 'FAILED', error: 'Die Nachricht gibt es nicht (mehr).' });
    // Link entfernen archiviert nur den Eintrag
    await e.delete(`/api/v1/message-builder/messages/${r3.id}`).expect(204);
    expect(await prisma.messageBuilderMessage.findUniqueOrThrow({ where: { id: r3.id } })).toMatchObject({ archivedAt: expect.any(Date) });
  });
});

describe('Embed Builder – Auswahlmenü mit mehreren Werten', () => {
  it('mehrere gewählte Optionen → mehrere Aktionen; abgewählt → Bestätigung; unbekannte ignoriert', async () => {
    const a = await as('eb_admin');
    const sel = { id: 's', type: 'select', placeholder: 'Wählen', minValues: 0, maxValues: 2, options: [{ id: 'o1', label: 'A', action: { type: 'reply', text: 'A!' } }, { id: 'o2', label: 'Funk', action: { type: 'role', roleId: ROLE } }] };
    const r = await a.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH, data: data(msg({ rows: [sel] })), confirm: true });
    expect(r.status).toBe(201);
    const st = await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/start`).set(bot()).expect(200);
    expect(st.body.items[0].payload.components[0].components[0]).toMatchObject({ min_values: 0, max_values: 2 });
    const act = await prisma.messageBuilderAction.findFirstOrThrow({ where: { sendId: r.body.id } });
    const ask = (b: Record<string, unknown>) => http().post('/api/v1/bot/message-builder/interactions').set(bot()).send({ actionId: act.id, discordId: '495000000000000001', guildId: GUILD, ...b });
    expect((await ask({ values: ['o1', 'o2'] })).body).toEqual({ type: 'multi', actions: [{ type: 'reply', text: 'A!' }, { type: 'role', roleId: ROLE, mode: 'toggle' }] });
    expect((await ask({ values: ['o1', 'zz'] })).body).toEqual({ type: 'reply', text: 'A!' });
    expect((await ask({ values: [] })).body).toMatchObject({ type: 'reply', text: expect.stringMatching(/entfernt/) });
    expect((await ask({ value: 'o1' })).body).toEqual({ type: 'reply', text: 'A!' }); // ältere Bot-Version (ein Wert)
  });
});

describe('Embed Builder – Webhook-Verwaltung', () => {
  type Call = { url: string; method: string; body?: string };
  const calls: Call[] = [];
  let replies: { status: number; json: unknown }[] = [];
  let hookId = '';
  beforeAll(() => {
    const c = app.get(WebhookClient);
    c.sleep = async () => undefined;
    c.fetch = async (url, init) => {
      calls.push({ url, method: init.method, ...(init.body ? { body: init.body } : {}) });
      const r = replies.shift() ?? { status: 500, json: {} };
      return { status: r.status, headers: { get: () => null }, text: async () => JSON.stringify(r.json) };
    };
  });

  it('anlegen mit Standardprofil; Name/Avatar von Discord; URL nie in Antworten', async () => {
    const a = await as('eb_admin');
    replies = [{ status: 200, json: { id: '493000000000000001', guild_id: GUILD, channel_id: FORUM, name: 'Captain Hook', avatar: 'abc123' } }];
    const w = await a.post('/api/v1/message-builder/webhooks').send({ name: 'Leitstelle', url: HOOK_URL, username: 'EN Leitstelle', avatarUrl: 'https://x.example/a.png' });
    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({ name: 'Leitstelle', username: 'EN Leitstelle', avatarUrl: 'https://x.example/a.png', discordName: 'Captain Hook', discordAvatarUrl: 'https://cdn.discordapp.com/avatars/493000000000000001/abc123.png?size=64', channelName: 'dienstanweisungen', channelType: 'forum', lastCheckOk: true });
    hookId = w.body.id;
    expect((await a.post('/api/v1/message-builder/webhooks').send({ name: 'X', url: HOOK_URL, username: 'Discord Bot' })).status).toBe(400);
    expect(JSON.stringify((await a.get('/api/v1/message-builder/webhooks')).body)).not.toContain('zyxwvutsrqponmlkjihgfedcba');
  });

  it('bearbeiten (lokal + Name in Discord), Verbindung testen (ok und Fehler)', async () => {
    const a = await as('eb_admin');
    calls.length = 0;
    replies = [{ status: 200, json: { id: '493000000000000001', name: 'EN Hook' } }];
    const u = await a.put(`/api/v1/message-builder/webhooks/${hookId}`).send({ name: 'Leitstelle 2', username: '', avatarUrl: null, discordName: 'EN Hook' });
    expect(u.status).toBe(200);
    expect(u.body).toMatchObject({ name: 'Leitstelle 2', username: null, discordName: 'EN Hook' });
    expect(calls[0]).toMatchObject({ url: HOOK_URL, method: 'PATCH' });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ name: 'EN Hook' });
    replies = [{ status: 200, json: { id: '493000000000000001', guild_id: GUILD, channel_id: FORUM, name: 'EN Hook', avatar: null } }];
    expect((await a.post(`/api/v1/message-builder/webhooks/${hookId}/test`)).body).toMatchObject({ ok: true, error: null, webhook: { lastCheckOk: true } });
    replies = [{ status: 404, json: { message: 'Unknown Webhook', code: 10015 } }];
    const bad = (await a.post(`/api/v1/message-builder/webhooks/${hookId}/test`)).body;
    expect(bad).toMatchObject({ ok: false, webhook: { lastCheckOk: false } });
    expect(bad.error).toMatch(/Webhook gibt es nicht mehr/);
    expect((await (await as('eb_sender')).post(`/api/v1/message-builder/webhooks/${hookId}/test`)).status).toBe(403);
  });

  it('Forum-Webhook: erste Nachricht eröffnet den Beitrag (thread_name), weitere gehen hinein; Webhook-Nachricht bearbeiten (PATCH)', async () => {
    const a = await as('eb_admin');
    calls.length = 0;
    replies = [{ status: 200, json: { id: '496000000000000001', channel_id: '491000000000000088' } }, { status: 200, json: { id: '496000000000000002', channel_id: '491000000000000088' } }];
    const r = await a.post('/api/v1/message-builder/send').send({ mode: 'webhook', webhookId: hookId, threadName: 'Neuer Beitrag', confirm: true, data: data(msg(), msg({ id: 'm2', content: 'Zwei' })) });
    expect(r.status).toBe(201);
    await app.get(MessageBuilderSendService).waitIdle();
    expect(calls[0]!.url).toBe(`${HOOK_URL}?wait=true&with_components=true`);
    expect(JSON.parse(calls[0]!.body!)).toMatchObject({ thread_name: 'Neuer Beitrag' });
    expect(calls[1]!.url).toBe(`${HOOK_URL}?wait=true&with_components=true&thread_id=491000000000000088`);
    expect(JSON.parse(calls[1]!.body!).thread_name).toBeUndefined();
    const saved = await prisma.messageBuilderMessage.findFirstOrThrow({ where: { messageId: '496000000000000001' } });
    expect(saved).toMatchObject({ mode: 'WEBHOOK', webhookId: hookId, channelId: '491000000000000088', threadId: '491000000000000088' });
    calls.length = 0;
    replies = [{ status: 200, json: { id: '496000000000000001' } }];
    const e = await a.post(`/api/v1/message-builder/messages/${saved.id}/edit`).send({ data: data(msg({ content: 'Geändert' })), confirm: true });
    expect(e.status).toBe(201);
    await app.get(MessageBuilderSendService).waitIdle();
    expect(calls[0]).toMatchObject({ method: 'PATCH', url: `${HOOK_URL}/messages/496000000000000001?with_components=true&thread_id=491000000000000088` });
    expect((await a.get(`/api/v1/message-builder/sends/${e.body.id}`)).body).toMatchObject({ kind: 'EDIT', status: 'SENT' });
    expect((await a.get(`/api/v1/message-builder/messages/${saved.id}`)).body.data.messages[0].content).toBe('Geändert');
    // Discord lehnt ab → verständlicher Fehler, Status ehrlich „fehlgeschlagen“
    replies = [{ status: 403, json: { message: 'Cannot edit a message authored by another user', code: 50005 } }];
    const e2 = await a.post(`/api/v1/message-builder/messages/${saved.id}/edit`).send({ data: data(msg({ content: 'Nochmal' })), confirm: true });
    await app.get(MessageBuilderSendService).waitIdle();
    const f = (await a.get(`/api/v1/message-builder/sends/${e2.body.id}`)).body;
    expect(f).toMatchObject({ status: 'FAILED', items: [{ status: 'FAILED', error: expect.stringMatching(/jemand anderem/) }] });
    expect((await a.get(`/api/v1/message-builder/messages/${saved.id}`)).body.data.messages[0].content).toBe('Geändert');
  });
});
