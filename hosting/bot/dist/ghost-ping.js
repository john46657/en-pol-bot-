"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GHOST_PING_WINDOW_MS = void 0;
exports.ghostPingTargets = ghostPingTargets;
exports.ghostPingText = ghostPingText;
exports.createGhostPing = createGhostPing;
/** Nur frisch gelöschte Nachrichten zählen – wer eine alte Nachricht aufräumt, „ghost-pingt“ niemanden. */
exports.GHOST_PING_WINDOW_MS = 15 * 60_000;
const CACHE_MS = 60_000;
/** Wer wurde geghost-pinged? Erwähnte Personen ohne Bots und ohne den Absender selbst. */
function ghostPingTargets(m, now = Date.now()) {
    if (m.authorBot || now - m.createdAt.getTime() > exports.GHOST_PING_WINDOW_MS)
        return [];
    return [...new Set(m.mentions.filter((u) => !u.bot && u.id !== m.authorId).map((u) => u.id))];
}
/** Text wie beim alten Bot: „@Person, Da war jemand sehr böse ! @Absender hat dich geghost-pinged mit dieser Nachricht !: "…"“. */
function ghostPingText(m, targets) {
    // @everyone/@here entschärfen; ohne Message-Content-Intent ist der Inhalt leer → die Erwähnungen zeigen
    const raw = m.content.trim() || targets.map((t) => `<@${t}>`).join(' ');
    const quoted = raw.replace(/@(everyone|here)/g, '@​$1').slice(0, 1500);
    return `${targets.map((t) => `<@${t}>`).join(', ')},\nDa war jemand sehr böse ! <@${m.authorId}> hat ${targets.length > 1 ? 'euch' : 'dich'} geghost-pinged mit dieser Nachricht !: "${quoted}"`;
}
/** Ghost-Ping-Meldung: an/aus im Dashboard (Einstellungen → Discord-Bot), Standard an. */
function createGhostPing(api, actions, log = console.error) {
    let cached;
    const enabled = async () => {
        if (cached && Date.now() - cached.at < CACHE_MS)
            return cached.enabled;
        const r = await api.service('GET', '/bot/ghost-ping').catch(() => ({ enabled: cached?.enabled ?? true }));
        cached = { at: Date.now(), enabled: r.enabled !== false };
        return cached.enabled;
    };
    return {
        async deleted(m) {
            const targets = ghostPingTargets(m);
            if (!targets.length || !(await enabled()))
                return;
            // nur die Geghost-Pingten werden benachrichtigt, der Absender nur genannt
            await actions.post(m.channelId, { content: ghostPingText(m, targets), mentionUserIds: targets }).catch((e) => log(`Ghost-Ping-Nachricht fehlgeschlagen: ${e instanceof Error ? e.message : e}`));
        },
    };
}
//# sourceMappingURL=ghost-ping.js.map