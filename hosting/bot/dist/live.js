"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLive = createLive;
const format_1 = require("./format");
const STATE_KEY = { danger: 'danger-panel', teamlist: 'teamlist' };
/**
 * Selbst aktualisierende Nachrichten (Gefahrenstatus-Panel, Teamliste).
 * Wo die Nachricht steht, speichert die API (`/bot/state/...`) – so überlebt es Neustarts des Bots.
 * Bearbeitet wird nur, wenn sich der Inhalt geändert hat (keine unnötigen Discord-Aufrufe).
 */
function createLive(api, platform, log = console.log) {
    const lastContent = {};
    async function render(kind) {
        if (kind === 'danger') {
            const s = await api.service('GET', '/bot/danger');
            return { embed: (0, format_1.dangerEmbed)(s), buttons: (0, format_1.dangerButtons)(s) };
        }
        const t = await api.service('GET', '/bot/team');
        return { embed: (0, format_1.teamlistEmbed)(t.members, t.rankOrder), buttons: undefined };
    }
    /**
     * Zeichnet die Nachricht neu. `channelId` setzt den Ort (z. B. per Befehl); sonst gilt der gespeicherte Ort,
     * bei der Teamliste vorrangig der in den Einstellungen konfigurierte Channel.
     */
    async function refresh(kind, o = {}) {
        const stored = (await api.service('GET', `/bot/state/${STATE_KEY[kind]}`)).value;
        let channelId = o.channelId ?? stored?.channelId;
        if (!o.channelId && kind === 'teamlist')
            channelId = (await api.service('GET', '/bot/config')).teamlist ?? channelId;
        if (!channelId)
            return null;
        const { embed, buttons } = await render(kind);
        const content = JSON.stringify(embed);
        const sameSpot = stored?.channelId === channelId && !!stored.messageId;
        if (sameSpot && !o.force && lastContent[kind] === content)
            return stored;
        const messageId = await platform.postOrEdit({ channelId, messageId: sameSpot ? stored.messageId : undefined, embed, buttons });
        lastContent[kind] = content;
        // Neu platziert (anderer Kanal) → altes Panel entfernen, damit nur eins existiert
        if (!sameSpot && stored?.messageId && o.force && platform.deleteMessage)
            await platform.deleteMessage(stored.channelId, stored.messageId).catch(() => undefined);
        const placement = { channelId, messageId };
        if (!sameSpot || stored?.messageId !== messageId)
            await api.service('PUT', `/bot/state/${STATE_KEY[kind]}`, { value: placement });
        return placement;
    }
    /** Regelmäßiger Abgleich (z. B. Dienststatus aus dem Web, Gefahrenstatus aus der Leitstelle). Fehler beenden die Schleife nicht. */
    function start(seconds) {
        let running = false;
        let lastError;
        const tick = async () => {
            if (running)
                return;
            running = true;
            try {
                for (const k of ['danger', 'teamlist'])
                    await refresh(k);
                lastError = undefined;
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (msg !== lastError) {
                    log(`live messages: refresh failed: ${msg} (will keep retrying quietly)`);
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
    return { refresh, start };
}
//# sourceMappingURL=live.js.map