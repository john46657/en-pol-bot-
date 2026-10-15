"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownGuilds = exports.isHomeGuild = exports.setGuildCount = exports.setHomeGuild = exports.homeGuild = void 0;
/**
 * Der eine Discord-Server dieses Systems. Das System nennt ihn (`GET /bot/server`); bis dahin gilt die erste ID aus
 * DISCORD_GUILD_ID der Bot-Konfiguration. Ist (noch) keiner bekannt, arbeitet der Bot wie bisher auf seinen Servern.
 */
let home = null;
/** Bot auf mehreren Servern, aber keiner eingerichtet: dann gehört KEINER dazu (sonst landeten fremde Server in diesen Akten). */
let several = false;
const homeGuild = () => home;
exports.homeGuild = homeGuild;
const setHomeGuild = (guildId) => { if (guildId && /^\d{15,25}$/.test(guildId))
    home = guildId; };
exports.setHomeGuild = setHomeGuild;
const setGuildCount = (n) => { several = n > 1; };
exports.setGuildCount = setGuildCount;
/**
 * Gehört dieser Discord-Server zum System? Ereignisse und Interaktionen anderer Server werden ignoriert – derselbe Bot kann so
 * auf weiteren Servern laufen, die jeweils eine EIGENE Installation (eigene Datenbank, eigene Akten) haben.
 */
const isHomeGuild = (guildId) => (home ? guildId === home : !several);
exports.isHomeGuild = isHomeGuild;
/** Server des Bots, auf denen er arbeitet: nur der eigene (solange keiner bekannt ist: alle). */
const ownGuilds = (c) => [...c.guilds.cache.values()].filter((g) => (0, exports.isHomeGuild)(g.id));
exports.ownGuilds = ownGuilds;
//# sourceMappingURL=home.js.map