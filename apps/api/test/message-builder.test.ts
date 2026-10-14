import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { MessageBuilderSendService } from '../src/message-builder/message-builder-send.service';
import { WebhookClient } from '../src/message-builder/webhook-client';

const TOKEN = 'test-bot-token-msgbuilder-0123456789abcdef0';
const bot = () => ({ Authorization: `Bot ${TOKEN}` });
const GUILD = '480000000000000001', OTHER_GUILD = '480000000000000099';
const CH_OK = '481000000000000001', CH_NOEMBED = '481000000000000002', CH_OTHER = '481000000000000003', CAT = '481000000000000009';
const ROLE = '482000000000000001';
const HOOK_URL = 'https://discord.com/api/webhooks/483000000000000001/abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOP-0123456789abcdefghijk';
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
const started = new Date();
const prevGuild = process.env.DISCORD_GUILD_ID;

async function userWith(name: string, perms: string[]) {
  const u = await makeUser(prisma, name);
  await prisma.userPermissionOverride.createMany({ data: perms.map((p) => ({ userId: u.id, permissionKey: p, effect: 'ALLOW' })) });
  return u;
}
const msg = (over: Record<string, unknown> = {}) => ({ id: 'm1', content: 'Dienstantritt **EMD 1**', ...over });
const data = (...messages: Record<string, unknown>[]) => ({ messages: messages.length ? messages : [msg()] });
const guilds = (bot2: Record<string, unknown> = {}) => ({ guilds: [{ id: GUILD, name: 'EN | Polizei', icon: null, roles: [{ id: ROLE, name: 'Funk', color: 0, position: 3 }], channels: [
  { id: CAT, name: 'Info', type: 'category', parentId: null, position: 0 },
  { id: CH_OK, name: 'ankuendigungen', type: 'text', parentId: CAT, position: 1, bot: { view: true, send: true, embed: true, mentionEveryone: false } },
  { id: CH_NOEMBED, name: 'chat', type: 'text', parentId: CAT, position: 2, bot: { view: true, send: true, embed: false, ...bot2 } },
  { id: CH_OTHER, name: 'leitstelle', type: 'text', parentId: null, position: 3 },
] }] });

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  process.env.DISCORD_GUILD_ID = GUILD;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'mb_admin', ['System Administrator']);
  await makeUser(prisma, 'mb_member', ['Police Member']);
  await userWith('mb_viewer', ['messagebuilder.view']);
  await userWith('mb_writer', ['messagebuilder.view', 'messagebuilder.create']);
  await userWith('mb_sender', ['messagebuilder.view', 'messagebuilder.create', 'messagebuilder.send']);
  await http().put('/api/v1/bot/guilds').set(bot()).send(guilds()).expect(204);
});
afterAll(async () => {
  await prisma.discordOutbox.deleteMany({ where: { createdAt: { gte: started } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['messagebuilder.channels', 'discord.guilds'] } } });
  if (prevGuild === undefined) delete process.env.DISCORD_GUILD_ID; else process.env.DISCORD_GUILD_ID = prevGuild;
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('Message Builder – Rechte', () => {
  it('ohne messagebuilder.view kein Zugriff (auch nicht per direktem API-Aufruf)', async () => {
    const m = (await login(app, 'mb_member')).agent;
    expect((await m.get('/api/v1/message-builder/documents?kind=TEMPLATE')).status).toBe(403);
    expect((await m.post('/api/v1/message-builder/documents').send({ kind: 'DRAFT', name: 'x' })).status).toBe(403);
    expect((await m.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH_OK, data: data(), confirm: true })).status).toBe(403);
  });
  it('nur ansehen: keine Entwürfe, keine Vorlagen, kein Versand, keine Historie, keine Webhooks', async () => {
    const v = (await login(app, 'mb_viewer')).agent;
    expect((await v.post('/api/v1/message-builder/documents').send({ kind: 'DRAFT', name: 'x' })).status).toBe(403);
    expect((await v.post('/api/v1/message-builder/send').send({ mode: 'test', channelId: CH_OK, data: data(), confirm: true })).status).toBe(403);
    expect((await v.get('/api/v1/message-builder/sends')).status).toBe(403);
    expect((await v.get('/api/v1/message-builder/webhooks')).status).toBe(403);
    expect((await v.put('/api/v1/message-builder/channels/config').send({ channelIds: [] })).status).toBe(403);
    expect((await v.post('/api/v1/message-builder/categories').send({ name: 'Neu' })).status).toBe(403);
  });
  it('Entwürfe sind privat; Vorlagen brauchen eigene Rechte', async () => {
    const w = (await login(app, 'mb_writer')).agent;
    const s = (await login(app, 'mb_sender')).agent;
    const d = await w.post('/api/v1/message-builder/documents').send({ kind: 'DRAFT', name: 'Mein Entwurf' });
    expect(d.status).toBe(201);
    expect((await s.get(`/api/v1/message-builder/documents/${d.body.id}`)).status).toBe(404);
    expect((await s.get('/api/v1/message-builder/documents?kind=DRAFT')).body.map((x: { id: string }) => x.id)).not.toContain(d.body.id);
    expect((await w.post('/api/v1/message-builder/documents').send({ kind: 'TEMPLATE', name: 'T' })).status).toBe(403);
    expect((await w.post(`/api/v1/message-builder/documents/${d.body.id}/copy`).send({ kind: 'TEMPLATE' })).status).toBe(403);
    expect((await w.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH_OK, data: data(), confirm: true })).status).toBe(403);
  });
});

