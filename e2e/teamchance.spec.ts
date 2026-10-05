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

/** Praxistest Phase 60c: Bewerbung zurückstellen und fortsetzen (Dashboard), Filter „Zurückgestellt“. */
test('Team-Chance: Bewerbung zurückstellen und fortsetzen', async ({ page, context, request }) => {
  test.setTimeout(90_000);
  const jwt = await token();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;
  const app = await (await request.post(`${g}/applications`, { headers, data: { name: 'Moderation (Team-Chance)', slug: `tc-${Date.now()}` } })).json();
  const id = execFileSync('node', ['e2e/seed-submission.mjs', E2E.guildId, app.id, '900000000000777002', 'Hold Tester', 'HLD'], { encoding: 'utf8' }).trim();

  await page.goto(`/guilds/${E2E.guildId}/submissions/${id}`);
  page.once('dialog', (d) => void d.accept('Warten auf Rückmeldung der Leitung'));
  await page.getByRole('button', { name: '🟠 Zurückstellen' }).click();
  await expect(page.getByText('Bewerbung zurückgestellt.')).toBeVisible();
  await expect(page.getByRole('button', { name: '▶️ Fortsetzen' })).toBeVisible();
  const hist = await (await request.get(`${g}/submissions/${id}/history`, { headers })).json();
  expect(hist.map((e: { action: string }) => e.action)).toContain('submission.on_hold');

  // Liste: Filter „Zurückgestellt“
  await page.goto(`/guilds/${E2E.guildId}/submissions`);
  await page.getByRole('combobox').filter({ hasText: 'Zurückgestellt' }).first().selectOption('ON_HOLD');
  await expect(page.getByText('Hold Tester').first()).toBeVisible();

  await page.goto(`/guilds/${E2E.guildId}/submissions/${id}`);
  await page.getByRole('button', { name: '▶️ Fortsetzen' }).click();
  await expect(page.getByText('Bewerbung wird weiter bearbeitet.')).toBeVisible();
  expect((await (await request.get(`${g}/submissions/${id}`, { headers })).json()).status).toBe('UNDER_REVIEW');
});
