"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.embedOf = embedOf;
exports.componentsOf = componentsOf;
exports.payloadOf = payloadOf;
exports.createTicketRuntime = createTicketRuntime;
const discord_js_1 = require("discord.js");
const STYLE = { primary: discord_js_1.ButtonStyle.Primary, secondary: discord_js_1.ButtonStyle.Secondary, success: discord_js_1.ButtonStyle.Success, danger: discord_js_1.ButtonStyle.Danger };
const VIEW = [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.ReadMessageHistory];
const TALK = [discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.AttachFiles, discord_js_1.PermissionFlagsBits.EmbedLinks];
const https = (u) => (u && /^https:\/\//.test(u) ? u : undefined);
function embedOf(e) {
    const b = new discord_js_1.EmbedBuilder();
    if (e.title)
        b.setTitle(e.title.slice(0, 256));
    if (e.description)
        b.setDescription(e.description.slice(0, 4096));
    if (e.color !== undefined)
        b.setColor(e.color);
    if (https(e.thumbnail))
        b.setThumbnail(e.thumbnail);
    if (https(e.image))
        b.setImage(e.image);
    if (e.author)
        b.setAuthor({ name: e.author.slice(0, 256), ...(https(e.authorIcon) ? { iconURL: e.authorIcon } : {}) });
    if (e.footer)
        b.setFooter({ text: e.footer.slice(0, 2048), ...(https(e.footerIcon) ? { iconURL: e.footerIcon } : {}) });
    if (e.fields?.length)
        b.addFields(e.fields.slice(0, 25).map((f) => ({ name: f.name.slice(0, 256) || '​', value: f.value.slice(0, 1024) || '​', inline: f.inline ?? false })));
    if (e.timestamp)
        b.setTimestamp(new Date(e.timestamp));
    if (!e.title && !e.description && !e.fields?.length)
        b.setDescription('​');
    return b;
}
/** Menü + Buttons zu Discord-Reihen (max. 5 Reihen, 5 Buttons je Reihe). */
function componentsOf(buttons = [], selects = []) {
    const rows = [];
    for (const s of selects.slice(0, 5)) {
        let menu;
        if (s.kind === 'user')
            menu = new discord_js_1.UserSelectMenuBuilder();
        else if (s.kind === 'role')
            menu = new discord_js_1.RoleSelectMenuBuilder();
        else {
            const sm = new discord_js_1.StringSelectMenuBuilder();
            sm.addOptions((s.options ?? []).slice(0, 25).map((o) => ({ label: o.label.slice(0, 100), value: o.value.slice(0, 100), ...(o.description ? { description: o.description.slice(0, 100) } : {}), ...(o.emoji ? { emoji: o.emoji } : {}) })));
            menu = sm;
        }
        menu.setCustomId(s.id).setPlaceholder(s.placeholder.slice(0, 150));
        const max = Math.max(1, Math.min(s.max ?? 1, s.kind === 'user' || s.kind === 'role' ? 25 : (s.options?.length ?? 1)));
        menu.setMinValues(Math.min(s.min ?? 1, max)).setMaxValues(max);
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(menu));
    }
    for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(buttons.slice(i, i + 5).map((b) => {
            const x = b.url ? new discord_js_1.ButtonBuilder().setURL(b.url).setStyle(discord_js_1.ButtonStyle.Link) : new discord_js_1.ButtonBuilder().setCustomId(b.id).setStyle(STYLE[b.style] ?? discord_js_1.ButtonStyle.Secondary);
            x.setLabel(b.label.slice(0, 80));
            if (b.emoji)
                x.setEmoji(b.emoji);
            if (b.disabled)
                x.setDisabled(true);
            return x;
        })));
    }
    return rows;
}
function payloadOf(m) {
    return {
        ...(m.content ? { content: m.content.slice(0, 2000) } : {}),
        embeds: (m.embeds ?? []).slice(0, 10).map(embedOf),
        components: componentsOf(m.buttons, m.select ? [m.select] : []),
        // Nur ausdrücklich gewünschte Erwähnungen pingen – niemals @everyone/@here
        allowedMentions: { parse: [], users: m.mentionUsers ?? [], roles: m.mentionRoles ?? [] },
    };
}
/**
 * Führt Ticket-Effekte in Discord aus und schneidet Nachrichten in Ticket-Channels mit.
 * Das System (API) entscheidet alles; hier passiert nur die Discord-Seite.
 */
