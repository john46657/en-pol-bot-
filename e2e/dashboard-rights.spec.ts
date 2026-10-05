import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const MEMBER = '900000000000000040'; // trägt die Rolle „Polizeileitung“ im Fake-Discord
const ROLE = '900000000000000100';
const ORIGIN = 'http://localhost:3101';
const API = 'http://localhost:3000/api/v1';

const session = (sub: string) =>
  new SignJWT({ sub, username: 'u' + sub, at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

/** Praxistest Phase 57: Seitenrecht „dashboard.tickets“ zeigt nur die Ticket-Seite – lesend. */
test('Seitenrecht dashboard.tickets: Menü, Lesen ja, Ändern und Rechteverwaltung nein', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  // Als Besitzer der Rolle genau dieses Recht geben
  const owner = await session(E2E.ownerId);
  const put = await request.put(`${API}/guilds/${E2E.guildId}/permissions/${ROLE}`, {
    headers: { Cookie: `nexus_session=${owner}`, Origin: ORIGIN, 'X-Requested-With': 'nexus' },
    data: { permissions: ['dashboard.tickets'] },
  });
  expect(put.ok(), await put.text()).toBeTruthy();

  const member = await session(MEMBER);
  await context.addCookies([{ name: 'nexus_session', value: member, domain: 'localhost', path: '/' }]);
  const h = { headers: { Cookie: `nexus_session=${member}`, Origin: ORIGIN, 'X-Requested-With': 'nexus' } };

  // Lesen der Tickets: erlaubt; Verwalten/Schließen/Rechte: verboten
  expect((await request.get(`${API}/guilds/${E2E.guildId}/tickets`, h)).status()).toBe(200);
  expect((await request.put(`${API}/guilds/${E2E.guildId}/tickets/settings`, { ...h, data: {} })).status()).toBe(403);
  expect((await request.post(`${API}/guilds/${E2E.guildId}/tickets/x/close`, { ...h, data: { reason: 'abc' } })).status()).toBe(403);
  expect((await request.get(`${API}/guilds/${E2E.guildId}/permissions`, h)).status()).toBe(403);
  expect((await request.get(`${API}/guilds/${E2E.guildId}/audit`, h)).status()).toBe(403);

  // Menü: Tickets sichtbar, Verwaltungsseiten nicht
  await page.goto(`/guilds/${E2E.guildId}/tickets`);
  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Tickets' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Berechtigungen' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Logs' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Rollen & Rechte' })).toHaveCount(0);

  // Aufräumen
  await request.put(`${API}/guilds/${E2E.guildId}/permissions/${ROLE}`, { headers: { Cookie: `nexus_session=${owner}`, Origin: ORIGIN, 'X-Requested-With': 'nexus' }, data: { permissions: [] } });
});
