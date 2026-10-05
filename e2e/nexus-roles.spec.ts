import { execFileSync } from 'node:child_process';
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

/** Praxistest Phase 57: Dashboard-Rollen anlegen, ändern, Mitglieder, duplizieren, löschen; Profil-Felder; Ticket wieder öffnen/löschen. */
test('Rollen & Rechte: Rolle anlegen, bearbeiten, Mitglied, duplizieren, löschen', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addCookies([{ name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' }]);
  await page.goto(`/guilds/${E2E.guildId}/nexus-roles`);
  await expect(page.getByRole('heading', { name: 'Rollen & Rechte' })).toBeVisible();

  await page.getByPlaceholder('Name der neuen Rolle').fill('Ausbilder E2E');
  await page.getByRole('button', { name: 'Rolle erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Rolle bearbeiten' })).toBeVisible();

  await page.getByLabel('Beschreibung').fill('Bildet neue Beamte aus');
  await page.getByRole('textbox', { name: /Farbe/ }).fill('#3366cc');
  await page.getByRole('spinbutton', { name: /Priorität/ }).fill('7');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Priorität 7').first()).toBeVisible();

  // Mitglied suchen und hinzufügen (befristet)
  await page.getByPlaceholder('Mitglied suchen …').fill('u');
  await page.getByRole('button', { name: 'Suchen' }).last().click();
  const first = page.getByRole('checkbox').nth(1);
  await first.check();
  await page.getByPlaceholder('Tage (leer = unbefristet)').fill('7');
  await page.getByRole('button', { name: /hinzufügen/ }).click();
  await expect(page.getByText(/bis \d/)).toBeVisible();
  await expect(page.getByText('1 Mitglieder')).toBeVisible();

  // Duplizieren: Kopie ist deaktiviert und ohne Mitglieder
  await page.getByRole('button', { name: 'Duplizieren' }).click();
  await expect(page.getByText('Ausbilder E2E (Kopie)').first()).toBeVisible();
  await expect(page.getByText('(deaktiviert)').first()).toBeVisible();

  // Kopie löschen
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Ausbilder E2E (Kopie)')).toHaveCount(0);
});

test('Profile: Farbe, Priorität, Aktiv, Duplizieren', async ({ page, context }) => {
  await context.addCookies([{ name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' }]);
  await page.goto(`/guilds/${E2E.guildId}/profiles`);
  await page.getByPlaceholder('Name des neuen Profils').fill('Profil E2E');
  await page.getByRole('button', { name: 'Leeres Profil' }).click();
  await expect(page.getByRole('heading', { name: 'Profil bearbeiten' })).toBeVisible();
  await page.getByRole('textbox', { name: /Farbe/ }).fill('#aa0000');
  await page.getByRole('spinbutton', { name: /Priorität/ }).fill('3');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Profil gespeichert.')).toBeVisible();
  await page.getByRole('button', { name: 'Duplizieren' }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Profil E2E (Kopie)');
});

test('Tickets: wieder öffnen, Transkript und Ticket löschen', async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addCookies([{ name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' }]);
  execFileSync('node', ['e2e/seed-ticket.mjs', E2E.guildId, '900000000000888002', 'Wiederöffnen Browser', '900000000000999001'], { encoding: 'utf8' });
  await page.goto(`/guilds/${E2E.guildId}/tickets`);
  const row = page.getByRole('listitem').filter({ hasText: 'Wiederöffnen Browser' });
  await row.getByLabel('Schließungsgrund').fill('Problem gelöst');
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: /Archiv/ }).click();
  const closed = page.getByRole('listitem').filter({ hasText: 'Wiederöffnen Browser' });
  await closed.getByRole('button', { name: 'Wieder öffnen' }).click();
  await page.getByRole('button', { name: 'Offene' }).click();
  const reopened = page.getByRole('listitem').filter({ hasText: 'Wiederöffnen Browser' });
  await expect(reopened).toContainText(/offen/);

  // erneut schließen, dann Transkript und Ticket endgültig löschen
  await reopened.getByLabel('Schließungsgrund').fill('Doch erledigt');
  page.once('dialog', (d) => void d.accept());
  await reopened.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.getByRole('button', { name: /Archiv/ }).click();
  const again = page.getByRole('listitem').filter({ hasText: 'Wiederöffnen Browser' });
  page.once('dialog', (d) => void d.accept());
  await again.getByRole('button', { name: 'Transkript löschen' }).click();
  await expect(page.getByText('Transkript gelöscht.')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await again.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Wiederöffnen Browser' })).toHaveCount(0);
});
