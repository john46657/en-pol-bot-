import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

/**
 * Bildschirmfotos der wichtigsten Seiten zur Sichtprüfung des Dashboards (nur mit `SHOTS=1`, schreibt nach test-results/shots).
 * Kein Test im eigentlichen Sinn – prüft nur, dass jede Seite ohne Fehler lädt und nicht leer ist.
 */
test.skip(!process.env['SHOTS'], 'nur mit SHOTS=1');

const session = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

const PAGES: [string, string][] = [
  ['overview', ''],
  ['applications', '/applications'],
  ['submissions', '/submissions'],
  ['team', '/team'],
  ['personnel', '/personnel'],
  ['tickets', '/tickets'],
  ['wanted', '/wanted'],
  ['restrictions', '/restrictions'],
  ['training', '/training'],
  ['shifts', '/shifts'],
  ['panels', '/panels'],
  ['personnel-structure', '/personnel-structure'],
  ['reports', '/reports'],
  ['permissions', '/permissions'],
  ['logs', '/logs'],
  ['design', '/design'],
];
const DIR = 'test-results/shots';

for (const [mode, viewport] of [
  ['dark-desktop', { width: 1440, height: 900 }],
  ['light-desktop', { width: 1440, height: 900 }],
  ['dark-mobile', { width: 390, height: 844 }],
] as const) {
  test(`Fotos ${mode}`, async ({ page, context }) => {
    test.setTimeout(240_000);
    mkdirSync(DIR, { recursive: true });
    const jwt = await session();
    await context.addCookies([
      { name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' },
    ]);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: mode.startsWith('light') ? 'light' : 'dark' });
    await page.addInitScript(
      (m) => {
        try {
          localStorage.setItem('nexus-theme', m);
        } catch {
          /* ignore */
        }
      },
      mode.startsWith('light') ? 'light' : 'dark',
    );
    // etwas Beispieldaten
    if (mode === 'dark-desktop') {
      execFileSync(
        'node',
        ['e2e/seed-record.mjs', E2E.guildId, '900000000000999101', 'Max Mustermann'],
        { encoding: 'utf8' },
      );
      execFileSync(
        'node',
        ['e2e/seed-ticket.mjs', E2E.guildId, '900000000000888101', 'Waffenschein beantragen'],
        { encoding: 'utf8' },
      );
    }
    await page.goto('/login');
    await page.screenshot({ path: `${DIR}/${mode}-login.png` });
    await page.goto('/servers');
    await page.waitForSelector('.server-grid li', { timeout: 15000 }).catch(() => undefined);
    await page.screenshot({ path: `${DIR}/${mode}-servers.png` });
    for (const [name, path] of PAGES) {
      await page.goto(`/guilds/${E2E.guildId}${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1200);
      await expect(page.locator('body')).not.toBeEmpty();
      await page.screenshot({ path: `${DIR}/${mode}-${name}.png`, fullPage: false });
    }
  });
}
