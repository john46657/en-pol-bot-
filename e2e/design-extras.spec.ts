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
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Praxistest Phase 44: eigene Schrift, Button „Fenster öffnen“, Bild-Overlay, eigene Seiten-Adresse, Änderungsprotokoll. */
test('Extras: Webfont, Modal-Button, Overlay, Seiten-Adresse, Protokoll', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.locator('fieldset').first()).toBeVisible();
  const copy = page.getByRole('button', { name: 'Eigene Kopie zum Bearbeiten anlegen' });
  if (await copy.isVisible()) await copy.click();
  await expect(page.getByText('ist eine Vorlage')).toHaveCount(0);

  // --- Eigene Schrift ---
  await page.getByRole('tab', { name: /Typografie/ }).click();
  await page
    .getByLabel('Hauptschrift', { exact: true })
    .selectOption({ label: 'Eigene Schrift (Webfont-Adresse)' });
  await page.getByRole('textbox', { name: 'Name der eigenen Schrift' }).fill('TestSchrift');
  await page
    .getByRole('textbox', { name: /^Adresse der Schriftdatei/ })
    .fill('https://example.org/fonts/test.woff2');
  await expect
    .poll(() => page.locator('style#nexus-preview-font').evaluate((e) => e.textContent))
    .toContain('font-family:"TestSchrift"'); // Vorschau lädt sie

  // --- Seite mit eigener Adresse, Modal-Button, Bild mit Overlay ---
  await page.getByRole('tab', { name: /Seiten & Widgets/ }).click();
  await page.getByRole('button', { name: '+ Seite erstellen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Neue Seite' });
  await dlg.getByLabel('Name', { exact: true }).fill('Dienstregeln');
  await dlg.getByLabel(/Adresse \(URL/).fill('Regeln!');
  await expect(dlg.getByText('…/p/regeln')).toBeVisible(); // Sonderzeichen entfernt, klein
  await dlg.getByRole('button', { name: 'Erstellen' }).click();
  await expect(page.getByLabel('Seite wählen')).toHaveValue('page-regeln');

  await page.getByRole('button', { name: 'Link hinzufügen' }).click();
  const insp = page.locator('.we-insp');
  await insp.getByLabel('Aktion').selectOption({ label: 'Fenster mit Text öffnen' });
  await insp.getByLabel('Titel des Fensters').fill('Unsere Regeln');
  await insp.locator('textarea').fill('# Regel 1\n- Respekt\n- Funkdisziplin');
  await insp.getByLabel('Text', { exact: true }).fill('Regeln lesen');

  await page.getByRole('button', { name: 'Bild hinzufügen' }).click();
  await insp
    .locator('input[type=file]')
    .setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Bild hochgeladen')).toBeVisible();
  await insp.getByLabel(/Overlay-Deckkraft/).fill('50');
  await insp.getByLabel('Titel (leer = Standard)').fill('Dienstbild');

  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();

  // --- Im Dashboard ---
  await page.goto(`/guilds/${E2E.guildId}/p/regeln`);
  const main = page.locator('.content');
  await expect(main.getByRole('heading', { name: /Dienstregeln/ })).toBeVisible();
  await expect
    .poll(() => page.locator('style#nexus-custom-font').evaluate((e) => e.textContent))
    .toContain('"TestSchrift"');
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--font-main')),
  ).toContain('"TestSchrift"');
  // Overlay
  const img = main.getByRole('region', { name: 'Dienstbild' });
  await expect(img.locator('.wg-overlay')).toHaveCSS('opacity', '0.5');
  // Modal-Button
  await main.getByRole('button', { name: 'Regeln lesen' }).click();
  const modal = page.getByRole('dialog', { name: 'Unsere Regeln' });
  await expect(modal.getByRole('heading', { name: 'Regel 1' })).toBeVisible();
  await expect(modal.getByRole('listitem')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);

  // --- Änderungsprotokoll ---
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.locator('fieldset').first()).toBeVisible();
  await page.getByRole('tab', { name: /Themes/ }).click();
  const log = page.getByRole('list', { name: 'Änderungsprotokoll' });
  await expect(log).toContainText('Theme geändert');
  await expect(log).toContainText('Bild hochgeladen');
  await expect(log).toContainText(E2E.ownerId);
});

/** Praxistest Phase 45: serverweite Überschreibungen sichtbar, einzeln und gesammelt zurücksetzbar. */
test('Überschreibungen: anzeigen, einzeln und alle entfernen', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(60_000);
  const jwt = await session();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const API = `http://localhost:3000/api/v1`;
  const put = await request.put(`${API}/guilds/${E2E.guildId}/design/overrides`, {
    headers: { Authorization: `Bearer ${jwt}` },
    data: { overrides: { radius: 4, colors: { dark: { primary: '#FF0000' } } } },
  });
  expect(put.ok(), await put.text()).toBe(true);
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await page.getByRole('tab', { name: /Themes/ }).click();
  const list = page.getByRole('list', { name: 'Überschreibungen' });
  await expect(list).toContainText('colors.dark.primary');
  await list
    .getByRole('listitem')
    .filter({ hasText: 'colors.dark.primary' })
    .getByRole('button', { name: 'Zurücksetzen' })
    .click();
  await expect(list).not.toContainText('colors.dark.primary');
  await page.getByRole('button', { name: 'Alle Überschreibungen entfernen' }).click();
  await expect(page.getByText('Keine Überschreibungen aktiv.')).toBeVisible();
});
