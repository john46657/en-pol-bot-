import type { Client, Guild } from 'discord.js';

/**
 * Der eine Discord-Server dieses Systems. Das System nennt ihn (`GET /bot/server`); bis dahin gilt die erste ID aus
 * DISCORD_GUILD_ID der Bot-Konfiguration. Ist (noch) keiner bekannt, arbeitet der Bot wie bisher auf seinen Servern.
 */
let home: string | null = null;
/** Bot auf mehreren Servern, aber keiner eingerichtet: dann gehört KEINER dazu (sonst landeten fremde Server in diesen Akten). */
let several = false;
export const homeGuild = () => home;
export const setHomeGuild = (guildId: string | null | undefined) => { if (guildId && /^\d{15,25}$/.test(guildId)) home = guildId; };
export const setGuildCount = (n: number) => { several = n > 1; };
/**
 * Gehört dieser Discord-Server zum System? Ereignisse und Interaktionen anderer Server werden ignoriert – derselbe Bot kann so
 * auf weiteren Servern laufen, die jeweils eine EIGENE Installation (eigene Datenbank, eigene Akten) haben.
 */
export const isHomeGuild = (guildId: string | null | undefined) => (home ? guildId === home : !several);
/** Server des Bots, auf denen er arbeitet: nur der eigene (solange keiner bekannt ist: alle). */
export const ownGuilds = (c: Client): Guild[] => [...c.guilds.cache.values()].filter((g) => isHomeGuild(g.id));
