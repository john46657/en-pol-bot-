import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';

const APP_ID = '123456789012345678';
const GUILD = '555555555555555555';
const ROLE_POLICE = '666666666666666661';
let app: INestApplication; let prisma: PrismaService;
/** Nachgestelltes Discord: wer ist eingeloggt, wer ist auf dem Server (mit welchen Rollen). */
const discord: { user: { id: string; username: string; global_name: string | null }; members: Map<string, string[]>; tokenOk: boolean } = { user: { id: '111111111111111111', username: 'Oscar.Officer', global_name: 'Oscar' }, members: new Map(), tokenOk: true };
const realFetch = globalThis.fetch;

beforeAll(async () => {
  process.env.DISCORD_CLIENT_SECRET = 'test-client-secret';
  process.env.DISCORD_TOKEN = `${Buffer.from(APP_ID).toString('base64')}.xxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy`;
  process.env.DISCORD_GUILD_ID = GUILD;
  process.env.PASSWORD_LOGIN = 'true'; // Notfall-Schalter – für die Einrichtung der Tests (Admin per Passwort)
  process.env.ADMIN_DISCORD_IDS = '444444444444444444';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://discord.com/')) return realFetch(input, init);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/oauth2/token')) {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get('client_id')).toBe(APP_ID);
      expect(body.get('redirect_uri')).toMatch(/\/api\/v1\/auth\/discord\/callback$/);
      return discord.tokenOk ? json(200, { access_token: 'at' }) : json(400, { error: 'invalid_grant' });
    }
    if (url.endsWith('/users/@me')) return json(200, discord.user);
    const m = url.match(/\/guilds\/(\d+)\/members\/(\d+)$/);
    if (m) { const roles = m[1] === GUILD ? discord.members.get(m[2]!) : undefined; return roles ? json(200, { roles }) : json(404, { message: 'Unknown Member' }); }
    return json(404, {});
  });
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'dl_admin', ['System Administrator']);
});
afterAll(async () => {
  vi.restoreAllMocks();
  for (const k of ['DISCORD_CLIENT_SECRET', 'DISCORD_TOKEN', 'DISCORD_GUILD_ID', 'PASSWORD_LOGIN', 'ADMIN_DISCORD_IDS']) delete process.env[k];
  await app.close();
});
beforeEach(() => { discord.tokenOk = true; });

/** Kompletter Ablauf im Browser: Klick auf „Mit Discord anmelden“ → Discord → Rücksprung. */
async function discordLogin(agent = request.agent(app.getHttpServer())) {
  const start = await agent.get('/api/v1/auth/discord');
  expect(start.status).toBe(302);
  const to = new URL(start.headers.location as string);
  expect(to.origin + to.pathname).toBe('https://discord.com/oauth2/authorize');
  expect(to.searchParams.get('scope')).toBe('identify');
  const back = await agent.get(`/api/v1/auth/discord/callback?code=abc&state=${to.searchParams.get('state')}`);
  return { agent, location: String(back.headers.location), back };
}

