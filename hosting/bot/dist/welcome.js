"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.welcomeEmbed = welcomeEmbed;
exports.createWelcome = createWelcome;
const shared_1 = require("@enrp/shared");
const CACHE_MS = 30_000;
/** Nachricht (Willkommen oder Abschied) als Embed – leere Titel/Texte fallen weg. */
function welcomeEmbed(def, m, now = Date.now(), bannerFile) {
    const title = (0, shared_1.renderWelcomeText)(def.title, m, now).slice(0, 256);
    const description = (0, shared_1.renderWelcomeText)(def.message, m, now).slice(0, 4000);
    const image = bannerFile ? `attachment://${bannerFile}` : def.image;
    return { title: title || '​', ...(description ? { description } : {}), color: (0, shared_1.hexColor)(def.color), ...(def.showAvatar && m.avatar ? { thumbnail: m.avatar } : {}), ...(image ? { image } : {}) };
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
    const step = (label, p) => p.catch((e) => log(`${label} fehlgeschlagen: ${e instanceof Error ? e.message : e}`));
    // hochgeladene Banner (Datei bleibt gleich, solange die ID gleich ist)
    const banners = new Map();
    const banner = async (id) => {
        if (!banners.has(id)) {
            const b = await api.service('GET', `/bot/welcome/banner/${id}`);
            if (banners.size > 20)
                banners.clear();
            banners.set(id, { name: b.name.replace(/[^\w.-]/g, '') || 'banner.png', data: Buffer.from(b.data, 'base64') });
        }
        return banners.get(id);
    };
    const say = async (def, m) => {
        if (!def.enabled || !def.channelId)
            return;
        const file = def.imageMediaId ? await banner(def.imageMediaId).catch((e) => { log(`Banner nicht geladen: ${e instanceof Error ? e.message : e}`); return undefined; }) : undefined;
        await actions.post(def.channelId, { ...(def.pingUser ? { content: `<@${m.id}>`, mentionUserIds: [m.id] } : {}), embed: welcomeEmbed(def, m, Date.now(), file?.name), ...(file ? { file } : {}) });
    };
    return {
        async joined(m) {
            if (m.bot)
                return;
            const cfg = await config(m.guildId).catch((e) => { log(`Willkommens-Einstellungen nicht geladen: ${e instanceof Error ? e.message : e}`); return null; });
            if (!cfg)
                return;
            await Promise.all([
                step('Willkommensnachricht', say(cfg.welcome, m)),
                cfg.dm.enabled && cfg.dm.message.trim() ? step('Willkommens-DM', actions.dm(m.id, (0, shared_1.renderWelcomeText)(cfg.dm.message, m).slice(0, 2000))) : undefined,
                cfg.autoRoleIds.length ? step('Auto-Rollen', actions.addRoles(m.guildId, m.id, cfg.autoRoleIds)) : undefined,
            ]);
        },
        async left(m) {
            if (m.bot)
                return;
            const cfg = await config(m.guildId).catch((e) => { log(`Willkommens-Einstellungen nicht geladen: ${e instanceof Error ? e.message : e}`); return null; });
            await Promise.all([
                cfg ? step('Abschiedsnachricht', say(cfg.goodbye, m)) : undefined,
                step('Aktionen beim Verlassen', api.service('POST', '/bot/member-left', { guildId: m.guildId, discordId: m.id })),
            ]);
        },
        /** Test aus dem Dashboard: Nachricht bzw. DM wie beim echten Beitritt/Austritt – auch wenn sie ausgeschaltet ist, ohne Rollen/Aktionen. */
        async test(kind, m) {
            cache.delete(m.guildId); // gerade gespeicherte Einstellungen verwenden
            const cfg = await config(m.guildId);
            if (kind === 'dm') {
                await actions.dm(m.id, (0, shared_1.renderWelcomeText)(cfg.dm.message, m).slice(0, 2000));
                return;
            }
            if (!cfg[kind].channelId)
                throw new Error('Kein Kanal eingestellt');
            await say({ ...cfg[kind], enabled: true }, m);
        },
        /** Nach dem Speichern im Dashboard nicht 30 s warten müssen (Tests). */
        clear() { cache.clear(); },
    };
}
//# sourceMappingURL=welcome.js.map