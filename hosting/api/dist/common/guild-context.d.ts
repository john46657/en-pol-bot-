/** Erste gültige Discord-Server-ID aus Werten wie „123, 456“ (ältere Installationen trugen mehrere ein). */
export declare const firstGuildId: (...values: (string | null | undefined)[]) => string | null;
/** Der Discord-Server dieses Systems (`null` = noch nicht eingerichtet). */
export declare const homeGuild: () => string | null;
/** Nur für den HomeServerService: Wert aus Einstellungen bzw. Bot-Meldung. */
export declare const setStoredHomeGuild: (guildId: string | null) => void;
/** Gehört diese Discord-Server-ID zu diesem System? Solange keiner eingerichtet ist, wird nichts abgewiesen (Ersteinrichtung). */
export declare const isHomeGuild: (guildId: string | null | undefined) => boolean;
