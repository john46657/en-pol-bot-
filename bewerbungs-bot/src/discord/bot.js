import { ApplicationCommandOptionType, Client, Events, GatewayIntentBits, MessageFlags, Partials, PermissionFlagsBits } from 'discord.js';
import { accessLevel, canDecide } from '../access.js';
import { clip, plain } from '../forms.js';
import { AppError, isOpen } from '../service.js';
import { COLORS, historyPayload, simple } from './messages.js';

export const COMMANDS = [
  { name: 'bewerbung', description: 'Bewirb dich (Fragen per Direktnachricht)', dm_permission: false,
    options: [{ type: ApplicationCommandOptionType.String, name: 'art', description: 'Wofür möchtest du dich bewerben?', autocomplete: true, required: false }] },
  { name: 'bewerbungspanel', description: 'Postet ein Bewerbungs-Panel in diesen Kanal', dm_permission: false, default_member_permissions: String(PermissionFlagsBits.ManageGuild),
    options: [{ type: ApplicationCommandOptionType.String, name: 'panel', description: 'Welches Panel (Dashboard → Einrichtung → Panels)', autocomplete: true, required: false }] },
  { name: 'bewerbungsverlauf', description: 'Bisherige Bewerbungen einer Person', dm_permission: false,
    options: [{ type: ApplicationCommandOptionType.User, name: 'person', description: 'Person', required: true }] },
  { name: 'bewerbungssperre', description: 'Bewerbungssperren verwalten', dm_permission: false, options: [
    { type: ApplicationCommandOptionType.Subcommand, name: 'hinzufügen', description: 'Person für Bewerbungen sperren', options: [
      { type: ApplicationCommandOptionType.User, name: 'person', description: 'Person', required: true },
      { type: ApplicationCommandOptionType.String, name: 'grund', description: 'Grund (sieht die Person)', required: true, max_length: 500 },
      { type: ApplicationCommandOptionType.String, name: 'art', description: 'Bewerbungsart (leer = alle)', autocomplete: true, required: false },
      { type: ApplicationCommandOptionType.Integer, name: 'tage', description: 'Dauer in Tagen (leer = dauerhaft)', min_value: 1, max_value: 3650, required: false }] },
    { type: ApplicationCommandOptionType.Subcommand, name: 'aufheben', description: 'Alle aktiven Sperren einer Person aufheben', options: [
      { type: ApplicationCommandOptionType.User, name: 'person', description: 'Person', required: true }] },
  ] },
  { name: 'dashboard', description: 'Link zum Bewerbungs-Dashboard', dm_permission: false },
];

const err = (text) => ({ ...simple(text, COLORS.danger), flags: MessageFlags.Ephemeral });
const ok = (text) => ({ ...simple(text, COLORS.success), flags: MessageFlags.Ephemeral });
const eph = (payload) => ({ ...payload, flags: MessageFlags.Ephemeral });
/** Beim Bearbeiten einer (aufgeschobenen) Antwort keine Flags mitschicken. */
const strip = ({ flags: _f, ...payload }) => payload;
const memberOf = (i) => (i.member ? { roles: Array.isArray(i.member.roles) ? i.member.roles : [...i.member.roles.cache.keys()], manageGuild: i.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false } : null);
const userOf = (u) => ({ id: u.id, name: u.globalName ? `${u.globalName} (@${u.username})` : u.username, avatar: u.displayAvatarURL({ size: 64 }) });
const actorOf = (u) => ({ id: u.id, name: u.globalName ?? u.username });

export function createClient({ membersIntent }) {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, ...(membersIntent ? [GatewayIntentBits.GuildMembers] : [])],
    partials: [Partials.Channel, Partials.Message],
  });
}

