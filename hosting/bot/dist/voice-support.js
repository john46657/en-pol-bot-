"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_INTERACTION = void 0;
exports.createVoiceSupport = createVoiceSupport;
const api_1 = require("./api");
const format_1 = require("./format");
const errors_1 = require("./commands/errors");
const ROOMS_MS = 60_000;
const note = (text) => ({ content: text, ephemeral: true });
const fail = (e) => (e instanceof api_1.BotApiError && [400, 403, 404, 409].includes(e.status) && e.message ? (0, format_1.errorReply)((0, format_1.clip)(e.message, 500)) : (0, errors_1.mapError)(e));
/**
 * Sprach-Support wie bei GalaxyBot: Warteraum betreten → Meldung „Ein neuer Support-Fall“ mit Übernehmen / Ablehnen / Nachricht.
 * Übernehmen stellt einen Sprachkanal bereit und verschiebt die Person; ist der Kanal leer, wird der Fall geschlossen.
 */
function createVoiceSupport(api, ops, log = console.error) {
    const rooms = new Map();
    const roomsOf = async (guildId) => {
        const hit = rooms.get(guildId);
        if (hit && Date.now() - hit.at < ROOMS_MS)
            return hit.list;
        const list = await api.service('GET', `/bot/voice-support/rooms?guildId=${guildId}`).catch(() => hit?.list ?? []);
        rooms.set(guildId, { at: Date.now(), list });
        return list;
    };
    const safe = (label, p) => p.catch((e) => log(`voice support: ${label} failed: ${e instanceof Error ? e.message : e}`));
    const applyEdit = (e) => (e ? safe('update message', ops.edit(e.channelId, e.messageId, e.message)) : Promise.resolve());
    async function finished(r) {
        await applyEdit(r.edit);
        if (r.deleteChannelId)
            await safe('delete channel', ops.deleteChannel(r.deleteChannelId));
        if (r.ratingDm)
            await safe('rating DM', ops.dm(r.userId, r.ratingDm));
    }
    async function onVoiceState(e) {
        if (e.bot || e.from === e.to)
            return;
        const list = await roomsOf(e.guildId);
        if (!list.length)
            return; // Server ohne Sprach-Support
        if (e.from) {
            if (list.some((r) => r.waitingChannelId === e.from)) {
                const r = await api.service('POST', '/bot/voice-support/left', { guildId: e.guildId, channelId: e.from, discordId: e.userId, userName: e.userName });
                for (const x of r.edits)
                    await applyEdit(x);
            }
            else if (!ops.members(e.from).length) {
                // Support-Kanal leer → Fall schließen (das System kennt die Kanäle seiner Fälle)
                const r = await api.service('POST', '/bot/voice-support/empty', { channelId: e.from });
                if (r.closed)
                    await finished(r);
            }
        }
        if (e.to && list.some((r) => r.enabled && r.waitingChannelId === e.to)) {
            const r = await api.service('POST', '/bot/voice-support/join', { guildId: e.guildId, channelId: e.to, discordId: e.userId, userName: e.userName });
            if (r.action === 'closed' && r.dm)
                await safe('closed DM', ops.dm(e.userId, r.dm));
            if (r.action === 'notify' && r.caseId && r.channelId && r.message) {
                const messageId = await ops.post(r.channelId, r.message);
                await api.service('POST', `/bot/voice-support/cases/${r.caseId}/posted`, { messageId });
            }
        }
    }
    /** Übernehmen: Kanal bereitstellen (eigener freier Kanal oder neu), Person + Bearbeiter verschieben, Notizen-Thread. */
    async function claim(id, s) {
        const r = await api.service('POST', `/bot/voice-support/cases/${id}/claim`, s);
        await applyEdit(r.edit);
        const { case: c, room } = r;
        if (!room)
            return (0, format_1.okReply)('Übernommen.');
        let channelId = null, created = false;
        try {
            if (room.ownChannels)
                channelId = room.ownChannelIds.find((x) => !ops.members(x).length) ?? null;
            else {
                channelId = await ops.createVoice({ guildId: c.guildId, name: (0, format_1.clip)(`${room.channelPrefix}${c.userName}`, 100), nearChannelId: room.waitingChannelId, userId: c.userId, teamRoleId: room.teamRoleId });
                created = true;
            }
        }
        catch (e) {
            log(`voice support: channel failed: ${e instanceof Error ? e.message : e}`);
        }
        const moved = channelId ? await ops.move(c.guildId, c.userId, channelId).catch(() => false) : false;
        if (channelId && ops.voiceChannelOf(c.guildId, s.discordId))
            await ops.move(c.guildId, s.discordId, channelId).catch(() => false);
        const threadId = room.notes && r.edit ? await ops.thread(r.edit.channelId, r.edit.messageId, `Notizen #${c.number}`).catch(() => null) : null;
        const done = await api.service('POST', `/bot/voice-support/cases/${id}/channel`, { channelId, created, threadId });
        await applyEdit(done.edit);
        if (!channelId)
            return note(room.ownChannels ? '⚠️ Übernommen – aber gerade ist keiner der eigenen Support-Kanäle frei. Sprich die Person im Warteraum an.' : '⚠️ Übernommen – der Sprachkanal konnte nicht angelegt werden (fehlt dem Bot „Kanäle verwalten“?).');
        return (0, format_1.okReply)(`Übernommen: <#${channelId}>${moved ? '' : ' – die Person ist nicht mehr im Sprachkanal und wurde nicht verschoben.'}`);
    }
    async function interact(c) {
        const [action, id = '', extra] = c.args;
        if (!/^[0-9a-f-]{36}$/.test(id))
            return (0, format_1.errorReply)('Unbekannter Support-Fall.');
        const s = { discordId: c.discordId, name: c.userName ?? c.discordId, roleIds: c.memberRoleIds ?? [], admin: !!c.isGuildAdmin };
        try {
            switch (action) {
                case 'claim': return await claim(id, s);
                case 'decline': return { modal: { id: `vs:declinesubmit:${id}`, title: 'Support-Fall ablehnen', fields: [{ id: 'reason', label: 'Grund (optional, geht per DM an die Person)', paragraph: true, required: false, maxLength: 500 }] } };
                case 'declinesubmit': {
                    const r = await api.service('POST', `/bot/voice-support/cases/${id}/decline`, { ...s, ...(c.fields?.reason?.trim() ? { reason: c.fields.reason.trim() } : {}) });
                    await applyEdit(r.edit);
                    const sent = await ops.dm(r.userId, r.dm).then(() => true, () => false);
                    return (0, format_1.okReply)(`Abgelehnt.${sent ? ' Die Person wurde per DM informiert.' : ' (Die DM kam nicht an – Direktnachrichten sind bei der Person aus.)'}`);
                }
                case 'msg': return { modal: { id: `vs:msgsubmit:${id}`, title: 'Nachricht an die Person', fields: [{ id: 'text', label: 'Nachricht (per DM)', paragraph: true, required: true, maxLength: 2000 }] } };
                case 'msgsubmit': {
                    const text = (c.fields?.text ?? '').trim();
                    if (!text)
                        return (0, format_1.errorReply)('Bitte eine Nachricht eingeben.');
                    const r = await api.service('POST', `/bot/voice-support/cases/${id}/message`, { ...s, text });
                    const sent = await ops.dm(r.userId, r.dm).then(() => true, () => false);
                    if (!sent)
                        return (0, format_1.errorReply)('Die Nachricht kam nicht an – die Person hat Direktnachrichten ausgeschaltet.');
                    await applyEdit(r.edit);
                    if (r.threadId)
                        await safe('thread log', ops.threadPost(r.threadId, r.log));
                    return note('💬 Nachricht gesendet.');
                }
                case 'close': {
                    await finished(await api.service('POST', `/bot/voice-support/cases/${id}/close`, s));
                    return note('🔒 Support-Fall geschlossen.');
                }
                case 'rate': {
                    const stars = Number(extra);
                    if (!(stars >= 1 && stars <= 5))
                        return (0, format_1.errorReply)('Ungültige Bewertung.');
                    const r = await api.service('POST', `/bot/voice-support/cases/${id}/rating`, { discordId: c.discordId, stars });
                    await applyEdit(r.edit);
                    return { ...(0, format_1.okReply)('Danke für deine Bewertung! ⭐'), update: { embeds: [{ title: '⭐ Danke!', description: `Du hast ${'⭐'.repeat(stars)} vergeben.`, color: 0xfacc15 }] } };
                }
                default: return (0, format_1.errorReply)('Unbekannte Aktion.');
            }
        }
        catch (e) {
            return fail(e);
        }
    }
    return { onVoiceState, interact, clear: () => rooms.clear() };
}
/** Buttons/Formulare `vs:<aktion>:<fallId>` → Laufzeit aus dem Kontext. */
exports.VOICE_INTERACTION = {
    prefix: 'vs',
    opensModal: (a) => a[0] === 'decline' || a[0] === 'msg',
    async run(c) { return c.voiceSupport ? c.voiceSupport.interact(c) : (0, format_1.errorReply)('Der Sprach-Support ist hier nicht verfügbar.'); },
};
//# sourceMappingURL=voice-support.js.map