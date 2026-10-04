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

// gültiges 1×1-PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Praxistest Phase 42: Bilder hochladen (geprüft, optimiert), ausliefern, als Logo und Hintergrund verwenden. */
test('Uploads: Logo hochladen, SVG abgelehnt, Bibliothek, Auslieferung, wirksam im Dashboard', async ({
  page,
  context,
  request,
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

  // --- Logo hochladen ---
  await page.getByLabel('Quelle', { exact: true }).selectOption({ label: 'Eigenes Bild (URL)' });
  const fileInput = page.locator('input[type=file]').first();

  // SVG im PNG-Mantel: der Server prüft den Inhalt, nicht den Namen
  await fileInput.setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await expect(page.getByText(/Nur Bilder/)).toBeVisible();

  await fileInput.setInputFiles({ name: 'Mein Logo.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByText('Bild hochgeladen')).toBeVisible();
  const thumb = page.getByAltText('Vorschau des gewählten Bildes');
  await expect(thumb).toBeVisible();
  const src = (await thumb.getAttribute('src'))!;
  expect(src).toMatch(new RegExp(`/uploads/${E2E.guildId}/[0-9a-f]{24}\\.webp$`)); // zu WebP optimiert, Adresse der API

  // Auslieferung: echtes Bild, sichere Header
  const res = await request.get(src);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/webp');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['content-security-policy']).toContain("default-src 'none'");
  expect(
    (await request.get(src.replace(/[0-9a-f]{24}\.webp$/, '../../etc/passwd'))).status(),
  ).not.toBe(200);
  await expect
    .poll(() => thumb.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0); // im Browser geladen

  // Bibliothek: Bild ist gelistet
  await page
    .getByRole('button', { name: /Aus Bibliothek wählen/ })
    .first()
    .click();
  const lib = page.getByRole('dialog', { name: 'Bilder-Bibliothek' });
  await expect(lib.getByText('1 / 100 Bilder')).toBeVisible();
  await expect(lib.getByRole('button', { name: 'Mein Logo.png verwenden' })).toBeVisible();
  await lib.getByRole('button', { name: 'Schließen' }).click();

  // --- Hintergrundbild: gleiches Bild aus der Bibliothek wählen ---
  await page.getByRole('tab', { name: /Hintergrund/ }).click();
  await page.getByLabel('Typ').first().selectOption('image');
  await page.getByRole('button', { name: /Aus Bibliothek wählen/ }).click();
  await page
    .getByRole('dialog', { name: 'Bilder-Bibliothek' })
    .getByRole('button', { name: 'Mein Logo.png verwenden' })
    .click();
  await expect(page.getByAltText('Vorschau des gewählten Bildes')).toBeVisible();

  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();

  // --- Wirksam im Dashboard ---
  await page.goto(`/guilds/${E2E.guildId}`);
  const logo = page.locator('img.logo-img');
  await expect(logo).toHaveAttribute(
    'src',
    new RegExp(`/uploads/${E2E.guildId}/[0-9a-f]{24}\\.webp$`),
  );
  await expect
    .poll(() => logo.evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator('.design-bg')).toHaveCSS('background-image', /uploads\/.*\.webp/);

  // --- Löschen in der Bibliothek ---
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.locator('fieldset').first()).toBeVisible();
  await page.getByLabel('Quelle', { exact: true }).selectOption({ label: 'Eigenes Bild (URL)' });
  await page
    .getByRole('button', { name: /Aus Bibliothek wählen/ })
    .first()
    .click();
  const lib2 = page.getByRole('dialog', { name: 'Bilder-Bibliothek' });
  await lib2.getByRole('button', { name: 'Mein Logo.png löschen' }).click();
  await expect(lib2.getByText('Noch keine Bilder hochgeladen.')).toBeVisible();
  expect((await request.get(src)).status()).toBe(404); // Datei ist weg
});
