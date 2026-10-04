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

/** Praxistest Phase 48: Teamstatus ändern, suspendieren (Grund Pflicht), Akte schließen und wiederherstellen. */
test('Teamzustände: Pause, Suspendierung, Schließen, Wiederherstellen', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  const id = execFileSync(
    'node',
    ['e2e/seed-record.mjs', E2E.guildId, '900000000000777001', 'Tim Teststatus'],
    { encoding: 'utf8' },
  ).trim();
  await page.goto(`/guilds/${E2E.guildId}/personnel/${id}`);
  const heading = page.getByRole('heading', { name: /Tim Teststatus/ });
  await expect(heading).toContainText('Aktiv');

  const prompts: string[] = [];
  let answer = '';
  page.on('dialog', (d) => {
    prompts.push(d.message());
    void d.accept(answer);
  });
  await page.getByLabel('Teamstatus').selectOption('PAUSE');
  await expect(heading).toContainText('Pause');
  answer = 'Dienstvergehen im Einsatz';
  await page.getByLabel('Teamstatus').selectOption('SUSPENDED');
  await expect(heading).toContainText('Suspendiert');
  await expect(page.getByText('Grund: Dienstvergehen im Einsatz')).toBeVisible();
  expect(prompts.some((m) => m.includes('Pflicht'))).toBe(true);

  answer = 'Austritt aus dem Polizeidienst';
  await page.getByRole('button', { name: 'Akte schließen' }).click();
  await expect(heading).toContainText('Geschlossen');
  await expect(page.getByText('Schließungsgrund: Austritt aus dem Polizeidienst')).toBeVisible();
  await expect(page.getByLabel('Teamstatus')).toHaveCount(0);
  await expect(page.getByText('Teamstatus geändert').first()).toBeVisible();

  await page.getByRole('button', { name: 'Akte wiederherstellen' }).click();
  await expect(heading).toContainText('Aktiv');
});
