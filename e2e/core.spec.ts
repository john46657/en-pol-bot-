import { expect, test } from '@playwright/test';
import { ADMIN_PASSWORD } from '../playwright.config';
import { adminApi, createUser, uiLogin } from './helpers';

test('login rejects bad credentials, accepts good ones, and logout ends the session', async ({ page }) => {
  await uiLogin(page, 'admin', 'wrong-password', { expectSuccess: false });
  await expect(page.getByRole('alert')).toContainText('Benutzername oder Passwort ist falsch.');
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await expect(page.getByRole('heading', { name: /Willkommen, System Administrator/ })).toBeVisible();
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/); // protected route redirects
});

test('person → ticket creation is linked and visible on the person record', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/persons');
  await page.getByRole('button', { name: 'Neue Person' }).click();
  await page.getByLabel('Roblox-Name oder Roblox-ID *').fill('E2E_Speeder');
  await page.getByLabel('Roblox-Benutzer-ID (optional)').fill('5550001');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'E2E_Speeder' })).toBeVisible();

  await page.goto('/tickets');
  await page.getByRole('button', { name: 'Neuer Strafzettel' }).click();
  await page.getByLabel('Person *').fill('E2E_Speeder');
  await page.getByRole('option', { name: /E2E_Speeder/ }).click();
  await page.getByLabel('Grund *').fill('Speeding 120 in a 60 zone');
  await page.getByLabel('Betrag').fill('300');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: /^Strafzettel T-/ })).toBeVisible();
  await expect(page.getByText(/Strafzettel T-.* ausgestellt/).first()).toBeVisible(); // timeline

  await page.goto('/persons');
  await page.getByText('E2E_Speeder').click();
  await page.getByRole('tab', { name: 'Strafzettel' }).click();
  await expect(page.getByText('Speeding 120 in a 60 zone')).toBeVisible();
});

