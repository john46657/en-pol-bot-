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

/** Praxistest Phase 41: eigene Seite aus Vorlage, Banner (aktuell/abgelaufen), im echten Dashboard. */
test('Seiten & Banner: Seite aus Vorlage erstellen, Banner anlegen → Menü, Seite, Banner im Dashboard', async ({
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

  // --- Seite aus Vorlage ---
  await page.getByRole('tab', { name: /Seiten & Widgets/ }).click();
  await page.getByRole('button', { name: '+ Seite erstellen' }).click();
  const dlg = page.getByRole('dialog', { name: 'Neue Seite' });
  await dlg.getByLabel('Name', { exact: true }).fill('Fortbildung');
  await dlg.getByLabel('Icon', { exact: true }).fill('🎓');
  await dlg.getByLabel('Beschreibung', { exact: true }).fill('Fortbildungsübersicht');
  await dlg.getByLabel('Vorlage').selectOption({ label: 'Statistik-Seite' });
  await expect(dlg.getByText('…/p/fortbildung')).toBeVisible();
  await dlg.getByRole('button', { name: 'Erstellen' }).click();
  await expect(page.getByLabel('Seite wählen')).toHaveValue('page-fortbildung');
  await expect(page.getByLabel('Widget-Leinwand').locator('.we-item')).toHaveCount(6);

  // --- Banner ---
  await page.getByRole('tab', { name: /^📢 Banner/ }).click();
  await page.getByRole('button', { name: '+ Banner erstellen' }).click();
  const b = page.locator('.we-insp');
  await b.getByLabel('Titel', { exact: true }).fill('Wichtige Information');
  await b.locator('textarea').fill('Die neuen **Dienstanweisungen** sind verfügbar.');
  await b.getByLabel('Aktion').selectOption({ label: 'Externe Adresse (https)' });
  await b.getByRole('textbox', { name: /^Adresse \(https\)/ }).fill('https://example.org/dienst');
  await b.getByLabel('Text', { exact: true }).fill('Mehr erfahren');
  await expect(b.locator('.banner').getByRole('link', { name: 'Mehr erfahren' })).toBeVisible(); // Vorschau

  // zweites Banner, bereits abgelaufen
  await page.getByRole('button', { name: '+ Banner erstellen' }).click();
  const b2 = page.locator('.we-insp');
  await b2.getByLabel('Titel', { exact: true }).fill('Abgelaufene Info');
  await b2.getByLabel(/Ablaufdatum/).fill('2020-01-01');

  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();

  // --- Im Dashboard ---
  await page.goto(`/guilds/${E2E.guildId}`);
  const nav = page.getByRole('complementary', { name: 'Navigation' });
  const main = page.locator('.content');
  // Banner auf der Übersicht, abgelaufenes nicht
  const banner = main.getByRole('complementary', { name: 'Wichtige Information' });
  await expect(banner).toContainText('Dienstanweisungen');
  await expect(banner.locator('strong').nth(1)).toHaveText('Dienstanweisungen');
  await expect(banner.getByRole('link', { name: 'Mehr erfahren' })).toHaveAttribute(
    'href',
    'https://example.org/dienst',
  );
  await expect(banner.getByRole('link', { name: 'Mehr erfahren' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await expect(main.getByText('Abgelaufene Info')).toHaveCount(0);

  // Seite im Menü, öffnen
  await nav.getByRole('link', { name: /Fortbildung/ }).click();
  await expect(page).toHaveURL(new RegExp(`/guilds/${E2E.guildId}/p/fortbildung$`));
  await expect(main.getByRole('heading', { name: /Fortbildung/ })).toBeVisible();
  await expect(main.getByText('Fortbildungsübersicht')).toBeVisible();
  await expect(main.getByRole('region', { name: 'Offene Tickets' })).toContainText('1'); // das Testticket (Seed)
  await expect(main.getByRole('region', { name: 'Im Dienst' })).toBeVisible();
  await expect(main.getByRole('region', { name: 'Bewerbungen nach Status' })).toBeVisible();
  await expect(main.getByRole('complementary', { name: 'Wichtige Information' })).toBeVisible(); // Banner auch hier

  // Banner auch auf einer eingebauten Seite
  await page.goto(`/guilds/${E2E.guildId}/tickets`);
  await expect(
    page.locator('.content').getByRole('complementary', { name: 'Wichtige Information' }),
  ).toBeVisible();

  // Unbekannte Seite
  await page.goto(`/guilds/${E2E.guildId}/p/gibts-nicht`);
  await expect(page.getByRole('heading', { name: 'Seite nicht gefunden' })).toBeVisible();
});
