import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RobloxService } from '../src/persons/roblox.service';

let app: INestApplication; let prisma: PrismaService;
const ID = 5151515151;
const USER = { id: ID, name: 'Keller_RP', displayName: 'Noah', description: 'RP-Spieler', created: '2018-06-01T00:00:00Z', isBanned: false, hasVerifiedBadge: true };
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
let groupsDown = false;

beforeAll(async () => {
  process.env.ROBLOX_LOOKUP = 'on';
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === 'https://users.roblox.com/v1/usernames/users') {
      const names = (JSON.parse(String(init?.body)) as { usernames: string[] }).usernames;
      return json({ data: names[0]!.toLowerCase() === USER.name.toLowerCase() ? [{ id: ID, name: USER.name }] : [] });
    }
    if (url === `https://users.roblox.com/v1/users/${ID}`) return json(USER);
    if (url.startsWith(`https://users.roblox.com/v1/users/${ID}/username-history`)) return json({ data: [{ name: 'OldKeller' }, { name: 'KellerNoah' }] });
    if (url.includes('thumbnails.roblox.com/v1/users/avatar?')) return json({ data: [{ state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/body/420/420/Avatar/Png' }] });
    if (url.includes('thumbnails.roblox.com/v1/users/avatar-headshot')) return json({ data: [{ state: 'Completed', imageUrl: 'https://tr.rbxcdn.com/head/150/150/AvatarHeadshot/Png' }] });
    if (url.endsWith('/friends/count')) return json({ count: 12 });
    if (url.endsWith('/followers/count')) return json({ count: 340 });
    if (url.endsWith('/followings/count')) return json({ count: 7 });
    if (url.startsWith('https://groups.roblox.com/v2/users/')) return groupsDown ? json({}, 503) : json({ data: [{ group: { id: 99, name: 'EN Polizei', memberCount: 500 }, role: { name: 'Officer', rank: 10 } }] });
    if (url.includes('roblox.com')) return json({}, 404);
    return realFetch(input, init);
  });
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'mr_officer', ['Police Member']);
  await makeUser(prisma, 'mr_none', []);
});
afterAll(async () => { vi.restoreAllMocks(); process.env.ROBLOX_LOOKUP = 'off'; await app.close(); });

describe('MDT: Roblox-Profil in der Bürgerakte', () => {
  it('zeigt Avatar, Konto, Freunde, Gruppen und frühere Namen; trägt fehlende Roblox-ID nach', async () => {
    const p = await prisma.person.create({ data: { robloxUsername: 'Keller_RP' } });
    const officer = (await login(app, 'mr_officer')).agent;
    const r = await officer.get(`/api/v1/mdt/citizens/${p.id}/roblox`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'ok', profile: {
      id: String(ID), name: 'Keller_RP', displayName: 'Noah', verified: true, isBanned: false, friends: 12, followers: 340, following: 7,
      avatarUrl: 'https://tr.rbxcdn.com/body/420/420/Avatar/Png', headshotUrl: 'https://tr.rbxcdn.com/head/150/150/AvatarHeadshot/Png',
      groups: [{ name: 'EN Polizei', role: 'Officer', rank: 10 }], previousNames: ['OldKeller', 'KellerNoah'],
    } });
    expect((await prisma.person.findUniqueOrThrow({ where: { id: p.id } })).robloxUserId).toBe(String(ID));
    const none = (await login(app, 'mr_none')).agent;
    expect((await none.get(`/api/v1/mdt/citizens/${p.id}/roblox`)).status).toBe(403);
  });

  it('unbekanntes Konto → not_found; einzelne Teile nicht erreichbar → null statt geraten', async () => {
    const officer = (await login(app, 'mr_officer')).agent;
    const ghost = await prisma.person.create({ data: { robloxUsername: 'GibtEsNicht_123' } });
    expect((await officer.get(`/api/v1/mdt/citizens/${ghost.id}/roblox`)).body).toEqual({ status: 'not_found', profile: null });
    groupsDown = true;
    // dieselbe ID käme aus dem Zwischenspeicher (10 Minuten) – darum ein frischer Dienst
    const fresh = new RobloxService(prisma);
    const d = await fresh.profileDetails(String(ID));
    expect(d).toMatchObject({ groups: null, friends: 12 });
  });
});