test('dispatch workflow: unit + incident, assign, progress and close', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/dispatch');
  await page.getByRole('button', { name: 'Neue Einheit' }).click();
  await page.getByLabel('Funkrufname *').fill('E2E-1');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await page.getByLabel('Status von E2E-1').selectOption('AVAILABLE');

  await page.getByRole('button', { name: 'Neuer Einsatz' }).click();
  await page.getByLabel('Titel *').fill('E2E bank robbery');
  await page.getByLabel('Priorität').selectOption('HIGH');
  await page.getByRole('button', { name: 'Speichern' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'E2E bank robbery' });
  await expect(row).toBeVisible();
  await row.getByLabel(/Einheit zu .* zuweisen/).selectOption({ label: 'E2E-1' });
  await expect(row.getByText('Zugewiesen')).toBeVisible();
  for (const next of ['Anfahrt', 'Vor Ort', 'Abschluss']) {
    await row.getByRole('button', { name: new RegExp(`→ ${next}`) }).click();
    await expect(row.getByText(next, { exact: true }).first()).toBeVisible();
  }
  await row.getByRole('button', { name: /→ Geschlossen/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E bank robbery' })).toHaveCount(0); // leaves the active board
});

test('permission denial: a police member cannot reach admin pages or see admin navigation', async ({ page }) => {
  const u = await createUser('e2e_rookie', 'Police Member');
  await uiLogin(page, u.username, u.password);
  await expect(page.getByRole('link', { name: 'Personen', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit-Logs' })).toHaveCount(0);
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toBeVisible();
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Kein Zugriff' })).toBeVisible();
  // the API refuses as well, regardless of UI
  const res = await page.request.get('/api/v1/audit');
  expect(res.status()).toBe(403);
});

test('complaint workflow via UI', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/complaints');
  await page.getByRole('button', { name: 'Neue Beschwerde' }).click();
  await page.getByLabel('Kategorie *').fill('Conduct');
  await page.getByLabel('Beschreibung *').fill('Officer was rude during the traffic stop on Main Street.');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: /^Beschwerde C-/ })).toBeVisible();
  await expect(page.getByText('Eingegangen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Vorprüfung starten' }).click();
  await expect(page.getByText('Vorprüfung', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await expect(page.getByText('Geschlossen', { exact: true })).toBeVisible();
});

test('public application → staff review workflow', async ({ page, browser }) => {
  const pub = await browser.newContext();
  const p = await pub.newPage();
  await p.goto('/apply');
  await p.getByLabel('Roblox-Benutzername *').fill('E2E_Applicant');
  for (const l of ['Welche Erfahrung', 'Wann und wie oft', 'Warum möchtest du', 'Was bedeutet für dich', 'Wie gut kennst du']) await p.getByLabel(new RegExp(`^${l}`)).fill(`${l} – Antwort`);
  await p.getByRole('button', { name: 'Bewerbung absenden' }).click();
  await expect(p.getByRole('status')).toContainText('APP-');
  await pub.close();

  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/applications');
  // Entscheidung direkt in der Liste (wie die Buttons in Discord), mit Grund per DM
  const card = page.locator('div').filter({ has: page.getByText('E2E_Applicant', { exact: true }) }).filter({ has: page.getByRole('button', { name: 'Annehmen mit Grund' }) }).last();
  await card.getByRole('button', { name: 'Annehmen mit Grund' }).click();
  await page.getByLabel(/^Grund/).fill('Strong interview');
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await page.getByLabel('Status').selectOption({ label: 'Angenommen' });
  await expect(page.locator('h2').getByText('Angenommen', { exact: true })).toBeVisible();
});


test('Studio: custom field + accent colour apply to forms, validation and detail view', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/admin/studio');
  await page.getByRole('button', { name: 'Feld hinzufügen' }).first().click();
  await page.getByLabel('Personen: Feldschlüssel').fill('license');
  await page.getByLabel('Personen: Feldname').fill('License class');
  await page.getByLabel('Personen: Feldtyp').selectOption('select');
  await page.getByLabel('Personen: Feldoptionen').fill('A, B, None');
  await page.getByLabel('Personen: Feldschlüssel').locator('xpath=ancestor::div[1]').getByLabel('Pflichtfeld').check();
  // automatisch gespeichert – kein Klick nötig
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('tab', { name: 'Design' }).click();
  await page.getByRole('radio', { name: /Grün/ }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())).toBe('#22c55e');

  await page.goto('/persons');
  await page.getByRole('button', { name: 'Neue Person' }).click();
  await page.getByLabel('Roblox-Name oder Roblox-ID *').fill('E2E_Custom');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByText('License class ist erforderlich')).toBeVisible(); // client-side required
  await page.getByLabel('License class *').selectOption('B');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: 'E2E_Custom' })).toBeVisible();
  await expect(page.getByText('License class')).toBeVisible();
  await expect(page.getByRole('definition').filter({ hasText: /^B$/ })).toBeVisible();

  // aufräumen: spätere Läufe/Tests sollen keine Pflichtfelder erben
  const api = await adminApi();
  expect((await api.put('/api/v1/admin/settings/studio.customFields', { data: { value: { persons: [], vehicles: [] } } })).ok()).toBeTruthy();
  expect((await api.put('/api/v1/admin/settings/theme.accent', { data: { value: 'blue' } })).ok()).toBeTruthy();
});

test('MDT: permission-aware search and quick action create an incident', async ({ page }) => {
  const api = await adminApi();
  await api.post('/api/v1/persons', { data: { robloxUsername: 'MDT_Target', robloxUserId: '6660001' } });
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/mdt');
  await page.getByLabel('MDT-Suche').fill('MDT_Target');
  await expect(page.getByRole('link', { name: /MDT_Target/ })).toBeVisible();
  await page.getByLabel('MDT-Suche').fill('6660001'); // Roblox ID
  await expect(page.getByRole('link', { name: /MDT_Target/ })).toBeVisible();
  await page.getByRole('button', { name: 'Einsatz anlegen' }).click();
  await page.getByLabel('Titel *').fill('E2E quick action incident');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: /E2E quick action incident/ })).toBeVisible();

  // a police member sees only the actions they may perform
  const u = await createUser('e2e_mdt_user', 'Police Member');
  const ctx = await page.context().browser()!.newContext();
  const p2 = await ctx.newPage();
  await uiLogin(p2, u.username, u.password);
  await p2.goto('/mdt');
  await expect(p2.getByRole('button', { name: 'Bericht anlegen' })).toBeVisible();
  await expect(p2.getByRole('button', { name: 'Ermittlung anlegen' })).toHaveCount(0);
  await expect(p2.getByRole('button', { name: 'Fahndung anlegen' })).toHaveCount(0);
  await ctx.close();
});

