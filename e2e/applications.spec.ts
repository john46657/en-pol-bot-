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

/** Praxistest Phase 54: Fragen per Drag & Drop sortieren, eigene Fehlermeldung, ID-Präfix. */
test('Bewerbungs-Builder: Drag & Drop, Fehlermeldung, ID-Präfix', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000);
  const jwt = await token();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;
  const app = await (
    await request.post(`${g}/applications`, {
      headers,
      data: { name: 'DnD Test', slug: `dnd-${Date.now()}` },
    })
  ).json();
  for (const title of ['Erste Frage', 'Zweite Frage', 'Dritte Frage'])
    expect(
      (
        await request.post(`${g}/applications/${app.id}/questions`, {
          headers,
          data: { question: { type: 'TEXT', title, required: true } },
        })
      ).ok(),
    ).toBe(true);
  const order = async () =>
    (
      await (await request.get(`${g}/applications/${app.id}/questions`, { headers })).json()
    ).questions.map((q: { title: string }) => q.title);
  expect(await order()).toEqual(['Erste Frage', 'Zweite Frage', 'Dritte Frage']);

  await page.goto(`/guilds/${E2E.guildId}/applications/${app.id}`);
  await expect(page.getByRole('listitem', { name: /Frage 3: Dritte Frage/ })).toBeVisible();
  await page
    .getByRole('listitem', { name: /Frage 3: Dritte Frage/ })
    .dragTo(page.getByRole('listitem', { name: /Frage 1: Erste Frage/ }));
  await expect.poll(order).toEqual(['Dritte Frage', 'Erste Frage', 'Zweite Frage']);

  // ID-Präfix
  await page.getByLabel('ID-Präfix').fill('pol');
  await page.getByRole('button', { name: 'Präfix speichern' }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).idPrefix,
    )
    .toBe('POL');

  // Regex + eigene Fehlermeldung
  await page
    .getByRole('listitem', { name: /Frage 1: Dritte Frage/ })
    .getByRole('button', { name: 'Bearbeiten' })
    .click();
  await page.getByLabel(/^Regex-Validierung/).fill('^[a-z]+$');
  await page.getByLabel(/^Eigene Fehlermeldung/).fill('Nur Kleinbuchstaben bitte.');
  await page
    .getByRole('button', { name: /^Speichern/ })
    .first()
    .click();
  await expect
    .poll(async () =>
      JSON.stringify(
        (await (await request.get(`${g}/applications/${app.id}/questions`, { headers })).json())
          .questions[0].validation,
      ),
    )
    .toContain('Nur Kleinbuchstaben bitte.');
});

/** Praxistest Phase 54: Bewerbung übernehmen, Verlauf des Benutzers, Zurücknehmen mit Grund. */
test('Bewerbung bearbeiten: ID, Übernehmen, Verlauf, Zurücknehmen', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(90_000);
  const jwt = await token();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const g = `${API}/guilds/${E2E.guildId}`;
  const app = await (
    await request.post(`${g}/applications`, {
      headers: { Authorization: `Bearer ${jwt}` },
      data: { name: 'Review Test', slug: `rev-${Date.now()}` },
    })
  ).json();
  const id = execFileSync(
    'node',
    ['e2e/seed-submission.mjs', E2E.guildId, app.id, '900000000000444001', 'Rita Review'],
    { encoding: 'utf8' },
  ).trim();
  await page.goto(`/guilds/${E2E.guildId}/submissions/${id}`);
  await expect(page.getByRole('heading', { name: /#POL-00002/ })).toBeVisible();
  await expect(page.getByLabel('Bearbeiter', { exact: true })).toContainText('Noch nicht zugewiesen');
  await page.getByRole('button', { name: /Bewerbung übernehmen/ }).click();
  await expect(page.getByLabel('Bearbeiter', { exact: true })).toContainText(E2E.ownerId);
  const history = page.getByRole('list', { name: 'Bewerbungshistorie' });
  await expect(history).toContainText('#POL-00001');
  await expect(history).toContainText('(diese)');

  await page.getByRole('button', { name: /Freigeben/ }).click();
  await expect(page.getByLabel('Bearbeiter', { exact: true })).toContainText('Noch nicht zugewiesen');

  page.once('dialog', (d) => void d.accept('Doppelt eingereicht'));
  await page.getByRole('button', { name: /Zurücknehmen/ }).click();
  await expect(page.locator('.pill').first()).toContainText(/zurückgezogen/i);
});
