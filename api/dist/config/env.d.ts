import { z } from 'zod';
declare const schema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    PORT: z.ZodDefault<z.ZodNumber>;
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
}, "strip", z.ZodTypeAny, {
    NODE_ENV: "development" | "test" | "production";
    PORT: number;
    DATABASE_URL: string;
    SESSION_SECRET: string;
    LOGIN_RATE_LIMIT: number;
    SESSION_TTL_HOURS: number;
    WEB_ORIGIN: string;
    STORAGE_DIR: string;
    ENABLE_SWAGGER?: "true" | "false" | undefined;
    BOT_API_TOKEN?: string | undefined;
    COOKIE_SECURE?: "true" | "false" | undefined;
    WEB_DIST?: string | undefined;
}, {
    DATABASE_URL: string;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    PORT?: number | undefined;
    SESSION_SECRET?: string | undefined;
    ENABLE_SWAGGER?: "true" | "false" | undefined;
    BOT_API_TOKEN?: string | undefined;
    COOKIE_SECURE?: "true" | "false" | undefined;
    WEB_DIST?: string | undefined;
    LOGIN_RATE_LIMIT?: number | undefined;
    SESSION_TTL_HOURS?: number | undefined;
    WEB_ORIGIN?: string | undefined;
    STORAGE_DIR?: string | undefined;
}>;
export type Env = z.infer<typeof schema>;
export declare function loadEnv(source?: NodeJS.ProcessEnv): Env;
export {};
