import { defineConfig } from '@playwright/test';

const DB_PORT = 54340, API_PORT = 3100, WEB_PORT = 5174;
export const API_URL = `http://localhost:${API_PORT}`;
export const ADMIN_PASSWORD = 'e2e-admin-password-123';
const env = { DATABASE_URL: `postgresql://enrp:enrp@localhost:${DB_PORT}/enrp`, PORT: String(API_PORT), WEB_ORIGIN: `http://localhost:${WEB_PORT}`, ADMIN_PASSWORD, NODE_ENV: 'development', LOGIN_RATE_LIMIT: '1000', BOT_API_TOKEN: 'e2e-bot-token-0123456789-abcdefghijklmnop' };

/** E2E: eigene Wegwerf-Datenbank, API und Vite auf separaten Ports. Nutzt das installierte Google Chrome (kein Browser-Download). */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'rm -rf .pgdata-e2e && pnpm --filter @enrp/api dev:db', env: { DEV_DB_PORT: String(DB_PORT), DEV_DB_DIR: '../../.pgdata-e2e' }, port: DB_PORT, reuseExistingServer: false, timeout: 90_000 },
    { command: 'pnpm --filter @enrp/api exec prisma migrate deploy && pnpm --filter @enrp/api db:seed && pnpm --filter @enrp/api dev', env, url: `${API_URL}/health`, reuseExistingServer: false, timeout: 90_000 },
    { command: 'pnpm --filter @enrp/web dev', env: { WEB_PORT: String(WEB_PORT), API_URL }, port: WEB_PORT, reuseExistingServer: false, timeout: 60_000 },
  ],
});