describe('Message Builder – Entwürfe, Vorlagen, Kategorien', () => {
  it('Standard-Kategorien aus der Migration; Kategorien bearbeitbar, Löschen behält Vorlagen', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const cats = (await a.get('/api/v1/message-builder/categories')).body as { id: string; name: string }[];
    expect(cats.map((c) => c.name)).toEqual(['Allgemein', 'Polizei', 'Leitstelle', 'Dienstantritt', 'Dienstende', 'Einsatzmeldung', 'Personalinformation', 'Ankündigung', 'Wartung', 'Sonstiges']);
    const c = await a.post('/api/v1/message-builder/categories').send({ name: 'Schulung' });
    expect(c.status).toBe(201);
    expect((await a.post('/api/v1/message-builder/categories').send({ name: 'Schulung' })).status).toBe(409);
    expect((await a.put(`/api/v1/message-builder/categories/${c.body.id}`).send({ name: 'Ausbildung' })).body.name).toBe('Ausbildung');
    const t = await a.post('/api/v1/message-builder/documents').send({ kind: 'TEMPLATE', name: 'Kursinfo', categoryId: c.body.id, data: data() });
    await a.delete(`/api/v1/message-builder/categories/${c.body.id}`).expect(204);
    expect((await a.get(`/api/v1/message-builder/documents/${t.body.id}`)).body).toMatchObject({ name: 'Kursinfo', categoryId: null });
  });

  it('Autosave mit Versionsprüfung, Duplizieren, Entwurf → Vorlage, Vorlage → Entwurf, Löschen = Archiv', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const cat = ((await a.get('/api/v1/message-builder/categories')).body as { id: string; name: string }[]).find((c) => c.name === 'Dienstantritt')!;
    const t = (await a.post('/api/v1/message-builder/documents').send({ kind: 'TEMPLATE', name: 'Dienstantritt', categoryId: cat.id })).body;
    expect(t).toMatchObject({ kind: 'TEMPLATE', version: 1, messageCount: 1 });
    const body = { name: 'Dienstantritt', categoryId: cat.id, channelId: CH_OK, data: data(msg(), msg({ id: 'm2', content: 'Zweite' })), version: 1 };
    const u1 = await a.put(`/api/v1/message-builder/documents/${t.id}`).send(body);
    expect(u1.status).toBe(200);
    expect(u1.body).toMatchObject({ version: 2, messageCount: 2, channelId: CH_OK });
    // zweiter Tab mit veraltetem Stand → 409 mit aktuellem Stand, nichts überschrieben
    const stale = await a.put(`/api/v1/message-builder/documents/${t.id}`).send({ ...body, name: 'Überschrieben', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.details.current).toMatchObject({ name: 'Dienstantritt', version: 2 });
    // ungültige Struktur wird abgewiesen
    expect((await a.put(`/api/v1/message-builder/documents/${t.id}`).send({ ...body, version: 2, data: { messages: 'x' } })).status).toBe(400);
    // Entwürfe dürfen unfertig sein (z. B. leere Nachricht, zu langer Text) – geprüft wird erst beim Senden
    const draftData = data(msg({ content: 'x'.repeat(2500) }));
    expect((await a.put(`/api/v1/message-builder/documents/${t.id}`).send({ ...body, version: 2, data: draftData })).status).toBe(200);
    const dup = await a.post(`/api/v1/message-builder/documents/${t.id}/copy`).send({ kind: 'TEMPLATE' });
    expect(dup.body).toMatchObject({ kind: 'TEMPLATE', name: 'Dienstantritt (Kopie)', categoryId: cat.id });
    const draft = await a.post(`/api/v1/message-builder/documents/${t.id}/copy`).send({ kind: 'DRAFT' });
    expect(draft.body).toMatchObject({ kind: 'DRAFT', name: 'Dienstantritt' });
    expect((await a.get('/api/v1/message-builder/documents?kind=DRAFT')).body.map((x: { id: string }) => x.id)).toContain(draft.body.id);
    await a.delete(`/api/v1/message-builder/documents/${dup.body.id}`).expect(204);
    expect((await a.get(`/api/v1/message-builder/documents/${dup.body.id}`)).status).toBe(404);
    expect(await prisma.messageBuilderDocument.findUnique({ where: { id: dup.body.id } })).toMatchObject({ archivedAt: expect.any(Date) }); // nicht gelöscht
    const audit = await prisma.auditLog.findMany({ where: { entityId: t.id }, select: { action: true } });
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['messagebuilder.template_create', 'messagebuilder.template_update']));
  });
});

