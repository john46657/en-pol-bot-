import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const API = 'http://localhost:3000/api/v1';
const session = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

/** Praxistest Phase 62: Sicherung herunterladen, Änderung zurückholen, Teilbereich zurücksetzen. */
test('Sicherung: herunterladen, einspielen, zurücksetzen', async ({ page, context, request }) => {
  test.setTimeout(90_000);
  const jwt = await session();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;
  const app = await (await request.post(`${g}/applications`, { headers, data: { name: 'Backup-Test', slug: `bk-${Date.now()}` } })).json();

  await page.goto(`/guilds/${E2E.guildId}/backup`);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ Sicherung herunterladen' }).click();
  const file = await (await dl).path();
  const backup = JSON.parse(readFileSync(file, 'utf8'));
  expect(backup).toMatchObject({ format: 'nexus-config-backup', guildId: E2E.guildId });
  expect(backup.tables.Application.some((a: { id: string }) => a.id === app.id)).toBe(true);

  // Änderung nach der Sicherung, dann einspielen
  expect((await request.patch(`${g}/applications/${app.id}`, { headers, data: { name: 'Kaputt umbenannt' } })).ok()).toBeTruthy();
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Sicherungsdatei').setInputFiles(file);
  await expect(page.getByText('Sicherung eingespielt.')).toBeVisible();
  await expect(page.getByLabel('Ergebnis der Wiederherstellung')).toContainText('Application');
  expect((await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).name).toBe('Backup-Test');

  // Fremde Sicherung wird abgewiesen
  const foreign = await request.post(`${g}/backup/restore`, { headers, data: { ...backup, guildId: '900000000000000999' } });
  expect(foreign.status()).toBe(400);
  expect((await foreign.json()).message).toContain('anderen Server');

  // Zurücksetzen nur der Log-Weiterleitungen (mit automatischer Sicherung)
  expect((await request.put(`${g}/log-forwards`, { headers, data: { forwards: [{ area: 'tickets', channelId: '900000000000000201' }] } })).ok()).toBeTruthy();
  await page.getByLabel('Log-Weiterleitungen').check();
  await page.getByLabel('Zur Bestätigung „ZURÜCKSETZEN“ eingeben').fill('ZURÜCKSETZEN');
  const auto = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Zurücksetzen', exact: true }).click();
  expect((await auto).suggestedFilename()).toContain('vor-zuruecksetzen');
  await expect(page.getByText(/Zurückgesetzt/)).toBeVisible();
  expect((await (await request.get(`${g}/log-forwards`, { headers })).json()).forwards).toEqual([]);
});