describe('login with Discord', () => {
  it('gives admins a ready invite link for the bot (bot + slash commands, administrator, no code grant)', async () => {
    const admin = (await login(app, 'dl_admin')).agent;
    const r = await admin.get('/api/v1/auth/discord/invite');
    expect(r.status).toBe(200);
    const u = new URL(r.body.url);
    expect(u.origin + u.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(u.searchParams.get('client_id')).toBe(APP_ID);
    expect(u.searchParams.get('scope')).toBe('bot applications.commands');
    expect(u.searchParams.get('response_type')).toBeNull(); // sonst verlangt Discord eine Weiterleitung
    expect(u.searchParams.get('permissions')).toBe('8'); // Administrator
    expect((await request(app.getHttpServer()).get('/api/v1/auth/discord/invite')).status).toBe(401);
  });

  it('admins can add the bot to a server through the dashboard (code grant is redeemed by the system)', async () => {
    const admin = (await login(app, 'dl_admin')).agent;
    const start = await admin.get('/api/v1/auth/discord/install');
    expect(start.status).toBe(302);
    const to = new URL(start.headers.location as string);
    expect(to.searchParams.get('scope')).toBe('bot applications.commands');
    expect(to.searchParams.get('permissions')).toBe('8');
    expect(to.searchParams.get('response_type')).toBe('code');
    expect(to.searchParams.get('redirect_uri')).toMatch(/\/api\/v1\/auth\/discord\/callback$/);
    const back = await admin.get(`/api/v1/auth/discord/callback?code=abc&state=${to.searchParams.get('state')}&guild_id=1`);
    expect(String(back.headers.location)).toMatch(/\/admin\/settings\?discord=installed/);
    expect(await prisma.auditLog.count({ where: { action: 'discord.bot_installed' } })).toBe(1);
    // fehlgeschlagener Code → zurück in die Einstellungen mit Hinweis
    discord.tokenOk = false;
    const s2 = new URL((await admin.get('/api/v1/auth/discord/install')).headers.location as string);
    expect(String((await admin.get(`/api/v1/auth/discord/callback?code=abc&state=${s2.searchParams.get('state')}`)).headers.location)).toMatch(/\/admin\/settings\?discord=install_failed$/);
    discord.tokenOk = true;
    // nur mit Recht (Gast ohne Login)
    expect((await request(app.getHttpServer()).get('/api/v1/auth/discord/install')).status).toBe(401);
  });

  it('offers Discord on the login page', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/auth/providers')).body).toEqual({ discord: true, password: true });
  });

  it('only members of the Discord server get a new account; it starts without roles', async () => {
    const out = await discordLogin();
    expect(out.location).toMatch(/\/login\?discord=not_member$/);
    discord.members.set(discord.user.id, []);
    const ok = await discordLogin();
    expect(ok.location).toMatch(/\/$/);
    const me = await ok.agent.get('/api/v1/auth/me');
    expect(me.body).toMatchObject({ username: 'oscar.officer', displayName: 'Oscar', roles: [] });
    expect(await prisma.discordLink.count({ where: { discordId: discord.user.id } })).toBe(1);
    // mit Passwort kann man sich bei einem Discord-Konto nicht anmelden
    expect((await login(app, 'oscar.officer', '!discord-login-only')).res.status).toBe(401);
  });

  it('maps Discord roles to system roles on every login (added and removed)', async () => {
    const admin = (await login(app, 'dl_admin')).agent;
    expect((await admin.put('/api/v1/admin/settings/auth.discord').send({ value: { signup: true, requireGuild: true, roleMap: [{ discordRoleId: ROLE_POLICE, role: 'Police Member' }] } })).status).toBe(200);
    discord.members.set(discord.user.id, [ROLE_POLICE]);
    const a = await discordLogin();
    expect((await a.agent.get('/api/v1/auth/me')).body.roles).toEqual(['Police Member']);
    discord.members.set(discord.user.id, []);
    const b = await discordLogin();
    expect((await b.agent.get('/api/v1/auth/me')).body.roles).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: 'auth.discord.roles_synced' } })).toBe(2);
  });

  it('team role: without one of the configured Discord roles no access to the MDT (owners always get in)', async () => {
    const admin = (await login(app, 'dl_admin')).agent;
    const TEAM = '777777777777777777';
    expect((await admin.put('/api/v1/admin/settings/auth.discord').send({ value: { signup: true, requireGuild: true, roleMap: [], teamRoleIds: ['nope'] } })).status).toBe(400);
    expect((await admin.put('/api/v1/admin/settings/auth.discord').send({ value: { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [TEAM] } })).status).toBe(200);
    discord.members.set(discord.user.id, [ROLE_POLICE]);
    expect((await discordLogin()).location).toMatch(/discord=no_team_role$/);
    discord.members.set(discord.user.id, [ROLE_POLICE, TEAM]);
    const ok = await discordLogin();
    expect((await ok.agent.get('/api/v1/auth/me')).status).toBe(200);
    // Besitzer (ADMIN_DISCORD_IDS) braucht die Team-Rolle nicht
    const before = discord.user;
    discord.user = { ...before, id: '444444444444444444', username: 'owner' };
    discord.members.set('444444444444444444', []);
    expect((await (await discordLogin()).agent.get('/api/v1/auth/me')).status).toBe(200);
    discord.user = before;
    await admin.put('/api/v1/admin/settings/auth.discord').send({ value: { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] } });
  });

  it('rejects forged or replayed callbacks, other browsers, failed token exchange and disabled sign-up', async () => {
    const agent = request.agent(app.getHttpServer());
    const to = new URL((await agent.get('/api/v1/auth/discord')).headers.location as string);
    const state = to.searchParams.get('state');
    // anderer Browser (ohne Bindungs-Cookie)
    expect((await request(app.getHttpServer()).get(`/api/v1/auth/discord/callback?code=abc&state=${state}`)).headers.location).toMatch(/discord=state$/);
    // Zustand ist danach verbraucht
    expect((await agent.get(`/api/v1/auth/discord/callback?code=abc&state=${state}`)).headers.location).toMatch(/discord=state$/);
    expect((await agent.get('/api/v1/auth/discord/callback?code=abc&state=forged')).headers.location).toMatch(/discord=state$/);
    expect((await agent.get('/api/v1/auth/discord/callback?error=access_denied')).headers.location).toMatch(/discord=cancelled$/);
    discord.tokenOk = false;
    expect((await discordLogin()).location).toMatch(/discord=failed$/);
    discord.tokenOk = true;
    const admin = (await login(app, 'dl_admin')).agent;
    await admin.put('/api/v1/admin/settings/auth.discord').send({ value: { signup: false, requireGuild: true, roleMap: [] } });
    const prev = discord.user;
    discord.user = { id: '222222222222222222', username: 'newbie', global_name: null };
    discord.members.set('222222222222222222', []);
    expect((await discordLogin()).location).toMatch(/discord=no_account$/);
    discord.user = prev;
  });

  it('a signed-in user links Discord by logging in with Discord (instead of a code)', async () => {
    const admin = (await login(app, 'dl_admin')).agent;
    discord.user = { id: '333333333333333333', username: 'admin', global_name: 'Admin' };
    const start = await admin.get('/api/v1/auth/discord/link');
    const state = new URL(start.headers.location as string).searchParams.get('state');
    const back = await admin.get(`/api/v1/auth/discord/callback?code=abc&state=${state}`);
    expect(back.headers.location).toMatch(/\/\?discord=linked$/);
    const me = await prisma.user.findUniqueOrThrow({ where: { username: 'dl_admin' } });
    expect((await prisma.discordLink.findUniqueOrThrow({ where: { userId: me.id } })).discordId).toBe('333333333333333333');
    // danach klappt auch der Discord-Login für dieses Konto (Admin ist kein Server-Mitglied → abgelehnt, solange Server-Pflicht an ist)
    expect((await discordLogin()).location).toMatch(/discord=not_member$/);
    discord.members.set('333333333333333333', []);
    const ok = await discordLogin();
    expect((await ok.agent.get('/api/v1/auth/me')).body.username).toBe('dl_admin');
    expect((await request(app.getHttpServer()).get('/api/v1/auth/discord/link')).status).toBe(401);
  });

  it('only Discord: password login is off once Discord is set up; ADMIN_DISCORD_IDS always get in as admin', async () => {
    delete process.env.PASSWORD_LOGIN;
    expect((await request(app.getHttpServer()).get('/api/v1/auth/providers')).body).toEqual({ discord: true, password: false });
    const pw = await login(app, 'dl_admin');
    expect(pw.res.status).toBe(403);
    // Besitzer: nicht auf dem Server, Anmeldung neuer Konten aus – kommt trotzdem rein und ist Admin
    discord.user = { id: '444444444444444444', username: 'owner', global_name: 'Owner' };
    const ok = await discordLogin();
    expect(ok.location).toMatch(/\/$/);
    expect((await ok.agent.get('/api/v1/auth/me')).body.roles).toContain('System Administrator');
    process.env.PASSWORD_LOGIN = 'true';
    expect((await login(app, 'dl_admin')).res.status).toBe(200);
  });
});
