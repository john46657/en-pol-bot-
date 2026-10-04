"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const zod_1 = require("zod");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    PORT: zod_1.z.coerce.number().default(3000),
    DATABASE_URL: zod_1.z.string().min(1),
    SESSION_SECRET: zod_1.z.string().min(16).default('dev-only-insecure-session-secret'),
    /** Swagger UI unter /api/docs. Standard: nur in Entwicklung (in Produktion würde es die API-Struktur öffentlich zeigen). */
    ENABLE_SWAGGER: zod_1.z.enum(['true', 'false']).optional(),
    /** Gemeinsames Geheimnis zwischen API und Discord-Bot (mind. 32 Zeichen). Leer = Bot-Zugang komplett deaktiviert. */
    BOT_API_TOKEN: zod_1.z.string().min(32).optional(),
    /** Session-Cookie nur über HTTPS senden. Standard: an in Produktion. Nur auf `false` setzen, wenn der Dienst ohne HTTPS-Proxy betrieben wird (dann sind Passwörter/Sessions im Klartext unterwegs!). */
    COOKIE_SECURE: zod_1.z.enum(['true', 'false']).optional(),
    /** Verzeichnis mit dem gebauten Web-Frontend; wenn gesetzt, liefert die API es selbst aus (Ein-Prozess-Betrieb). */
    WEB_DIST: zod_1.z.string().optional(),
    LOGIN_RATE_LIMIT: zod_1.z.coerce.number().int().positive().default(10),
    SESSION_TTL_HOURS: zod_1.z.coerce.number().positive().default(12),
    WEB_ORIGIN: zod_1.z.string().default('http://localhost:5173'),
    STORAGE_DIR: zod_1.z.string().default('./uploads'),
});
function loadEnv(source = process.env) {
    // Leere Strings (z. B. aus docker-compose `${VAR:-}`) gelten als nicht gesetzt.
    const env = schema.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
    if (env.NODE_ENV === 'production' && env.SESSION_SECRET === 'dev-only-insecure-session-secret') {
        throw new Error('SESSION_SECRET must be set in production');
    }
    return env;
}
//# sourceMappingURL=env.js.map