describe('Message Builder – Kanäle', () => {
  it('nur Textkanäle des eingerichteten Servers, mit Bot-Rechten; erlaubte Kanäle einschränkbar', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const s = (await a.get('/api/v1/message-builder/server')).body;
    expect(s.guild).toMatchObject({ id: GUILD });
    expect(s.channels.map((c: { id: string }) => c.id)).toEqual([CH_OTHER, CH_OK, CH_NOEMBED]); // ohne Kategorie zuerst, dann nach Kategorie
    expect(s.channels.find((c: { id: string }) => c.id === CH_OK)).toMatchObject({ category: 'Info', allowed: true, bot: { send: true, embed: true } });
    expect((await a.put('/api/v1/message-builder/channels/config').send({ channelIds: ['489999999999999999'] })).status).toBe(400);
    await a.put('/api/v1/message-builder/channels/config').send({ channelIds: [CH_OK, CH_NOEMBED] }).expect(200);
    const s2 = (await a.get('/api/v1/message-builder/server')).body;
    expect(s2.restricted).toBe(true);
    expect(s2.channels.find((c: { id: string }) => c.id === CH_OTHER).allowed).toBe(false);
  });
});

describe('Message Builder – Versand über den Bot', () => {
  it('Prüfung vor dem Versand: Limits, Kanal, Bot-Rechte, erlaubte Kanäle, Rollen-Aktionen', async () => {
    const s = (await login(app, 'mb_sender')).agent;
    const send = (b: Record<string, unknown>) => s.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH_OK, data: data(), confirm: true, ...b });
    const empty = await send({ data: data(msg({ content: '' })) });
    expect(empty.status).toBe(400);
    expect(empty.body.details.issues[0].message).toMatch(/leer/);
    expect((await send({ data: data(msg({ content: 'x'.repeat(2001) })) })).body.message).toMatch(/2001\/2000/);
    expect((await send({ data: data(msg({ embeds: [{ id: 'e', title: 'T', imageUrl: 'kein-link' }] })) })).body.message).toMatch(/Bild: keine gültige URL/);
    expect((await send({ confirm: false })).status).toBe(400);
    expect((await send({ channelId: '489999999999999999' })).body.message).toMatch(/gibt es auf dem Discord-Server/);
    expect((await send({ channelId: CH_OTHER })).status).toBe(403); // nicht erlaubt (Einschränkung aus dem Kanal-Test)
    const noEmbed = await send({ channelId: CH_NOEMBED, data: data(msg({ embeds: [{ id: 'e', title: 'T' }] })) });
    expect(noEmbed.status).toBe(400);
    expect(noEmbed.body.message).toMatch(/Links einbetten/);
    const roleBtn = data(msg({ rows: [{ id: 'r', type: 'buttons', buttons: [{ id: 'b', kind: 'action', label: 'Funk', action: { type: 'role', roleId: ROLE } }] }] }));
    expect((await send({ data: roleBtn })).body.message).toMatch(/Rollen-Aktionen/); // Recht messagebuilder.roles fehlt
    expect(await prisma.discordOutbox.count({ where: { type: 'mb.send', createdAt: { gte: started } } })).toBe(0);
  });

  it('Gruppe → ein Outbox-Auftrag; Bot holt einmal ab, meldet je Nachricht; Teilfehler ehrlich als „teilweise“', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const group = data(
      msg({ content: 'Willkommen', embeds: [{ id: 'e1', title: 'Info', color: '#1e3a8a', timestamp: 'send' }] }),
      msg({ id: 'm2', content: 'Weiteres', rows: [{ id: 'r1', type: 'buttons', buttons: [{ id: 'b1', kind: 'link', label: 'Web', url: 'https://emden.example/' }, { id: 'b2', kind: 'action', label: 'Info', style: 'success', action: { type: 'reply', text: 'Nur für dich' } }] }, { id: 's1', type: 'select', placeholder: 'Abteilung', options: [{ id: 'o1', label: 'SEK', action: { type: 'reply', text: 'SEK-Info' } }, { id: 'o2', label: 'Funk', action: { type: 'role', roleId: ROLE } }] }] }),
      msg({ id: 'm3', content: 'Ende' }),
    );
    const r = await a.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH_OK, name: 'Begrüßung', data: group, confirm: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'QUEUED', mode: 'BOT', channelId: CH_OK, channelName: 'ankuendigungen', items: [{ status: 'PENDING', summary: 'Text · 1 Embed' }, { status: 'PENDING', summary: 'Text · 2 Buttons · 1 Auswahlmenü' }, { status: 'PENDING' }] });
    const job = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'mb.send', payload: { path: ['sendId'], equals: r.body.id } } });
    expect(job.payload).toEqual({ sendId: r.body.id }); // Inhalte nicht in der Outbox
    expect((await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/start`)).status).toBe(401);
    const st = await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/start`).set(bot()).expect(200);
    expect(st.body).toMatchObject({ proceed: true, guildId: GUILD, channelId: CH_OK });
    expect(st.body.items).toHaveLength(3);
    const p2 = st.body.items[1].payload;
    expect(p2.components[0].components[0]).toEqual({ type: 2, style: 5, url: 'https://emden.example/', label: 'Web' });
    expect(p2.components[0].components[1].custom_id).toMatch(/^mb:[0-9a-f-]{36}$/);
    expect(p2.components[1].components[0]).toMatchObject({ type: 3, options: [{ label: 'SEK', value: 'o1' }, { label: 'Funk', value: 'o2' }] });
    expect(st.body.items[0].payload.allowed_mentions).toEqual({ parse: ['users'] });
    // zweites Abholen (z. B. Outbox-Wiederholung) → kein doppelter Versand
    expect((await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/start`).set(bot())).body).toEqual({ proceed: false });
    await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/items/0`).set(bot()).send({ ok: true, messageId: '484000000000000001' }).expect(204);
    await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/items/1`).set(bot()).send({ ok: false, error: 'Dem Bot fehlen Rechte in diesem Kanal.' }).expect(204);
    await http().post(`/api/v1/bot/message-builder/sends/${r.body.id}/finish`).set(bot()).send({ error: 'Nicht gesendet, weil eine vorherige Nachricht fehlschlug.' }).expect(204);
    const done = (await a.get(`/api/v1/message-builder/sends/${r.body.id}`)).body;
    expect(done).toMatchObject({ status: 'PARTIAL', error: 'Dem Bot fehlen Rechte in diesem Kanal.', items: [{ status: 'SENT', messageId: '484000000000000001' }, { status: 'FAILED' }, { status: 'SKIPPED' }] });
    const items = await prisma.messageBuilderSendItem.findMany({ where: { sendId: r.body.id } });
    expect(items.every((i) => i.payload === null)).toBe(true); // Inhalte nach dem Versand nicht mehr gespeichert
    // Interaktionen: Button-Antwort, Menü-Option (Rolle), fremder Server, unbekannt
    const actions = await prisma.messageBuilderAction.findMany({ where: { sendId: r.body.id } });
    const btn = actions.find((x) => x.kind === 'button')!, sel = actions.find((x) => x.kind === 'select')!;
    expect(p2.components[0].components[1].custom_id).toBe(`mb:${btn.id}`);
    const ask = (b: Record<string, unknown>) => http().post('/api/v1/bot/message-builder/interactions').set(bot()).send({ discordId: '485000000000000001', guildId: GUILD, ...b });
    expect((await ask({ actionId: btn.id })).body).toEqual({ type: 'reply', text: 'Nur für dich' });
    expect((await ask({ actionId: sel.id, value: 'o2' })).body).toEqual({ type: 'role', roleId: ROLE, mode: 'toggle' });
    expect((await ask({ actionId: sel.id, value: 'zz' })).body).toEqual({ type: 'gone' });
    expect((await ask({ actionId: btn.id, guildId: OTHER_GUILD })).status).toBe(403);
  });

  it('alle erfolgreich → „gesendet“; Historie zeigt Status je Nachricht', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const r = (await a.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH_OK, name: 'Kurz', data: data(), confirm: true })).body;
    await http().post(`/api/v1/bot/message-builder/sends/${r.id}/start`).set(bot()).expect(200);
    await http().post(`/api/v1/bot/message-builder/sends/${r.id}/items/0`).set(bot()).send({ ok: true, messageId: '484000000000000002' }).expect(204);
    await http().post(`/api/v1/bot/message-builder/sends/${r.id}/finish`).set(bot()).send({}).expect(204);
    const h = (await a.get('/api/v1/message-builder/sends')).body;
    expect(h.items[0]).toMatchObject({ id: r.id, status: 'SENT', documentName: 'Kurz', createdByName: 'mb_admin', items: [{ status: 'SENT', messageId: '484000000000000002' }] });
    expect(h.guildId).toBe(GUILD);
    // Absender ohne Historien-Recht sieht nur den eigenen Versand
    const s = (await login(app, 'mb_sender')).agent;
    expect((await s.get(`/api/v1/message-builder/sends/${r.id}`)).status).toBe(403);
  });

  it('Testmodus: prüft wie echt, sendet nichts, liefert die Discord-Daten', async () => {
    const w = (await login(app, 'mb_writer')).agent;
    const before = await prisma.discordOutbox.count();
    const r = await w.post('/api/v1/message-builder/send').send({ mode: 'test', channelId: CH_OK, data: data(msg({ embeds: [{ id: 'e', title: 'Test', imageUrl: 'http://emden.example/x.png' }] })), confirm: true });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'TEST', mode: 'TEST', items: [{ status: 'TEST' }] });
    expect(r.body.payloads[0].embeds[0]).toMatchObject({ title: 'Test', image: { url: 'http://emden.example/x.png' } });
    expect(r.body.warnings[0].message).toMatch(/http/);
    expect(await prisma.discordOutbox.count()).toBe(before);
    expect((await w.post('/api/v1/message-builder/send').send({ mode: 'test', channelId: CH_NOEMBED, data: data(msg({ embeds: [{ id: 'e', title: 'x' }] })), confirm: true })).status).toBe(400);
  });

  it('Bot holt nicht ab → nach 10 Minuten „fehlgeschlagen“, Outbox-Auftrag erledigt; danach kein Versand mehr', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const r = (await a.post('/api/v1/message-builder/send').send({ mode: 'bot', channelId: CH_OK, data: data(), confirm: true })).body;
    await app.get(MessageBuilderSendService).expireStale(Date.now() + 11 * 60_000);
    const s = (await a.get(`/api/v1/message-builder/sends/${r.id}`)).body;
    expect(s).toMatchObject({ status: 'FAILED', items: [{ status: 'SKIPPED' }] });
    expect(s.error).toMatch(/nicht innerhalb von 10 Minuten/);
    expect((await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'mb.send', payload: { path: ['sendId'], equals: r.id } } })).sentAt).not.toBeNull();
    expect((await http().post(`/api/v1/bot/message-builder/sends/${r.id}/start`).set(bot())).body).toEqual({ proceed: false });
  });
});

describe('Message Builder – Webhooks (optional)', () => {
  type Call = { url: string; method: string; body?: string };
  const calls: Call[] = [];
  let replies: { status: number; json: unknown; headers?: Record<string, string> }[] = [];
  beforeAll(() => {
    const c = app.get(WebhookClient);
    c.sleep = async () => undefined;
    c.fetch = async (url, init) => {
      calls.push({ url, method: init.method, ...(init.body ? { body: init.body } : {}) });
      const r = replies.shift() ?? { status: 500, json: {} };
      return { status: r.status, headers: { get: (n: string) => r.headers?.[n.toLowerCase()] ?? null }, text: async () => JSON.stringify(r.json) };
    };
  });

  it('anlegen nur für den eigenen Server; URL wird nie ausgeliefert und verschlüsselt gespeichert', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    expect((await a.post('/api/v1/message-builder/webhooks').send({ name: 'X', url: 'https://evil.example/api/webhooks/1/2' })).status).toBe(400);
    replies = [{ status: 200, json: { id: '483000000000000001', guild_id: OTHER_GUILD, channel_id: CH_OK } }];
    expect((await a.post('/api/v1/message-builder/webhooks').send({ name: 'Fremd', url: HOOK_URL })).body.message).toMatch(/nicht zum Discord-Server/);
    replies = [{ status: 200, json: { id: '483000000000000001', guild_id: GUILD, channel_id: CH_OK } }];
    const w = await a.post('/api/v1/message-builder/webhooks').send({ name: 'Leitstelle', url: HOOK_URL });
    expect(w.status).toBe(201);
    expect(w.body).toMatchObject({ name: 'Leitstelle', webhookId: '483000000000000001', channelId: CH_OK, channelName: 'ankuendigungen', readable: true });
    const list = await a.get('/api/v1/message-builder/webhooks');
    expect(JSON.stringify(list.body)).not.toContain('abcdefghijklmnopqrstuvwxyz');
    const row = await prisma.messageBuilderWebhook.findUniqueOrThrow({ where: { id: w.body.id } });
    expect(row.secret).not.toContain('webhooks');
  });

  it('Versand über Webhook nur mit Recht und ausdrücklicher Wahl; Rate-Limit wird abgewartet; Teilfehler', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const s = (await login(app, 'mb_sender')).agent;
    const hook = (await a.get('/api/v1/message-builder/webhooks')).body[0];
    const body = { mode: 'webhook', webhookId: hook.id, confirm: true, data: { ...data(msg(), msg({ id: 'm2', content: 'Zwei' }), msg({ id: 'm3', content: 'Drei' })), webhookProfile: { username: 'EN Leitstelle', avatarUrl: '' } } };
    expect((await s.post('/api/v1/message-builder/send').send(body)).status).toBe(403); // ohne messagebuilder.webhooks
    const interactive = { ...body, data: data(msg({ rows: [{ id: 'r', type: 'buttons', buttons: [{ id: 'b', kind: 'action', label: 'X', action: { type: 'reply', text: 'y' } }] }] })) };
    expect((await a.post('/api/v1/message-builder/send').send(interactive)).body.message).toMatch(/nur Link-Buttons/);
    calls.length = 0;
    replies = [
      { status: 429, json: { message: 'You are being rate limited.', retry_after: 0.4, global: false } },
      { status: 200, json: { id: '486000000000000001' } },
      { status: 200, json: { id: '486000000000000002' }, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '1.5' } },
      { status: 404, json: { message: 'Unknown Webhook', code: 10015 } },
    ];
    const r = await a.post('/api/v1/message-builder/send').send(body);
    expect(r.status).toBe(201);
    await app.get(MessageBuilderSendService).waitIdle();
    expect(calls.map((c) => c.url)).toEqual(Array(4).fill(`${HOOK_URL}?wait=true&with_components=true`));
    expect(JSON.parse(calls[1]!.body!)).toMatchObject({ content: 'Dienstantritt **EMD 1**', username: 'EN Leitstelle', allowed_mentions: { parse: ['users'] } });
    const done = (await a.get(`/api/v1/message-builder/sends/${r.body.id}`)).body;
    expect(done).toMatchObject({ mode: 'WEBHOOK', status: 'PARTIAL', items: [{ status: 'SENT', messageId: '486000000000000001' }, { status: 'SENT' }, { status: 'FAILED' }] });
    expect(done.items[2].error).toMatch(/Webhook gibt es nicht mehr/);
    expect(JSON.stringify(done)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  });

  it('Webhook entfernen löscht das Geheimnis', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const hook = (await a.get('/api/v1/message-builder/webhooks')).body[0];
    await a.delete(`/api/v1/message-builder/webhooks/${hook.id}`).expect(204);
    expect((await prisma.messageBuilderWebhook.findUniqueOrThrow({ where: { id: hook.id } })).secret).toBe('');
    expect((await a.get('/api/v1/message-builder/webhooks')).body).toEqual([]);
  });
});

describe('Message Builder – dauerhafte Speicherung', () => {
  it('Vorlagen, Entwürfe und Historie überstehen einen Neustart der API', async () => {
    const a = (await login(app, 'mb_admin')).agent;
    const t = (await a.post('/api/v1/message-builder/documents').send({ kind: 'TEMPLATE', name: 'Wartungshinweis', data: data(msg({ content: 'Wartung um 20 Uhr' })) })).body;
    const sends = (await a.get('/api/v1/message-builder/sends')).body.total;
    await app.close();
    ({ app, prisma } = await createTestApp());
    const a2 = (await login(app, 'mb_admin')).agent;
    expect((await a2.get(`/api/v1/message-builder/documents/${t.id}`)).body.data.messages[0].content).toBe('Wartung um 20 Uhr');
    expect((await a2.get('/api/v1/message-builder/sends')).body.total).toBe(sends);
  });
});
