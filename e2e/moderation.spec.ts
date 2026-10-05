import { expect, test } from '@playwright/test';
import { SignJWT } from 'jose';
import { E2E } from '../playwright.config';

const [WARN_U, TIMEOUT_U, BAN_U, KICK_U] = ['900000000000000080', '900000000000000081', '900000000000000082', '900000000000000083'];
const LEAD = '900000000000000040'; // Polizeileitung (Position 3)
const LEAD_ROLE = '900000000000000100';
const ADMINS = '900000000000000030'; // Rolle „Admins“ (Position 7)
const OWNER = E2E.ownerId;
const API = 'http://localhost:3000/api/v1';
const ORIGIN = 'http://localhost:3101';
const FAKE = 'http://localhost:4010';

const session = (sub: string) =>
  new SignJWT({ sub, username: 'u' + sub, at: 'fake-access-token' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(E2E.issuer)
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(E2E.authSecret));
const headers = async (sub: string) => ({ Cookie: `nexus_session=${await session(sub)}`, Origin: ORIGIN, 'X-Requested-With': 'nexus' });

/** Praxistest Phase 59: Moderation über die Oberfläche (verwarnen, Timeout, Kick, Bann, aufheben) gegen Fake-Discord. */
test('Moderation: verwarnen, stummschalten, kicken, bannen und aufheben', async ({ page, context, request }) => {
  test.setTimeout(90_000);
  await context.addCookies([{ name: 'nexus_session', value: await session(OWNER), domain: 'localhost', path: '/' }]);
  await page.goto(`/guilds/${E2E.guildId}/moderation`);
  await expect(page.getByRole('heading', { name: 'Moderation' })).toBeVisible();

  const issue = async (userId: string, type: string, reason: string, extra?: () => Promise<void>) => {
    const person = page.getByLabel('Betroffene Person', { exact: true });
    if (await person.count()) await person.fill(userId); // eingefügte ID wird direkt übernommen
    await expect(page.locator(`.user-picker [data-user-id="${userId}"]`)).toBeVisible();
    const kind = page.getByRole('combobox', { name: 'Maßnahme', exact: true }).last();
    await kind.selectOption({ value: type });
    await expect(kind).toHaveValue(type);
    await page.getByLabel(/^Grund \(Pflicht\)/).fill(reason);
    if (extra) await extra();
  };

  // Personensuche: Name tippen, Treffer wählen → Auswahl zeigt den Namen
  await page.getByLabel('Betroffene Person', { exact: true }).fill('0080');
  await page.getByRole('listbox', { name: 'Betroffene Person: Treffer' }).getByRole('button', { name: /user80/ }).click();
  await expect(page.locator(`.user-picker [data-user-id="${WARN_U}"]`)).toHaveText(`u${WARN_U}`); // Name laut Fake-Discord (Einzelabfrage)

  // Verwarnung
  await issue(WARN_U, 'WARN', 'Spam im Chat');
  await page.getByRole('button', { name: 'Verwarnung verhängen' }).click();
  await expect(page.getByText(/Verwarnung verhängt \(Fall #1\)/)).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: 'Spam im Chat' });
  await expect(row).toContainText('Aktiv');

  // Timeout (60 Minuten) → Fake-Discord kennt das Ende
  await issue(TIMEOUT_U, 'TIMEOUT', 'Streit im Voice', async () => page.getByLabel(/Dauer in Minuten/).fill('60'));
  await page.getByRole('button', { name: 'Timeout verhängen' }).click();
  await expect(page.getByText(/Timeout verhängt \(Fall #2\)/)).toBeVisible();
  let state = await (await request.get(`${FAKE}/__moderation`)).json();
  expect(Date.parse(state.timeouts[TIMEOUT_U]) - Date.now()).toBeGreaterThan(55 * 60_000);

  // Kick und Bann (mit Bestätigung)
  await issue(KICK_U, 'KICK', 'Beleidigung');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Kick verhängen' }).click();
  await expect(page.getByText(/Kick verhängt \(Fall #3\)/)).toBeVisible();
  await issue(BAN_U, 'BAN', 'Wiederholter Verstoß');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Bann verhängen' }).click();
  await expect(page.getByText(/Bann verhängt \(Fall #4\)/)).toBeVisible();
  state = await (await request.get(`${FAKE}/__moderation`)).json();
  expect(state.kicked).toContain(KICK_U);
  expect(state.bans).toContain(BAN_U);

  // Bann aufheben → Unban bei Discord
  const ban = page.getByRole('listitem').filter({ hasText: 'Wiederholter Verstoß' });
  await ban.getByLabel(/Grund zum Aufheben/).fill('Irrtum');
  await ban.getByRole('button', { name: 'Aufheben' }).click();
  await expect(page.getByText('Maßnahme aufgehoben.')).toBeVisible();
  state = await (await request.get(`${FAKE}/__moderation`)).json();
  expect(state.bans).not.toContain(BAN_U);

  // Timeout aufheben → Timeout wird bei Discord entfernt
  const to = page.getByRole('listitem').filter({ hasText: 'Streit im Voice' });
  await to.getByLabel(/Grund zum Aufheben/).fill('Entschuldigt');
  await to.getByRole('button', { name: 'Aufheben' }).click();
  await expect.poll(async () => (await (await request.get(`${FAKE}/__moderation`)).json()).timeouts[TIMEOUT_U]).toBeNull();

  // Archiv: aufgehobene Fälle sichtbar
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('REVOKED');
  await expect(page.getByRole('listitem').filter({ hasText: 'Wiederholter Verstoß' })).toContainText('Aufgehoben');
});

test('Moderation: Rechte je Maßnahme, Rangfolge und Besitzerschutz über die API', async ({ request }) => {
  test.setTimeout(60_000);
  const oh = await headers(OWNER);
  const mh = await headers(LEAD);
  const put = (permissions: string[]) => request.put(`${API}/guilds/${E2E.guildId}/permissions/${LEAD_ROLE}`, { headers: oh, data: { permissions } });
  const post = (userId: string, type: string, extra: object = {}) => request.post(`${API}/guilds/${E2E.guildId}/moderation/cases`, { headers: mh, data: { userId, type, reason: 'API-Test', ...extra } });

  expect((await put([])).ok()).toBeTruthy();
  expect((await request.get(`${API}/guilds/${E2E.guildId}/moderation/cases`, { headers: mh })).status()).toBe(403); // ohne Recht

  expect((await put(['dashboard.moderation'])).ok()).toBeTruthy(); // Seitenrecht: lesen
  expect((await request.get(`${API}/guilds/${E2E.guildId}/moderation/cases`, { headers: mh })).status()).toBe(200);
  expect((await post(WARN_U, 'WARN')).status()).toBe(403); // aber nicht verwarnen

  expect((await put(['moderation.warn'])).ok()).toBeTruthy();
  expect((await post(WARN_U, 'WARN')).status()).toBe(201); // Verwarnung erlaubt
  expect((await post(WARN_U, 'TIMEOUT', { durationMin: 5 })).status()).toBe(403); // Timeout nicht
  expect((await post(WARN_U, 'BAN')).status()).toBe(403);
  const higher = await post(ADMINS, 'WARN'); // Rolle „Admins“ steht über „Polizeileitung“
  expect(higher.status()).toBe(403);
  expect((await higher.json()).message).toMatch(/unter deiner eigenen/);
  const owner = await post(OWNER, 'WARN');
  expect(owner.status()).toBe(403);
  expect((await owner.json()).message).toMatch(/Serverbesitzer/);
  const self = await post(LEAD, 'WARN');
  expect((await self.json()).message).toMatch(/selbst/);

  // Aufheben braucht ein eigenes Recht
  const cases = await (await request.get(`${API}/guilds/${E2E.guildId}/moderation/cases?userId=${WARN_U}&status=ACTIVE`, { headers: oh })).json();
  const id = cases[0].id as string;
  expect((await request.post(`${API}/guilds/${E2E.guildId}/moderation/cases/${id}/revoke`, { headers: mh, data: { reason: 'Test' } })).status()).toBe(403);
  expect((await put(['moderation.warn', 'moderation.revoke'])).ok()).toBeTruthy();
  expect((await request.post(`${API}/guilds/${E2E.guildId}/moderation/cases/${id}/revoke`, { headers: mh, data: { reason: 'Test' } })).status()).toBe(201);
  expect((await put([])).ok()).toBeTruthy();
});
