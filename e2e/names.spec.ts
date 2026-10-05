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

/** Praxistest: Namen statt Discord-IDs (Spitzname, Ausgetretene, unbekannte ID bleibt sichtbar; ID im Tooltip). */
test('Namen statt Discord-IDs im Dashboard', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  const jwt = await session();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;
  const created: string[] = [];
  for (const userId of ['900000000000000040', '900000000000000977']) {
    const r = await request.post(`${g}/restrictions`, { headers, data: { userId, type: 'RADIO', reason: 'Namenstest' } });
    expect(r.ok()).toBeTruthy();
    created.push((await r.json()).id);
  }

  const names = await (await request.get(`${g}/discord/names?ids=900000000000000040,900000000000000977,abc`, { headers })).json();
  expect(names['900000000000000040']).toMatchObject({ name: 'Hauptkommissarin Lea', inGuild: true });
  expect(names['900000000000000977']).toMatchObject({ name: 'ehemalig77', inGuild: false });
  expect(names['abc']).toBeUndefined();

  await page.goto(`/guilds/${E2E.guildId}/restrictions`);
  const list = page.getByRole('list', { name: 'Sperren' });
  const lea = list.locator('[data-user-id="900000000000000040"]').first();
  await expect(lea).toHaveText('Hauptkommissarin Lea');
  await expect(lea).toHaveAttribute('title', /@u900000000000000040 · 900000000000000040/);
  await expect(list.locator('[data-user-id="900000000000000977"]').first()).toContainText('ehemalig77 (ausgetreten)');
  await expect(list.getByText('900000000000000040', { exact: true })).toHaveCount(0); // ID nicht mehr als Text

  // Ersteller im Logs-Bereich ebenfalls mit Namen
  await page.goto(`/guilds/${E2E.guildId}/logs`);
  await expect(page.locator(`[data-user-id="${E2E.ownerId}"]`).first()).toBeVisible();

  // Aufräumen: Sperren wieder aufheben (andere Tests erwarten eine leere Liste)
  for (const id of created) expect((await request.post(`${g}/restrictions/${id}/revoke`, { headers, data: { reason: 'Test beendet' } })).ok()).toBeTruthy();
});
