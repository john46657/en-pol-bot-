import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const session = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

test('ohne Session landet man auf der Anmeldung', async ({ page }) => {
  await page.goto('/servers');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('link', { name: 'Mit Discord anmelden' })).toBeVisible();
});

test.describe('angemeldet als Server-Besitzer', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
    ]);
  });

  test('Serverauswahl → alle Menüseiten laden ohne Fehler', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()))
        problems.push(`console: ${m.text()}`);
    });

    await page.goto('/servers');
    await expect(page.getByText('NEXUS Demo-Server')).toBeVisible();
    // Ohne laufenden Bot zeigt die Auswahl „Bot einladen“; das Dashboard selbst ist trotzdem erreichbar.
    await page.goto(`/guilds/${E2E.guildId}`);

    const hrefs = await page
      .locator('nav a[href^="/guilds/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') as string));
    expect(hrefs.length).toBeGreaterThanOrEqual(25);
    for (const href of hrefs) {
      await page.goto(href);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main, .page, .content').first(), href).toBeVisible();
      await expect(
        page.getByText(/Application error|Cannot read|undefined is not/i),
        href,
      ).toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });

  test('mobile Ansicht: Menü öffnet, kein horizontaler Überlauf', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/guilds/${E2E.guildId}`);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
