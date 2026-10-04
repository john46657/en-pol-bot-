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

/** Praxistest Phase 39: Menü bearbeiten – Gruppe, Titel, Badge, Ausblenden, Link, Drag & Drop, im echten Dashboard sichtbar. */
test('Navigation: Gruppe, Umbenennen, Badge, Ausblenden, Link, Drag & Drop → wirksam im Dashboard', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.locator('fieldset').first()).toBeVisible(); // Theme ist geladen
  const copy = page.getByRole('button', { name: 'Eigene Kopie zum Bearbeiten anlegen' });
  if (await copy.isVisible()) await copy.click();
  await expect(page.getByText('ist eine Vorlage')).toHaveCount(0);
  await page.getByRole('tab', { name: /Navigation/ }).click();

  // Gruppe anlegen
  await page.getByLabel('Name der neuen Gruppe').fill('SUPPORT');
  await page.getByRole('button', { name: '+ Gruppe hinzufügen' }).click();
  await expect(page.getByLabel('Name der Gruppe SUPPORT')).toBeVisible();

  // Tickets: umbenennen, in Gruppe, Badge
  await page.getByRole('button', { name: 'Tickets bearbeiten' }).click();
  const edit = page.locator('.nv-edit');
  await edit.getByLabel(/Titel/).fill('Support-Tickets');
  await edit.locator('select').selectOption({ label: 'SUPPORT' });
  await edit.getByLabel(/Badge/).fill('neu');
  await page.getByRole('button', { name: 'Support-Tickets bearbeiten' }).click(); // schließen

  // Logs ausblenden
  await page.getByLabel('Logs sichtbar').uncheck();

  // Eigener Link
  await page.getByLabel('Titel des neuen Links').fill('Diensthandbuch');
  await page.getByLabel('Adresse des neuen Links').fill('javascript:alert(1)');
  await expect(page.getByRole('button', { name: '+ Link hinzufügen' })).toBeDisabled(); // nur https
  await page.getByLabel('Adresse des neuen Links').fill('https://example.org/handbuch');
  await page.getByRole('button', { name: '+ Link hinzufügen' }).click();
  await expect(page.getByLabel('Diensthandbuch sichtbar')).toBeVisible();

  // Vorschau zeigt Gruppe und Badge sofort
  await expect(page.locator('.pv-group')).toHaveText(/SUPPORT/);
  await expect(page.locator('.pv-side .nav-badge')).toHaveText('neu');

  // Drag & Drop: „Abmeldungen“ zwei Plätze nach oben ziehen (kurze Strecke im sichtbaren Bereich)
  const handles = page.locator('.nv-list .nv-handle');
  const titles = () => page.locator('.nv-list > li > .row > .grow').allTextContents();
  const idx = (await titles()).findIndex((t) => t.startsWith('Abmeldungen'));
  expect(idx).toBeGreaterThan(2);
  await handles.nth(idx).scrollIntoViewIfNeeded();
  await handles.nth(idx).dragTo(page.locator('.nv-list > li').nth(idx - 2));
  await expect
    .poll(async () => (await titles()).findIndex((t) => t.startsWith('Abmeldungen')))
    .toBe(idx - 2);

  // Pfeiltasten: „Abmeldungen“ wieder eins nach unten
  await page.getByRole('button', { name: 'Abmeldungen nach unten' }).click();
  await expect
    .poll(async () => (await titles()).findIndex((t) => t.startsWith('Abmeldungen')))
    .toBe(idx - 1);
  const expectedOrder = (await titles())
    .filter((t) => !t.includes('· SUPPORT') && !t.startsWith('Logs'))
    .map((t) => t.split(' ·')[0]!);

  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();

  // Im echten Dashboard
  await page.goto(`/guilds/${E2E.guildId}`);
  const nav = page.getByRole('complementary', { name: 'Navigation' });
  await expect(nav.getByRole('link', { name: /Support-Tickets/ })).toBeVisible();
  await expect(nav.getByRole('link', { name: /Support-Tickets/ })).toContainText('neu');
  await expect(nav.getByText('SUPPORT', { exact: true })).toBeVisible();
  await expect(nav.getByRole('link', { name: /^📜 Logs/ })).toHaveCount(0); // ausgeblendet
  const link = nav.getByRole('link', { name: /Diensthandbuch/ });
  await expect(link).toHaveAttribute('href', 'https://example.org/handbuch');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);
  // Reihenfolge im Menü = Reihenfolge im Editor (ohne ausgeblendete und gruppierte Einträge)
  const labels = (await nav.locator('a').allTextContents()).map((t) =>
    t.replace(/^\S+\s/, '').trim(),
  );
  expectedOrder.forEach((title, i) => expect(labels[i], `Platz ${i}`).toContain(title));

  // Seite „Design“ bleibt trotz allem erreichbar (kein Aussperren)
  await expect(nav.getByRole('link', { name: /Design & Erscheinungsbild/ })).toBeVisible();
});
