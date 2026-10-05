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

/** Praxistest Phase 53: Teamliste im Dashboard (Menüpunkt, Gruppierung, Zustand). */
test('Teamliste: Menüpunkt, Mitglied mit Zustand sichtbar', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  execFileSync(
    'node',
    ['e2e/seed-record.mjs', E2E.guildId, '900000000000999001', 'Lena Listentest'],
    { encoding: 'utf8' },
  );
  await page.goto(`/guilds/${E2E.guildId}`);
  await page
    .getByRole('complementary', { name: 'Navigation' })
    .getByRole('link', { name: 'Team', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Team', exact: true })).toBeVisible();
  const group = page.getByRole('region', { name: 'Ohne Team' });
  await expect(group).toContainText('Lena Listentest');
  await expect(group).toContainText('🟢');
});
