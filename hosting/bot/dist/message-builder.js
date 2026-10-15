"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MB_INTERACTION = void 0;
exports.discordErrorText = discordErrorText;
exports.runMbSend = runMbSend;
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
    let stop = null;
    try {
        const miss = await discord.missingPerms(s.guildId ?? null, channelId, s.items.map((i) => i.payload));
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
    for (const item of s.items) {
        try {
            const msg = await discord.send(channelId, item.payload);
            await report(api, `${base}/items/${item.position}`, { ok: true, messageId: msg.id }, log);
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
/** Buttons/Menüs aus dem Message Builder (`mb:<aktion>`): Antwort nur für die Person oder Rolle geben/nehmen. */
exports.MB_INTERACTION = {
    prefix: 'mb',
    async run(c) {
        const [actionId] = c.args;
        if (!/^[0-9a-f-]{36}$/.test(actionId ?? ''))
            return (0, format_1.errorReply)('Unbekannte Aktion.');
        try {
            const a = await c.api.service('POST', '/bot/message-builder/interactions', { actionId, guildId: c.guildId ?? null, discordId: c.discordId, ...(c.values?.[0] ? { value: c.values[0] } : {}) });
            if (a.type === 'reply')
                return { ephemeral: true, content: a.text.slice(0, 2000) };
            if (a.type === 'gone')
                return (0, format_1.errorReply)('Diese Aktion ist nicht mehr verfügbar.');
            if (!c.guildId || !c.discord?.setRole)
                return (0, format_1.errorReply)('Das geht nur auf dem Discord-Server.');
            try {
                const r = await c.discord.setRole(c.guildId, c.discordId, a.roleId, a.mode);
                const text = { added: `✅ Du hast jetzt die Rolle <@&${a.roleId}>.`, removed: `✅ Die Rolle <@&${a.roleId}> wurde dir entfernt.`, unchanged: `ℹ️ Keine Änderung an <@&${a.roleId}>.` }[r];
                return { ephemeral: true, content: text };
            }
            catch (e) {
                return (0, format_1.errorReply)(`Die Rolle konnte nicht geändert werden: ${discordErrorText(e)} (Die Bot-Rolle muss über dieser Rolle stehen und „Rollen verwalten“ haben.)`);
            }
        }
        catch (e) {
            return (0, errors_1.mapError)(e);
        }
    },
};
//# sourceMappingURL=message-builder.js.map