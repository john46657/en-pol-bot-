import { expect, test } from '@playwright/test';
import { ADMIN_PASSWORD } from '../playwright.config';
import { adminApi, createUser, uiLogin } from './helpers';

test('login rejects bad credentials, accepts good ones, and logout ends the session', async ({ page }) => {
  await uiLogin(page, 'admin', 'wrong-password', { expectSuccess: false });
  await expect(page.getByRole('alert')).toContainText('Invalid username or password.');
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await expect(page.getByRole('heading', { name: /Welcome, System Administrator/ })).toBeVisible();
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/); // protected route redirects
});

test('person → ticket creation is linked and visible on the person record', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/persons');
  await page.getByRole('button', { name: 'New person' }).click();
  await page.getByLabel('Roblox username *').fill('E2E_Speeder');
  await page.getByLabel('Roblox user ID').fill('5550001');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'E2E_Speeder' })).toBeVisible();

  await page.goto('/tickets');
  await page.getByRole('button', { name: 'New ticket' }).click();
  await page.getByLabel('Person *').fill('E2E_Speeder');
  await page.getByRole('option', { name: /E2E_Speeder/ }).click();
  await page.getByLabel('Reason *').fill('Speeding 120 in a 60 zone');
  await page.getByLabel('Amount').fill('300');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /^Ticket T-/ })).toBeVisible();
  await expect(page.getByText(/Ticket T-.* issued/).first()).toBeVisible(); // timeline

  await page.goto('/persons');
  await page.getByText('E2E_Speeder').click();
  await page.getByRole('tab', { name: 'Tickets' }).click();
  await expect(page.getByText('Speeding 120 in a 60 zone')).toBeVisible();
});

test('dispatch workflow: unit + incident, assign, progress and close', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/dispatch');
  await page.getByRole('button', { name: 'New unit' }).click();
  await page.getByLabel('Callsign *').fill('E2E-1');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByLabel('Status of E2E-1').selectOption('AVAILABLE');

  await page.getByRole('button', { name: 'New incident' }).click();
  await page.getByLabel('Title *').fill('E2E bank robbery');
  await page.getByLabel('Priority').selectOption('HIGH');
  await page.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'E2E bank robbery' });
  await expect(row).toBeVisible();
  await row.getByLabel(/Assign unit to/).selectOption({ label: 'E2E-1' });
  await expect(row.getByText('ASSIGNED')).toBeVisible();
  for (const next of ['EN ROUTE', 'ON SCENE', 'CLEARING']) {
    await row.getByRole('button', { name: new RegExp(`→ ${next}`) }).click();
    await expect(row.getByText(next, { exact: true }).first()).toBeVisible();
  }
  await row.getByRole('button', { name: /→ CLOSED/ }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E bank robbery' })).toHaveCount(0); // leaves the active board
});

test('permission denial: a police member cannot reach admin pages or see admin navigation', async ({ page }) => {
  const u = await createUser('e2e_rookie', 'Police Member');
  await uiLogin(page, u.username, u.password);
  await expect(page.getByRole('link', { name: 'Persons' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit' })).toHaveCount(0);
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  // the API refuses as well, regardless of UI
  const res = await page.request.get('/api/v1/audit');
  expect(res.status()).toBe(403);
});

test('complaint workflow via UI', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/complaints');
  await page.getByRole('button', { name: 'New complaint' }).click();
  await page.getByLabel('Category *').fill('Conduct');
  await page.getByLabel('Description *').fill('Officer was rude during the traffic stop on Main Street.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /^Complaint C-/ })).toBeVisible();
  await expect(page.getByText('RECEIVED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start screening' }).click();
  await expect(page.getByText('SCREENING', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('CLOSED', { exact: true })).toBeVisible();
});

test('public application → staff review workflow', async ({ page, browser }) => {
  const pub = await browser.newContext();
  const p = await pub.newPage();
  await p.goto('/apply');
  await p.getByLabel('Roblox username *').fill('E2E_Applicant');
  for (const l of ['Experience', 'Availability', 'Motivation', 'Roleplay Knowledge', 'ER:LC Knowledge']) await p.getByLabel(`${l} *`).fill(`${l} answer`);
  await p.getByRole('button', { name: 'Submit application' }).click();
  await expect(p.getByRole('status')).toContainText('APP-');
  await pub.close();

  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/applications');
  await page.getByText('E2E_Applicant').click();
  for (const b of ['Start screening', 'Move to interview', 'Ready for decision']) await page.getByRole('button', { name: b }).click();
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.getByLabel(/Reason/).fill('Strong interview');
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText('ACCEPTED', { exact: true })).toBeVisible();
});


test('Studio: custom field + accent colour apply to forms, validation and detail view', async ({ page }) => {
  await uiLogin(page, 'admin', ADMIN_PASSWORD);
  await page.goto('/admin/studio');
  await page.getByRole('button', { name: 'Add field' }).first().click();
  await page.getByLabel('persons field key').fill('license');
  await page.getByLabel('persons field label').fill('License class');
  await page.getByLabel('persons field type').selectOption('select');
  await page.getByLabel('persons field options').fill('A, B, None');
  await page.getByLabel('persons field key').locator('xpath=ancestor::div[1]').getByLabel('required').check();
  await page.getByRole('button', { name: 'Save custom fields' }).click();
  await expect(page.getByRole('status')).toContainText('Saved.');
  await page.getByRole('tab', { name: 'Theme' }).click();
  await page.getByRole('radio', { name: /green/ }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())).toBe('#22c55e');

  await page.goto('/persons');
  await page.getByRole('button', { name: 'New person' }).click();
  await page.getByLabel('Roblox username *').fill('E2E_Custom');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('License class is required')).toBeVisible(); // client-side required
  await page.getByLabel('License class *').selectOption('B');
  await page.getByRole('button', { name: 'Save' }).click();
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
  await page.getByLabel('MDT search').fill('MDT_Target');
  await expect(page.getByRole('link', { name: /MDT_Target/ })).toBeVisible();
  await page.getByLabel('MDT search').fill('6660001'); // Roblox ID
  await expect(page.getByRole('link', { name: /MDT_Target/ })).toBeVisible();
  await page.getByRole('button', { name: 'Create Incident' }).click();
  await page.getByLabel('Title *').fill('E2E quick action incident');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /E2E quick action incident/ })).toBeVisible();

  // a police member sees only the actions they may perform
  const u = await createUser('e2e_mdt_user', 'Police Member');
  const ctx = await page.context().browser()!.newContext();
  const p2 = await ctx.newPage();
  await uiLogin(p2, u.username, u.password);
  await p2.goto('/mdt');
  await expect(p2.getByRole('button', { name: 'Create Report' })).toBeVisible();
  await expect(p2.getByRole('button', { name: 'Create Investigation' })).toHaveCount(0);
  await expect(p2.getByRole('button', { name: 'Create Wanted' })).toHaveCount(0);
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
  await expect(row).toContainText('OFF DUTY');
  await row.getByLabel('Duty status of Team Officer').selectOption('ON_DUTY');
  await expect(row).toContainText('ON DUTY');
  await expect(page.getByText('On duty', { exact: true }).first()).toBeVisible();
});
