import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16).default('dev-only-insecure-session-secret'),
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
  return env;
}
