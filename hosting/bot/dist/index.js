"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const discord_tickets_1 = require("./discord-tickets");
const messages_1 = require("./messages");
const staff_lists_1 = require("./staff-lists");
const guilds_1 = require("./guilds");
const presence_1 = require("./presence");
const api_1 = require("./api");
const commands_1 = require("./commands");
const features_1 = require("./commands/features");
const qualifications_1 = require("./commands/qualifications");
const config_1 = require("./config");
const live_1 = require("./live");
const outbox_1 = require("./outbox");
const roblox_1 = require("./roblox");
const welcome_1 = require("./welcome");
const ghost_ping_1 = require("./ghost-ping");
const backup_1 = require("./backup");
const voice_support_1 = require("./voice-support");
const verify_1 = require("./verify");
const format_1 = require("./format");
const shared_1 = require("@enrp/shared");
(0, config_1.loadDotEnv)();
const cfg = (0, config_1.loadConfig)();
const api = new api_1.HttpApi(cfg.API_URL, cfg.BOT_API_TOKEN);
const makeClient = (i) => new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.DirectMessages, discord_js_1.GatewayIntentBits.GuildMessages, discord_js_1.GatewayIntentBits.GuildVoiceStates,
        ...(i.content ? [discord_js_1.GatewayIntentBits.MessageContent] : []), ...(i.members ? [discord_js_1.GatewayIntentBits.GuildMembers] : []), ...(i.presences ? [discord_js_1.GatewayIntentBits.GuildPresences] : [])],
    partials: [discord_js_1.Partials.Channel, discord_js_1.Partials.GuildMember], // GuildMember: Austritt auch von Mitgliedern, die nicht im Cache sind
});
/** Reihenfolge der Versuche, falls privilegierte Intents im Developer Portal aus sind. */
const INTENT_STEPS = [
    { content: true, members: true, presences: true }, { content: true, members: true, presences: false },
    { content: true, members: false, presences: false }, { content: false, members: true, presences: true }, { content: false, members: false, presences: false },
];
let intents = INTENT_STEPS[0];
let client = makeClient(intents);
const tickets = (0, discord_tickets_1.createTicketRuntime)(() => client, api);
const toEmbed = (e) => {
    const b = new discord_js_1.EmbedBuilder().setTitle(e.title);
    if (e.description)
        b.setDescription(e.description);
    if (e.color !== undefined)
        b.setColor(e.color);
    if (e.fields?.length)
        b.addFields(e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
    if (e.footer)
        b.setFooter({ text: e.footer });
    if (e.thumbnail && /^https:\/\//.test(e.thumbnail))
        b.setThumbnail(e.thumbnail);
    if (e.image && /^(https|attachment):\/\//.test(e.image))
        b.setImage(e.image);
    if (e.author?.name)
        b.setAuthor({ name: e.author.name.slice(0, 256), ...(e.author.iconUrl && /^https:\/\//.test(e.author.iconUrl) ? { iconURL: e.author.iconUrl } : {}) });
    b.setTimestamp(new Date()); // Datum/Uhrzeit unten in jeder Bot-Nachricht (Discord zeigt sie in der Zeitzone des Lesers)
    return b;
};
const STYLE = { primary: discord_js_1.ButtonStyle.Primary, secondary: discord_js_1.ButtonStyle.Secondary, success: discord_js_1.ButtonStyle.Success, danger: discord_js_1.ButtonStyle.Danger };
/** Buttons in Reihen zu je max. 5 (Discord-Limit). */
const toRows = (buttons = []) => {
    const rows = [];
    for (let i = 0; i < buttons.length && rows.length < 5; i += 5) {
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(buttons.slice(i, i + 5).map((b) => {
            const x = b.url ? new discord_js_1.ButtonBuilder().setURL(b.url).setLabel(b.label).setStyle(discord_js_1.ButtonStyle.Link) : new discord_js_1.ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(STYLE[b.style]);
            if (b.emoji)
                x.setEmoji(b.emoji);
            return x;
        })));
    }
    return rows;
};
/** Auswahlmenüs als eigene Reihen über den Buttons. */
const toComponents = (buttons, select, selects = []) => (0, discord_tickets_1.componentsOf)(buttons, [...(select ? [select] : []), ...selects]);
const toModal = (m) => new discord_js_1.ModalBuilder().setCustomId(m.id).setTitle(m.title.slice(0, 45)).addComponents(m.fields.map((f) => {
    const input = new discord_js_1.TextInputBuilder().setCustomId(f.id).setLabel(f.label.slice(0, 45)).setStyle(f.paragraph ? discord_js_1.TextInputStyle.Paragraph : discord_js_1.TextInputStyle.Short).setRequired(!!f.required);
    if (f.maxLength)
        input.setMaxLength(f.maxLength);
    if (f.minLength)
        input.setMinLength(Math.min(f.minLength, f.maxLength ?? 4000));
    if (f.placeholder)
        input.setPlaceholder(f.placeholder.slice(0, 100));
    if (f.value)
        input.setValue(f.value.slice(0, f.maxLength ?? 4000));
    return new discord_js_1.ActionRowBuilder().addComponents(input);
}));
const replyPayload = (r) => ({ content: r.content ?? '', embeds: (r.embeds ?? []).map(toEmbed), components: toComponents(r.buttons, r.select, r.selects), allowedMentions: { parse: [] } });
const TICKET_PREFIX = 'ticket-';
const ticketName = (userName, userId) => `${TICKET_PREFIX}${userName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || userId}`;
/** Echte Discord-Umsetzung der Plattform-Aktionen (in Tests ein Fake). */
const platform = {
    async setRole(guildId, userId, roleId, on) {
        const member = await (await client.guilds.fetch(guildId)).members.fetch(userId);
        if (on)
            await member.roles.add(roleId, 'EN Polizei');
        else
            await member.roles.remove(roleId, 'EN Polizei');
    },
    async createTicketChannel({ guildId, userId, userName, categoryId, staffRoleId, extraUserIds = [] }) {
        const guild = await client.guilds.fetch(guildId);
        const channels = await guild.channels.fetch();
        // Ein offenes Ticket pro Person: erkannt an der Benutzer-ID im Channel-Thema
        const existing = channels.find((c) => c?.type === discord_js_1.ChannelType.GuildText && c.name.startsWith(TICKET_PREFIX) && c.topic?.includes(`(${userId})`));
        if (existing)
            return { channelId: existing.id, existing: true };
        const view = [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.SendMessages, discord_js_1.PermissionFlagsBits.ReadMessageHistory, discord_js_1.PermissionFlagsBits.AttachFiles];
        const ch = await guild.channels.create({
            name: ticketName(userName, userId), type: discord_js_1.ChannelType.GuildText, topic: `Support-Ticket von ${userName} (${userId})`,
            ...(categoryId && channels.get(categoryId)?.type === discord_js_1.ChannelType.GuildCategory ? { parent: categoryId } : {}),
            permissionOverwrites: [
                { id: guild.roles.everyone.id, type: discord_js_1.OverwriteType.Role, deny: [discord_js_1.PermissionFlagsBits.ViewChannel] },
                { id: userId, type: discord_js_1.OverwriteType.Member, allow: view },
                { id: client.user.id, type: discord_js_1.OverwriteType.Member, allow: [...view, discord_js_1.PermissionFlagsBits.ManageChannels] },
                ...(staffRoleId ? [{ id: staffRoleId, type: discord_js_1.OverwriteType.Role, allow: view }] : []),
                ...extraUserIds.filter((id) => id !== userId).map((id) => ({ id, type: discord_js_1.OverwriteType.Member, allow: view })),
            ],
        });
        return { channelId: ch.id, existing: false };
    },
    async deleteChannel(channelId, delayMs = 0) {
        const ch = await client.channels.fetch(channelId);
        // Sicherheitsnetz: der Bot löscht ausschließlich eigene Ticket-Channels
        if (!ch || ch.type !== discord_js_1.ChannelType.GuildText || !ch.name.startsWith(TICKET_PREFIX))
            throw new Error('not a ticket channel');
        setTimeout(() => void ch.delete('Support-Ticket geschlossen').catch((e) => console.error('ticket delete failed:', e instanceof Error ? e.message : e)), delayMs);
    },
    async sendDirectMessage(userId, text) {
        await (await client.users.fetch(userId)).send({ content: text, allowedMentions: { parse: [] } });
    },
    async sendDm(userId, { embed, buttons, select }) {
        const m = await (await client.users.fetch(userId)).send({ embeds: [toEmbed(embed)], components: toComponents(buttons, select), allowedMentions: { parse: [] } });
        return { channelId: m.channelId, messageId: m.id };
    },
    async postOrEdit({ channelId, messageId, embed, buttons }) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isSendable() || !('messages' in ch))
            throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
        const payload = { embeds: [toEmbed(embed)], components: toRows(buttons), allowedMentions: { parse: [] } };
        if (messageId) {
            const old = await ch.messages.fetch(messageId).catch(() => null); // gelöscht → neu senden
            if (old) {
                await old.edit(payload);
                return old.id;
            }
        }
        return (await ch.send(payload)).id;
    },
    async deleteMessage(channelId, messageId) {
        const ch = await client.channels.fetch(channelId);
        if (ch?.isSendable() && 'messages' in ch)
            await ch.messages.delete(messageId);
    },
    async postPanel({ channelId, embed, buttons, select }) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isSendable())
            throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
        await ch.send({ embeds: [toEmbed(embed)], components: toComponents(buttons, select), allowedMentions: { parse: [] } });
    },
};
const live = (0, live_1.createLive)(api, platform);
const staffLists = (0, staff_lists_1.createStaffLists)(() => client, api);
/** Willkommen & Abschied, Aktion beim Verlassen (braucht den „Server Members“-Intent). */
const welcome = (0, welcome_1.createWelcome)(api, {
    async post(channelId, m) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isSendable())
            throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
        await ch.send({ ...(m.content ? { content: m.content } : {}), embeds: [toEmbed(m.embed)], ...(m.file ? { files: [{ attachment: m.file.data, name: m.file.name }] } : {}), allowedMentions: { parse: [], users: m.mentionUserIds ?? [] } });
    },
    async dm(userId, text) { await platform.sendDirectMessage(userId, text); },
    async addRoles(guildId, userId, roleIds) {
        const guild = await client.guilds.fetch(guildId);
        const ids = roleIds.filter((r) => guild.roles.cache.has(r));
        if (ids.length)
            await (await guild.members.fetch(userId)).roles.add(ids, 'EN Polizei: Willkommen');
    },
});
/** Ghost-Ping: gelöschte Nachricht mit @Erwähnung → Hinweis im selben Kanal (nur die Erwähnten werden benachrichtigt). */
const ghostPing = (0, ghost_ping_1.createGhostPing)(api, {
    async post(channelId, m) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isSendable())
            throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
        await ch.send({ content: m.content, allowedMentions: { parse: [], users: m.mentionUserIds } });
    },
});
/** Roblox-Verifizierung: Rollen und Nickname setzen (nur was nötig ist); liefert verständliche Hinweise, was nicht ging. */
async function applyVerify(guildId, userId, a) {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    const problems = [];
    const usable = (ids) => ids.filter((r) => {
        const role = guild.roles.cache.get(r);
        if (!role)
            return false;
        if (role.position >= me.roles.highest.position) {
            problems.push(`Rolle „${role.name}“ steht über der Bot-Rolle`);
            return false;
        }
        return true;
    });
    const remove = usable(a.remove.filter((r) => member.roles.cache.has(r)));
    const add = usable(a.add.filter((r) => !member.roles.cache.has(r)));
    try {
        if (remove.length)
            await member.roles.remove(remove, 'EN Polizei: Roblox-Verifizierung');
        if (add.length)
            await member.roles.add(add, 'EN Polizei: Roblox-Verifizierung');
    }
    catch {
        problems.push('Rollen konnten nicht gesetzt werden (fehlt dem Bot „Rollen verwalten“?)');
    }
    if (a.nickname && member.nickname !== a.nickname && member.displayName !== a.nickname) {
        if (member.id === guild.ownerId)
            problems.push('Den Server-Besitzer kann der Bot nicht umbenennen');
        else if (!member.manageable)
            problems.push('Nickname nicht geändert (deine Rolle steht über der Bot-Rolle)');
        else
            await member.setNickname(a.nickname, 'EN Polizei: Roblox-Verifizierung').catch(() => problems.push('Nickname nicht geändert (fehlt dem Bot „Spitznamen verwalten“?)'));
    }
    return [...new Set(problems)];
}
const verify = (0, verify_1.createVerify)(api, {
    apply: applyVerify,
    async guildsOf(userId) {
        const out = [];
        for (const g of client.guilds.cache.values()) {
            const m = await g.members.fetch(userId).catch(() => null);
            if (m)
                out.push({ guildId: g.id, displayName: m.user.username });
        }
        return out;
    },
});
/** Sprach-Support: Warteraum → Support-Fall → eigener Sprachkanal (braucht GuildVoiceStates, „Kanäle verwalten“, „Mitglieder verschieben“). */
const VOICE_TALK = [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect, discord_js_1.PermissionFlagsBits.Speak, discord_js_1.PermissionFlagsBits.Stream, discord_js_1.PermissionFlagsBits.UseVAD];
const voiceSupport = (0, voice_support_1.createVoiceSupport)(api, {
    async post(channelId, m) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isSendable())
            throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
        return (await ch.send((0, discord_tickets_1.payloadOf)(m))).id;
    },
    async edit(channelId, messageId, m) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isTextBased() || !('messages' in ch))
            return;
        const msg = await ch.messages.fetch(messageId).catch(() => null);
        if (msg)
            await msg.edit({ ...(0, discord_tickets_1.payloadOf)(m), content: m.content ?? '' });
    },
    async dm(userId, m) { await (await client.users.fetch(userId)).send((0, discord_tickets_1.payloadOf)(m)); },
    members(channelId) {
        const ch = client.channels.cache.get(channelId);
        return ch?.isVoiceBased() ? [...ch.members.keys()] : [];
    },
    voiceChannelOf(guildId, userId) { return client.guilds.cache.get(guildId)?.voiceStates.cache.get(userId)?.channelId ?? null; },
    async createVoice({ guildId, name, nearChannelId, userId, teamRoleId }) {
        const guild = await client.guilds.fetch(guildId);
        const near = await guild.channels.fetch(nearChannelId).catch(() => null);
        const ch = await guild.channels.create({
            name, type: discord_js_1.ChannelType.GuildVoice, ...(near?.parentId ? { parent: near.parentId } : {}), reason: 'EN Polizei: Sprach-Support',
            permissionOverwrites: [
                { id: guild.roles.everyone.id, type: discord_js_1.OverwriteType.Role, deny: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect] },
                { id: userId, type: discord_js_1.OverwriteType.Member, allow: VOICE_TALK },
                ...(guild.roles.cache.has(teamRoleId) ? [{ id: teamRoleId, type: discord_js_1.OverwriteType.Role, allow: [...VOICE_TALK, discord_js_1.PermissionFlagsBits.MoveMembers] }] : []),
                { id: client.user.id, type: discord_js_1.OverwriteType.Member, allow: [discord_js_1.PermissionFlagsBits.ViewChannel, discord_js_1.PermissionFlagsBits.Connect, discord_js_1.PermissionFlagsBits.MoveMembers, discord_js_1.PermissionFlagsBits.ManageChannels] },
            ],
        });
        return ch.id;
    },
    async move(guildId, userId, channelId) {
        const member = await (await client.guilds.fetch(guildId)).members.fetch(userId).catch(() => null);
        if (!member?.voice.channelId)
            return false;
        await member.voice.setChannel(channelId, 'EN Polizei: Sprach-Support');
        return true;
    },
    async deleteChannel(channelId) {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        // Sicherheitsnetz: nur Sprachkanäle (die das System als selbst angelegt meldet)
        if (ch?.type === discord_js_1.ChannelType.GuildVoice)
            await ch.delete('EN Polizei: Support-Fall geschlossen');
    },
    async thread(channelId, messageId, name) {
        const ch = await client.channels.fetch(channelId);
        if (!ch?.isTextBased() || !('messages' in ch))
            return null;
        const msg = await ch.messages.fetch(messageId);
        return (await msg.startThread({ name: name.slice(0, 100), autoArchiveDuration: 1440 })).id;
    },
    async threadPost(threadId, text) {
        const ch = await client.channels.fetch(threadId);
        if (ch?.isSendable())
            await ch.send({ content: text.slice(0, 2000), allowedMentions: { parse: [] } });
    },
});
/** Mitglied (auch teilweise geladen) → Daten für Platzhalter. */
function memberEvent(m) {
    if (!m.user)
        return null;
    return { id: m.id, guildId: m.guild.id, bot: m.user.bot, username: m.user.username, displayName: m.displayName ?? m.user.username, server: m.guild.name, memberCount: m.guild.memberCount, createdAt: m.user.createdAt, avatar: m.user.displayAvatarURL({ size: 256 }) };
}
function addOptions(b, options = []) {
    for (const o of options) {
        const common = (x) => { x.setName(o.name); x.setDescription(o.description); x.setRequired(!!o.required); };
        if (o.type === 'string')
            b.addStringOption((x) => { common(x); if (o.maxLength)
                x.setMaxLength(o.maxLength); if (o.choices)
                x.addChoices(...o.choices); return x; });
        else if (o.type === 'integer')
            b.addIntegerOption((x) => { common(x); if (o.min !== undefined)
                x.setMinValue(o.min); if (o.max !== undefined)
                x.setMaxValue(o.max); return x; });
        else if (o.type === 'boolean')
            b.addBooleanOption((x) => { common(x); return x; });
        else if (o.type === 'user')
            b.addUserOption((x) => { common(x); return x; });
        else
            b.addNumberOption((x) => { common(x); if (o.min !== undefined)
                x.setMinValue(o.min); if (o.max !== undefined)
                x.setMaxValue(o.max); return x; });
    }
}
function toBuilder(def) {
    const b = new discord_js_1.SlashCommandBuilder().setName(def.name).setDescription(def.description);
    if (def.subcommands?.length)
        for (const sc of def.subcommands)
            b.addSubcommand((x) => { x.setName(sc.name).setDescription(sc.description); addOptions(x, sc.options); return x; });
    else
        addOptions(b, def.options);
    return b.toJSON();
}
/** Server-Beitritt des Mitglieds (voller GuildMember oder rohe API-Daten). */
function joinedAtOf(m) {
    const x = m;
    const t = x?.joinedTimestamp ?? (x?.joined_at ? Date.parse(x.joined_at) : NaN);
    return typeof t === 'number' && Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}
