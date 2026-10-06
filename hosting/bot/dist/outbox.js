"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollOnce = pollOnce;
exports.startOutboxLoop = startOutboxLoop;
const format_1 = require("./format");
/** Benachrichtigungen, die per Direktnachricht an eine Person gehen statt in einen Channel. */
const DIRECT = { 'application.decided': format_1.applicationDecisionText, 'qualification.decided': format_1.qualificationDecisionText };
/**
 * Holt offene Benachrichtigungen aus der System-API, postet sie und quittiert.
 * Fehlgeschlagene Sendungen werden gemeldet (die API zählt Versuche und gibt nach 5 Fehlversuchen auf).
 */
async function pollOnce(api, send, log = console.log, dm, grantRole) {
    const [channels, items] = await Promise.all([api.service('GET', '/bot/config'), api.service('GET', '/bot/outbox?limit=20')]);
    let sent = 0;
    for (const item of items) {
        const direct = DIRECT[item.type];
        if (direct) {
            try {
                const userId = String(item.payload.discordId ?? '');
                if (!/^\d{15,25}$/.test(userId))
                    throw new Error('no Discord user id');
                // Rolle zuerst (wichtiger als die Nachricht; erneutes Vergeben bei Wiederholung schadet nicht)
                const roleId = String(item.payload.roleId ?? '');
                if (item.payload.status === 'ACCEPTED' && /^\d{15,25}$/.test(roleId) && grantRole) {
                    await grantRole(userId, roleId).catch((e) => log(`outbox ${item.id}: role ${roleId} could not be given: ${e instanceof Error ? e.message : e}`));
                }
                if (!dm)
                    throw new Error('direct messages not available');
                await dm(userId, direct(item.payload));
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
                sent++;
            }
            catch (e) {
                // z. B. Nutzer hat DMs deaktiviert oder den Server verlassen
                const msg = e instanceof Error ? e.message : 'send failed';
                log(`outbox ${item.id} (${item.type}) direct message failed: ${msg}`);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
            }
            continue;
        }
        // pro Art dürfen mehrere Channel-IDs (Komma-getrennt, auch auf mehreren Servern) hinterlegt sein
        // eigener Channel im Eintrag (z. B. Bewerbungen einer Einheit) hat Vorrang
        const own = typeof item.payload.channelId === 'string' && /^\d{15,25}$/.test(item.payload.channelId) ? item.payload.channelId : null;
        const channelIds = own ? [own] : (channels[item.channelKey] ?? '').split(/[\s,;]+/).filter(Boolean);
        const embeds = (0, format_1.renderOutboxEmbeds)(item.type, item.payload);
        try {
            if (!channelIds.length)
                throw new Error(`channel "${item.channelKey}" not configured`);
            if (!embeds)
                throw new Error(`unknown type "${item.type}"`);
            const buttons = (0, format_1.outboxButtons)(item.type, item.payload);
            const results = await Promise.allSettled(channelIds.map((id) => send(id, embeds, buttons)));
            const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${channelIds[i]}: ${r.reason instanceof Error ? r.reason.message : r.reason}`] : []));
            failed.forEach((f) => log(`outbox ${item.id}: send failed for channel ${f}`));
            // Erfolg, wenn mindestens ein Channel erreicht wurde (sonst Wiederholung – würde die erfolgreichen doppelt beliefern)
            if (failed.length === channelIds.length)
                throw new Error(failed[0]);
            await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
            sent++;
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : 'send failed';
            log(`outbox ${item.id} (${item.type}) failed: ${msg}`);
            await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
        }
    }
    return sent;
}
/** Läuft dauerhaft; überlappende Durchläufe werden vermieden, Fehler (z. B. API kurz down) beenden die Schleife nicht. */
function startOutboxLoop(api, send, seconds, log = console.log, dm, grantRole) {
    let running = false;
    let lastError;
    const tick = async () => {
        if (running)
            return;
        running = true;
        try {
            await pollOnce(api, send, log, dm, grantRole);
            if (lastError) {
                log('outbox: connection to the API restored');
                lastError = undefined;
            }
        }
        catch (e) {
            // Nur bei neuer/anderer Störung loggen – nicht alle 5 Sekunden dieselbe Zeile
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== lastError) {
                log(`outbox poll failed: ${msg} (will keep retrying quietly)`);
                lastError = msg;
            }
        }
        finally {
            running = false;
        }
    };
    const timer = setInterval(() => void tick(), seconds * 1000);
    void tick();
    return () => clearInterval(timer);
}
//# sourceMappingURL=outbox.js.map