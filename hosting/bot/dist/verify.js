"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVerify = createVerify;
const CACHE_MS = 30_000;
/** Roblox-Verifizierung im Bot: beim Beitritt automatisch, nach Änderungen im Dashboard auf allen Servern. */
function createVerify(api, ops, log = console.error) {
    const cache = new Map();
    const config = async (guildId) => {
        const hit = cache.get(guildId);
        if (hit && Date.now() - hit.at < CACHE_MS)
            return hit.cfg;
        const cfg = await api.service('GET', `/bot/verify/config?guildId=${guildId}`);
        cache.set(guildId, { at: Date.now(), cfg });
        return cfg;
    };
    /** Status holen und anwenden; null = auf diesem Server aus. */
    const sync = async (guildId, userId, discordName) => {
        const s = await api.service('POST', '/bot/verify/status', { guildId, discordId: userId, ...(discordName ? { discordName } : {}) });
        if (!s.enabled || !s.actions)
            return null;
        return { status: s, problems: await ops.apply(guildId, userId, s.actions) };
    };
    return {
        sync,
        /** Beitritt: Verifizierte bekommen sofort Rollen + Nickname, alle anderen die „nicht verifiziert“-Rollen. */
        async joined(m) {
            if (m.bot)
                return;
            const cfg = await config(m.guildId).catch((e) => { log(`Verifizierungs-Einstellungen nicht geladen: ${e instanceof Error ? e.message : e}`); return null; });
            if (!cfg?.enabled || !cfg.autoOnJoin)
                return;
            const r = await sync(m.guildId, m.id, m.displayName).catch((e) => { log(`Verifizierung beim Beitritt fehlgeschlagen: ${e instanceof Error ? e.message : e}`); return null; });
            if (r?.problems.length)
                log(`Verifizierung beim Beitritt (${m.guildId}): ${r.problems.join('; ')}`);
        },
        /** Nach Entfernen/Ändern im Dashboard: auf allen Servern neu setzen. */
        async refreshEverywhere(userId) {
            for (const g of await ops.guildsOf(userId)) {
                const r = await sync(g.guildId, userId, g.displayName).catch((e) => { log(`Verifizierung aktualisieren fehlgeschlagen (${g.guildId}): ${e instanceof Error ? e.message : e}`); return null; });
                if (r?.problems.length)
                    log(`Verifizierung aktualisieren (${g.guildId}): ${r.problems.join('; ')}`);
            }
        },
        clear() { cache.clear(); },
    };
}
//# sourceMappingURL=verify.js.map