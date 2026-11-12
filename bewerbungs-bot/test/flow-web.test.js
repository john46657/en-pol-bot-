import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, answers, G, setup, web } from './helpers.js';

const USER = { id: '700000000000000001', name: 'Lena' };
const lastDm = (discord) => discord.calls.filter((c) => c[0] === 'sendDm').at(-1)[2];

test('DM-Bewerbung: Bestätigung → Fragen → Einreichen', async () => {
  const ctx = setup();
  const offer = await ctx.flow.offer({ guildId: G, typeKey: 'team', user: USER, memberRoles: [], joinedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(offer.embeds[0].title, 'Bewerbung gestartet');
  assert.equal(lastDm(ctx.discord).components[0].components[0].custom_id, `app:start:${G}:team`);
  await ctx.flow.start({ guildId: G, typeKey: 'team', user: USER });
  assert.match(lastDm(ctx.discord).embeds[0].description, /1\/4/);
  assert.equal(ctx.store.progress(G)[0].answered, 0, 'in Bearbeitung');
  await ctx.flow.message(USER, answers[0]);
  await ctx.flow.message(USER, 'zu kurz');
  assert.match(lastDm(ctx.discord).embeds[0].description, /zu kurz/);
  for (const a of answers.slice(1)) await ctx.flow.message(USER, a);
  assert.match(lastDm(ctx.discord).embeds[0].description, /APP-000001.*eingegangen/s);
  const app = ctx.store.data.applications[0];
  assert.equal(app.joinedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(ctx.store.progress(G).length, 0);
  // zweiter Versuch: offene Bewerbung
  const again = await ctx.flow.offer({ guildId: G, typeKey: 'team', user: USER, memberRoles: [] });
  assert.match(again.embeds[0].description, /bereits eine offene Bewerbung/);
});

test('DM-Bewerbung: Auswahl, Überspringen, Roblox-Bestätigung, abbrechen', async () => {
  const ctx = setup({ questions: [
    { key: 'rb', label: 'Roblox?', required: true, type: 'ROBLOX' },
    { key: 'c', label: 'Rang?', required: true, type: 'CHOICE', options: [{ label: 'A' }, { label: 'B' }] },
    { key: 'o', label: 'Optional?', required: false, type: 'CHOICE', options: [{ label: 'X' }] },
  ] });
  await ctx.flow.start({ guildId: G, typeKey: 'team', user: USER });
  await ctx.flow.message(USER, 'gibtsnicht');
  assert.match(lastDm(ctx.discord).embeds[0].description, /gibt es nicht/);
  await ctx.flow.message(USER, 'Builderman');
  assert.equal(lastDm(ctx.discord).components[0].components[0].custom_id, 'app:rb:0:yes');
  assert.ok((await ctx.flow.component(USER, 'rb', 0, ['yes'])).update);
  assert.equal((await ctx.flow.component(USER, 'ans', 0, ['0'])).error, 'Diese Frage hast du schon beantwortet.');
  await ctx.flow.message(USER, 'Text statt Menü');
  assert.match(ctx.discord.calls.filter((c) => c[0] === 'sendDm').at(-2)[2].embeds[0].description, /Menü/);
  await ctx.flow.component(USER, 'ans', 1, ['1']);
  await ctx.flow.component(USER, 'skip', 2);
  const app = ctx.store.data.applications[0];
  assert.deepEqual(app.answers.map((a) => a.answer), ['Builderman (ID 42)', 'B', '—']);
  assert.deepEqual(app.roblox, { name: 'Builderman', id: '42' });
  await ctx.flow.start({ guildId: G, typeKey: 'team', user: { id: '700000000000000002', name: 'B' } });
  await ctx.flow.message({ id: '700000000000000002', name: 'B' }, 'abbrechen');
  assert.match(lastDm(ctx.discord).embeds[0].description, /abgebrochen/);
});

test('Web-API: Anmeldung, Schutz, Liste, Entscheidung, Sperren, Statistik, Einstellungen', async () => {
  const ctx = setup();
  const a = await ctx.service.submit({ guildId: G, typeKey: 'team', user: USER, answers });
  const w = await web(ctx);
  try {
    assert.equal((await w.call(`/api/g/${G}/applications`, { auth: false })).status, 401);
    assert.equal((await w.call(`/api/g/${G}/applications/${a.id}/decide`, { method: 'POST', body: { status: 'ACCEPTED' }, csrf: false })).status, 403, 'ohne eigenen Header');
    const me = await (await w.call('/api/me')).json();
    assert.equal(me.guilds[0].level, 'admin');
    const list = await (await w.call(`/api/g/${G}/applications?status=OPEN`)).json();
    assert.equal(list.total, 1);
    assert.equal(list.items[0].canDecide, true);
    assert.equal((await (await w.call(`/api/g/${G}/applications/${a.id}/status`, { method: 'POST', body: { status: 'INTERVIEW' } })).json()).status, 'INTERVIEW');
    const d = await (await w.call(`/api/g/${G}/applications/${a.id}/decide`, { method: 'POST', body: { status: 'ACCEPTED', reason: 'Top' } })).json();
    assert.equal(d.application.status, 'ACCEPTED');
    assert.equal((await w.call(`/api/g/${G}/applications/${a.id}/decide`, { method: 'POST', body: { status: 'REJECTED' } })).status, 409);
    const detail = await (await w.call(`/api/g/${G}/applications/${a.id}`)).json();
    assert.deepEqual(detail.history.map((x) => x.status), ['OPEN', 'INTERVIEW', 'ACCEPTED']);
    assert.match(await (await w.call(`/api/g/${G}/applications.csv?status=ALL`)).text(), /APP-000001/);
    const ban = await w.call(`/api/g/${G}/bans`, { method: 'POST', body: { userId: '700000000000000009', types: ['team'], reason: 'Spam' } });
    assert.equal(ban.status, 200);
    assert.equal((await (await w.call(`/api/g/${G}/bans`)).json()).length, 1);
    assert.equal((await (await w.call(`/api/g/${G}/analytics?days=7`)).json()).kpis[0].value, 1);
    const cfg = await (await w.call(`/api/g/${G}/config`)).json();
    cfg.types[0].name = 'Polizei';
    const saved = await (await w.call(`/api/g/${G}/config`, { method: 'PUT', body: cfg })).json();
    assert.equal(saved.config.types[0].name, 'Polizei');
    cfg.types[0].questions = [];
    assert.equal((await w.call(`/api/g/${G}/config`, { method: 'PUT', body: cfg })).status, 400);
    assert.equal((await w.call('/api/g/999999999999999999/applications')).status, 404, 'fremder Server');
  } finally { w.close(); }
});

test('Web-API: Prüfer sieht nur seine Arten und darf nichts einrichten', async () => {
  const ctx = setup();
  const cfg = ctx.store.guild(G);
  cfg.access.reviewerRoles = ['400000000000000010'];
  cfg.types.push({ ...structuredClone(cfg.types[0]), key: 'sek', name: 'SEK', roles: { ...cfg.types[0].roles, managers: ['400000000000000020'] } });
  await ctx.service.submit({ guildId: G, typeKey: 'sek', user: USER, answers });
  ctx.discord.members[ADMIN.id] = { roles: ['400000000000000010'], manageGuild: false };
  const w = await web(ctx);
  try {
    assert.equal((await (await w.call(`/api/g/${G}/applications`)).json()).total, 0, 'SEK unsichtbar');
    assert.equal((await w.call(`/api/g/${G}/config`)).status, 403);
  } finally { w.close(); }
});

test('Bewerbung im Browser per persönlichem Link', async () => {
  const ctx = setup({ mode: 'WEB' });
  const offer = await ctx.flow.offer({ guildId: G, typeKey: 'team', user: USER, memberRoles: [] });
  const url = offer.components[0].components[0].url;
  assert.match(url, /^http:\/\/x\/bewerbung\/[\w-]+$/);
  assert.equal(ctx.store.progress(G)[0].source, 'WEB');
  const token = url.split('/').pop();
  const w = await web(ctx);
  try {
    const form = await (await w.call(`/api/apply/${token}`, { auth: false })).json();
    assert.equal(form.questions.length, 4);
    assert.equal(form.userName, 'Lena');
    assert.equal((await w.call(`/api/apply/${token.slice(0, -1)}A`, { auth: false })).status, 404);
    const bad = await w.call(`/api/apply/${token}`, { method: 'POST', auth: false, body: { answers: { name: 'x' } } });
    assert.equal(bad.status, 400);
    const ok = await w.call(`/api/apply/${token}`, { method: 'POST', auth: false, body: { answers: Object.fromEntries(form.questions.map((q, i) => [q.key, answers[i]])) } });
    assert.equal(ok.status, 201);
    assert.equal(ctx.store.data.applications[0].source, 'WEB');
    assert.equal(ctx.store.progress(G).length, 0);
    assert.equal((await w.call(`/api/apply/${token}`, { auth: false })).status, 409, 'schon abgeschickt');
    assert.equal((await w.call(`/bewerbung/${token}`, { auth: false })).status, 200);
  } finally { w.close(); }
});
