"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dutyRoleChanges = dutyRoleChanges;
exports.pollOnce = pollOnce;
exports.startOutboxLoop = startOutboxLoop;
const cad_1 = require("./commands/cad");
const format_1 = require("./format");
/** Welche Discord-Rolle zu welchem Dienststatus gehört (Einstellungen → Discord). */
function dutyRoleChanges(status, cfg) {
    // je Status mehrere Rollen-IDs möglich (eine pro Discord-Server), Komma-getrennt
    const ids = (v) => (v ?? '').split(/[\s,;]+/).filter((r) => /^\d{15,25}$/.test(r));
    const map = { ON_DUTY: ids(cfg.dutyRole), BREAK: ids(cfg.breakRole), TRAINING: ids(cfg.trainingRole), ADMINISTRATIVE: ids(cfg.adminDutyRole) };
    const add = map[status] ?? [];
    const all = [...new Set(Object.values(map).flat())];
    return { add: [...new Set(add)], remove: all.filter((r) => !add.includes(r)) };
}
/** Benachrichtigungen, die per Direktnachricht an eine Person gehen statt in einen Channel. */
const DIRECT = {
    'application.decided': format_1.applicationDecisionText, 'qualification.decided': format_1.qualificationDecisionText,
    'leave.decided': (p) => (0, format_1.leaveDirectEmbed)('leave.decided', p), 'leave.pending': (p) => (0, format_1.leaveDirectEmbed)('leave.pending', p),
};
/**
 * Holt offene Benachrichtigungen aus der System-API, postet sie und quittiert.
 * Fehlgeschlagene Sendungen werden gemeldet (die API zählt Versuche und gibt nach 5 Fehlversuchen auf).
 */
