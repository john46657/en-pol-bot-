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

/** Praxistest Phase 51: Dienstgrad mit Symbol und Farbe anlegen, bearbeiten, deaktivieren (Symbol bleibt), Vergabe-Modus der Dienstnummer. */
test('Dienstgrade: Symbol, Farbe, Bearbeiten; Dienstnummer-Vergabe einstellen', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  const form = page.locator('form').filter({ hasText: 'Rangfolge' });
  await page.goto(`/guilds/${E2E.guildId}/personnel-structure`);
  await expect(page.getByRole('heading', { name: 'Dienstgrade', exact: true })).toBeVisible();

  await form.getByLabel('Name', { exact: true }).fill('Kommissar E2E');
  await form.getByLabel('Symbol (z. B. ⭐)').fill('🔷');
  await form.getByLabel('Farbe des Dienstgrads').fill('#aa3300');
  await form.getByRole('button', { name: 'Dienstgrad anlegen' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Kommissar E2E' });
  await expect(row).toContainText('🔷 Kommissar E2E');

  await row.getByRole('button', { name: 'Deaktivieren' }).click();
  await expect(row).toContainText('deaktiviert');
  await expect(row).toContainText('🔷'); // Symbol geht beim Umschalten nicht verloren

  await row.getByRole('button', { name: 'Bearbeiten' }).click();
  await form.getByLabel('Name', { exact: true }).fill('Kommissar E2E neu');
  await form.getByRole('button', { name: 'Dienstgrad speichern' }).click();
  const renamed = page.getByRole('listitem').filter({ hasText: 'Kommissar E2E neu' });
  await expect(renamed).toContainText('🔷');
  await expect(renamed).toContainText('deaktiviert'); // Status bleibt beim Bearbeiten

  await page.getByLabel('Automatische Vergabe').selectOption('ACCEPT');
  await page.getByRole('button', { name: 'Speichern' }).first().click();
  await page.reload();
  await expect(page.getByLabel('Automatische Vergabe')).toHaveValue('ACCEPT');
});
