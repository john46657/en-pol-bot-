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

/** Praxistest Phase 49: übernehmen → wartet auf Rückmeldung → weiter bearbeiten → Schließen nur mit Grund. */
test('Ticket-Status: Bearbeitung, Wartend, Schließen mit Pflichtgrund', async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  await context.addCookies([
    { name: 'nexus_session', value: await session(), domain: 'localhost', path: '/' },
  ]);
  execFileSync(
    'node',
    ['e2e/seed-ticket.mjs', E2E.guildId, '900000000000888001', 'Statusfrage Browser'],
    { encoding: 'utf8' },
  );
  await page.goto(`/guilds/${E2E.guildId}/tickets`);
  const row = page.getByRole('listitem').filter({ hasText: 'Statusfrage Browser' });
  await expect(row).toContainText('offen');
  await row.getByRole('button', { name: 'Übernehmen' }).click();
  await expect(row).toContainText('in Bearbeitung');
  await row.getByRole('button', { name: 'Wartet auf Rückmeldung' }).click();
  await expect(row).toContainText('wartet auf Rückmeldung');
  await row.getByRole('button', { name: 'Weiter bearbeiten' }).click();
  await expect(row).toContainText('in Bearbeitung');

  const close = row.getByRole('button', { name: 'Schließen', exact: true });
  await expect(close).toBeDisabled(); // ohne Grund nicht möglich
  await row.getByLabel('Schließungsgrund').fill('Problem gelöst');
  await expect(close).toBeEnabled();
  page.once('dialog', (d) => void d.accept());
  await close.click();
  await page.getByRole('button', { name: /Archiv/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Statusfrage Browser' })).toContainText(
    'Grund: Problem gelöst',
  );
});
