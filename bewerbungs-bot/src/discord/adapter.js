import { ChannelType, OverwriteType, PermissionFlagsBits } from 'discord.js';
import { clip } from '../forms.js';
import { applicationPayload, archivePayload, button, COLORS, decisionDmPayload, panelPayload, row } from './messages.js';

/**
 * Alles, was das Bewerbungssystem in Discord tut (Nachrichten, Rollen, Tickets, Server-Infos für das Dashboard).
 * Die Kernlogik (service.js) kennt nur diese Funktionen.
 */
export function createDiscordAdapter(client, { store, publicUrl, log = console }) {
  const guild = (id) => client.guilds.cache.get(id) ?? client.guilds.fetch(id);
  const channel = async (id) => { const c = client.channels.cache.get(id) ?? await client.channels.fetch(id); if (!c?.isTextBased()) throw new Error(`Kanal ${id} ist kein Textkanal oder nicht erreichbar.`); return c; };
  const dashboardUrl = (a) => (publicUrl ? `${publicUrl}/#/g/${a.guildId}/applications/${a.id}` : undefined);

  return {
    async guildName(guildId) { return (await guild(guildId)).name; },

    async sendDm(userId, payload) {
      const user = await client.users.fetch(userId);
      const m = await user.send(payload);
      return { channelId: m.channelId, messageId: m.id };
    },

    async sendDecisionDm(app, type, text, guildName) { return this.sendDm(app.userId, decisionDmPayload(app, text, guildName)); },

    async applyRoles(guildId, userId, add, remove, reason) {
      const g = await guild(guildId);
      const member = await g.members.fetch(userId);
      if (add.length) await member.roles.add(add, reason);
      if (remove.length) await member.roles.remove(remove.filter((r) => member.roles.cache.has(r)), reason);
    },

    /** Neue Bewerbung in den Kanal für offene Einsendungen (mit Ping-Rollen und optional Team-Thread). */
    async postApplication(guildId, app, type) {
      if (!type.channels?.pending) return null;
      const ch = await channel(type.channels.pending);
      const g = await guild(guildId);
      const ping = type.pingRoles?.length ? type.pingRoles.map((r) => `<@&${r}>`).join(' ') : undefined;
      const m = await ch.send({ ...(ping ? { content: ping, allowedMentions: { roles: type.pingRoles } } : {}), ...applicationPayload(app, type, { guildName: g.name, dashboardUrl: dashboardUrl(app) }) });
      let threadId = null;
      if (type.staffThreads && 'threads' in ch) {
        try { threadId = (await m.startThread({ name: clip(`${app.number} · ${app.userName}`, 100), autoArchiveDuration: 10080 })).id; } catch (e) { log.error('Team-Thread:', e.message); }
      }
      return { channelId: m.channelId, messageId: m.id, threadId };
    },

    async updateApplicationMessage(app, type) {
      if (!app.message) return;
      const ch = await channel(app.message.channelId);
      const g = await guild(app.guildId);
      const m = await ch.messages.fetch(app.message.messageId);
      await m.edit(applicationPayload(app, type, { guildName: g.name, dashboardUrl: dashboardUrl(app) }));
    },

    async postArchive(channelId, app, type) {
      const ch = await channel(channelId);
      const g = await guild(app.guildId);
      await ch.send(archivePayload(app, type, { guildName: g.name, dashboardUrl: dashboardUrl(app) }));
    },

    /** Panel senden oder die gesendete Nachricht aktualisieren (`mode: 'new'` = immer neu). */
    async postPanel(guildId, panel, types, mode = 'update') {
      const payload = panelPayload(panel, types);
      if (mode !== 'new' && panel.message && panel.message.channelId === panel.channelId) {
        try {
          const ch = await channel(panel.message.channelId);
          await (await ch.messages.fetch(panel.message.messageId)).edit(payload);
          return panel.message;
        } catch { /* gelöscht → neu senden */ }
      }
      const ch = await channel(panel.channelId);
      if (ch.guildId !== guildId) throw new Error('Der Kanal gehört zu einem anderen Server.');
      const m = await ch.send(payload);
      return { channelId: m.channelId, messageId: m.id };
    },

    /** Privater Kanal mit Bewerber, Team-Rolle und dem anfragenden Teammitglied. */
    async createTicket(guildId, app, requesterId, cfg = {}) {
      const g = await guild(guildId);
      const known = store.data.tickets[app.id];
      if (known) { const c = await g.channels.fetch(known).catch(() => null); if (c) return { channelId: c.id, existing: true }; }
      const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles];
      const overwrites = [
        { id: g.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, type: OverwriteType.Member, allow: [...allow, PermissionFlagsBits.ManageChannels] },
        { id: app.userId, type: OverwriteType.Member, allow },
        ...(cfg.staffRoleId ? [{ id: cfg.staffRoleId, type: OverwriteType.Role, allow }] : []),
        ...(requesterId && requesterId !== app.userId ? [{ id: requesterId, type: OverwriteType.Member, allow }] : []),
      ];
      const c = await g.channels.create({ name: `bewerbung-${app.number.toLowerCase()}`, type: ChannelType.GuildText, parent: cfg.categoryId || undefined, permissionOverwrites: overwrites, reason: `Rückfrage zu Bewerbung ${app.number}` });
      store.data.tickets[app.id] = c.id; store.touch();
      await c.send({
        content: `<@${app.userId}>${requesterId ? ` <@${requesterId}>` : ''}`,
        embeds: [{ title: `🎫 Ticket zur Bewerbung ${app.number}`, color: COLORS.info, description: `<@${app.userId}>, das Team hat eine Rückfrage zu deiner Bewerbung **${app.number}** (${app.typeName}).` }],
        components: [row(button('app:closeticket', 'Ticket schließen', 'danger', '🔒'))],
      });
      return { channelId: c.id, existing: false };
    },

    // ---- für das Dashboard ----
    guilds() { return [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name, icon: g.iconURL({ size: 64 }) })); },

    /** Zugriff einer Person auf einen Server: Mitglied? „Server verwalten“? Rollen? */
    async member(guildId, userId) {
      const g = client.guilds.cache.get(guildId);
      if (!g) return null;
      const m = await g.members.fetch(userId).catch(() => null);
      if (!m) return null;
      return { roles: [...m.roles.cache.keys()], manageGuild: m.permissions.has(PermissionFlagsBits.ManageGuild), name: m.displayName, avatar: m.displayAvatarURL({ size: 64 }) };
    },

    async meta(guildId) {
      const g = await guild(guildId);
      await g.channels.fetch().catch(() => undefined);
      const me = g.members.me;
      const channels = [...g.channels.cache.values()].filter((c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
        .sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name, parent: c.parent?.name ?? null, botCanSend: !!me && c.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]) }));
      const categories = [...g.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name }));
      const top = me?.roles.highest.position ?? 0;
      const roles = [...g.roles.cache.values()].filter((r) => r.id !== g.id).sort((a, b) => b.position - a.position)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, managed: r.managed, assignable: !r.managed && r.position < top }));
      return { id: g.id, name: g.name, icon: g.iconURL({ size: 64 }), channels, categories, roles, botCanManageRoles: !!me?.permissions.has(PermissionFlagsBits.ManageRoles) };
    },

    async avatar(userId) { const u = await client.users.fetch(userId).catch(() => null); return u?.displayAvatarURL({ size: 64 }) ?? null; },
  };
}
