import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

// Dateiname bewusst „rights-…“: Der Test schreibt `permissions.*`-Einträge ins Audit-Log, die in der Glocke als
// „Systemeinstellungen geändert“ erscheinen; er muss hinter design-search.spec.ts laufen, das auf ein festes Glocken-Fenster zählt.
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

test('Log-Weiterleitung: Besitzer konfiguriert über die Oberfläche, dashboard.logs nur lesend', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const owner = await session(E2E.ownerId);
  const oh = { headers: { Cookie: `nexus_session=${owner}`, Origin: ORIGIN, 'X-Requested-With': 'nexus' } };
  await context.addCookies([{ name: 'nexus_session', value: owner, domain: 'localhost', path: '/' }]);
  await page.goto(`/guilds/${E2E.guildId}/logs`);
  await page.getByText('Weiterleitung in Discord-Kanäle').click();
  await page.getByLabel('Kanal für Tickets').selectOption({ label: '#bewerbungen' });
  await page.getByRole('button', { name: 'Weiterleitung speichern' }).click();
  await expect(page.getByText(/Weiterleitung gespeichert/)).toBeVisible();

  // Mitglied mit nur „Logs ansehen“ (Seitenrecht): lesen ja, ändern nein, fremder Kanal nein
  expect((await request.put(`${API}/guilds/${E2E.guildId}/permissions/${ROLE}`, { ...oh, data: { permissions: ['dashboard.logs'] } })).ok()).toBeTruthy();
  const mh = { headers: { Cookie: `nexus_session=${await session(MEMBER)}`, Origin: ORIGIN, 'X-Requested-With': 'nexus' } };
  const got = await request.get(`${API}/guilds/${E2E.guildId}/log-forwards`, mh);
  expect(got.status()).toBe(200);
  expect((await got.json()).forwards).toEqual([{ area: 'tickets', channelId: '900000000000000201', enabled: true }]);
  expect((await request.put(`${API}/guilds/${E2E.guildId}/log-forwards`, { ...mh, data: { forwards: [] } })).status()).toBe(403);
  expect((await request.get(`${API}/guilds/${E2E.guildId}/audit-log`, mh)).status()).toBe(200);

  // Besitzer: Kanal außerhalb des Servers wird abgelehnt; danach aufräumen
  const bad = await request.put(`${API}/guilds/${E2E.guildId}/log-forwards`, { ...oh, data: { forwards: [{ area: 'tickets', channelId: '123456789012345678' }] } });
  expect(bad.status()).toBe(400);
  await request.put(`${API}/guilds/${E2E.guildId}/log-forwards`, { ...oh, data: { forwards: [] } });
  await request.put(`${API}/guilds/${E2E.guildId}/permissions/${ROLE}`, { ...oh, data: { permissions: [] } });
});
