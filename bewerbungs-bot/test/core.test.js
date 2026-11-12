import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, cooldownLeft, decisionRoles, possessive, renderText, roleBlock, validateQuestions } from '../src/forms.js';
import { sanitizeConfig, defaultGuildConfig } from '../src/defaults.js';
import { analytics } from '../src/analytics.js';
import { aiCheck } from '../src/ai-check.js';
import { accessLevel, canDecide, visibleTypes } from '../src/access.js';
import { createSigner } from '../src/links.js';
import { applicationPayload, panelPayload } from '../src/discord/messages.js';
import { ADMIN, answers, G, setup } from './helpers.js';

test('Antworten prüfen: Text, Auswahl, Rollen, Roblox', () => {
  assert.equal(checkAnswer({ key: 'a', label: 'A', required: true }, '  ').ok, false);
  assert.match(checkAnswer({ key: 'a', label: 'A', required: true, minLength: 10 }, 'kurz').error, /zu kurz/);
  assert.deepEqual(checkAnswer({ key: 'a', label: 'A', required: false }, ''), { ok: true, text: '', roleIds: [] });
  const choice = { key: 'c', label: 'C', required: true, type: 'CHOICE', options: [{ label: 'x' }, { label: 'y' }] };
  assert.equal(checkAnswer(choice, ['x', 'y']).ok, false, 'nur eine Auswahl');
  assert.equal(checkAnswer({ ...choice, multiple: true }, ['x', 'y']).text, 'x, y');
  assert.equal(checkAnswer(choice, ['z']).ok, false);
  const role = { key: 'r', label: 'R', required: true, type: 'ROLE', options: [{ label: 'SEK', roleId: '400000000000000009' }] };
  assert.deepEqual(checkAnswer(role, ['SEK']).roleIds, ['400000000000000009']);
  assert.equal(checkAnswer({ key: 'rb', label: 'Roblox', type: 'ROBLOX', required: true }, 'a b').ok, false);
  assert.equal(checkAnswer({ key: 'rb', label: 'Roblox', type: 'ROBLOX', required: true }, '@Builderman').text, 'Builderman');
});

test('Fragenkatalog, Texte, Rollen, Wartezeit, Genitiv', () => {
  assert.match(validateQuestions([{ key: 'a', label: 'x', type: 'ROLE', options: [{ label: 'o' }] }]), /Rolle/);
  assert.match(validateQuestions([{ key: 'a', label: 'x' }, { key: 'a', label: 'y' }]), /doppelt/);
  assert.equal(validateQuestions([{ key: 'a', label: 'x' }]), null);
  assert.equal(renderText('Hallo {applicant} {foo}', { '{applicant}': '@x' }), 'Hallo @x {foo}');
  assert.equal(renderText('Abgelehnt.', { '{reason}': 'zu jung' }, true), 'Abgelehnt.\n\n**Grund:** zu jung');
  const t = { roles: { accepted: ['400000000000000001'], pending: ['400000000000000002'], acceptedRemove: [], denied: [], deniedRemove: [], required: { ids: ['400000000000000003'], mode: 'ANY' } }, cooldownMinutes: 60 };
  assert.deepEqual(decisionRoles(t, true, ['400000000000000005']), { add: ['400000000000000005', '400000000000000001'], remove: ['400000000000000002'] });
  assert.match(roleBlock(t, []), /fehlt/);
  assert.equal(roleBlock(t, ['400000000000000003']), null);
  assert.equal(cooldownLeft(t, new Date(Date.now() - 30 * 60_000)), 30);
  assert.equal(possessive('Lena'), 'Lenas');
  assert.equal(possessive('Jonas'), 'Jonas’');
});

test('Einstellungen aus dem Dashboard werden geprüft', () => {
  const base = defaultGuildConfig();
  assert.ok(sanitizeConfig(base, base).config);
  assert.match(sanitizeConfig({ ...base, types: [] }).error, /Mindestens eine/);
  assert.match(sanitizeConfig({ ...base, types: [{ ...base.types[0], key: 'A B' }] }).error, /Schlüssel/);
  const r = sanitizeConfig({ ...base, panels: [{ ...base.panels[0], types: ['team', 'gibtsnicht'] }], access: { adminRoles: ['nope', '400000000000000001'] } }, base);
  assert.deepEqual(r.config.panels[0].types, ['team']);
  assert.deepEqual(r.config.access.adminRoles, ['400000000000000001']);
  assert.equal(r.config.types[0].timeLimitMinutes, 180);
});