async function pollOnce(api, send, log = console.log, dm, grantRole, syncRoles, onDutyChanged, ticketEffects, onMembersSync, onPanel, onTask) {
    const [channels, items] = await Promise.all([api.service('GET', '/bot/config'), api.service('GET', '/bot/outbox?limit=20')]);
    let sent = 0;
    for (const item of items) {
        if (item.type === 'danger.panel') {
            try {
                const channelId = String(item.payload.channelId ?? '');
                if (!/^\d{15,25}$/.test(channelId))
                    throw new Error('no channel id');
                if (!onPanel)
                    throw new Error('panels not supported');
                await onPanel('danger', channelId);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
                sent++;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'panel failed';
                log(`outbox ${item.id} (danger.panel) failed: ${msg}`);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
            }
            continue;
        }
        if (item.type === 'application.ticket' || item.type === 'embed.post' || item.type === 'message.decided') {
            try {
                if (!onTask || !(await onTask(item.type, item.payload)))
                    throw new Error('tasks not supported');
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
                sent++;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'task failed';
                log(`outbox ${item.id} (${item.type}) failed: ${msg}`);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
            }
            continue;
        }
        const direct = DIRECT[item.type];
        if (direct) {
            try {
                const userId = String(item.payload.discordId ?? '');
                if (!/^\d{15,25}$/.test(userId))
                    throw new Error('no Discord user id');
                // Rolle zuerst (wichtiger als die Nachricht; erneutes Vergeben bei Wiederholung schadet nicht)
                // Rollen aus der Entscheidung (Annahme-/Ablehnungs-Rollen, Rolle der Einheit, Rollen-Auswahl); `roleId` = ältere Einträge (nur bei Annahme)
                const ids = (v) => (Array.isArray(v) ? v : []).map((r) => String(r ?? '')).filter((r) => /^\d{15,25}$/.test(r));
                const roleIds = [...new Set([...(item.payload.status === 'ACCEPTED' ? ids([item.payload.roleId]) : []), ...ids(item.payload.roleIds)])];
                if (grantRole)
                    for (const roleId of roleIds)
                        await grantRole(userId, roleId).catch((e) => log(`outbox ${item.id}: role ${roleId} could not be given: ${e instanceof Error ? e.message : e}`));
                const remove = ids(item.payload.removeRoleIds);
                if (remove.length && syncRoles)
                    await syncRoles(userId, [], remove).catch((e) => log(`outbox ${item.id}: roles could not be removed: ${e instanceof Error ? e.message : e}`));
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
        // Support-Tickets: Discord-Änderungen aus dem Dashboard/der Automatik ausführen
        if (item.type === 'ticket.effects') {
            if (!ticketEffects) {
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: 'tickets not available' }).catch(() => undefined);
                continue;
            }
            try {
                await ticketEffects(item.payload.effects ?? []);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
                sent++;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'ticket effects failed';
                log(`outbox ${item.id} (${item.type}) failed: ${msg}`);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
            }
            continue;
        }
        // „Jetzt aktualisieren“ in der Teamliste: Teammitglieder und Voice sofort neu melden
        if (item.type === 'members.sync') {
            onMembersSync?.();
            await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
            sent++;
            continue;
        }
        // Rollen eines Mitglieds ändern (z. B. „ausstehend“-Rollen beim Einreichen einer Bewerbung)
        if (item.type === 'member.roles') {
            const userId = String(item.payload.discordId ?? '');
            const ids = (v) => (Array.isArray(v) ? v : []).map(String).filter((r) => /^\d{15,25}$/.test(r));
            try {
                if (!syncRoles || !/^\d{15,25}$/.test(userId))
                    throw new Error('roles not available');
                await syncRoles(userId, ids(item.payload.add), ids(item.payload.remove));
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
                sent++;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : 'roles failed';
                log(`outbox ${item.id} (member.roles) failed: ${msg}`);
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
            }
            continue;
        }
        // Dienststatus: zuerst die Dienst-Rollen abgleichen; ohne Dienst-Channel ist der Eintrag damit erledigt
        if (item.type === 'duty.changed') {
            onDutyChanged?.(); // z. B. Teamliste sofort neu zeichnen
            const userId = String(item.payload.discordId ?? '');
            if (syncRoles && /^\d{15,25}$/.test(userId)) {
                // Schichten-Modul: Rollen kommen fertig aus der API (Schicht-/Pausen-Rolle der Schicht-Art)
                const given = item.payload.roles;
                const ids = (v) => (Array.isArray(v) ? v : []).map(String).filter((r) => /^\d{15,25}$/.test(r));
                const { add, remove } = given ? { add: ids(given.add), remove: ids(given.remove) } : dutyRoleChanges(String(item.payload.status), channels);
                if (add.length || remove.length)
                    await syncRoles(userId, add, remove).catch((e) => log(`outbox ${item.id}: duty roles could not be updated: ${e instanceof Error ? e.message : e}`));
            }
            const ownLog = typeof item.payload.channelId === 'string' && /^\d{15,25}$/.test(item.payload.channelId);
            if (!channels.duty && !ownLog) {
                await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true }).catch(() => undefined);
                sent++;
                continue;
            }
        }
        // eigener Channel im Eintrag (z. B. Bewerbungen einer Einheit) hat Vorrang
        const own = typeof item.payload.channelId === 'string' && /^\d{15,25}$/.test(item.payload.channelId) ? item.payload.channelId : null;
        // CAD: Zielkanäle kommen fertig aus der API (Kanalzuordnungen + Server-Verbindungen)
        const many = Array.isArray(item.payload.channelIds) ? item.payload.channelIds.map(String).filter((c) => /^\d{15,25}$/.test(c)) : null;
        const channelIds = own ? [own] : many ?? (channels[item.channelKey] ?? '').split(/[\s,;]+/).filter(Boolean);
        const cad = item.type.startsWith('cad.') ? (0, cad_1.renderCadOutbox)(item.type, item.payload) : null;
        const embeds = item.type.startsWith('cad.') ? (cad ? [cad] : null) : (0, format_1.renderOutboxEmbeds)(item.type, item.payload);
        try {
            if (!channelIds.length)
                throw new Error(`channel "${item.channelKey}" not configured`);
            if (!embeds)
                throw new Error(`unknown type "${item.type}"`);
            const buttons = item.type.startsWith('cad.') ? (0, cad_1.cadButtons)(item.type, item.payload) : (0, format_1.outboxButtons)(item.type, item.payload);
            const pingRoleIds = Array.isArray(item.payload.pingRoleIds) ? item.payload.pingRoleIds.map(String).filter((r) => /^\d{15,25}$/.test(r)) : [];
            const avatarUserId = /\.(submitted|archived)$/.test(item.type) && /^(qualification|application)\./.test(item.type) && typeof item.payload.discordId === 'string' && /^\d{15,25}$/.test(item.payload.discordId) ? item.payload.discordId : undefined;
            // Staff-Thread je Bewerbung (wie bei Appy)
            const thread = item.payload.thread === true && /\.submitted$/.test(item.type) ? `Bewerbung ${String(item.payload.number ?? '')}`.slice(0, 100) : undefined;
            const authorUserId = item.type === 'leave.requested' && typeof item.payload.discordId === 'string' && /^\d{15,25}$/.test(item.payload.discordId) ? item.payload.discordId : undefined;
            // Gefahrenstatus: vorherige Meldung im Kanal löschen, damit nur der aktuelle Status dort steht
            const replaceKey = item.type === 'danger.changed' ? 'danger' : undefined;
            // Anträge/Bewerbungen mit Entscheidungs-Buttons: Ort merken, damit eine Entscheidung im Dashboard die Nachricht anpassen kann
            const trackKind = { 'leave.requested': 'l', 'application.submitted': 'a', 'qualification.submitted': 'q' }[item.type];
            const trackKey = trackKind && typeof item.payload.id === 'string' && /^[0-9a-f-]{36}$/.test(item.payload.id) ? `msg-${trackKind}-${item.payload.id}` : undefined;
            const opts = pingRoleIds.length || avatarUserId || thread || authorUserId || replaceKey || trackKey ? { ...(pingRoleIds.length ? { pingRoleIds } : {}), ...(avatarUserId ? { avatarUserId } : {}), ...(thread ? { thread } : {}), ...(authorUserId ? { authorUserId } : {}), ...(replaceKey ? { replaceKey } : {}), ...(trackKey ? { trackKey } : {}) } : undefined;
            const results = await Promise.allSettled(channelIds.map((id) => (opts ? send(id, embeds, buttons, opts) : send(id, embeds, buttons))));
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
function startOutboxLoop(api, send, seconds, log = console.log, dm, grantRole, syncRoles, onDutyChanged, ticketEffects, onMembersSync, onPanel, onTask) {
    let running = false;
    let lastError;
    const tick = async () => {
        if (running)
            return;
        running = true;
        try {
            await pollOnce(api, send, log, dm, grantRole, syncRoles, onDutyChanged, ticketEffects, onMembersSync, onPanel, onTask);
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