/** Befehle, Buttons, Menüs, Formulare und DMs an das Bewerbungssystem anschließen. */
export function wireBot(client, { service, store, flow, publicUrl, log = console }) {
  client.once(Events.ClientReady, async (c) => {
    log.info(`Discord: angemeldet als ${c.user.tag} auf ${c.guilds.cache.size} Server(n).`);
    try { await c.application.commands.set(COMMANDS); log.info('Discord: Slash-Befehle registriert.'); } catch (e) { log.error('Slash-Befehle konnten nicht registriert werden:', e.message); }
    setInterval(() => flow.sweep(), 60_000).unref();
  });

  client.on(Events.MessageCreate, async (m) => {
    if (m.author.bot || m.guildId) return;
    try { await flow.message(userOf(m.author), m.content ?? ''); } catch (e) { log.error('DM-Bewerbung:', e); }
  });

  client.on(Events.GuildMemberRemove, async (m) => {
    try { const r = await service.memberLeft(m.guild.id, m.id); if (r.denied || r.withdrawn) log.info(`${m.id} hat ${m.guild.name} verlassen: ${r.denied} abgelehnt, ${r.withdrawn} zurückgezogen.`); } catch (e) { log.error('Verlassen:', e); }
  });

  client.on(Events.InteractionCreate, async (i) => {
    try {
      if (i.isAutocomplete()) return await autocomplete(i);
      if (i.isChatInputCommand()) return await command(i);
      if (i.isButton() || i.isStringSelectMenu() || i.isModalSubmit()) {
        if (!i.customId.startsWith('app:')) return;
        return await component(i);
      }
    } catch (e) {
      const msg = e instanceof AppError ? e.message : 'Da ist etwas schiefgelaufen. Bitte versuche es erneut.';
      if (!(e instanceof AppError)) log.error('Interaktion:', e);
      const payload = err(msg);
      if (i.isRepliable()) await (i.deferred || i.replied ? i.followUp(payload) : i.reply(payload)).catch(() => undefined);
    }
  });

  async function autocomplete(i) {
    const cfg = store.guild(i.guildId);
    const q = String(i.options.getFocused() ?? '').toLowerCase();
    const opt = i.options.getFocused(true).name;
    const list = opt === 'panel'
      ? cfg.panels.map((p) => ({ name: clip(p.title, 100), value: p.id }))
      : [...(i.commandName === 'bewerbungssperre' ? [{ name: 'Alle Bewerbungen', value: '*' }] : []), ...cfg.types.filter((t) => i.commandName !== 'bewerbung' || t.enabled).map((t) => ({ name: clip(t.name, 100), value: t.key }))];
    await i.respond(list.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 25));
  }

  async function command(i) {
    const cfg = store.guild(i.guildId);
    const member = memberOf(i);
    if (i.commandName === 'bewerbung') {
      let key = i.options.getString('art');
      if (!key) {
        const open = cfg.types.filter((t) => t.enabled);
        if (open.length === 1) key = open[0].key;
        else if (!open.length) return i.reply(err('Derzeit sind keine Bewerbungen geöffnet.'));
        else return i.reply(eph({ ...simple('Wofür möchtest du dich bewerben?'), components: [{ type: 1, components: [{ type: 3, custom_id: 'app:pick', placeholder: 'Bewerbungsart wählen …', options: open.slice(0, 25).map((t) => ({ label: clip(t.name, 100), value: t.key })) }] }] }));
      }
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(strip(await flow.offer({ guildId: i.guildId, typeKey: key, user: userOf(i.user), memberRoles: member?.roles ?? [], joinedAt: i.member?.joinedAt?.toISOString?.() ?? null })));
    }
    if (i.commandName === 'dashboard') return i.reply(eph(simple(publicUrl ? `Dashboard: ${publicUrl}/#/g/${i.guildId}` : 'Für das Dashboard ist keine Adresse (PUBLIC_URL) eingestellt.')));
    if (i.commandName === 'bewerbungspanel') {
      if (accessLevel(cfg, member) !== 'admin') return i.reply(err('Dafür brauchst du „Server verwalten“ oder eine Admin-Rolle des Bewerbungssystems.'));
      const pid = i.options.getString('panel');
      const panel = pid ? cfg.panels.find((p) => p.id === pid) : cfg.panels[0];
      if (!panel) return i.reply(err('Kein Panel gefunden – lege eins im Dashboard unter *Einrichtung → Panels* an.'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      panel.channelId = i.channelId;
      try { panel.message = await service.discord.postPanel(i.guildId, panel, cfg.types, 'new'); store.touch(); } catch (e) { return i.editReply(strip(err(`Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Kanal?). ${e.message}`))); }
      return i.editReply(strip(ok(`Panel **${plain(panel.title)}** gepostet. Änderungen im Dashboard aktualisieren es automatisch.`)));
    }
    if (!accessLevel(cfg, member)) return i.reply(err('Dafür brauchst du eine Prüfer- oder Admin-Rolle des Bewerbungssystems.'));
    if (i.commandName === 'bewerbungsverlauf') {
      const u = i.options.getUser('person', true);
      return i.reply(eph(historyPayload(u.id, service.history(i.guildId, u.id))));
    }
    if (i.commandName === 'bewerbungssperre') {
      const u = i.options.getUser('person', true);
      if (i.options.getSubcommand() === 'aufheben') {
        const active = service.activeBans(i.guildId).filter((b) => b.userId === u.id);
        active.forEach((b) => service.liftBan(i.guildId, b.id, actorOf(i.user)));
        return i.reply(ok(active.length ? `${active.length} Sperre(n) von <@${u.id}> aufgehoben.` : `<@${u.id}> hat keine aktive Sperre.`));
      }
      const art = i.options.getString('art') ?? '*';
      const days = i.options.getInteger('tage');
      const b = await service.createBan(i.guildId, actorOf(i.user), { userId: u.id, name: u.username, types: [art], reason: i.options.getString('grund', true), expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null });
      const what = art === '*' ? 'alle Bewerbungen' : cfg.types.find((t) => t.key === art)?.name ?? art;
      return i.reply(ok(`<@${u.id}> ist für **${plain(what)}** gesperrt${b.expiresAt ? ` bis <t:${Math.floor(Date.parse(b.expiresAt) / 1000)}:f>` : ' (dauerhaft)'}.`));
    }
  }

  async function component(i) {
    const [, action, ...rest] = i.customId.split(':');
    const user = userOf(i.user);

    // ---- Bewerber ----
    if (action === 'pick') {
      const key = i.isStringSelectMenu() ? i.values[0] : rest[0];
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(strip(await flow.offer({ guildId: i.guildId, typeKey: key, user, memberRoles: memberOf(i)?.roles ?? [], joinedAt: i.member?.joinedAt?.toISOString?.() ?? null })));
    }
    if (action === 'start') {
      await i.deferUpdate();
      const r = await flow.start({ guildId: rest[0], typeKey: rest[1], user });
      await i.editReply({ components: [] }).catch(() => undefined);
      if (r.embeds[0].color === COLORS.danger) await i.followUp(r);
      return;
    }
    if (action === 'cancel') return i.update({ ...flow.cancel(user.id), components: [] });
    if (action === 'ans' || action === 'skip' || action === 'rb') {
      await i.deferUpdate();
      const r = await flow.component(user, action, Number(rest[0]), action === 'rb' ? [rest[1]] : i.isStringSelectMenu() ? i.values : []);
      return r.error ? i.followUp(err(r.error)) : i.editReply(r.update);
    }

    // ---- Team ----
    if (!i.guildId) return i.reply(err('Das geht nur auf dem Server.'));
    const cfg = store.guild(i.guildId);
    const member = memberOf(i);
    if (action === 'closeticket') {
      if (!accessLevel(cfg, member)) return i.reply(err('Nur das Team kann das Ticket schließen.'));
      await i.reply(simple(`🔒 Ticket wird von <@${i.user.id}> geschlossen …`, COLORS.neutral));
      for (const [k, v] of Object.entries(store.data.tickets)) if (v === i.channelId) delete store.data.tickets[k];
      store.touch();
      setTimeout(() => i.channel?.delete('Ticket geschlossen').catch(() => undefined), 4000);
      return;
    }
    if (action === 'history') {
      if (!accessLevel(cfg, member)) return i.reply(err('Du hast keine Berechtigung, Bewerbungen anzusehen.'));
      return i.reply(eph(historyPayload(rest[0], service.history(i.guildId, rest[0]))));
    }
    const app = service.get(i.guildId, rest[0]);
    if (action === 'ticket') {
      if (!accessLevel(cfg, member)) return i.reply(err('Du hast keine Berechtigung dafür.'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const t = await service.openTicket(i.guildId, app.id, i.user.id);
        return i.editReply(strip(ok(t.existing ? `Zu dieser Bewerbung gibt es schon ein Ticket: <#${t.channelId}>` : `Ticket geöffnet: <#${t.channelId}>`)));
      } catch (e) { return i.editReply(strip(err(`Ticket konnte nicht angelegt werden (Recht „Kanäle verwalten“? Person noch auf dem Server?). ${e.message}`))); }
    }
    const status = rest[1] === 'A' ? 'ACCEPTED' : 'REJECTED';
    if (!canDecide(cfg, service.typeOf(app), member)) return i.reply(err('Über diese Bewerbung dürfen nur die eingestellten Manager-Rollen (bzw. Prüfer/Admins) entscheiden.'));
    if (!isOpen(app)) return i.reply(err('Über diese Bewerbung wurde bereits entschieden.'));
    if (action === 'reason') {
      return i.showModal({ custom_id: `app:reasonsubmit:${app.id}:${rest[1]}`, title: status === 'ACCEPTED' ? 'Annehmen mit Grund' : 'Ablehnen mit Grund',
        components: [{ type: 1, components: [{ type: 4, custom_id: 'reason', label: 'Grund (geht per DM an die Person)', style: 2, required: true, max_length: 1000 }] }] });
    }
    if (action === 'decide' || action === 'reasonsubmit') {
      const reason = action === 'reasonsubmit' ? i.fields.getTextInputValue('reason').trim() : null;
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const r = await service.decide(i.guildId, app.id, { status, reason, notifyReason: true, actor: actorOf(i.user) });
      return i.editReply(strip(ok(`Bewerbung **${app.number}** ${status === 'ACCEPTED' ? '**angenommen**' : '**abgelehnt**'}.${r.dm ? ' Die Person wurde per DM informiert.' : ' ⚠️ DM konnte nicht zugestellt werden.'}${r.roles && r.roles !== 'ok' ? ` ⚠️ Rollen: ${r.roles}` : ''}`)));
    }
    return i.reply(err('Unbekannte Aktion.'));
  }
}
