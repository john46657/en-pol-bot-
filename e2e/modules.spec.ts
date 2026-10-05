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

/** Praxistest Phase 61: Modul „Tickets“ abschalten → Menüpunkt weg, API gesperrt; wieder anschalten. */
test('Module & Befehle: Modul abschalten und wieder anschalten', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const jwt = await session();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;

  await page.goto(`/guilds/${E2E.guildId}/modules`);
  await expect(page.getByRole('heading', { name: 'Module & Befehle' })).toBeVisible();
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Tickets' })).toBeVisible();

  await page.getByLabel('Modul Tickets').uncheck();
  await page.getByLabel('Befehl /mod').uncheck();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Module gespeichert.')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Tickets' })).toHaveCount(0);
  const off = await request.get(`${g}/tickets`, { headers });
  expect(off.status()).toBe(403);
  expect((await off.json()).message).toBe('Das Modul „Tickets“ ist auf diesem Server deaktiviert.');
  expect((await (await request.get(`${g}/modules`, { headers })).json()).state).toEqual({ disabled: ['tickets'], disabledCommands: ['mod'] });

  await page.getByLabel('Modul Tickets').check();
  await page.getByLabel('Befehl /mod').check();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('Module gespeichert.').last()).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Tickets' })).toBeVisible();
  expect((await request.get(`${g}/tickets`, { headers })).status()).toBe(200);
});
