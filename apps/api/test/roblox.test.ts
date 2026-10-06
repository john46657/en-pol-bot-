import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RobloxService } from '../src/persons/roblox.service';

let app: INestApplication; let prisma: PrismaService;
const calls: string[] = [];
const USER = { id: 4242424242, name: 'Builderman_LC', displayName: 'Bob', description: 'Hi', created: '2015-03-01T00:00:00Z', isBanned: false };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });

beforeAll(async () => {
  process.env.ROBLOX_LOOKUP = 'on';
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === 'https://users.roblox.com/v1/usernames/users') {
      calls.push(url);
      const names = (JSON.parse(String(init?.body)) as { usernames: string[] }).usernames;
      return json({ data: names[0]!.toLowerCase() === USER.name.toLowerCase() ? [{ id: USER.id, name: USER.name, displayName: USER.displayName }] : [] });
    }
    if (url.startsWith('https://users.roblox.com/v1/users/')) { calls.push(url); return url.endsWith(`/${USER.id}`) ? json(USER) : json({ errors: [{ message: 'not found' }] }, 404); }
    if (url.startsWith('https://thumbnails.roblox.com/')) return json({ data: [{ targetId: USER.id, state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/abc/150/150/AvatarHeadshot/Png' }] });
    return realFetch(input, init);
  });
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'rb_off', ['Police Member']);
  await makeUser(prisma, 'rb_none', []);
});
afterAll(async () => { vi.restoreAllMocks(); await app.close(); });

describe('Roblox lookup (MDT search)', () => {
  it('parses names, ids and profile links', () => {
    expect(RobloxService.parse('Builderman_LC')).toEqual({ name: 'Builderman_LC' });
    expect(RobloxService.parse('@Builderman_LC')).toEqual({ name: 'Builderman_LC' });
    expect(RobloxService.parse('4242424242')).toEqual({ id: '4242424242' });
    expect(RobloxService.parse('https://www.roblox.com/users/4242424242/profile')).toEqual({ id: '4242424242' });
    expect(RobloxService.parse('LC 1001')).toBeNull();
    expect(RobloxService.parse('ab')).toBeNull();
  });

  it('finds the account by name or id with avatar, links an existing record, caches, needs persons.view', async () => {
    const off = (await login(app, 'rb_off')).agent;
    expect((await (await login(app, 'rb_none')).agent.get('/api/v1/persons/roblox?q=Builderman_LC')).status).toBe(403);
    const byName = await off.get('/api/v1/persons/roblox?q=builderman_lc');
    expect(byName.status).toBe(200);
    expect(byName.body.profile).toMatchObject({ id: String(USER.id), name: USER.name, displayName: 'Bob', avatarUrl: expect.stringContaining('rbxcdn.com'), profileUrl: `https://www.roblox.com/users/${USER.id}/profile`, person: null });
    const before = calls.length;
    await off.get('/api/v1/persons/roblox?q=Builderman_LC'); // aus dem Zwischenspeicher
    expect(calls.length).toBe(before);
    expect((await off.get(`/api/v1/persons/roblox?q=${USER.id}`)).body.profile.name).toBe(USER.name);
    expect((await off.get('/api/v1/persons/roblox?q=Nobody_Here_1')).body.profile).toBeNull();
    expect((await off.get('/api/v1/persons/roblox?q=99999')).body.profile).toBeNull();
    expect((await off.get('/api/v1/persons/roblox?q=LC%201001')).body.profile).toBeNull();
    // Akte anlegen (mit ID) → wird danach verlinkt
    const admin = await makeUser(prisma, 'rb_admin', ['System Administrator']);
    expect(admin.id).toBeTruthy();
    const created = await (await login(app, 'rb_admin')).agent.post('/api/v1/persons').send({ robloxUsername: USER.name, robloxUserId: String(USER.id) });
    expect(created.status).toBe(201);
    expect((await off.get(`/api/v1/persons/roblox?q=${USER.id}`)).body.profile.person).toEqual({ id: created.body.person.id, robloxUsername: USER.name });
  });

  it('allows Discord and Roblox images in the page security policy', async () => {
    const res = await (await login(app, 'rb_off')).agent.get('/api/v1/auth/me');
    expect(String(res.headers['content-security-policy'])).toMatch(/img-src 'self' data: blob: https:\/\/cdn\.discordapp\.com https:\/\/\*\.rbxcdn\.com/);
  });
  it('new person with only the name or only the ID: the rest comes from Roblox', async () => {
    await prisma.person.deleteMany({ where: { robloxUserId: String(USER.id) } });
    const admin = (await login(app, 'rb_admin')).agent;
    const byId = await admin.post('/api/v1/persons').send({ robloxUsername: String(USER.id) });
    expect(byId.status).toBe(201);
    expect(byId.body.person).toMatchObject({ robloxUsername: USER.name, robloxUserId: String(USER.id) });
    // gleicher Spieler nochmal per Name → schon vorhanden
    const again = await admin.post('/api/v1/persons').send({ robloxUsername: 'builderman_lc' });
    expect(again.status).toBe(409);
    // unbekannt bei Roblox → wird so gespeichert, wie eingegeben
    const unknown = await admin.post('/api/v1/persons').send({ robloxUsername: 'Nobody_Here_1' });
    expect(unknown.body.person).toMatchObject({ robloxUsername: 'Nobody_Here_1', robloxUserId: null });
  });
});
