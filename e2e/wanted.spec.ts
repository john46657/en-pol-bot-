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

/** Praxistest Phase 46: Fahndung mit Laufzeit anlegen, Ablauf sichtbar, abgelaufene Fahndung nicht mehr aktiv. */
test('Fahndungen: Standarddauer, Laufzeit, Ablauf', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const jwt = await session();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const API = `http://localhost:3000/api/v1/guilds/${E2E.guildId}/wanted`;
  const headers = { Authorization: `Bearer ${jwt}` };
  await page.goto(`/guilds/${E2E.guildId}/wanted`);
  await expect(
    page.getByText('Neue Fahndungen laufen nach 20 Minuten automatisch ab'),
  ).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Ablauf Testperson');
  await page.getByLabel('Fahndungsgrund').fill('Browser-Test Ablauf');
  await page.getByRole('button', { name: 'Erstellen' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Ablauf Testperson' });
  await expect(row).toContainText('läuft ab um');

  // Ablauf erzwingen wie nach 20 Minuten: Standarddauer ändern bleibt unberührt, Fahndung wird beendet
  const list = await (
    await request.get(`${API}?kind=PERSON&query=Ablauf%20Testperson`, { headers })
  ).json();
  const id = list.items[0].id as string;
  const { execFileSync } = await import('node:child_process');
  expect(id).toBeTruthy();
  execFileSync('node', ['e2e/expire-wanted.mjs', id], { stdio: 'inherit' });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Fahndungen' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Ablauf Testperson' })).toHaveCount(0); // Filter „Aktiv“
  await page.getByLabel('Status', { exact: true }).selectOption('EXPIRED');
  await expect(page.getByRole('listitem').filter({ hasText: 'Ablauf Testperson' })).toContainText(
    'automatisch abgelaufen',
  );

  // Standarddauer ändern
  await page.getByLabel('Neue Standarddauer in Minuten (0 = nie)').fill('35');
  const saved = page.waitForResponse((r) => r.url().endsWith('/wanted/settings') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Speichern' }).last().click();
  const res = await saved;
  expect(res.status(), await res.text()).toBe(200);
  await expect(
    page.getByText('Neue Fahndungen laufen nach 35 Minuten automatisch ab'),
  ).toBeVisible();
  await request.put(`${API}/settings`, { headers, data: { defaultMinutes: 20 } });
});
