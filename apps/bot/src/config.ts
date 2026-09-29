import 'dotenv/config';

/**
 * Bot-Konfiguration (alle Werte über Env, nichts hardcoded – §149).
 */
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Pflicht-Umgebungsvariable fehlt: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  discord: {
    token: process.env['DISCORD_TOKEN'] ?? '',
    clientId: process.env['DISCORD_CLIENT_ID'] ?? '',
    devGuildId: optional('DISCORD_DEV_GUILD_ID', ''),
  },
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    queuePrefix: optional('QUEUE_PREFIX', 'nexus'),
  },
  api: {
    url: optional('API_URL', 'http://localhost:3000'),
  },
  log: {
    level: optional('LOG_LEVEL', 'info'),
  },
  limits: {
    maxActiveSubmissionsPerUser: Number(optional('NEXUS_MAX_ACTIVE_SUBMISSIONS_PER_USER', '5')),
    maxQuestionsPerApplication: Number(optional('NEXUS_MAX_QUESTIONS_PER_APPLICATION', '100')),
  },
} as const;

export function assertConfig(): void {
  if (!config.discord.token) {
    throw new Error('DISCORD_TOKEN fehlt – Bot kann nicht starten.');
  }
  if (!config.discord.clientId) {
    throw new Error('DISCORD_CLIENT_ID fehlt – Slash-Commands können nicht registriert werden.');
  }
}
