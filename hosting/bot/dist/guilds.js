"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guildInfo = guildInfo;
exports.startGuildDirectory = startGuildDirectory;
const discord_js_1 = require("discord.js");
const kind = (t) => t === discord_js_1.ChannelType.GuildText || t === discord_js_1.ChannelType.GuildAnnouncement ? 'text' : t === discord_js_1.ChannelType.GuildCategory ? 'category' : t === discord_js_1.ChannelType.GuildVoice || t === discord_js_1.ChannelType.GuildStageVoice ? 'voice' : 'other';
function guildInfo(g) {
    return {
        id: g.id, name: g.name.slice(0, 100), icon: g.iconURL({ size: 256 }) ?? null,
        banner: g.bannerURL({ size: 1024 }) ?? g.splashURL({ size: 1024 }) ?? null, memberCount: g.memberCount,
        channels: [...g.channels.cache.values()].filter((c) => !c.isThread()).slice(0, 500)
            .map((c) => ({ id: c.id, name: c.name.slice(0, 100), type: kind(c.type), parentId: 'parentId' in c ? c.parentId ?? null : null, position: 'rawPosition' in c ? c.rawPosition : 0 })),
        // @everyone und Rollen von Bots/Integrationen sind keine sinnvolle Auswahl
        roles: [...g.roles.cache.values()].filter((r) => r.id !== g.id && !r.managed).slice(0, 250)
            .map((r) => ({ id: r.id, name: r.name.slice(0, 100), color: r.color, position: r.position })),
    };
}
/** Meldet alle Server des Bots an das System (beim Start, bei Änderungen und regelmäßig). */
function startGuildDirectory(client, api, log = console.log) {
    let timer;
    const push = async () => {
        const guilds = [...client().guilds.cache.values()].slice(0, 50).map(guildInfo);
        await api.service('PUT', '/bot/guilds', { guilds }).catch((e) => log(`guild directory not sent: ${e instanceof Error ? e.message : e}`));
    };
    // mehrere Änderungen kurz hintereinander nur einmal melden
    const soon = () => { clearTimeout(timer); timer = setTimeout(() => void push(), 5_000); timer.unref?.(); };
    const c = client();
    for (const ev of ['guildCreate', 'guildDelete', 'guildUpdate', 'channelCreate', 'channelDelete', 'channelUpdate', 'roleCreate', 'roleDelete', 'roleUpdate'])
        c.on(ev, soon);
    void push();
    setInterval(() => void push(), 10 * 60_000).unref();
    return { push };
}
//# sourceMappingURL=guilds.js.map