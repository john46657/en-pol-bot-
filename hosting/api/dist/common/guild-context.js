"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHomeGuild = exports.setStoredHomeGuild = exports.homeGuild = exports.firstGuildId = void 0;
/**
 * Das System arbeitet mit GENAU EINEM, fest konfigurierten Discord-Server (keine Server-Auswahl, kein `X-Guild-Id`).
 * Woher er kommt (in dieser Reihenfolge): Umgebungsvariable `DISCORD_GUILD_ID` → Einstellung „Discord-Server-ID“
 * (`discord.channels.guildId`) → der einzige Server, auf dem der Bot ist. Den gespeicherten Teil lädt der HomeServerService.
 * Rollen, Rechte, Einstellungen und alle Fachdaten sind zentral – die Server-ID wird nur für Discord selbst gebraucht
 * (Kanäle, Rollen, Mitgliedschaft, Bot-Befehle).
 */
const DISCORD_ID = /^\d{15,25}$/;
let stored = null;
/** Erste gültige Discord-Server-ID aus Werten wie „123, 456“ (ältere Installationen trugen mehrere ein). */
const firstGuildId = (...values) => values.filter(Boolean).join(',').split(/[\s,;]+/).find((g) => DISCORD_ID.test(g)) ?? null;
exports.firstGuildId = firstGuildId;
/** Der Discord-Server dieses Systems (`null` = noch nicht eingerichtet). */
const homeGuild = () => (0, exports.firstGuildId)(process.env.DISCORD_GUILD_ID) ?? stored;
exports.homeGuild = homeGuild;
/** Nur für den HomeServerService: Wert aus Einstellungen bzw. Bot-Meldung. */
const setStoredHomeGuild = (guildId) => { stored = guildId; };
exports.setStoredHomeGuild = setStoredHomeGuild;
/** Gehört diese Discord-Server-ID zu diesem System? Solange keiner eingerichtet ist, wird nichts abgewiesen (Ersteinrichtung). */
const isHomeGuild = (guildId) => { const h = (0, exports.homeGuild)(); return !h || guildId === h; };
exports.isHomeGuild = isHomeGuild;
//# sourceMappingURL=guild-context.js.map