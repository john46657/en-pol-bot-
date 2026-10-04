"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pollOnce = pollOnce;
exports.startOutboxLoop = startOutboxLoop;
const format_1 = require("./format");
/** Benachrichtigungen, die per Direktnachricht an eine Person gehen statt in einen Channel. */
const DIRECT = { 'application.decided': format_1.applicationDecisionText };
/**
 * Holt offene Benachrichtigungen aus der System-API, postet sie und quittiert.
 * Fehlgeschlagene Sendungen werden gemeldet (die API zählt Versuche und gibt nach 5 Fehlversuchen auf).
 */
async function pollOnce(api, send, log = console.log, dm) {
    const [channels, items] = await Promise.all([api.service('GET', '/bot/config'), api.service('GET', '/bot/outbox?limit=20')]);
    let sent = 0;
    for (const item of items) {
        const direct = DIRECT[item.type];
        if (direct) {
            try {
                const userId = String(item.payload.discordId ?? '');
                if (!/^\d{15,25}$/.test(userId))
                    throw new Error('no Discord user id');
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
        const channelIds = (channels[item.channelKey] ?? '').split(/[\s,;]+/).filter(Boolean);
        const embed = (0, format_1.renderOutbox)(item.type, item.payload);
        try {
            if (!channelIds.length)
                throw new Error(`channel "${item.channelKey}" not configured`);
            if (!embed)
                throw new Error(`unknown type "${item.type}"`);
            const results = await Promise.allSettled(channelIds.map((id) => send(id, embed)));
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
function startOutboxLoop(api, send, seconds, log = console.log, dm) {
    let running = false;
    let lastError;
    const tick = async () => {
        if (running)
            return;
        running = true;
        try {
            await pollOnce(api, send, log, dm);
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