/** Nach einer Entscheidung: Bewerbungs-Nachricht einfärben, Feld „Entscheidung“ anhängen, Entscheidungs-Buttons entfernen. */
async function markDecided(message, d) {
    const embeds = message.embeds.map((e, i, all) => {
        const b = discord_js_1.EmbedBuilder.from(e).setColor(d.color);
        if (i === all.length - 1)
            b.setFields([...(e.fields ?? []).filter((f) => f.name !== 'Entscheidung'), { name: 'Entscheidung', value: d.text.slice(0, 1024) }]); // nur einmal, auch wenn Button und Dashboard beide melden
        return b;
    });
    const rows = [];
    for (const row of message.components) {
        if (!('components' in row))
            continue;
        const kept = row.components.filter((c) => c.type === discord_js_1.ComponentType.Button && !/^(quali|leave):(decide|reason):/.test(c.customId ?? ''));
        if (kept.length)
            rows.push(new discord_js_1.ActionRowBuilder().addComponents(kept.map((c) => discord_js_1.ButtonBuilder.from(c))));
    }
    await message.edit({ embeds, components: rows, allowedMentions: { parse: [] } });
}
/** Gemeinsamer Kontext für Befehle, Buttons und Formulare. */
function baseCtx(i) {
    const perms = i.memberPermissions;
    return {
        discordId: i.user.id, api, platform, userName: i.user.username, userAvatar: i.user.displayAvatarURL({ size: 64 }), memberJoinedAt: joinedAtOf(i.member),
        guildId: i.guildId ?? undefined, channelId: i.channelId ?? undefined,
        isGuildAdmin: !!perms && (perms.has(discord_js_1.PermissionFlagsBits.ManageGuild) || perms.has(discord_js_1.PermissionFlagsBits.Administrator)),
        config: () => api.service('GET', '/bot/config'),
        refreshLive: (kind, o) => live.refresh(kind, o),
        robloxLookup: (name) => (0, roblox_1.robloxLookup)(name),
        memberRoleIds: rolesOf(i.member),
        applyEffects: (effects) => tickets.apply(effects),
        listCategories: (guildId) => tickets.listCategories(guildId),
        userNameOf: (id) => client.users.fetch(id).then((u) => u.username, () => null),
        voiceSupport,
        verifyApply: (guildId, userId, a) => applyVerify(guildId, userId, a),
        userDisplayName: displayNameOf(i.member) ?? i.user.globalName ?? i.user.username,
        discord: {
            post: (channelId, message, asUser) => (asUser ? (0, messages_1.postAsUser)(client, api, channelId, message, asUser) : (0, messages_1.postOrUpdate)(client, api, { channelId, message, forceNew: true })),
            deleteMessage: (channelId, messageId) => (0, messages_1.deleteMessage)(client, channelId, messageId),
            addRoles: async (guildId, userId, roleIds) => {
                const g = client.guilds.cache.get(guildId);
                const m = await g?.members.fetch(userId).catch(() => null);
                const add = roleIds.filter((r) => g?.roles.cache.has(r) && !m?.roles.cache.has(r));
                if (m && add.length)
                    await m.roles.add(add, 'EN Polizei: Formular-Panel');
            },
        },
    };
}
/** Anzeigename des Mitglieds auf dem Server (voller GuildMember oder rohe API-Daten). */
function displayNameOf(m) {
    const x = m;
    return x?.displayName ?? x?.nick ?? undefined;
}
/** Rollen-IDs des Mitglieds (voller GuildMember oder rohe API-Daten). */
function rolesOf(m) {
    const x = m;
    if (!x?.roles)
        return [];
    return Array.isArray(x.roles) ? x.roles : [...(x.roles.cache?.keys() ?? [])];
}
async function safeRun(label, fn) {
    try {
        return await fn();
    }
    catch (e) {
        console.error(`${label} failed:`, e instanceof Error ? e.message : e);
        return (0, commands_1.mapError)(e);
    }
}
async function handleCommand(i) {
    const def = (0, commands_1.byName)(i.commandName);
    if (!def)
        return;
    const opts = {};
    const sub = def.subcommands?.length ? i.options.getSubcommand(false) ?? undefined : undefined;
    if (sub)
        opts._sub = sub;
    for (const o of (sub ? def.subcommands?.find((x) => x.name === sub)?.options : def.options) ?? []) {
        const v = i.options.get(o.name)?.value;
        opts[o.name] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : undefined;
    }
    if (def.opensModal) {
        // Formulare müssen die erste Antwort sein – kein deferReply vorher.
        const reply = await safeRun(`command ${def.name}`, () => def.run({ ...baseCtx(i), opts }));
        if (reply.modal)
            await i.showModal(toModal(reply.modal));
        else
            await i.reply({ ...replyPayload(reply), flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    // Antworten sind immer nur für den Aufrufer sichtbar (Daten gehören nicht in öffentliche Channels).
    await i.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const reply = await safeRun(`command ${def.name}`, () => def.run({ ...baseCtx(i), opts }));
    await i.editReply(replyPayload(reply));
}
async function handleComponent(i) {
    const hit = (0, features_1.interactionFor)(i.customId);
    if (!hit)
        return;
    if ((i.isButton() || i.isAnySelectMenu()) && hit.def.opensModal?.(hit.args)) {
        // Formulare müssen die erste Antwort sein – kein deferReply vorher.
        const reply = await safeRun(`interaction ${i.customId}`, () => hit.def.run({ ...baseCtx(i), opts: {}, args: hit.args, ...(i.isAnySelectMenu() ? { values: i.values } : {}) }));
        if (reply.modal)
            await i.showModal(toModal(reply.modal));
        else
            await i.reply({ ...replyPayload(reply), flags: discord_js_1.MessageFlags.Ephemeral });
        return;
    }
    await i.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
    const fields = i.isModalSubmit() ? Object.fromEntries(i.fields.fields.map((f, id) => [id, 'value' in f ? String(f.value) : ''])) : undefined;
    const values = i.isAnySelectMenu() ? i.values : undefined;
    const reply = await safeRun(`interaction ${i.customId}`, () => hit.def.run({ ...baseCtx(i), opts: {}, args: hit.args, fields, values }));
    await i.editReply(replyPayload(reply));
    const source = i.isModalSubmit() ? (i.isFromMessage() ? i.message : null) : i.message;
    if (reply.decided && source)
        await markDecided(source, reply.decided).catch((e) => console.error('could not update the application message:', e instanceof Error ? e.message : e));
    if (reply.update && source)
        await source.edit({ embeds: (reply.update.embeds ?? []).map(toEmbed), components: toComponents(reply.update.buttons), allowedMentions: { parse: [] } }).catch((e) => console.error('could not update message:', e instanceof Error ? e.message : e));
}
function wire(c) {
    // Verbindungsfehler melden – ein 'error'-Ereignis ohne Listener würde den ganzen Prozess beenden
    c.on('error', (e) => console.error('discord client error:', e.message));
    c.on('shardError', (e, id) => console.error(`discord shard ${id} error:`, e.message));
    c.on('interactionCreate', (i) => {
        // Server der Interaktion → API prüft Rechte für genau diesen Server (Server laufen getrennt)
        const task = api_1.guildScope.run(i.guildId ?? null, () => api_1.rolesScope.run(rolesOf(i.member), () => i.isChatInputCommand() ? handleCommand(i) : i.isButton() || i.isModalSubmit() || i.isAnySelectMenu() ? handleComponent(i) : undefined));
        void task?.catch((e) => console.error('interaction failed:', e instanceof Error ? e.message : e));
    });
    c.on('voiceStateUpdate', (o, n) => {
        const user = n.member?.user ?? o.member?.user;
        if (!user)
            return;
        void voiceSupport.onVoiceState({ guildId: n.guild.id, userId: n.id, userName: n.member?.displayName ?? user.username, bot: user.bot, from: o.channelId, to: n.channelId })
            .catch((x) => console.error('voice support failed:', x instanceof Error ? x.message : x));
    });
    c.on('guildMemberAdd', (m) => {
        const e = memberEvent(m);
        if (!e)
            return;
        void welcome.joined(e).catch((x) => console.error('member join failed:', x instanceof Error ? x.message : x));
    });
    c.on('guildMemberRemove', (m) => { staffLists.changed(); const e = memberEvent(m); if (e)
        void welcome.left(e).catch((x) => console.error('member leave failed:', x instanceof Error ? x.message : x)); });
    // Staff-Listen: Rollen oder Name geändert → neu zeichnen (gesammelt)
    c.on('guildMemberUpdate', (o, n) => { if (o.roles.cache.size !== n.roles.cache.size || o.displayName !== n.displayName || ![...o.roles.cache.keys()].every((r) => n.roles.cache.has(r)))
        staffLists.changed(); });
    // Ghost-Ping: nur Nachrichten aus dem Cache (Erwähnungen bekannt); Teil-Nachrichten ohne Daten werden übergangen
    c.on('messageDelete', (m) => {
        if (m.partial || !m.inGuild() || !m.author)
            return;
        void ghostPing.deleted({ guildId: m.guildId, channelId: m.channelId, authorId: m.author.id, authorBot: m.author.bot, content: m.content ?? '', createdAt: m.createdAt, mentions: [...m.mentions.users.values()].map((u) => ({ id: u.id, bot: u.bot })) });
    });
    // Direktnachrichten: Antworten auf Bewerbungsfragen (Bewerbung bei EN Polizei und Qualifikationen)
    c.on('messageCreate', (m) => {
        if (m.inGuild()) {
            void tickets.onMessage(m);
            return;
        } // Verlauf der Support-Tickets
        if (m.author.bot)
            return;
        void (0, qualifications_1.handleDirectMessage)({ userId: m.author.id, userName: m.author.username, content: m.content, api, sendDm: (u, msg) => platform.sendDm(u, msg), robloxLookup: (n) => (0, roblox_1.robloxLookup)(n), robloxCheck: (n) => (0, roblox_1.robloxCheck)(n) })
            .catch((e) => console.error('direct message handling failed:', e instanceof Error ? e.message : e));
    });
}
setInterval(() => (0, qualifications_1.sweepSessions)(), 10 * 60_000).unref();
/** Rollen auf allen Servern abgleichen, auf denen es sie gibt (Dienst-Rollen). Nur tatsächlich nötige Änderungen. */
async function syncRolesEverywhere(userId, add, remove) {
    for (const g of client.guilds.cache.values()) {
        const present = [...add, ...remove].filter((r) => g.roles.cache.has(r));
        if (!present.length)
            continue;
        const member = await g.members.fetch(userId).catch(() => null);
        if (!member)
            continue;
        const toRemove = remove.filter((r) => g.roles.cache.has(r) && member.roles.cache.has(r));
        const toAdd = add.filter((r) => g.roles.cache.has(r) && !member.roles.cache.has(r));
        if (toRemove.length)
            await member.roles.remove(toRemove, 'EN Polizei: Dienststatus');
        if (toAdd.length)
            await member.roles.add(toAdd, 'EN Polizei: Dienststatus');
    }
}
/** Rolle auf allen Servern vergeben, auf denen es sie gibt (angenommene Bewerbung). */
async function grantRoleEverywhere(userId, roleId) {
    let found = false;
    for (const g of client.guilds.cache.values()) {
        const role = g.roles.cache.get(roleId) ?? await g.roles.fetch(roleId).catch(() => null);
        if (!role)
            continue;
        found = true;
        const member = await g.members.fetch(userId).catch(() => null);
        if (member)
            await member.roles.add(roleId, 'EN Polizei: Bewerbung angenommen');
    }
    if (!found)
        throw new Error('role not found on any server');
}
/** Beim Start prüfen, ob das System erreichbar ist (nur Hinweis – der Bot läuft auch ohne API weiter). */
async function checkApi() {
    try {
        const res = await fetch(`${cfg.API_URL}/health`, { signal: AbortSignal.timeout(8000) });
        console.log(res.ok ? `API reachable at ${cfg.API_URL}` : `API answered HTTP ${res.status} at ${cfg.API_URL}/health — commands will fail until the system is running (502 = app behind the proxy is not running)`);
    }
    catch {
        console.log(`API NOT reachable at ${cfg.API_URL} — the bot runs, but commands will say "system not reachable" until the system is up`);
    }
}
function wireReady(client0) {
    client0.once('clientReady', async (c) => {
        console.log(`Logged in as ${c.user.tag}`);
        // Einladungs-Link (Administrator-Rechte, wie im Dashboard)
        console.log(`Bot einladen: https://discord.com/oauth2/authorize?client_id=${c.user.id}&scope=bot%20applications.commands&permissions=8`);
        console.log(`Server (${c.guilds.cache.size}): ${[...c.guilds.cache.values()].map((g) => g.name).join(', ') || 'keiner – Bot mit dem Link oben einladen'}`);
        void checkApi();
        const json = commands_1.COMMANDS.map(toBuilder);
        // Befehle auf JEDEM Server des Bots registrieren (sofort sichtbar) – auch auf neuen Servern, sobald der Bot eingeladen wird.
        // DISCORD_GUILD_ID wird zusätzlich berücksichtigt (falls der Bot dort noch nicht im Cache ist).
        try {
            await c.application.commands.set([]);
        }
        catch (e) {
            console.error(`could not clear global commands: ${e instanceof Error ? e.message : e}`);
        } // keine doppelten (global + Server)
        const register = async (g, name) => {
            try {
                await c.application.commands.set(json, g);
                console.log(`${json.length} slash commands registered for ${name ?? g}`);
            }
            catch (e) {
                console.error(`could not register commands for ${name ?? g} (invited with the applications.commands scope?): ${e instanceof Error ? e.message : e}`);
            }
        };
        const all = new Map([...c.guilds.cache.values()].map((g) => [g.id, g.name]));
        for (const g of (0, config_1.guildIds)(cfg))
            if (!all.has(g))
                all.set(g, g);
        for (const [id, name] of all)
            await register(id, name);
        c.on('guildCreate', (g) => { console.log(`added to server ${g.name}`); void register(g.id, g.name); });
        // Teamliste und Voice-Widget im Dashboard (alle 5 s und bei Änderungen)
        const presence = (0, presence_1.startPresenceReporter)(() => client, api, { members: intents.members, presences: intents.presences });
        (0, outbox_1.startOutboxLoop)(api, async (channelId, embeds, buttons, opts) => {
            const ch = await client.channels.fetch(channelId);
            if (!ch?.isSendable())
                throw new Error(`channel ${channelId} is not a text channel the bot can post in`);
            // Profilbild des Bewerbers rechts (wie bei Appy)
            const avatar = opts?.avatarUserId ? await client.users.fetch(opts.avatarUserId).then((u) => u.displayAvatarURL({ size: 256 }), () => undefined) : undefined;
            let list = avatar && embeds[0] ? [{ ...embeds[0], thumbnail: avatar }, ...embeds.slice(1)] : embeds;
            // Kopfzeile „@Benutzer“ mit Profilbild (Abmeldeantrag wie bei Trident)
            if (opts?.authorUserId && list[0]) {
                const u = await client.users.fetch(opts.authorUserId).catch(() => null);
                if (u)
                    list = [{ ...list[0], author: { name: `@${u.username}`, iconUrl: u.displayAvatarURL({ size: 64 }) } }, ...list.slice(1)];
            }
            // Nur die ausdrücklich eingestellten Rollen pingen – niemals @everyone/@here
            const roles = opts?.pingRoleIds ?? [];
            const msg = await ch.send({ ...(roles.length ? { content: roles.map((r) => `<@&${r}>`).join(' ') } : {}), embeds: list.map(toEmbed), components: toRows(buttons), allowedMentions: { parse: [], roles } });
            // Staff-Thread zur Bewerbung (braucht im Channel das Recht „Öffentliche Threads erstellen“)
            // Ersetzende Meldung (Gefahrenstatus): alte Nachricht in diesem Kanal löschen, neue merken (überlebt Neustarts)
            if (opts?.replaceKey) {
                const key = `last-${opts.replaceKey}-${channelId}`;
                const old = await api.service('GET', `/bot/state/${key}`).then((r) => r.value, () => null);
                if (old && old !== msg.id)
                    await ch.messages.delete(old).catch(() => undefined); // schon gelöscht / keine Rechte → egal
                await api.service('PUT', `/bot/state/${key}`, { value: msg.id }).catch((e) => console.error('could not remember message:', e instanceof Error ? e.message : e));
            }
            if (opts?.trackKey) {
                const key = opts.trackKey;
                const prev = await api.service('GET', `/bot/state/${key}`).then((r) => (Array.isArray(r.value) ? r.value : []), () => []);
                await api.service('PUT', `/bot/state/${key}`, { value: [...prev, { channelId, messageId: msg.id }].slice(-10) }).catch((e) => console.error('could not remember message:', e instanceof Error ? e.message : e));
            }
            if (opts?.thread)
                await msg.startThread({ name: opts.thread, autoArchiveDuration: 10080 }).catch((e) => console.error('could not create staff thread:', e instanceof Error ? e.message : e));
        }, cfg.OUTBOX_POLL_SECONDS, console.log, (userId, msg) => (typeof msg === 'string' ? platform.sendDirectMessage(userId, msg) : platform.sendDm(userId, { embed: msg }).then(() => undefined)), grantRoleEverywhere, syncRolesEverywhere, () => void live.refresh('teamlist').catch(() => undefined), (effects) => tickets.apply(effects).then(() => undefined, (e) => console.error('ticket effects failed:', e instanceof Error ? e.message : e)), () => void presence.sync().catch((e) => console.error('team/voice sync failed:', e instanceof Error ? e.message : e)), async (kind, channelId) => { await live.refresh(kind, { channelId, force: true }); }, async (type, p) => {
            if (type === 'voice.effects') {
                await voiceSupport.applyEffects(p);
                return true;
            }
            if (type === 'verify.panel') {
                // Verifizierungs-Panel posten oder aktualisieren, Ort ans System melden
                const panel = p.panel;
                const channelId = String(p.channelId ?? '');
                const messageId = await platform.postOrEdit({ channelId, ...(typeof p.messageId === 'string' ? { messageId: p.messageId } : {}),
                    embed: { title: panel.title, description: panel.message, color: (0, shared_1.hexColor)(panel.color, 0x22c55e) }, buttons: [{ id: 'verify:start', label: panel.buttonLabel, style: 'success', emoji: '✅' }] });
                await api.service('POST', '/bot/verify/panel-posted', { guildId: p.guildId ?? null, channelId, messageId });
                return true;
            }
            if (type === 'verify.log') {
                await platform.postOrEdit({ channelId: String(p.channelId ?? ''), embed: { title: 'Roblox-Verifizierung', description: String(p.text ?? '').slice(0, 4000), color: typeof p.color === 'number' ? p.color : 0x3b82f6 } });
                return true;
            }
            if (type === 'duty.reminder') {
                // Inaktivitäts-Erinnerung (nur „Im Dienst“) bzw. Hinweis, dass die Schicht automatisch beendet wurde
                const userId = String(p.discordId ?? '');
                if (!/^\d{15,25}$/.test(userId))
                    throw new Error('no Discord user id');
                await platform.sendDm(userId, (0, format_1.dutyReminderDm)(p));
                return true;
            }
            if (type === 'verify.member') {
                await verify.refreshEverywhere(String(p.discordId ?? ''));
                return true;
            }
            if (type === 'message.decided') {
                // Entscheidung (auch aus dem Dashboard): gemerkte Antrags-/Bewerbungsnachricht einfärben, Buttons entfernen
                const key = String(p.key ?? '');
                if (!/^msg-[laq]-[0-9a-f-]{36}$/.test(key))
                    throw new Error('invalid key');
                const spots = await api.service('GET', `/bot/state/${key}`).then((r) => (Array.isArray(r.value) ? r.value : []));
                for (const spot of spots) {
                    const ch = spot.channelId ? await client.channels.fetch(spot.channelId).catch(() => null) : null;
                    if (!ch?.isTextBased() || !('messages' in ch) || !spot.messageId)
                        continue;
                    const msg = await ch.messages.fetch(spot.messageId).catch(() => null); // gelöscht → nichts zu tun
                    if (msg)
                        await markDecided(msg, { text: String(p.text ?? 'Entschieden'), color: typeof p.color === 'number' ? p.color : 0x64748b });
                }
                return true;
            }
            if (type === 'embed.post') {
                // Embed-Baukasten: vorhandene Nachricht bearbeiten (falls noch da), sonst neu posten; Ort ans System melden
                const channelId = typeof p.channelId === 'string' ? p.channelId : '';
                const r = await (0, messages_1.postOrUpdate)(client, api, { channelId, message: p.message, messageId: typeof p.messageId === 'string' ? p.messageId : null, forceNew: typeof p.messageId !== 'string' });
                await api.service('POST', `/bot/embeds/${String(p.embedId)}/posted`, r);
                return true;
            }
            if (type === 'bot.stafflist') {
                await staffLists.refresh({ id: String(p.id ?? ''), force: true, forceNew: p.forceNew === true });
                return true;
            }
            if (type === 'bot.dm') {
                const userId = String(p.discordId ?? '');
                if (!/^\d{15,25}$/.test(userId))
                    throw new Error('no Discord user id');
                const { message, files } = await (0, messages_1.resolveAssets)(api, p.message);
                await (await client.users.fetch(userId)).send({ ...(0, discord_tickets_1.payloadOf)(message, false), ...(files.length ? { files } : {}) });
                return true;
            }
            if (type === 'bot.nickname') {
                // Dienstnummer im Nickname – auf allen Servern, auf denen die Person ist (Bot braucht „Nicknames verwalten“; Server-Inhaber geht nicht)
                const userId = String(p.discordId ?? ''), nick = String(p.nickname ?? '').slice(0, 32);
                if (!/^\d{15,25}$/.test(userId) || !nick)
                    throw new Error('invalid nickname task');
                let done = 0;
                for (const g of client.guilds.cache.values()) {
                    const m = await g.members.fetch(userId).catch(() => null);
                    if (m && m.id !== g.ownerId && (await m.setNickname(nick, 'EN Polizei: Dienstnummer').then(() => true, () => false)))
                        done++;
                }
                if (!done)
                    console.warn(`nickname for ${userId} could not be set (missing permission, owner or not on a server)`);
                return true;
            }
            if (type === 'bot.backup.create') {
                // Discord-Server-Backup: Server auslesen und ans System schicken (Fehler landen am Backup, nicht in der Warteschlange)
                const id = String(p.backupId ?? '');
                try {
                    await api.service('POST', `/bot/discord-backups/${id}/data`, { data: await (0, backup_1.captureGuild)(await client.guilds.fetch(String(p.guildId ?? ''))) });
                }
                catch (e) {
                    await api.service('POST', `/bot/discord-backups/${id}/data`, { error: e instanceof Error ? e.message : String(e) });
                }
                return true;
            }
            if (type === 'bot.backup.restore') {
                const id = String(p.backupId ?? '');
                const b = await api.service('GET', `/bot/discord-backups/${id}`);
                if (!b.data)
                    throw new Error('backup has no data');
                const parts = (Array.isArray(p.parts) ? p.parts : []).filter((x) => x === 'roles' || x === 'channels' || x === 'settings');
                const result = await (0, backup_1.restoreGuild)(await client.guilds.fetch(String(p.guildId ?? '')), b.data, parts);
                await api.service('POST', `/bot/discord-backups/${id}/result`, result);
                return true;
            }
            if (type === 'bot.welcome-test') {
                // Test aus dem Dashboard (Willkommen & Abschied): mit dem Profil der Person, die getestet hat
                const kind = p.kind === 'goodbye' || p.kind === 'dm' ? p.kind : 'welcome';
                const guild = await client.guilds.fetch(String(p.guildId ?? ''));
                const e = memberEvent(await guild.members.fetch(String(p.discordId ?? '')));
                if (!e)
                    throw new Error('member not found');
                await welcome.test(kind, e);
                return true;
            }
            if (type === 'bot.delete') {
                await (0, messages_1.deleteMessage)(client, String(p.channelId ?? ''), String(p.messageId ?? ''));
                return true;
            }
            if (type === 'message.post') {
                // Allgemein (Funk-Codes, Staff-Liste, Panels, Berichte …): gemerkte Nachricht bearbeiten oder neu senden
                const stateKey = typeof p.stateKey === 'string' && /^[a-z0-9:_-]{1,64}$/.test(p.stateKey) ? p.stateKey : undefined;
                await (0, messages_1.postOrUpdate)(client, api, { channelId: String(p.channelId ?? ''), message: p.message, ...(stateKey ? { stateKey } : {}), forceNew: p.forceNew === true });
                return true;
            }
            if (type !== 'application.ticket')
                return false;
            const str = (k) => (typeof p[k] === 'string' ? p[k] : undefined);
            const [guildId, discordId] = [str('guildId'), str('discordId')];
            if (!guildId || !discordId)
                throw new Error('guild or user missing');
            const cfg = await api.service('GET', '/bot/config').catch(() => undefined);
            await (0, qualifications_1.openApplicantTicket)(platform, cfg, { guildId, discordId, userName: str('userName') ?? discordId, number: str('number') ?? '', unitName: str('unitName'), requesterId: str('requesterId') });
            return true;
        });
        live.start(cfg.LIVE_REFRESH_SECONDS);
        staffLists.start(300);
        void tickets.refresh();
        (0, guilds_1.startGuildDirectory)(() => client, api);
        setInterval(() => void tickets.refresh(), 120_000).unref();
    });
}
for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => { void client.destroy().finally(() => process.exit(0)); });
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e instanceof Error ? e.message : e));
// Fehler in einem Ereignis-Handler beendet nicht den Bot (laufende DM-Bewerbungen blieben sonst auf der Strecke).
// Häufen sie sich, lieber beenden – das Hosting-Startskript startet den Bot dann sauber neu.
let crashes = [];
process.on('uncaughtException', (e) => {
    console.error('uncaughtException:', e instanceof Error ? e.stack ?? e.message : e);
    crashes = [...crashes.filter((t) => Date.now() - t < 60_000), Date.now()];
    if (crashes.length > 20) {
        console.error('zu viele Fehler in kurzer Zeit – Bot wird neu gestartet');
        process.exit(1);
    }
});
/** Start; sind privilegierte Intents im Developer Portal aus, schrittweise ohne sie neu verbinden. */
async function start() {
    for (const [n, step] of INTENT_STEPS.entries()) {
        if (n > 0) {
            await client.destroy().catch(() => undefined);
            intents = step;
            client = makeClient(step);
        }
        wire(client);
        wireReady(client);
        try {
            await client.login(cfg.DISCORD_TOKEN);
            break;
        }
        catch (e) {
            if (!/disallowed intents/i.test(e instanceof Error ? e.message : String(e)) || n === INTENT_STEPS.length - 1)
                throw e;
        }
    }
    const off = [!intents.content && '"Message Content" (ticket transcripts without texts)', !intents.members && '"Server Members" (dashboard team list only shows cached members; no welcome/goodbye messages, auto roles or actions when someone leaves)', !intents.presences && '"Presence" (no online status in the team list)'].filter(Boolean);
    if (off.length)
        console.warn(`Discord: privileged intents not enabled in the Developer Portal (Bot → Privileged Gateway Intents): ${off.join(', ')}.`);
}
void start().catch((e) => { console.error('Discord login failed:', e instanceof Error ? e.message : e); process.exit(1); });
//# sourceMappingURL=index.js.map