"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MB_INTERACTION = void 0;
exports.discordErrorText = discordErrorText;
exports.runMbSend = runMbSend;
exports.runMbFetch = runMbFetch;
const shared_1 = require("@enrp/shared");
const format_1 = require("./format");
const errors_1 = require("./commands/errors");
/** Discord-/discord.js-Fehler → verständlicher Text (ohne Token). */
function discordErrorText(e) {
    const x = e;
    if (x?.name === 'RateLimitError')
        return (0, shared_1.describeDiscordError)({ status: 429 });
    return (0, shared_1.describeDiscordError)({ status: typeof x?.status === 'number' ? x.status : undefined, code: typeof x?.code === 'number' ? x.code : undefined, message: typeof x?.message === 'string' ? x.message : String(e) });
}
/** Ergebnis an die API melden – bei kurzer Störung bis zu 3 Versuche (sonst bliebe der Status falsch). */
async function report(api, path, body, log) {
    for (let i = 1; i <= 3; i++) {
        try {
            await api.service('POST', path, body);
            return;
        }
        catch (e) {
            if (i === 3)
                log(`message builder: could not report ${path}: ${e instanceof Error ? e.message : e}`);
            else
                await new Promise((r) => setTimeout(r, 500 * i));
        }
    }
}
/**
 * Versandauftrag aus dem Dashboard: Nachrichten in Reihenfolge einzeln senden, Ergebnis je Nachricht melden.
 * Schlägt eine fehl, werden die folgenden nicht gesendet (Reihenfolge bleibt erhalten). Discord-Rate-Limits wartet discord.js ab.
 * Die API gibt den Auftrag nur einmal heraus (`proceed`), damit eine Wiederholung nie doppelt sendet.
 */
async function runMbSend(api, sendId, discord, log = console.log) {
    if (!/^[0-9a-f-]{36}$/.test(sendId))
        throw new Error('invalid send id');
    const s = await api.service('POST', `/bot/message-builder/sends/${sendId}/start`);
    if (!s.proceed || !s.items)
        return;
    const base = `/bot/message-builder/sends/${sendId}`;
    const channelId = s.channelId ?? '';
    const edit = s.kind === 'EDIT';
    let stop = null;
    try {
        if (edit && (!s.messageId || !discord.edit))
            throw new Error('Bearbeiten wird von dieser Bot-Version nicht unterstützt.');
        if (s.threadName && !discord.createPost)
            throw new Error('Forum-Beiträge werden von dieser Bot-Version nicht unterstützt.');
        const miss = await discord.missingPerms(s.guildId ?? null, channelId, s.items.map((i) => i.payload), { threadId: s.threadId ?? null, threadName: s.threadName ?? null, edit });
        if (miss.length)
            stop = `Dem Bot fehlen in diesem Kanal Rechte: ${miss.join(', ')}.`;
    }
    catch (e) {
        stop = e instanceof Error ? e.message : String(e);
    }
    if (stop) {
        await report(api, `${base}/items/${s.items[0]?.position ?? 0}`, { ok: false, error: stop }, log);
        await report(api, `${base}/finish`, { error: 'Nicht gesendet.' }, log);
        return;
    }
    // Ziel: bearbeitete Nachricht liegt in channelId (bei Threads ist das die Thread-ID); sonst Thread bzw. neuer Forum-Beitrag
    let where = edit ? channelId : s.threadId || channelId;
    for (const item of s.items) {
        try {
            let msg;
            if (edit)
                msg = await discord.edit(where, s.messageId, item.payload);
            else if (s.threadName && where === channelId) {
                const post = await discord.createPost(channelId, s.threadName, item.payload);
                where = post.channelId;
                msg = post;
            }
            else
                msg = await discord.send(where, item.payload);
            await report(api, `${base}/items/${item.position}`, { ok: true, messageId: msg.id, ...(where !== channelId ? { channelId: where } : {}) }, log);
        }
        catch (e) {
            const error = discordErrorText(e);
            log(`message builder ${sendId}: message ${item.position + 1} failed: ${error}`);
            await report(api, `${base}/items/${item.position}`, { ok: false, error }, log);
            stop = 'Nicht gesendet, weil eine vorherige Nachricht fehlschlug.';
            break;
        }
    }
    await report(api, `${base}/finish`, stop ? { error: stop } : {}, log);
}
/** Nachricht per Link laden: Inhalt und Absender (Bot, Webhook, fremd) an die API melden. */
async function runMbFetch(api, id, discord, log = console.log) {
    if (!/^[0-9a-f-]{36}$/.test(id))
        throw new Error('invalid message id');
    const t = await api.service('GET', `/bot/message-builder/messages/${id}`);
    if (!t.proceed || !t.channelId || !t.messageId)
        return;
    let body;
    try {
        const f = await discord.fetch(t.guildId ?? null, t.channelId, t.messageId);
        body = { ok: true, author: f.author, ...(f.webhookId ? { webhookId: f.webhookId } : {}), channelId: f.channelId, parentId: f.parentId, ...(f.channelName ? { channelName: f.channelName.slice(0, 100) } : {}), message: f.message };
    }
    catch (e) {
        body = { ok: false, error: e instanceof Error && !('status' in e) ? e.message.slice(0, 500) : discordErrorText(e) };
    }
    await report(api, `/bot/message-builder/messages/${id}/loaded`, body, log);
}
/** Buttons/Menüs aus dem Message Builder (`mb:<aktion>`): Antwort nur für die Person oder Rolle geben/nehmen. */
exports.MB_INTERACTION = {
    prefix: 'mb',
    async run(c) {
        const [actionId] = c.args;
        if (!/^[0-9a-f-]{36}$/.test(actionId ?? ''))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        try {
            // Auswahlmenü: alle gewählten Werte (Mehrfachauswahl); ein Wert zusätzlich als `value` (ältere API-Versionen)
            const values = c.values ?? [];
            const sel = c.values !== undefined ? { values, ...(values[0] ? { value: values[0] } : {}) } : {};
            const a = await c.api.service('POST', '/bot/message-builder/interactions', { actionId, guildId: c.guildId ?? null, discordId: c.discordId, ...sel });
            if (a.type === 'gone')
                return (0, format_1.errorReply)('Diese Aktion ist nicht mehr verfügbar.');
            const list = a.type === 'multi' ? a.actions : [a];
            const out = [];
            for (const x of list) {
                if (x.type === 'reply') {
                    out.push(x.text);
                    continue;
                }
                if (!c.guildId || !c.discord?.setRole)
                    return (0, format_1.errorReply)('Das geht nur auf dem Discord-Server.');
                try {
                    const r = await c.discord.setRole(c.guildId, c.discordId, x.roleId, x.mode);
                    out.push({ added: `✅ Du hast jetzt die Rolle <@&${x.roleId}>.`, removed: `✅ Die Rolle <@&${x.roleId}> wurde dir entfernt.`, unchanged: `ℹ️ Keine Änderung an <@&${x.roleId}>.` }[r]);
                }
                catch (e) {
                    const err = `Die Rolle konnte nicht geändert werden: ${discordErrorText(e)} (Die Bot-Rolle muss über dieser Rolle stehen und „Rollen verwalten“ haben.)`;
                    if (list.length === 1)
                        return (0, format_1.errorReply)(err);
                    out.push(`❌ ${err}`);
                }
            }
            return { ephemeral: true, content: out.join('\n\n').slice(0, 2000) };
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
//# sourceMappingURL=message-builder.js.map