test('Team dashboard: supervisor sets duty status of an officer', async ({ page }) => {
  const api = await adminApi();
  const roles = await (await api.get('/api/v1/roles')).json();
  const role = roles.find((r: { name: string }) => r.name === 'Police Member');
  const user = await (await api.post('/api/v1/users', { data: { username: 'e2e_team_off', displayName: 'Team Officer', password: 'rookie-password-123', roleIds: [role.id] } })).json();
  expect((await api.post('/api/v1/personnel', { data: { userId: user.id, rank: 'Officer', callsign: 'e2e-7' } })).ok()).toBeTruthy();
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/team');
  const row = page.getByRole('row').filter({ hasText: 'Team Officer' });
  await expect(row).toContainText('Außer Dienst');
  await row.getByLabel('Dienststatus von Team Officer').selectOption('ON_DUTY');
  await expect(row).toContainText('Im Dienst');
  await expect(page.getByText('Im Dienst', { exact: true }).first()).toBeVisible();
});

test('Discord: link code from the UI is redeemed by the bot API, then unlinked', async ({ page, request }) => {
  const BOT = { Authorization: 'Bot e2e-bot-token-0123456789-abcdefghijklmnop' };
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Discord verknüpfen' }).click();
  await page.getByRole('button', { name: 'Code erzeugen' }).click();
  const text = await page.getByTestId('link-code').innerText();
  const code = text.split('code:')[1]!.trim();
  expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const res = await request.post('http://localhost:3100/api/v1/bot/link', { headers: BOT, data: { code, discordId: '300000000000000001' } });
  expect(res.status()).toBe(200);
  // erneut öffnen: Status „verknüpft“
  await page.reload();
  await page.getByRole('button', { name: 'Discord verknüpfen' }).click();
  await expect(page.getByText('verknüpft', { exact: true })).toBeVisible();
  // Der Bot darf jetzt im Namen des Admins lesen, aber keine Admin-Routen nutzen
  const ok = await request.get('http://localhost:3100/api/v1/persons', { headers: { ...BOT, 'X-Discord-User': '300000000000000001' } });
  expect(ok.status()).toBe(200);
  const blocked = await request.get('http://localhost:3100/api/v1/users', { headers: { ...BOT, 'X-Discord-User': '300000000000000001' } });
  expect(blocked.status()).toBe(403);
  await page.getByRole('button', { name: 'Verknüpfung lösen' }).click();
  await expect(page.getByRole('button', { name: 'Code erzeugen' })).toBeVisible();
  const after = await request.get('http://localhost:3100/api/v1/persons', { headers: { ...BOT, 'X-Discord-User': '300000000000000001' } });
  expect(after.status()).toBe(401);
});

