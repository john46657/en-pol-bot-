"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureGuild = captureGuild;
exports.restoreGuild = restoreGuild;
const discord_js_1 = require("discord.js");
const TYPE = {
    [discord_js_1.ChannelType.GuildText]: 'text', [discord_js_1.ChannelType.GuildVoice]: 'voice', [discord_js_1.ChannelType.GuildCategory]: 'category',
    [discord_js_1.ChannelType.GuildAnnouncement]: 'announcement', [discord_js_1.ChannelType.GuildStageVoice]: 'stage', [discord_js_1.ChannelType.GuildForum]: 'forum',
};
const BACK = { text: discord_js_1.ChannelType.GuildText, voice: discord_js_1.ChannelType.GuildVoice, category: discord_js_1.ChannelType.GuildCategory, announcement: discord_js_1.ChannelType.GuildAnnouncement, stage: discord_js_1.ChannelType.GuildStageVoice, forum: discord_js_1.ChannelType.GuildForum };
/** Server auslesen: Rollen (ohne Bot-/Integrationsrollen), Kategorien und Kanäle mit Rechten, Servereinstellungen. */
async function captureGuild(guild) {
    await guild.roles.fetch();
    await guild.channels.fetch();
    const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed)
        .map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position }))
        .sort((a, b) => a.position - b.position);
    const channels = [];
    for (const c of guild.channels.cache.values()) {
        const type = TYPE[c.type];
        if (!type || c.isThread())
            continue;
        const g = c;
        channels.push({
            id: g.id, name: g.name, type, parentId: g.parentId ?? null, position: g.rawPosition,
            ...(g.topic !== undefined ? { topic: g.topic } : {}), ...(g.nsfw !== undefined ? { nsfw: g.nsfw } : {}), ...(g.rateLimitPerUser !== undefined ? { rateLimitPerUser: g.rateLimitPerUser } : {}),
            ...(g.bitrate !== undefined ? { bitrate: g.bitrate } : {}), ...(g.userLimit !== undefined ? { userLimit: g.userLimit } : {}),
            overwrites: [...g.permissionOverwrites.cache.values()].map((o) => ({ id: o.id, type: o.type === discord_js_1.OverwriteType.Role ? 'role' : 'member', allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
        });
    }
    channels.sort((a, b) => Number(b.type === 'category') - Number(a.type === 'category') || a.position - b.position);
    return {
        version: 1, guildId: guild.id, everyonePermissions: guild.roles.everyone.permissions.bitfield.toString(), roles, channels,
        settings: { name: guild.name, verificationLevel: guild.verificationLevel, defaultMessageNotifications: guild.defaultMessageNotifications, explicitContentFilter: guild.explicitContentFilter, afkChannelId: guild.afkChannelId, afkTimeout: guild.afkTimeout, systemChannelId: guild.systemChannelId },
    };
}
/**
 * Wiederherstellen – sicher: Vorhandenes (gleicher Name, bei Kanälen gleicher Typ und gleiche Kategorie) wird angepasst,
 * Fehlendes neu angelegt, nichts gelöscht. Rollen-IDs aus dem Backup werden auf die Rollen des Ziel-Servers umgeschrieben.
 */
async function restoreGuild(guild, data, parts) {
    const r = { created: 0, updated: 0, failed: 0, errors: [], parts, at: new Date().toISOString() };
    const fail = (what, e) => { r.failed++; if (r.errors.length < 30)
        r.errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`); };
    await guild.roles.fetch();
    await guild.channels.fetch();
    const me = guild.members.me ?? await guild.members.fetchMe();
    const roleMap = new Map([[data.guildId, guild.id]]); // @everyone
    for (const role of data.roles) {
        const hit = guild.roles.cache.find((x) => x.name === role.name && !x.managed);
        if (hit)
            roleMap.set(role.id, hit.id);
    }
    if (parts.includes('roles')) {
        try {
            await guild.roles.everyone.setPermissions(BigInt(data.everyonePermissions), 'Backup wiederhergestellt');
            r.updated++;
        }
        catch (e) {
            fail('@everyone', e);
        }
        for (const role of data.roles) {
            const existing = roleMap.get(role.id) ? guild.roles.cache.get(roleMap.get(role.id)) : undefined;
            const opts = { name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: BigInt(role.permissions) & me.permissions.bitfield, reason: 'Backup wiederhergestellt' };
            try {
                if (existing) {
                    if (existing.position >= me.roles.highest.position) {
                        fail(`Rolle ${role.name}`, 'steht über der Bot-Rolle');
                        continue;
                    }
                    await existing.edit(opts);
                    r.updated++;
                }
                else {
                    const created = await guild.roles.create(opts);
                    roleMap.set(role.id, created.id);
                    r.created++;
                }
            }
            catch (e) {
                fail(`Rolle ${role.name}`, e);
            }
        }
        // Reihenfolge wie im Backup (nur unterhalb der Bot-Rolle)
        const positions = data.roles.map((x) => ({ role: roleMap.get(x.id), position: x.position })).filter((x) => !!x.role && (guild.roles.cache.get(x.role)?.position ?? 1e9) < me.roles.highest.position);
        await guild.roles.setPositions(positions.map((x) => ({ role: x.role, position: Math.min(x.position, me.roles.highest.position - 1) }))).catch((e) => fail('Rollen-Reihenfolge', e));
    }
    const chanMap = new Map();
    if (parts.includes('channels')) {
        const overwrites = (c) => c.overwrites.map((o) => ({ id: o.type === 'role' ? roleMap.get(o.id) ?? null : o.id, type: o.type === 'role' ? discord_js_1.OverwriteType.Role : discord_js_1.OverwriteType.Member, allow: new discord_js_1.PermissionsBitField(BigInt(o.allow)), deny: new discord_js_1.PermissionsBitField(BigInt(o.deny)) }))
            .filter((o) => !!o.id && (o.type === discord_js_1.OverwriteType.Role ? guild.roles.cache.has(o.id) : true));
        for (const c of data.channels) {
            const parent = c.parentId ? chanMap.get(c.parentId) ?? null : null;
            const existing = guild.channels.cache.find((x) => !x.isThread() && x.name === c.name && x.type === BACK[c.type] && ('parentId' in x ? (x.parentId ?? null) === parent : true));
            const opts = {
                name: c.name, type: BACK[c.type], parent, permissionOverwrites: overwrites(c), reason: 'Backup wiederhergestellt',
                ...(c.topic != null && c.type !== 'voice' && c.type !== 'category' ? { topic: c.topic } : {}), ...(c.nsfw !== undefined && c.type !== 'category' ? { nsfw: c.nsfw } : {}),
                ...(c.rateLimitPerUser ? { rateLimitPerUser: c.rateLimitPerUser } : {}), ...(c.bitrate && (c.type === 'voice' || c.type === 'stage') ? { bitrate: Math.min(c.bitrate, guild.maximumBitrate) } : {}), ...(c.userLimit !== undefined && c.type === 'voice' ? { userLimit: c.userLimit } : {}),
            };
            try {
                if (existing) {
                    const edit = { ...opts };
                    delete edit.type; // Typ lässt sich nicht ändern
                    await existing.edit(edit);
                    chanMap.set(c.id, existing.id);
                    r.updated++;
                }
                else {
                    const created = await guild.channels.create(opts);
                    chanMap.set(c.id, created.id);
                    r.created++;
                }
            }
            catch (e) {
                fail(`Kanal #${c.name}`, e);
            }
        }
    }
    if (parts.includes('settings')) {
        const s = data.settings;
        const map = (id) => (id ? chanMap.get(id) ?? (guild.channels.cache.has(id) ? id : null) : null);
        try {
            await guild.edit({ name: s.name, verificationLevel: s.verificationLevel, defaultMessageNotifications: s.defaultMessageNotifications, explicitContentFilter: s.explicitContentFilter, afkTimeout: s.afkTimeout, afkChannel: map(s.afkChannelId), systemChannel: map(s.systemChannelId), reason: 'Backup wiederhergestellt' });
            r.updated++;
        }
        catch (e) {
            fail('Servereinstellungen', e);
        }
    }
    return r;
}
//# sourceMappingURL=backup.js.map