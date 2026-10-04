import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Vom Hosting-Panel zugewiesener Port (z. B. bot-hosting.net). Hat Vorrang vor `PORT`, damit ein altes `PORT=3000` die Domain nicht ins Leere zeigen lässt. */
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  /** Adresse, auf der die API lauscht. `0.0.0.0` = von außen erreichbar (nötig hinter dem Panel-Proxy); nie nur 127.0.0.1. */
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16).default('dev-only-insecure-session-secret'),
  /** Swagger UI unter /api/docs. Standard: nur in Entwicklung (in Produktion würde es die API-Struktur öffentlich zeigen). */
  ENABLE_SWAGGER: z.enum(['true', 'false']).optional(),
  /** Gemeinsames Geheimnis zwischen API und Discord-Bot (mind. 32 Zeichen). Leer = Bot-Zugang komplett deaktiviert. */
  BOT_API_TOKEN: z.string().min(32).optional(),
  /** Session-Cookie nur über HTTPS senden. Standard: an in Produktion. Nur auf `false` setzen, wenn der Dienst ohne HTTPS-Proxy betrieben wird (dann sind Passwörter/Sessions im Klartext unterwegs!). */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Verzeichnis mit dem gebauten Web-Frontend; wenn gesetzt, liefert die API es selbst aus (Ein-Prozess-Betrieb). */
  WEB_DIST: z.string().optional(),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  STORAGE_DIR: z.string().default('./uploads'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Leere Strings (z. B. aus docker-compose `${VAR:-}`) gelten als nicht gesetzt.
  const env = schema.parse(Object.fromEntries(Object.entries(source).filter(([, v]) => v !== '')));
  if (env.NODE_ENV === 'production' && env.SESSION_SECRET === 'dev-only-insecure-session-secret') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  // Der Port des Panels gewinnt; danach gilt überall nur noch `env.PORT`
  return { ...env, PORT: env.SERVER_PORT ?? env.PORT };
}