test('autosave: personal design survives a reload and another device; status shows saved', async ({ page, browser }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/me/settings');
  await page.getByRole('radio', { name: '☀️ Hell' }).click();
  await page.getByRole('button', { name: 'Akzentfarbe #7289DA' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  // anderes „Gerät“: gleiche Einstellungen aus der Datenbank
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await uiLogin(p2, 'admin', ADMIN_PASSWORD);
  await expect.poll(() => p2.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim().toLowerCase())).toBe('#7289da');
  await ctx.close();
  // zurück auf dunkel (andere Tests)
  await page.getByRole('radio', { name: '🌙 Dunkel' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
});

test('autosave: a change made right before navigating away is not lost (stored locally first)', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/me/settings');
  await page.getByRole('radio', { name: 'Kompakt' }).click();
  await page.goto('/teamlist'); // sofort weg – ohne auf das Speichern zu warten
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.density)).toBe('compact');
  const api = await adminApi();
  await expect.poll(async () => (await (await api.get('/api/v1/me/preferences')).json()).preferences.density).toBe('compact');
  await page.goto('/me/settings');
  await page.getByRole('radio', { name: 'Komfortabel' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
});

test('roles editor: create a role, change a permission in the matrix – saved automatically and audited', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/admin/roles');
  await page.getByRole('button', { name: 'Neue Rolle', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E Moderator');
  await page.getByRole('button', { name: 'ticket.close: nicht gesetzt' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
  const api = await adminApi();
  const role = ((await (await api.get('/api/v1/roles')).json()) as { name: string; permissions: { permissionKey: string; effect: string }[] }[]).find((r) => r.name === 'E2E Moderator');
  expect(role?.permissions).toEqual([{ permissionKey: 'ticket.close', effect: 'ALLOW' }]);
  await page.getByRole('tab', { name: 'Berechtigungsmatrix' }).click();
  await page.getByRole('button', { name: 'E2E Moderator – ticket.delete: nicht gesetzt' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
  await page.goto('/admin/audit');
  await expect(page.getByText(/die Berechtigung ticket\.delete erteilt/).first()).toBeVisible();
});

test('dashboard: edit mode adds the voice widget separately from the team list; team list page has cards/table', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Dashboard bearbeiten' }).click();
  await page.getByRole('button', { name: 'Auf Standard zurücksetzen' }).click();
  await expect(page.getByRole('heading', { name: '🎙️ Aktive Voice-Channels' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '👥 Teamliste' })).toBeVisible();
  const voice = page.locator('section').filter({ has: page.getByRole('heading', { name: '🎙️ Aktive Voice-Channels' }) });
  await voice.getByRole('button', { name: 'Entfernen' }).click();
  await expect(page.getByRole('heading', { name: '🎙️ Aktive Voice-Channels' })).toHaveCount(0);
  await page.getByLabel('Widget hinzufügen').selectOption({ label: '🎙️ Aktive Voice-Channels' });
  await expect(page.getByRole('heading', { name: '🎙️ Aktive Voice-Channels' })).toBeVisible();
  await page.getByRole('button', { name: 'Fertig' }).click();
  await page.goto('/teamlist');
  await expect(page.getByPlaceholder('🔍 Teammitglied suchen')).toBeVisible();
  await page.getByRole('button', { name: 'Tabellenansicht' }).click();
  await expect(page.getByRole('button', { name: 'Tabellenansicht' })).toHaveAttribute('aria-pressed', 'true');
});

test('Funk-Codes: standard codes, edit with autosave, find via global search', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.getByRole('link', { name: 'Funk-Codes' }).click();
  await page.getByRole('button', { name: 'Standard-Codes einfügen' }).click();
  await expect(page.getByLabel('Bedeutung 10-4')).toHaveValue('Verstanden');
  await page.getByLabel('Bedeutung 10-4').fill('Verstanden, Ende');
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel('Bedeutung 10-4')).toHaveValue('Verstanden, Ende');
  await page.keyboard.press('Control+k');
  await page.getByLabel('Suchbegriff').fill('10-99');
  await page.getByRole('dialog').getByRole('button', { name: /10-99/ }).click();
  await expect(page).toHaveURL(/radio-codes\?q=10-99/);
});

test('Team-Chance: open it (autosave) – the public application page shows it', async ({ page, browser }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.getByRole('link', { name: 'Team-Chance' }).click();
  await page.getByLabel('Titel').fill('E2E Team-Chance');
  await page.getByRole('checkbox', { name: /Team-Chance ist geschlossen/ }).check();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('📣 offen')).toBeVisible({ timeout: 10_000 });
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.goto('/apply');
  await expect(p.getByText('📣 E2E Team-Chance – jetzt offen')).toBeVisible();
  await ctx.close();
  await page.getByRole('checkbox', { name: /Team-Chance ist geöffnet/ }).uncheck();
  await expect(page.getByRole('status').filter({ hasText: 'Alle Änderungen gespeichert' })).toBeVisible({ timeout: 10_000 });
});

test('system notice appears as popup and in the notification center; menu is German', async ({ page, browser }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  const u = await createUser('e2e_notice', 'Police Member');
  await uiLogin(other, u.username, u.password);
  await page.goto('/admin/settings');
  await page.getByLabel('Titel').fill('Wartung heute Abend');
  await page.getByRole('button', { name: 'Senden' }).click();
  await expect(page.getByText(/An \d+ Benutzer gesendet/)).toBeVisible();
  await expect(other.getByText('⚠️ Wartung heute Abend').first()).toBeVisible({ timeout: 10_000 });
  await ctx.close();
  await expect(page.getByRole('link', { name: 'Personen', exact: true })).toBeVisible(); // Dashboard ist durchgehend deutsch
});
