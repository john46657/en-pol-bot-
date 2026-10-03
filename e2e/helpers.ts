import { expect, request, type Page } from '@playwright/test';
import { ADMIN_PASSWORD, API_URL } from '../playwright.config';

export async function uiLogin(page: Page, username: string, password: string, opts: { expectSuccess?: boolean } = {}) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  if (opts.expectSuccess ?? true) await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** API-Client mit Admin-Session für das Anlegen von Testdaten (Node-Requests senden keinen Origin-Header). */
export async function adminApi() {
  const ctx = await request.newContext({ baseURL: API_URL });
  const res = await ctx.post('/api/v1/auth/login', { data: { username: 'admin', password: ADMIN_PASSWORD } });
  expect(res.ok()).toBeTruthy();
  return ctx;
}

export async function createUser(username: string, roleName: string, password = 'rookie-password-123') {
  const api = await adminApi();
  const roles = await (await api.get('/api/v1/roles')).json();
  const role = roles.find((r: { name: string }) => r.name === roleName);
  const res = await api.post('/api/v1/users', { data: { username, displayName: username, password, roleIds: [role.id] } });
  expect(res.ok()).toBeTruthy();
  return { username, password };
}
