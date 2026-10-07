"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.welcomeEmbed = welcomeEmbed;
exports.createWelcome = createWelcome;
const shared_1 = require("@enrp/shared");
const CACHE_MS = 30_000;
/** Nachricht (Willkommen oder Abschied) als Embed – leere Titel/Texte fallen weg. */
function welcomeEmbed(def, m, now = Date.now()) {
    const title = (0, shared_1.renderWelcomeText)(def.title, m, now).slice(0, 256);
    const description = (0, shared_1.renderWelcomeText)(def.message, m, now).slice(0, 4000);
    return { title: title || '​', ...(description ? { description } : {}), color: (0, shared_1.hexColor)(def.color), ...(def.showAvatar && m.avatar ? { thumbnail: m.avatar } : {}) };
}
/**
 * Beitritt: Willkommensnachricht, DM, automatische Rollen. Austritt: Abschiedsnachricht und Meldung an das System
 * (offene Bewerbungen/Tickets nach Einstellung). Braucht den privilegierten „Server Members“-Intent.
 */
function createWelcome(api, actions, log = console.error) {
    const cache = new Map();
    const config = async (guildId) => {
        const hit = cache.get(guildId);
        if (hit && Date.now() - hit.at < CACHE_MS)
            return hit.cfg;
        const cfg = await api.service('GET', `/bot/welcome?guildId=${guildId}`);
        cache.set(guildId, { at: Date.now(), cfg });
        return cfg;
    };
    const step = (label, p) => p.catch((e) => log(`${label} failed: ${e instanceof Error ? e.message : e}`));
    const say = (def, m) => (def.enabled && def.channelId
        ? actions.post(def.channelId, { ...(def.pingUser ? { content: `<@${m.id}>`, mentionUserIds: [m.id] } : {}), embed: welcomeEmbed(def, m) })
        : Promise.resolve());
    return {
        async joined(m) {
            if (m.bot)
                return;
            const cfg = await config(m.guildId).catch((e) => { log(`welcome config not loaded: ${e instanceof Error ? e.message : e}`); return null; });
            if (!cfg)
                return;
            await Promise.all([
                step('welcome message', say(cfg.welcome, m)),
                cfg.dm.enabled && cfg.dm.message.trim() ? step('welcome DM', actions.dm(m.id, (0, shared_1.renderWelcomeText)(cfg.dm.message, m).slice(0, 2000))) : undefined,
                cfg.autoRoleIds.length ? step('auto roles', actions.addRoles(m.guildId, m.id, cfg.autoRoleIds)) : undefined,
            ]);
        },
        async left(m) {
            if (m.bot)
                return;
            const cfg = await config(m.guildId).catch((e) => { log(`welcome config not loaded: ${e instanceof Error ? e.message : e}`); return null; });
            await Promise.all([
                cfg ? step('goodbye message', say(cfg.goodbye, m)) : undefined,
                step('member-left actions', api.service('POST', '/bot/member-left', { guildId: m.guildId, discordId: m.id })),
            ]);
        },
        /** Nach dem Speichern im Dashboard nicht 30 s warten müssen (Tests). */
        clear() { cache.clear(); },
    };
}
//# sourceMappingURL=welcome.js.map