test('Zugriff: Admin, Prüfer, Manager-Rollen', () => {
  const cfg = defaultGuildConfig();
  cfg.access.reviewerRoles = ['400000000000000010'];
  cfg.types.push({ ...cfg.types[0], key: 'sek', roles: { ...cfg.types[0].roles, managers: ['400000000000000020'] } });
  assert.equal(accessLevel(cfg, { roles: [], manageGuild: true }), 'admin');
  assert.equal(accessLevel(cfg, { roles: [], manageGuild: false }), null);
  const reviewer = { roles: ['400000000000000010'], manageGuild: false };
  assert.equal(canDecide(cfg, cfg.types[0], reviewer), true);
  assert.equal(canDecide(cfg, cfg.types[1], reviewer), false, 'SEK nur mit Manager-Rolle');
  assert.deepEqual([...visibleTypes(cfg, { roles: ['400000000000000020'], manageGuild: false })], ['sek']);
});

test('Signierte Links: gültig, manipuliert, abgelaufen', () => {
  const s = createSigner('geheim'.repeat(8), 'apply');
  const tok = s.encode({ a: 1, e: Date.now() + 1000 });
  assert.equal(s.decode(tok).a, 1);
  assert.equal(s.decode(`${tok.slice(0, -2)}xx`), null);
  assert.equal(createSigner('anders'.repeat(8), 'apply').decode(tok), null);
  assert.equal(s.decode(s.encode({ e: Date.now() - 1 })), null);
});

test('Einreichen → Team-Kanal, Rollen, keine zweite offene Bewerbung, Sperre, Wartezeit', async () => {
  const { service, discord, store } = setup({ cooldownMinutes: 60 });
  const user = { id: '700000000000000001', name: 'Lena' };
  const a = await service.submit({ guildId: G, typeKey: 'team', user, answers });
  assert.equal(a.number, 'APP-000001');
  assert.equal(a.answers[1].question, 'Warum möchtest du zu uns?');
  assert.deepEqual(a.message, { channelId: '300000000000000001', messageId: '1' });
  assert.ok(discord.calls.some((c) => c[0] === 'applyRoles' && c[3].includes('400000000000000002')), '„ausstehend“-Rolle');
  await assert.rejects(service.submit({ guildId: G, typeKey: 'team', user, answers }), /offene Bewerbung/);
  await assert.rejects(service.submit({ guildId: G, typeKey: 'team', user: { id: '700000000000000002', name: 'X' }, answers: ['a', 'zu kurz', 'b', 'c'] }), /zu kurz/);
  await service.decide(G, a.id, { status: 'REJECTED', actor: ADMIN });
  assert.match(service.preCheck(G, 'team', { userId: user.id }), /erst in 6\d Minuten|erst in 1 Stunde/);
  await service.createBan(G, ADMIN, { userId: '700000000000000003', types: ['*'], reason: 'Spam' });
  assert.match(service.preCheck(G, 'team', { userId: '700000000000000003' }), /gesperrt.*Spam/);
  assert.equal(store.data.applications.length, 1);
});

test('Entscheiden: DM-Text mit Grund, Rollen, Archiv, kein Doppel-Entscheid, nicht über eigene', async () => {
  const { service, discord } = setup();
  const a = await service.submit({ guildId: G, typeKey: 'team', user: { id: '700000000000000001', name: 'Lena' }, answers });
  await assert.rejects(service.decide(G, a.id, { status: 'ACCEPTED', actor: { id: '700000000000000001', name: 'Lena' } }), /eigene/);
  const r = await service.decide(G, a.id, { status: 'ACCEPTED', reason: 'Willkommen', actor: ADMIN });
  assert.equal(r.dm, true);
  const dm = discord.calls.find((c) => c[0] === 'sendDecisionDm');
  assert.match(dm[3], /angenommen/);
  assert.match(dm[3], /Grund:\*\* Willkommen/);
  assert.ok(discord.calls.some((c) => c[0] === 'applyRoles' && c[3].includes('400000000000000001') && c[4].includes('400000000000000002')));
  assert.ok(discord.calls.some((c) => c[0] === 'postArchive' && c[1] === '300000000000000002'));
  await assert.rejects(service.decide(G, a.id, { status: 'REJECTED', actor: ADMIN }), /schon entschieden/);
  // Grund nur intern
  const b = await service.submit({ guildId: G, typeKey: 'team', user: { id: '700000000000000005', name: 'Tim' }, answers });
  await service.decide(G, b.id, { status: 'REJECTED', reason: 'intern', notifyReason: false, actor: ADMIN });
  assert.doesNotMatch(discord.calls.filter((c) => c[0] === 'sendDecisionDm').at(-1)[3], /intern/);
});

