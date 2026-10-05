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

/** Praxistest Phase 60c/d: eigener Statusname, Bewerbung zurückstellen und fortsetzen (Dashboard), Filter „Zurückgestellt“. */
test('Team-Chance: Bewerbung zurückstellen und fortsetzen', async ({ page, context, request }) => {
  test.setTimeout(90_000);
  const jwt = await token();
  await context.addCookies([{ name: 'nexus_session', value: jwt, domain: 'localhost', path: '/' }]);
  const headers = { Authorization: `Bearer ${jwt}` };
  const g = `${API}/guilds/${E2E.guildId}`;
  const app = await (await request.post(`${g}/applications`, { headers, data: { name: 'Moderation (Team-Chance)', slug: `tc-${Date.now()}` } })).json();
  const id = execFileSync('node', ['e2e/seed-submission.mjs', E2E.guildId, app.id, '900000000000777002', 'Hold Tester', 'HLD'], { encoding: 'utf8' }).trim();

  // Voraussetzungen (Wartezeiten, Mitglied, Plätze, Hinweis)
  await page.goto(`/guilds/${E2E.guildId}/applications/${app.id}`);
  await page.getByLabel('Wartezeit nach einer Ablehnung').selectOption('14');
  await page.getByLabel('Wartezeit zwischen zwei Bewerbungen').selectOption('custom');
  await page.getByLabel('Wartezeit zwischen zwei Bewerbungen: Stunden').fill('12');
  await page.getByLabel('Bewerbungsdauer (danach läuft eine angefangene Bewerbung ab)').selectOption('48');
  await page.getByLabel('Mindestens … Tage auf dem Server').fill('30');
  await page.getByLabel('Plätze: höchstens … offene Bewerbungen gleichzeitig').fill('5');
  await page.getByLabel('Hinweis, wenn Voraussetzungen fehlen').fill('❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Team-Chance.');
  await page.getByRole('button', { name: 'Voraussetzungen speichern' }).click();
  await expect(page.getByText('Voraussetzungen gespeichert.')).toBeVisible();
  const req = (await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).config.requirements;
  expect(req).toMatchObject({ denyCooldown: { days: 14 }, cooldown: { days: 1, hours: 12 }, timeLimit: { days: 2 }, minGuildMembershipDays: 30, maxOpenSubmissions: 5, failMessage: '❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Team-Chance.' });

  // Ticket und Ergebnis (Bearbeitung)
  await page.getByLabel('Nach dem Absenden automatisch ein Bewerbungsticket eröffnen').check();
  await page.getByLabel('Ergebnis-Kanal (Annahmen werden dort bekannt gegeben)').selectOption({ label: '#bewerbungen' });
  await page.getByLabel('Auch Ablehnungen im Ergebnis-Kanal melden').check();
  await page.getByRole('button', { name: 'Speichern', exact: true }).first().click();
  await expect.poll(async () => (await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).config.review).toMatchObject({ createTicket: true, resultChannelId: '900000000000000201', resultPostDenied: true });

  // Benachrichtigungen je Ereignis
  await page.getByText('Bewerbung eingereicht', { exact: true }).click();
  await page.getByLabel('Bewerbung eingereicht: Kanal').selectOption({ label: '#bewerbungen' });
  await page.getByLabel('Bewerber erwähnen').check();
  await page.getByLabel('Bewerbung eingereicht Kanal: Titel').fill('Neue Bewerbung: {applicationName}');
  await page.getByText('Bewerbung angenommen', { exact: true }).click();
  await page.getByLabel('Bewerbung angenommen: Direktnachricht').selectOption('embed');
  await page.getByLabel('Bewerbung angenommen DM: Beschreibung').fill('Herzlichen Glückwunsch! Willkommen im Team.');
  await page.getByText('Bewerbung abgelehnt', { exact: true }).click();
  await page.getByLabel('Bewerbung abgelehnt: Direktnachricht').selectOption('off');
  await page.getByRole('button', { name: 'Benachrichtigungen speichern' }).click();
  await expect(page.getByText('Benachrichtigungen gespeichert.')).toBeVisible();
  const notes = (await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).config.notifications;
  expect(notes.submitted).toMatchObject({ channelId: '900000000000000201', mentionApplicant: true, channelEmbed: { title: 'Neue Bewerbung: {applicationName}' } });
  expect(notes.accepted).toMatchObject({ dmEmbed: { title: 'Bewerbung angenommen', description: 'Herzlichen Glückwunsch! Willkommen im Team.' } });
  expect(notes.denied).toEqual({ dm: false });

  // Eigener Statusname für „Zurückgestellt“ (Bewerbungsart → Statusnamen und Farben)
  await page.getByLabel('Name für Zurückgestellt').fill('⏸️ Später prüfen');
  await page.getByRole('button', { name: 'Statusnamen speichern' }).click();
  await expect(page.getByText('Statusnamen gespeichert.')).toBeVisible();
  const cfg = (await (await request.get(`${g}/applications/${app.id}`, { headers })).json()).config;
  expect(cfg.statusLabels).toEqual({ ON_HOLD: { label: '⏸️ Später prüfen' } });

  await page.goto(`/guilds/${E2E.guildId}/submissions/${id}`);
  page.once('dialog', (d) => void d.accept('Warten auf Rückmeldung der Leitung'));
  await page.getByRole('button', { name: '🟠 Zurückstellen' }).click();
  await expect(page.getByText('Bewerbung zurückgestellt.')).toBeVisible();
  await expect(page.getByRole('button', { name: '▶️ Fortsetzen' })).toBeVisible();
  await expect(page.getByText('⏸️ Später prüfen').first()).toBeVisible(); // eigener Name statt „Zurückgestellt“
  const hist = await (await request.get(`${g}/submissions/${id}/history`, { headers })).json();
  expect(hist.map((e: { action: string }) => e.action)).toContain('submission.on_hold');

  // Liste: Filter „Zurückgestellt“
  await page.goto(`/guilds/${E2E.guildId}/submissions`);
  await page.getByRole('combobox').filter({ hasText: 'Zurückgestellt' }).first().selectOption('ON_HOLD');
  await expect(page.getByText('Hold Tester').first()).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Hold Tester' }).getByText('⏸️ Später prüfen')).toBeVisible();

  await page.goto(`/guilds/${E2E.guildId}/submissions/${id}`);
  await page.getByRole('button', { name: '▶️ Fortsetzen' }).click();
  await expect(page.getByText('Bewerbung wird weiter bearbeitet.')).toBeVisible();
  expect((await (await request.get(`${g}/submissions/${id}`, { headers })).json()).status).toBe('UNDER_REVIEW');

  // Mehrere Bearbeiter: hinzufügen, entfernen, weiterleiten
  await page.getByLabel('Weiteren Bearbeiter hinzufügen').fill('900000000000000040');
  await page.getByRole('button', { name: '👥 Hinzufügen' }).click();
  await expect(page.getByText('Bearbeiter hinzugefügt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bearbeiter 900000000000000040 entfernen' })).toBeVisible();
  await page.getByRole('button', { name: 'Bearbeiter 900000000000000040 entfernen' }).click();
  await expect(page.getByText('Bearbeiter entfernt.')).toBeVisible();
  await page.getByLabel('Weiterleiten an').fill('900000000000000030');
  page.once('dialog', (d) => void d.accept('Bitte du'));
  await page.getByRole('button', { name: '📨 Weiterleiten' }).click();
  await expect(page.getByText('Bewerbung weitergeleitet.')).toBeVisible();
  expect((await (await request.get(`${g}/submissions/${id}`, { headers })).json()).assigneeUserId).toBe('900000000000000030');

  // Auswertung je Bewerbungsart (Seed: eine abgelehnte, eine offene Bewerbung)
  await page.goto(`/guilds/${E2E.guildId}/applications`);
  const stats = page.getByRole('region', { name: 'Auswertung' });
  await expect(stats).toBeVisible();
  await stats.getByLabel('Auswertung für').selectOption({ label: 'Moderation (Team-Chance)' });
  await expect(stats.locator('div').filter({ hasText: /^Bewerbungen insgesamt2$/ })).toBeVisible();
  await expect(stats.locator('div').filter({ hasText: /^Abgelehnt1$/ })).toBeVisible();
  await expect(stats.locator('div').filter({ hasText: /^Ablehnungsquote100 %$/ })).toBeVisible();

  // PDF-Export
  const pdf = await request.get(`${g}/submissions/export?format=pdf&applicationId=${app.id}`, { headers });
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  const body = await pdf.body();
  expect(body.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
  expect(body.toString('latin1')).toContain('Moderation \\(Team-Chance\\)');
});
