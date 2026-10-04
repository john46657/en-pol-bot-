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

/** Praxistest Phase 37: Design-API gegen die echte, gebaute API (Fake-Discord, Besitzer-Session). */
test('Dashboard-Design über die echte API: Theme anlegen, ändern, aktivieren, exportieren, zurücksetzen', async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${await token()}` };
  const d = `${API}/guilds/${E2E.guildId}/design`;
  const get = async (p: string) => (await request.get(d + p, { headers })).json();

  // Server in der Datenbank anlegen lassen (wie beim Öffnen im Dashboard)
  expect((await request.get(`${API}/guilds/${E2E.guildId}`, { headers })).ok()).toBe(true);

  const overview = await get('');
  expect(overview.themes.map((t: { name: string }) => t.name).sort()).toEqual([
    'Blue',
    'Midnight',
    'Purple',
    'Red',
    'Standard',
  ]);

  const created = await (
    await request.post(`${d}/themes`, {
      headers,
      data: { name: 'PrinceArmy', description: 'Test' },
    })
  ).json();
  const upd = await request.put(`${d}/themes/${created.id}`, {
    headers,
    data: {
      config: {
        colors: { dark: { primary: '#FF8800' } },
        background: { global: { type: 'gradient', color2: '#112233' } },
      },
    },
  });
  expect(upd.ok()).toBe(true);
  const bad = await request.put(`${d}/themes/${created.id}`, {
    headers,
    data: { config: { background: { global: { imageUrl: 'javascript:alert(1)' } } } },
  });
  expect(bad.status()).toBe(400);

  await request.post(`${d}/themes/${created.id}/activate`, { headers });
  const eff = await get('/effective');
  expect(eff.themeName).toBe('PrinceArmy');
  expect(eff.config.colors.dark.primary).toBe('#FF8800');
  expect(eff.config.background.global.type).toBe('gradient');

  const out = await (await request.get(`${d}/themes/${created.id}/export`, { headers })).json();
  expect(JSON.stringify(out)).not.toContain(E2E.guildId);

  expect((await request.post(`${d}/reset`, { headers, data: {} })).status()).toBe(400);
  const reset = await (
    await request.post(`${d}/reset`, { headers, data: { confirm: true } })
  ).json();
  expect(reset.themeName).toBe('Standard');
  expect((await get('/effective')).config.colors.dark.primary).toBe('#5865F2');

  // Ohne Anmeldung kein Zugriff
  expect((await request.get(`${d}/effective`)).status()).toBe(401);
});