test('Verlassen des Servers: ablehnen oder zurückziehen', async () => {
  const { service } = setup({ onLeave: 'WITHDRAW' });
  const a = await service.submit({ guildId: G, typeKey: 'team', user: { id: '700000000000000001', name: 'Lena' }, answers });
  assert.deepEqual(await service.memberLeft(G, '700000000000000001'), { denied: 0, withdrawn: 1 });
  assert.equal(a.status, 'WITHDRAWN');
});

test('Discord-Nachrichten bleiben unter den Limits', () => {
  const long = 'x'.repeat(3900);
  const app = { id: 'id', number: 'APP-000001', typeName: 'Team', status: 'OPEN', userId: '700000000000000001', userName: 'Lena', answers: Array.from({ length: 40 }, (_, i) => ({ question: `Frage ${i}`, answer: long })), source: 'DM', durationSec: 100, createdAt: new Date().toISOString() };
  const p = applicationPayload(app, { name: 'Team' }, { guildName: 'S' });
  const total = p.embeds.reduce((n, e) => n + (e.title?.length ?? 0) + e.description.length, 0);
  assert.ok(total <= 6000 && p.embeds.length <= 10, `zu lang: ${total}`);
  assert.ok(p.embeds.every((e) => e.description.length <= 4096));
  assert.equal(p.components[0].components.length, 4);
  const decided = applicationPayload({ ...app, status: 'ACCEPTED', decidedBy: ADMIN, decidedAt: new Date().toISOString() }, { name: 'Team' });
  assert.equal(decided.components[0].components.length, 2, 'nur Verlauf + Ticket');
  const types = defaultGuildConfig().types;
  assert.equal(panelPayload({ title: 'P', types: ['team'], color: '#ffffff' }, types).components[0].components[0].custom_id, 'app:pick:team');
  assert.equal(panelPayload({ title: 'P', types: ['team', 'sek'] }, [...types, { ...types[0], key: 'sek', name: 'SEK' }]).components[0].components[0].type, 3);
});

test('Statistik und KI-Checker', () => {
  const now = Date.now();
  const apps = [
    { typeName: 'Team', status: 'ACCEPTED', createdAt: new Date(now - 86_400_000).toISOString(), decidedAt: new Date(now - 82_800_000).toISOString(), decidedBy: ADMIN },
    { typeName: 'Team', status: 'OPEN', createdAt: new Date(now - 3_600_000).toISOString() },
    { typeName: 'SEK', status: 'REJECTED', createdAt: new Date(now - 40 * 86_400_000).toISOString(), decidedAt: new Date(now).toISOString(), decidedBy: ADMIN },
  ];
  const s = analytics(apps, { days: 30, now });
  assert.equal(s.kpis.find((k) => k.key === 'total').value, 2);
  assert.equal(s.kpis.find((k) => k.key === 'approvalRate').value, 100);
  assert.equal(Math.round(s.kpis.find((k) => k.key === 'avgReviewMin').value), 60);
  assert.equal(s.overTime.length, 30);
  assert.equal(s.reviewers[0].name, 'Admin');
  assert.equal(aiCheck([{ answer: 'weil ich bock hab xD und die leute nett sind, bin oft online abends' }]).level, 'LOW');
  assert.equal(aiCheck([{ answer: 'Gerne! Hier ist eine mögliche Antwort: Darüber hinaus ist Teamfähigkeit von großer Bedeutung.' }]).level, 'HIGH');
});
