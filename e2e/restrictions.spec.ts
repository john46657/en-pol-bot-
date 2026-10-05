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

/** Praxistest Phase 47: Sperre verhängen, in der Liste sehen, aufheben; Menüpunkt vorhanden. */
test('Sperren: verhängen, ansehen, aufheben', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  await page.goto(`/guilds/${E2E.guildId}`);
  await page
    .getByRole('link', { name: /Sperren/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Sperren' })).toBeVisible();
  await expect(page.getByText('Keine Sperren gefunden.')).toBeVisible();

  await page.getByLabel('Betroffene Person', { exact: true }).fill('900000000000555001');
  await expect(page.locator('.user-picker [data-user-id="900000000000555001"]')).toBeVisible();
  await page.getByLabel('Art der Sperre').selectOption({ label: 'Ticketsperre' });
  await page.getByLabel('Grund', { exact: true }).fill('Browser-Test Missbrauch');
  const end = new Date(Date.now() + 3 * 3600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page
    .getByLabel('Ende (leer = unbefristet)')
    .fill(
      `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}T${pad(end.getHours())}:${pad(end.getMinutes())}`,
    );
  await page.getByRole('button', { name: 'Sperre verhängen' }).click();
  const row = page
    .getByRole('list', { name: 'Sperren' })
    .getByRole('listitem')
    .filter({ hasText: 'Browser-Test Missbrauch' });
  await expect(row).toContainText('Ticketsperre');
  await expect(row).toContainText('Aktiv');

  await row.getByPlaceholder('Grund zum Aufheben').fill('Test beendet');
  await row.getByRole('button', { name: 'Aufheben' }).click();
  await expect(page.getByText('Keine Sperren gefunden.')).toBeVisible(); // Filter „Aktiv“
  await page.getByLabel('Status', { exact: true }).selectOption('REVOKED');
  await expect(page.getByRole('list', { name: 'Sperren' })).toContainText(
    'aufgehoben: Test beendet',
  );

  // Spezifikation 53: „Sperre erstellt“ erscheint in der Glocke
  await page.reload();
  await page.getByRole('button', { name: /^Benachrichtigungen/ }).click();
  await expect(page.getByRole('region', { name: 'Benachrichtigungen' })).toContainText(
    'Sperre erstellt',
  );
});