function createTicketRuntime(client, api, log = console.log) {
    const channels = new Set();
    const text = async (id) => {
        const ch = await client().channels.fetch(id).catch(() => null);
        return ch && ch.type === discord_js_1.ChannelType.GuildText ? ch : null;
    };
    async function create(e) {
        const guild = await client().guilds.fetch(e.guildId);
        const me = client().user.id;
        const overwrites = [
            { id: guild.roles.everyone.id, type: discord_js_1.OverwriteType.Role, deny: [discord_js_1.PermissionFlagsBits.ViewChannel] },
            { id: me, type: discord_js_1.OverwriteType.Member, allow: [...VIEW, ...TALK, discord_js_1.PermissionFlagsBits.ManageChannels, discord_js_1.PermissionFlagsBits.ManageMessages] },
            ...e.viewers.map((v) => ({ id: v.id, type: v.kind === 'user' ? discord_js_1.OverwriteType.Member : discord_js_1.OverwriteType.Role, allow: [...VIEW, ...(v.send ? TALK : [])], ...(v.send ? {} : { deny: [discord_js_1.PermissionFlagsBits.SendMessages] }) })),
        ];
        const parent = e.parentId ? await guild.channels.fetch(e.parentId).catch(() => null) : null;
        const base = { name: e.name, type: discord_js_1.ChannelType.GuildText, topic: e.topic.slice(0, 1024), permissionOverwrites: overwrites };
        let ch;
        try {
            ch = await guild.channels.create(parent?.type === discord_js_1.ChannelType.GuildCategory ? { ...base, parent: parent.id } : base);
        }
        catch (err) {
            if (!parent)
                throw err;
            ch = await guild.channels.create(base); // z. B. Kategorie voll (50 Channels) → ohne Kategorie
        }
        channels.add(ch.id);
        let control = null;
        try {
            control = await ch.send(payloadOf(e.control));
            for (const m of e.messages)
                await ch.send(payloadOf(m));
        }
        finally {
            await api.service('POST', `/bot/support-tickets/${e.ticketId}/channel`, { channelId: ch.id, controlMessageId: control?.id ?? null });
        }
        return ch.id;
    }
    async function transcript(e) {
        const { html } = await api.service('GET', `/bot/support-tickets/transcripts/${e.transcriptId}`);
        const file = () => new discord_js_1.AttachmentBuilder(Buffer.from(html, 'utf8'), { name: e.filename });
        const extra = e.message ? payloadOf(e.message) : { allowedMentions: { parse: [] } };
        for (const id of e.channelIds) {
            const ch = await text(id);
            if (ch)
                await ch.send({ ...extra, files: [file()] }).catch((err) => log(`transcript to ${id} failed: ${err instanceof Error ? err.message : err}`));
        }
        if (e.userId)
            await (await client().users.fetch(e.userId)).send({ ...extra, files: [file()] }).catch(() => log(`transcript DM to ${e.userId} failed (DMs closed?)`));
    }
    async function applyOne(e, result) {
        switch (e.type) {
            case 'create':
                result.channelId = await create(e);
                return;
            case 'access': {
                const ch = await text(e.channelId);
                if (!ch)
                    return;
                const type = e.kind === 'user' ? discord_js_1.OverwriteType.Member : discord_js_1.OverwriteType.Role;
                if (e.view === null) {
                    await ch.permissionOverwrites.delete(e.targetId, 'EN Polizei: Ticket-Zugriff entfernt').catch(() => undefined);
                    return;
                }
                await ch.permissionOverwrites.edit(e.targetId, { ViewChannel: e.view, ReadMessageHistory: e.view, ...(e.send === undefined ? {} : { SendMessages: e.send, AttachFiles: e.send }) }, { type, reason: 'EN Polizei: Ticket-Zugriff' });
                return;
            }
            case 'rename': {
                const ch = await text(e.channelId);
                if (ch)
                    await ch.setName(e.name, 'EN Polizei: Ticket umbenannt');
                return;
            }
            case 'move': {
                const ch = await text(e.channelId);
                if (ch)
                    await ch.setParent(e.parentId, { lockPermissions: false });
                return;
            }
            case 'post': {
                const ch = await text(e.channelId);
                if (ch)
                    await ch.send(payloadOf(e.message));
                return;
            }
            case 'control': {
                const ch = await text(e.channelId);
                if (!ch)
                    return;
                const msg = e.messageId ? await ch.messages.fetch(e.messageId).catch(() => null) : null;
                const edit = { ...payloadOf(e.message), content: undefined }; // Erwähnungen nicht erneut senden
                if (msg)
                    await msg.edit(edit);
                else {
                    const sent = await ch.send(edit);
                    await api.service('POST', `/bot/support-tickets/${e.ticketId}/channel`, { channelId: ch.id, controlMessageId: sent.id }).catch(() => undefined);
                }
                return;
            }
            case 'dm':
                await (await client().users.fetch(e.userId)).send(payloadOf(e.message)).catch(() => log(`ticket DM to ${e.userId} failed (DMs closed?)`));
                return;
            case 'transcript':
                await transcript(e);
                return;
            case 'delete': {
                // Sicherheitsnetz: nur bekannte Ticket-Channels löschen
                if (!channels.has(e.channelId))
                    await refresh();
                if (!channels.has(e.channelId)) {
                    log(`refusing to delete ${e.channelId}: not a ticket channel`);
                    return;
                }
                const ch = await text(e.channelId);
                if (!ch)
                    return;
                setTimeout(() => void ch.delete('EN Polizei: Ticket gelöscht').then(() => channels.delete(e.channelId)).catch((err) => log(`ticket delete failed: ${err instanceof Error ? err.message : err}`)), e.delayMs);
                return;
            }
            case 'panel': {
                const ch = await text(e.channelId);
                if (!ch)
                    throw new Error(`panel channel ${e.channelId} not found or not a text channel`);
                const old = e.messageId ? await ch.messages.fetch(e.messageId).catch(() => null) : null;
                const p = payloadOf(e.message);
                const msg = old ? await old.edit(p) : await ch.send(p);
                await api.service('POST', `/bot/support-tickets/panels/${e.panelId}/posted`, { channelId: ch.id, messageId: msg.id });
                return;
            }
        }
    }
    /** Effekte nacheinander ausführen; ein Fehler bei einem Effekt stoppt die übrigen nicht (außer beim Anlegen). */
    async function apply(effects) {
        const result = {};
        for (const e of effects) {
            try {
                await applyOne(e, result);
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                log(`ticket effect ${e.type} failed: ${msg}`);
                if (e.type === 'create') {
                    await api.service('POST', `/bot/support-tickets/${e.ticketId}/abort`, { reason: msg.slice(0, 300) }).catch(() => undefined);
                    throw new Error('Der Ticket-Channel konnte nicht erstellt werden (fehlen dem Bot die Rechte „Kanäle verwalten“ / „Rollen verwalten“?).');
                }
            }
        }
        return result;
    }
    async function refresh() {
        try {
            const ids = await api.service('GET', '/bot/support-tickets/channels');
            channels.clear();
            ids.forEach((i) => channels.add(i));
        }
        catch { /* API kurz weg – alter Stand bleibt */ }
    }
    /** Nachrichten in Ticket-Channels fürs Dashboard und das Transcript mitschneiden. */
    async function onMessage(m) {
        if (!m.inGuild() || !channels.has(m.channelId))
            return;
        await api.service('POST', '/bot/support-tickets/messages', {
            channelId: m.channelId, discordMessageId: m.id, authorId: m.author.id, authorName: (m.member?.displayName ?? m.author.globalName ?? m.author.username).slice(0, 100),
            authorAvatar: m.author.displayAvatarURL({ size: 64 }), isBot: m.author.bot, content: m.content.slice(0, 8000),
            attachments: [...m.attachments.values()].slice(0, 10).map((a) => ({ name: a.name.slice(0, 200), url: a.url, size: a.size, contentType: a.contentType ?? null })),
            embeds: m.embeds.slice(0, 10).map((e) => ({ ...(e.title ? { title: e.title.slice(0, 256) } : {}), ...(e.description ? { description: e.description.slice(0, 4096) } : {}) })),
        }).catch((err) => log(`ticket message not recorded: ${err instanceof Error ? err.message : err}`));
    }
    async function listCategories(guildId) {
        const guild = await client().guilds.fetch(guildId);
        return [...(await guild.channels.fetch()).values()].filter((c) => c?.type === discord_js_1.ChannelType.GuildCategory).map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
    }
    return { apply, refresh, onMessage, listCategories, isTicketChannel: (id) => channels.has(id) };
}
//# sourceMappingURL=discord-tickets.js.map