import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const API = 'http://localhost:3000/api/v1';
const FAKE = 'http://localhost:4010';
const session = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

/** Praxistest Phase 63: automatische Nachricht anlegen (wöchentlich), Prüfungen, sofort senden, löschen. */
test('Automatische Nachrichten: anlegen, prüfen, senden, löschen', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const jwt = await session();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;

  await page.goto(`/guilds/${E2E.guildId}/messages`);
  await page.getByRole('button', { name: '+ Neue Nachricht' }).click();
  await page.getByLabel('Name (nur intern)').fill('Teammeeting');
  await page.getByLabel('Kanal').selectOption({ label: '#bewerbungen' });
  await page.getByLabel('Text', { exact: true }).fill('Heute ({wochentag}) um 20 Uhr Teammeeting!');
  await page.getByLabel('Wiederholung').selectOption('weekly');
  await page.getByLabel('Uhrzeit').fill('19:30');
  // ohne Wochentag: verständlicher Fehler
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Bitte mindestens einen Wochentag wählen.')).toBeVisible();
  await page.getByLabel('Wochentage').getByLabel('Mi').check();
  await page.getByRole('button', { name: 'Speichern', exact: true }).click();
  await expect(page.getByText('Nachricht gespeichert.')).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Teammeeting' });
  await expect(row).toContainText('19:30 Uhr (Mi)');
  await expect(row).toContainText('Nächster Versand:');
  const saved = (await (await request.get(`${g}/scheduled-messages`, { headers })).json()).find((m: { name: string }) => m.name === 'Teammeeting');
  expect(new Date(saved.nextRunAt).getUTCDay()).toBe(3); // Mittwoch

  await row.getByRole('button', { name: 'Jetzt senden' }).click();
  await expect(page.getByText('Nachricht gesendet.')).toBeVisible();
  const sent = Object.values(await (await request.get(`${FAKE}/__messages`)).json()) as { content?: string }[];
  expect(sent.some((m) => m.content?.startsWith('Heute (') && m.content.includes('Teammeeting'))).toBe(true);

  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Nachricht gelöscht.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Teammeeting' })).toHaveCount(0);
});
