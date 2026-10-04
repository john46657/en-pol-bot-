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

/** Praxistest Phase 38: Design-Editor im echten Browser (echte API, Fake-Discord). */
test('Design-Editor: Kopie anlegen, Farbe ändern, Live-Vorschau, speichern, im Dashboard wirksam', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.getByRole('heading', { name: /Design & Erscheinungsbild/ })).toBeVisible();

  // Vorlage ist schreibgeschützt – erst eine eigene Kopie anlegen (falls noch keine aktiv ist)
  await expect(page.locator('fieldset').first()).toBeVisible(); // Theme ist geladen
  const copy = page.getByRole('button', { name: 'Eigene Kopie zum Bearbeiten anlegen' });
  if (await copy.isVisible()) {
    await expect(page.getByText('ist eine Vorlage und kann nicht verändert werden')).toBeVisible();
    await copy.click();
  }
  await expect(page.getByText('ist eine Vorlage')).toHaveCount(0);

  // Farben-Tab: Primärfarbe per HEX ändern → Vorschau sofort, Speicherleiste erscheint
  await page.getByRole('tab', { name: /Farben/ }).click();
  const hex = page.getByLabel('Primärfarbe HEX');
  await hex.fill('#FF8800');
  const pv = page.locator('.pv');
  await expect(pv).toHaveCSS('--primary', '#FF8800');
  await expect(page.getByText('Ungespeicherte Änderungen')).toBeVisible();
  // Ungültige Eingabe wird nicht übernommen
  await hex.fill('#GG');
  await expect(pv).toHaveCSS('--primary', '#FF8800');
  await hex.fill('#FF8800');

  // Zurücksetzen einer einzelnen Einstellung
  await page.getByRole('button', { name: 'Primärfarbe zurücksetzen' }).click();
  await expect(pv).toHaveCSS('--primary', '#5865F2');
  await hex.fill('#FF8800');

  // Geräte-Umschaltung
  await page.getByRole('button', { name: /Mobil/ }).click();
  await expect(page.locator('.pv-frame')).toHaveAttribute('data-device', 'mobile');
  await page.getByRole('button', { name: /Desktop/ }).click();

  // Verwerfen, dann erneut ändern und speichern
  await page.getByRole('button', { name: 'Änderungen verwerfen' }).click();
  await expect(page.getByText('Ungespeicherte Änderungen')).toHaveCount(0);
  await hex.fill('#FF8800');
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();
  await expect(page.getByText('Ungespeicherte Änderungen')).toHaveCount(0);

  // Wirkt im echten Dashboard (andere Seite, Neuladen)
  await page.goto(`/guilds/${E2E.guildId}`);
  await page.waitForLoadState('networkidle');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--primary')))
    .toBe('#FF8800');

  // Themes-Tab: Versionsverlauf und Theme-Liste
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await page.getByRole('tab', { name: /Themes/ }).click();
  await expect(page.getByText(/Versionsverlauf von/)).toBeVisible();
  await expect(page.getByText('Farben: ').first()).toBeVisible(); // Verlauf und Protokoll nennen es mehrfach
  expect(problems).toEqual([]);
});
