import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const API = 'http://localhost:3000/api/v1';
const token = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

/** Praxistest Phase 60: Bewertungsfelder je Bewerbungsart einrichten, eine Bewerbung bewerten (nur Team). */
test('Interne Bewertung: Felder einrichten, Sterne setzen, Mittelwert', async ({ page, context, request }) => {
  test.setTimeout(90_000);
  const jwt = await token();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;
  const app = await (await request.post(`${g}/applications`, { headers, data: { name: 'Bewertung E2E', slug: `rate-${Date.now()}` } })).json();

  // Felder im Builder einrichten
  await page.goto(`/guilds/${E2E.guildId}/applications/${app.id}`);
  await page.getByRole('button', { name: '+ Bewertungsfeld' }).click();
  await page.getByLabel('Bezeichnung des Bewertungsfelds').fill('Kommunikation');
  await page.getByRole('button', { name: '+ Bewertungsfeld' }).click();
  await page.getByLabel('Bezeichnung des Bewertungsfelds').nth(1).fill('Erfahrung');
  await page.getByRole('button', { name: 'Speichern', exact: true }).last().click();
  await expect(page.getByText('Bewertungsfelder gespeichert.')).toBeVisible();
  const fields = (await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).config.rating.fields;
  expect(fields.map((f: { id: string }) => f.id)).toEqual(['kommunikation', 'erfahrung']);

  // Bewerbung einreichen (Seed) und bewerten
  const submissionId = execFileSync('node', ['e2e/seed-submission.mjs', E2E.guildId, app.id, '900000000000777001', 'Rating Tester', 'RAT'], { encoding: 'utf8' }).trim();
  await page.goto(`/guilds/${E2E.guildId}/submissions/${submissionId}`);
  await expect(page.getByRole('heading', { name: 'Interne Bewertung' })).toBeVisible();
  await page.getByRole('button', { name: 'Kommunikation: 5 von 5' }).click();
  await page.getByRole('button', { name: 'Erfahrung: 3 von 5' }).click();
  await expect(page.getByRole('button', { name: 'Kommunikation: 5 von 5' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('5 / 5')).toBeVisible();
  await expect(page.getByText('Gesamt: 80 %')).toBeVisible(); // (100 % + 60 %) / 2

  // Erneut auf denselben Stern klicken entfernt die Bewertung
  await page.getByRole('button', { name: 'Erfahrung: 3 von 5' }).click();
  await expect(page.getByText('Gesamt: 100 %')).toBeVisible();

  // Der Bewerber hat keinen Zugriff; ohne Recht gibt es nichts zu sehen
  const other = await new SignJWT({ sub: '900000000000000020', username: 'u20', at: 'x' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt().setIssuer(E2E.issuer).setExpirationTime('1h').sign(new TextEncoder().encode(E2E.authSecret));
  expect((await request.get(`${g}/submissions/${submissionId}/ratings`, { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(403);
});
