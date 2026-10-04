import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const token = () =>
  new SignJWT({ sub: E2E.ownerId, username: 'besitzer', at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));

/** Praxistest Phase 43: Suche (Strg+K, Tastatur, Gruppen) und Glocke (ungelesen, Lesestatus), Schalter im Design. */
test('Suche und Benachrichtigungen im Header; abschaltbar, auch serverseitig', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(120_000);
  const jwt = await token();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  await page.goto(`/guilds/${E2E.guildId}`);
  const search = page.getByRole('combobox', { name: 'Suche' });
  await expect(search).toBeVisible();

  // --- Suche: Strg+K, Treffer nach Gruppen, Maus ---
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await search.fill('zebra');
  const list = page.getByRole('listbox', { name: 'Suchergebnisse' });
  await expect(list.getByRole('group', { name: 'Tickets' })).toBeVisible();
  await expect(
    list.getByRole('option', { name: /#4711 Einzigartiger Suchbegriff Zebra/ }),
  ).toBeVisible();
  await list.getByRole('option', { name: /#4711/ }).click();
  await expect(page).toHaveURL(new RegExp(`/guilds/${E2E.guildId}/tickets$`));
  await expect(search).toHaveValue('');

  // --- Suche: Tastatur (↓ Enter) → Teammitglied ---
  await search.fill('hans');
  await expect(list.getByRole('group', { name: 'Teammitglieder' })).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/guilds/${E2E.guildId}/personnel/[a-z0-9]+$`));

  // Dienstnummer und Seiten des Dashboards (lokal)
  await search.fill('P-4242');
  await expect(list.getByRole('option', { name: /Hans Beispiel/ })).toBeVisible();
  await search.fill('Bewerb');
  await expect(list.getByRole('group', { name: 'Seiten' })).toBeVisible();
  // keine Treffer / zu kurz / Escape
  await search.fill('qqqqqzzzzz');
  await expect(page.getByText(/Keine Treffer für „qqqqqzzzzz“/)).toBeVisible();
  await search.press('Escape');
  await expect(list).toHaveCount(0);

  // --- Glocke ---
  await page.goto(`/guilds/${E2E.guildId}`);
  const bell = page.getByRole('button', { name: /Benachrichtigungen, \d+ ungelesen/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.getByRole('region', { name: 'Benachrichtigungen' });
  await expect(panel.getByText('Neues Ticket')).toBeVisible();
  await expect(panel.getByText('#4711 Einzigartiger Suchbegriff Zebra')).toBeVisible();
  await panel.getByRole('button', { name: 'Alle gelesen' }).click();
  await expect(page.getByRole('button', { name: 'Benachrichtigungen', exact: true })).toBeVisible(); // kein Zähler mehr
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await page.reload(); // der Lesestatus bleibt
  await expect(page.getByRole('button', { name: 'Benachrichtigungen', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Benachrichtigungen', exact: true }).click();
  await page.getByRole('button', { name: /Neues Ticket/ }).click();
  await expect(page).toHaveURL(new RegExp(`/guilds/${E2E.guildId}/tickets$`));

  // --- Im Design ausschalten ---
  await page.goto(`/guilds/${E2E.guildId}/design`);
  await expect(page.locator('fieldset').first()).toBeVisible();
  const copy = page.getByRole('button', { name: 'Eigene Kopie zum Bearbeiten anlegen' });
  if (await copy.isVisible()) await copy.click();
  await expect(page.getByText('ist eine Vorlage')).toHaveCount(0);
  await page.getByRole('tab', { name: /Navigation/ }).click();
  await expect(page.getByRole('group', { name: 'Arten' })).toBeVisible();
  await page.getByLabel('Neues Ticket').uncheck(); // eine Art abwählen
  await page.getByLabel('Globale Suche aktivieren').uncheck();
  await page.getByRole('button', { name: 'Änderungen speichern' }).click();
  await expect(page.getByText('Design gespeichert')).toBeVisible();

  await page.goto(`/guilds/${E2E.guildId}`);
  await expect(page.getByRole('combobox', { name: 'Suche' })).toHaveCount(0); // Oberfläche
  const api = `http://localhost:3000/api/v1/guilds/${E2E.guildId}/design`;
  expect(
    (
      await request.get(`${api}/search?q=zebra`, { headers: { Authorization: `Bearer ${jwt}` } })
    ).status(),
  ).toBe(403); // Server
  const n = await (
    await request.get(`${api}/notifications`, { headers: { Authorization: `Bearer ${jwt}` } })
  ).json();
  expect(JSON.stringify(n)).not.toContain('Zebra'); // „Neues Ticket“ ist abgewählt
});
