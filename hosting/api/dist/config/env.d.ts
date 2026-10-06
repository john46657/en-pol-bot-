import { z } from 'zod';
declare const schema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    PORT: z.ZodDefault<z.ZodNumber>;
    /** Vom Hosting-Panel zugewiesener Port (z. B. bot-hosting.net). Hat Vorrang vor `PORT`, damit ein altes `PORT=3000` die Domain nicht ins Leere zeigen lässt. */
    SERVER_PORT: z.ZodOptional<z.ZodNumber>;
    /** Adresse, auf der die API lauscht. `0.0.0.0` = von außen erreichbar (nötig hinter dem Panel-Proxy); nie nur 127.0.0.1. */
    HOST: z.ZodDefault<z.ZodString>;
    DATABASE_URL: z.ZodString;
    SESSION_SECRET: z.ZodDefault<z.ZodString>;
    /** Swagger UI unter /api/docs. Standard: nur in Entwicklung (in Produktion würde es die API-Struktur öffentlich zeigen). */
    ENABLE_SWAGGER: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    /** Gemeinsames Geheimnis zwischen API und Discord-Bot (mind. 32 Zeichen). Leer = Bot-Zugang komplett deaktiviert. */
    BOT_API_TOKEN: z.ZodOptional<z.ZodString>;
    /** Session-Cookie nur über HTTPS senden. Standard: an in Produktion. Nur auf `false` setzen, wenn der Dienst ohne HTTPS-Proxy betrieben wird (dann sind Passwörter/Sessions im Klartext unterwegs!). */
    COOKIE_SECURE: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    /** Verzeichnis mit dem gebauten Web-Frontend; wenn gesetzt, liefert die API es selbst aus (Ein-Prozess-Betrieb). */
    WEB_DIST: z.ZodOptional<z.ZodString>;
    LOGIN_RATE_LIMIT: z.ZodDefault<z.ZodNumber>;
    SESSION_TTL_HOURS: z.ZodDefault<z.ZodNumber>;
    WEB_ORIGIN: z.ZodDefault<z.ZodString>;
    STORAGE_DIR: z.ZodDefault<z.ZodString>;
    /** „Mit Discord anmelden“: OAuth2-Client-Secret aus dem Discord Developer Portal (OAuth2 → Client Secret). Leer = nur Passwort-Login. */
    DISCORD_CLIENT_SECRET: z.ZodOptional<z.ZodString>;
    /** Application/Client-ID; wird sonst aus DISCORD_TOKEN abgeleitet (gleiche Anwendung wie der Bot). */
    DISCORD_CLIENT_ID: z.ZodOptional<z.ZodString>;
    /** Bot-Token (für Server-Mitgliedschaft und Rollen beim Discord-Login). */
    DISCORD_TOKEN: z.ZodOptional<z.ZodString>;
    DISCORD_GUILD_ID: z.ZodOptional<z.ZodString>;
    /** Discord-IDs (Komma), die beim Discord-Login immer „System Administrator“ sind – damit sich der Besitzer nicht aussperrt. */
    ADMIN_DISCORD_IDS: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    HOST: string;
    DATABASE_URL: string;
    SESSION_SECRET: string;
    LOGIN_RATE_LIMIT: number;
    SESSION_TTL_HOURS: number;
    WEB_ORIGIN: string;
    STORAGE_DIR: string;
    SERVER_PORT?: number | undefined;
    ENABLE_SWAGGER?: "true" | "false" | undefined;
    BOT_API_TOKEN?: string | undefined;
    COOKIE_SECURE?: "true" | "false" | undefined;
    WEB_DIST?: string | undefined;
    DISCORD_CLIENT_SECRET?: string | undefined;
    DISCORD_CLIENT_ID?: string | undefined;
    DISCORD_TOKEN?: string | undefined;
    DISCORD_GUILD_ID?: string | undefined;
    ADMIN_DISCORD_IDS?: string | undefined;
}, {
    DATABASE_URL: string;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    PORT?: number | undefined;
    SERVER_PORT?: number | undefined;
    HOST?: string | undefined;
    SESSION_SECRET?: string | undefined;
    ENABLE_SWAGGER?: "true" | "false" | undefined;
    BOT_API_TOKEN?: string | undefined;
    COOKIE_SECURE?: "true" | "false" | undefined;
    WEB_DIST?: string | undefined;
    LOGIN_RATE_LIMIT?: number | undefined;
    SESSION_TTL_HOURS?: number | undefined;
    WEB_ORIGIN?: string | undefined;
    STORAGE_DIR?: string | undefined;
    DISCORD_CLIENT_SECRET?: string | undefined;
    DISCORD_CLIENT_ID?: string | undefined;
    DISCORD_TOKEN?: string | undefined;
    DISCORD_GUILD_ID?: string | undefined;
    ADMIN_DISCORD_IDS?: string | undefined;
}>;
export type Env = z.infer<typeof schema>;
export declare function loadEnv(source?: NodeJS.ProcessEnv): Env;
export {};
