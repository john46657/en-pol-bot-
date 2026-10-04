import { readFileSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

const dotenv = readFileSync('.env', 'utf8');
const fromEnv = (k: string) => new RegExp(`^${k}="?([^"\\n]*)"?`, 'm').exec(dotenv)?.[1] ?? '';
const db = new URL(fromEnv('DATABASE_URL'));
db.pathname = '/nexus_e2e';

/** Gemeinsame Werte für API-Prozess und Test (Session-Signatur). */
export const E2E = {
  authSecret: fromEnv('AUTH_SECRET'),
  issuer: fromEnv('JWT_ISSUER') || 'nexus',
  guildId: '900000000000000001',
  ownerId: '900000000000000010',
};

/**
 * Browser-Test des Dashboards: Fake-Discord (:4010) + echte API (:3000, gebaut) + Vite (:3001),
 * eigene Datenbank nexus_e2e, Anmeldung über eine selbst signierte Session (kein echtes OAuth).
 * Voraussetzung: `pnpm dev:setup` (PostgreSQL/Redis) und `pnpm --filter @nexus/api build`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3101', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node scripts/fake-discord.mjs', port: 4010, reuseExistingServer: true },
    {
      command: 'pnpm exec tsx e2e/prepare-db.mts && pnpm --filter @nexus/api start',
      url: 'http://localhost:3000/api/v1/health/live',
      reuseExistingServer: false,
      timeout: 90_000,
      env: {
        DATABASE_URL: db.toString(),
        AUTH_SECRET: E2E.authSecret,
        STORAGE_DIR: `${process.cwd()}/test-results/uploads`, // hochgeladene Bilder des Tests (gitignored, vor jedem Lauf geleert)
        JWT_ISSUER: E2E.issuer,
        REDIS_URL: `${fromEnv('REDIS_URL').replace(/\/\d+$/, '')}/15`, // eigene Redis-Datenbank, vor jedem Lauf geleert (prepare-db)
        DASHBOARD_URL: 'http://localhost:3101',
        DISCORD_API_BASE: 'http://localhost:4010/api/v10',
        DISCORD_TOKEN: 'fake',
        DISCORD_CLIENT_ID: '1',
        DISCORD_CLIENT_SECRET: 'fake',
        NODE_ENV: 'development',
      },
    },
    {
      command: 'pnpm --filter @nexus/dashboard exec vite --port 3101 --strictPort',
      port: 3101,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
