"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberReport = memberReport;
exports.teamMembers = teamMembers;
exports.voiceReport = voiceReport;
exports.startPresenceReporter = startPresenceReporter;
const discord_js_1 = require("discord.js");
const STATUS = new Set(['online', 'idle', 'dnd', 'offline']);
function memberReport(m, presences) {
    const raw = m.presence?.status;
    return {
        id: m.id, guildId: m.guild.id, username: m.user.username.slice(0, 100), displayName: m.displayName.slice(0, 100), avatar: m.displayAvatarURL({ size: 128 }) ?? null,
        status: !presences ? 'unknown' : raw && STATUS.has(raw) ? raw : 'offline', // ohne Presence = offline/unsichtbar
        roleIds: [...m.roles.cache.keys()].filter((r) => r !== m.guild.id).slice(0, 250), joinedAt: m.joinedAt?.toISOString() ?? null,
    };
}
/** Alle Teammitglieder (mit mindestens einer Teamrolle) aller Server; dieselbe Person auf mehreren Servern nur einmal. */
function teamMembers(guilds, teamRoleIds, presences) {
    if (!teamRoleIds.length)
        return [];
    const out = new Map();
    for (const g of guilds)
        for (const m of g.members.cache.values()) {
            if (m.user.bot || !teamRoleIds.some((r) => m.roles.cache.has(r)))
                continue;
            const prev = out.get(m.id);
            const r = memberReport(m, presences);
            out.set(m.id, prev ? { ...prev, roleIds: [...new Set([...prev.roleIds, ...r.roleIds])], status: prev.status === 'online' ? prev.status : r.status } : r);
        }
    return [...out.values()].slice(0, 5000);
}
function voiceReport(guilds, since) {
    const out = [];
    for (const g of guilds) {
        const voice = [...g.channels.cache.values()].filter((c) => c.type === discord_js_1.ChannelType.GuildVoice || c.type === discord_js_1.ChannelType.GuildStageVoice);
        for (const c of voice) {
            out.push({
                id: c.id, guildId: g.id, name: c.name.slice(0, 100), parentId: c.parentId ?? null, parentName: c.parent?.name.slice(0, 100) ?? null, position: c.rawPosition,
                members: [...c.members.values()].slice(0, 500).map((m) => {
                    const v = m.voice;
                    const t = since.get(`${g.id}:${m.id}`);
                    return { id: m.id, displayName: m.displayName.slice(0, 100), avatar: m.displayAvatarURL({ size: 64 }) ?? null, selfMute: !!v.selfMute, selfDeaf: !!v.selfDeaf, serverMute: !!v.serverMute, serverDeaf: !!v.serverDeaf, video: !!v.selfVideo, streaming: !!v.streaming, since: t ? new Date(t).toISOString() : null };
                }),
            });
        }
    }
    return out.slice(0, 500);
}
/**
 * Meldet dem Dashboard Teammitglieder (mindestens alle 60 Sekunden und bei Änderungen) und Voice-Channels (bei jeder Änderung).
 * `members`/`presences`: ob die privilegierten Intents „Server Members“ und „Presence“ verfügbar sind.
 */
function startPresenceReporter(client, api, opts, log = console.log) {
    const since = new Map(); // Aufenthaltsdauer: seit wann in diesem Channel (ab Bot-Start bekannt)
    let teamRoles = [];
    let lastError;
    const guilds = () => [...client().guilds.cache.values()].slice(0, 50);
    const fail = (what) => (e) => {
        const msg = `${what}: ${e instanceof Error ? e.message : e}`;
        if (msg !== lastError) {
            log(`team/voice report failed – ${msg} (will keep retrying quietly)`);
            lastError = msg;
        }
    };
    const pushMembers = async () => {
        teamRoles = (await api.service('GET', '/bot/team-roles')).roleIds;
        await api.service('PUT', '/bot/members', { members: teamMembers(guilds(), teamRoles, opts.presences) });
        lastError = undefined;
    };
    const pushVoice = async () => { await api.service('PUT', '/bot/voice', { channels: voiceReport(guilds(), since) }); };
    let mt, vt;
    const membersSoon = () => { clearTimeout(mt); mt = setTimeout(() => void pushMembers().catch(fail('members')), 5_000); mt.unref?.(); };
    const voiceSoon = () => { clearTimeout(vt); vt = setTimeout(() => void pushVoice().catch(fail('voice')), 1_500); vt.unref?.(); };
    const c = client();
    for (const g of guilds())
        for (const s of g.voiceStates.cache.values())
            if (s.channelId)
                since.set(`${g.id}:${s.id}`, Date.now());
    c.on('voiceStateUpdate', (before, after) => {
        const key = `${after.guild.id}:${after.id}`;
        if (!after.channelId)
            since.delete(key);
        else if (before.channelId !== after.channelId)
            since.set(key, Date.now());
        voiceSoon();
    });
    for (const ev of ['guildMemberAdd', 'guildMemberRemove', 'guildMemberUpdate', 'userUpdate', ...(opts.presences ? ['presenceUpdate'] : [])])
        c.on(ev, membersSoon);
    c.on('channelCreate', voiceSoon);
    c.on('channelDelete', voiceSoon);
    c.on('channelUpdate', voiceSoon);
    /** Mitgliederliste einmal vollständig laden (danach hält Discord sie über Ereignisse aktuell). */
    const loadMembers = async () => {
        if (!opts.members) {
            log('Discord: "Server Members Intent" is off – the dashboard team list only shows members the bot has seen (enable it in the Developer Portal → Bot).');
            return;
        }
        for (const g of guilds())
            await g.members.fetch().catch((e) => log(`could not load members of ${g.name}: ${e instanceof Error ? e.message : e}`));
    };
    void loadMembers().then(() => Promise.all([pushMembers().catch(fail('members')), pushVoice().catch(fail('voice'))]));
    // verbindlich: spätestens alle 60 Sekunden ein frischer Stand
    setInterval(() => void pushMembers().catch(fail('members')), 60_000).unref();
    setInterval(() => void pushVoice().catch(fail('voice')), 60_000).unref();
    c.on('guildCreate', (g) => { if (opts.members)
        void g.members.fetch().catch(() => undefined).then(membersSoon); });
    return { sync: () => Promise.all([pushMembers(), pushVoice()]).then(() => undefined) };
}
//# sourceMappingURL=presence.js.map