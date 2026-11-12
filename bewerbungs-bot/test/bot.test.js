import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Events, PermissionFlagsBits } from 'discord.js';
import { wireBot, COMMANDS } from '../src/discord/bot.js';
import { answers, G, setup } from './helpers.js';

const STAFF = '200000000000000005';
const APPLICANT = '700000000000000001';

/** Nachgebaute Discord-Interaktion; merkt sich alle Antworten. */
function interaction({ kind = 'button', customId, values, userId = STAFF, roles = [], admin = false, guildId = G, fields, command, options = {} }) {
  const out = [];
  const rec = (name) => async (p) => { out.push([name, p]); };
  return {
    out, customId, values, guildId, commandName: command, channelId: '300000000000000001',
    user: { id: userId, username: `u${userId.slice(-2)}`, globalName: null, displayAvatarURL: () => null },
    member: guildId ? { roles: { cache: new Map(roles.map((r) => [r, {}])) }, joinedAt: new Date('2026-01-01') } : null,
    memberPermissions: { has: (p) => admin && p === PermissionFlagsBits.ManageGuild },
    fields: { getTextInputValue: (k) => fields?.[k] ?? '' },
    options: { getString: (k) => options[k] ?? null, getUser: (k) => options[k], getInteger: (k) => options[k] ?? null, getSubcommand: () => options.sub },
    isAutocomplete: () => false, isChatInputCommand: () => kind === 'command', isButton: () => kind === 'button', isStringSelectMenu: () => kind === 'select', isModalSubmit: () => kind === 'modal', isRepliable: () => true,
    reply: rec('reply'), deferReply: async () => { out.push(['defer']); }, editReply: rec('editReply'), followUp: rec('followUp'), showModal: rec('showModal'), update: rec('update'), deferUpdate: async () => { out.push(['deferUpdate']); },
  };
}

function bot(typeOver) {
  const ctx = setup(typeOver);
  const client = new EventEmitter();
  wireBot(client, { ...ctx, publicUrl: 'http://x', log: { info() {}, error(...a) { throw new Error(a.join(' ')); } } });
  const fire = async (i) => { client.emit(Events.InteractionCreate, i); await new Promise((r) => setTimeout(r, 20)); return i.out; };
  return { ...ctx, client, fire };
}
const text = (p) => p.embeds?.map((e) => e.description).join('\n') ?? '';

test('Befehle sind gültig definiert', () => {
  for (const c of COMMANDS) assert.match(c.name, /^[\p{Ll}\p{N}_-]{1,32}$/u);
  assert.ok(COMMANDS.find((c) => c.name === 'bewerbungssperre').options.every((o) => /^[\p{Ll}\p{N}_-]{1,32}$/u.test(o.name)));
});

test('Panel-Klick → DM-Bestätigung → Start → Antworten per DM', async () => {
  const b = bot();
  const pick = await b.fire(interaction({ customId: 'app:pick:team', userId: APPLICANT }));
  assert.equal(pick.at(-1)[0], 'editReply');
  assert.equal(pick.at(-1)[1].flags, undefined, 'keine Flags beim Bearbeiten');
  assert.match(pick.at(-1)[1].embeds[0].title, /gestartet/);
  const start = await b.fire(interaction({ customId: `app:start:${G}:team`, userId: APPLICANT, guildId: null }));
  assert.deepEqual(start.map((x) => x[0]), ['deferUpdate', 'editReply']);
  for (const a of answers) { b.client.emit(Events.MessageCreate, { author: { id: APPLICANT, username: 'lena', globalName: 'Lena', bot: false, displayAvatarURL: () => null }, guildId: null, content: a }); await new Promise((r) => setTimeout(r, 10)); }
  assert.equal(b.store.data.applications.length, 1);
  assert.equal(b.store.data.applications[0].userName, 'u01', 'Name vom Start-Klick');
});

test('Team-Buttons: Rechte, Annehmen mit Grund (Modal), Verlauf, doppelt', async () => {
  const b = bot();
  const cfg = b.store.guild(G);
  cfg.access.reviewerRoles = ['400000000000000010'];
  const app = await b.service.submit({ guildId: G, typeKey: 'team', user: { id: APPLICANT, name: 'Lena' }, answers });
  const denied = await b.fire(interaction({ customId: `app:decide:${app.id}:A` }));
  assert.match(text(denied[0][1]), /Manager-Rollen/);
  const modal = await b.fire(interaction({ customId: `app:reason:${app.id}:A`, roles: ['400000000000000010'] }));
  assert.equal(modal[0][0], 'showModal');
  assert.equal(modal[0][1].custom_id, `app:reasonsubmit:${app.id}:A`);
  const done = await b.fire(interaction({ kind: 'modal', customId: `app:reasonsubmit:${app.id}:A`, roles: ['400000000000000010'], fields: { reason: 'Willkommen!' } }));
  assert.match(text(done.at(-1)[1]), /angenommen/);
  assert.equal(app.status, 'ACCEPTED');
  assert.equal(app.reason, 'Willkommen!');
  const again = await b.fire(interaction({ customId: `app:decide:${app.id}:R`, admin: true }));
  assert.match(text(again[0][1]), /bereits entschieden/);
  const hist = await b.fire(interaction({ customId: `app:history:${APPLICANT}`, admin: true }));
  assert.match(text(hist[0][1]), /APP-000001/);
});

test('/bewerbungssperre und /bewerbungsverlauf', async () => {
  const b = bot();
  const add = await b.fire(interaction({ kind: 'command', command: 'bewerbungssperre', admin: true, options: { sub: 'hinzufügen', person: { id: APPLICANT, username: 'lena' }, grund: 'Spam', tage: 3 } }));
  assert.match(text(add[0][1]), /gesperrt bis/);
  const pick = await b.fire(interaction({ customId: 'app:pick:team', userId: APPLICANT }));
  assert.match(text(pick.at(-1)[1]), /gesperrt.*Spam/);
  const lift = await b.fire(interaction({ kind: 'command', command: 'bewerbungssperre', admin: true, options: { sub: 'aufheben', person: { id: APPLICANT } } }));
  assert.match(text(lift[0][1]), /1 Sperre/);
  const noAccess = await b.fire(interaction({ kind: 'command', command: 'bewerbungsverlauf', options: { person: { id: APPLICANT } } }));
  assert.match(text(noAccess[0][1]), /Prüfer- oder Admin-Rolle/);
});
