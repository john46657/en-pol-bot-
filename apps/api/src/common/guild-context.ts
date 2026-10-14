/**
 * Das System arbeitet mit GENAU EINEM, fest konfigurierten Discord-Server (keine Server-Auswahl, kein `X-Guild-Id`).
 * Woher er kommt (in dieser Reihenfolge): Umgebungsvariable `DISCORD_GUILD_ID` → Einstellung „Discord-Server-ID“
 * (`discord.channels.guildId`) → der einzige Server, auf dem der Bot ist. Den gespeicherten Teil lädt der HomeServerService.
 * Rollen, Rechte, Einstellungen und alle Fachdaten sind zentral – die Server-ID wird nur für Discord selbst gebraucht
 * (Kanäle, Rollen, Mitgliedschaft, Bot-Befehle).
 */
const DISCORD_ID = /^\d{15,25}$/;
let stored: string | null = null;

/** Erste gültige Discord-Server-ID aus Werten wie „123, 456“ (ältere Installationen trugen mehrere ein). */
export const firstGuildId = (...values: (string | null | undefined)[]): string | null =>
  values.filter(Boolean).join(',').split(/[\s,;]+/).find((g) => DISCORD_ID.test(g)) ?? null;

/** Der Discord-Server dieses Systems (`null` = noch nicht eingerichtet). */
export const homeGuild = (): string | null => firstGuildId(process.env.DISCORD_GUILD_ID) ?? stored;
/** Nur für den HomeServerService: Wert aus Einstellungen bzw. Bot-Meldung. */
export const setStoredHomeGuild = (guildId: string | null) => { stored = guildId; };
/** Gehört diese Discord-Server-ID zu diesem System? Solange keiner eingerichtet ist, wird nichts abgewiesen (Ersteinrichtung). */
export const isHomeGuild = (guildId: string | null | undefined): boolean => { const h = homeGuild(); return !h || guildId === h; };
