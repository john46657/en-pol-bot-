import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RobloxService } from '../src/persons/roblox.service';

const TOKEN = 'test-bot-token-verification-0123456789abc';
const bot = { Authorization: `Bot ${TOKEN}` };
const G = '610000000000000001', U1 = '610000000000000011', U2 = '610000000000000012';
const R = { verified: '620000000000000001', unverified: '620000000000000002', sgt: '620000000000000003', officer: '620000000000000004' };
let app: INestApplication; let prisma: PrismaService;
const http = () => request(app.getHttpServer());
let about = '';

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 'vf_admin', ['System Administrator']);
  await makeUser(prisma, 'vf_off', ['Police Member']);
  const rb = app.get(RobloxService);
  vi.spyOn(rb, 'lookup').mockImplementation(async (input: string) => (input.toLowerCase() === 'builderman_vf'
    ? { id: '156', name: 'builderman_vf', displayName: 'Builder', description: '', created: null, isBanned: false, avatarUrl: null, profileUrl: 'https://www.roblox.com/users/156/profile', person: null } : null));
  vi.spyOn(rb, 'description').mockImplementation(async () => about);
  vi.spyOn(rb, 'groupRanks').mockImplementation(async () => ({ '777': 50 }));
});
afterAll(async () => {
  await prisma.robloxLink.deleteMany({ where: { discordId: { in: [U1, U2] } } });
  await prisma.robloxVerifyCode.deleteMany({ where: { discordId: { in: [U1, U2] } } });
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: `verify.` } } });
  await prisma.robloxOAuthState.deleteMany({});
  delete process.env.BOT_API_TOKEN; await app.close();
});

describe('Roblox verification (like RoVer)', () => {
  it('config: settings.manage only, validated', async () => {
    const admin = (await login(app, 'vf_admin')).agent;
    const off = (await login(app, 'vf_off')).agent;
    expect((await admin.get(`/api/v1/verification/config?guildId=${G}`)).body).toMatchObject({ enabled: false, nickname: '{roblox-name}', autoOnJoin: true });
    const cfg = { enabled: true, verifiedRoleIds: [R.verified], unverifiedRoleIds: [R.unverified], nickname: '{display-name} (@{roblox-name})', logChannelId: '630000000000000001',
      panel: { channelId: '630000000000000002' }, binds: [{ id: 'sgt', groupId: '777', minRank: 50, maxRank: 100, roleIds: [R.sgt] }, { id: 'off', groupId: '777', minRank: 1, maxRank: 49, roleIds: [R.officer] }] };
    expect((await off.put(`/api/v1/verification/config?guildId=${G}`).send(cfg)).status).toBe(403);
    expect((await admin.put(`/api/v1/verification/config?guildId=${G}`).send({ ...cfg, unverifiedRoleIds: [R.verified] })).status).toBe(400);
    expect((await admin.put(`/api/v1/verification/config?guildId=${G}`).send({ ...cfg, binds: [{ ...cfg.binds[0], minRank: 120 }] })).status).toBe(400);
    expect((await admin.put(`/api/v1/verification/config?guildId=${G}`).send(cfg)).status).toBe(200);
    // Panel posten → Bot-Auftrag; Bot meldet den Ort zurück
    expect((await admin.post(`/api/v1/verification/panel?guildId=${G}`)).status).toBe(200);
    const job = await prisma.discordOutbox.findFirst({ where: { type: 'verify.panel' }, orderBy: { createdAt: 'desc' } });
    expect(job?.payload).toMatchObject({ guildId: G, channelId: '630000000000000002', panel: { buttonLabel: 'Verifizieren' } });
    await http().post('/api/v1/bot/verify/panel-posted').set(bot).send({ guildId: G, channelId: '630000000000000002', messageId: '640000000000000001' });
    expect((await admin.get(`/api/v1/verification/config?guildId=${G}`)).body.panelMessageId).toBe('640000000000000001');
  });

  it('start → code in profile → check gives roles, group binds and nickname', async () => {
    expect((await http().post('/api/v1/bot/verify/start').set(bot).send({ guildId: '610000000000000099', discordId: U1, roblox: 'builderman_vf' })).status).toBe(409); // dort aus
    expect((await http().post('/api/v1/bot/verify/start').set(bot).send({ guildId: G, discordId: U1, roblox: 'gibtsnicht_vf' })).status).toBe(404);
    expect((await http().post('/api/v1/bot/verify/start').set(bot).send({ guildId: G, discordId: U1, roblox: 'a b' })).status).toBe(400);
    const s = await http().post('/api/v1/bot/verify/start').set(bot).send({ guildId: G, discordId: U1, roblox: 'builderman_vf' });
    expect(s.status).toBe(200);
    expect(s.body.code.split(' ')).toHaveLength(5);
    expect(s.body.roblox).toMatchObject({ id: '156', name: 'builderman_vf' });
    // Code fehlt noch
    about = 'Hallo';
    expect((await http().post('/api/v1/bot/verify/check').set(bot).send({ guildId: G, discordId: U1 })).status).toBe(400);
    about = `Ich bin Polizist!\n  ${s.body.code.toUpperCase().replace(/ /g, '  ')} `;
    const ok = await http().post('/api/v1/bot/verify/check').set(bot).send({ guildId: G, discordId: U1, discordName: 'disc_user' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ enabled: true, link: { robloxId: '156', robloxName: 'builderman_vf' }, actions: { nickname: 'Builder (@builderman_vf)' } });
    expect(ok.body.actions.add.sort()).toEqual([R.verified, R.sgt].sort());
    expect(ok.body.actions.remove.sort()).toEqual([R.unverified, R.officer].sort());
    expect((await http().post('/api/v1/bot/verify/check').set(bot).send({ guildId: G, discordId: U1 })).status).toBe(404); // Code verbraucht
    expect((await prisma.discordOutbox.findFirst({ where: { type: 'verify.log' }, orderBy: { createdAt: 'desc' } }))?.payload).toMatchObject({ channelId: '630000000000000001', text: expect.stringContaining('builderman_vf') });
  });

  it('„Mit Roblox anmelden“: settings (secret never returned), link, callback verifies and queues roles', async () => {
    const admin = (await login(app, 'vf_admin')).agent;
    expect((await http().post('/api/v1/bot/verify/oauth').set(bot).send({ guildId: G, discordId: U2 })).body).toEqual({ enabled: false });
    expect((await (await login(app, 'vf_off')).agent.put('/api/v1/verification/oauth').send({ clientId: '123456789', clientSecret: 'geheim-123456' })).status).toBe(403);
    const saved = await admin.put('/api/v1/verification/oauth').send({ clientId: '123456789', clientSecret: 'geheim-123456' });
    expect(saved.body).toMatchObject({ enabled: true, clientId: '123456789', hasSecret: true, redirectUri: expect.stringContaining('/api/v1/verify/roblox/callback') });
    expect(JSON.stringify(saved.body)).not.toContain('geheim');
    // Client-ID ändern ohne Secret → Secret bleibt
    expect((await admin.put('/api/v1/verification/oauth').send({ clientId: '987654321' })).body).toMatchObject({ enabled: true, hasSecret: true });
    const l = await http().post('/api/v1/bot/verify/oauth').set(bot).send({ guildId: G, discordId: U2, discordName: 'oauth_user' });
    expect(l.body.enabled).toBe(true);
    const url = new URL(l.body.url);
    expect(url.origin + url.pathname).toBe('https://apis.roblox.com/oauth/v1/authorize');
    expect(url.searchParams.get('client_id')).toBe('987654321');
    expect(url.searchParams.get('scope')).toBe('openid profile');
    const state = url.searchParams.get('state')!;
    // Roblox nachbauen
    const real = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const u = String(input instanceof Request ? input.url : input);
      if (u.startsWith('https://apis.roblox.com/oauth/v1/token')) { seen.push(String(init?.body)); return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }); }
      if (u.startsWith('https://apis.roblox.com/oauth/v1/userinfo')) return new Response(JSON.stringify({ sub: '2034', preferred_username: 'LenaPolice', nickname: 'Lena' }), { status: 200 });
      return real(input, init);
    }) as typeof fetch;
    try {
      expect((await http().get('/api/v1/verify/roblox/callback?code=c&state=falsch')).status).toBe(400);
      const ok = await http().get(`/api/v1/verify/roblox/callback?code=abc&state=${state}`);
      expect(ok.status).toBe(200);
      expect(ok.text).toContain('Verifiziert als LenaPolice');
      expect(seen[0]).toContain('client_secret=geheim-123456');
      expect((await http().get(`/api/v1/verify/roblox/callback?code=abc&state=${state}`)).status).toBe(400); // nur einmal
      expect((await http().get('/api/v1/verify/roblox/callback?error=access_denied')).text).toContain('abgebrochen');
    } finally { globalThis.fetch = real; }
    expect(await prisma.robloxLink.findUnique({ where: { discordId: U2 } })).toMatchObject({ robloxId: '2034', robloxName: 'LenaPolice', displayName: 'Lena', discordName: 'oauth_user' });
    expect((await prisma.discordOutbox.findFirst({ where: { type: 'verify.member' }, orderBy: { createdAt: 'desc' } }))?.payload).toEqual({ discordId: U2 });
    await prisma.robloxLink.delete({ where: { discordId: U2 } });
  });

  it('status for unverified members; whois; dashboard list and unlink', async () => {
    const st = await http().post('/api/v1/bot/verify/status').set(bot).send({ guildId: G, discordId: U2 });
    expect(st.body).toMatchObject({ enabled: true, link: null, actions: { add: [R.unverified], nickname: null } });
    expect(st.body.actions.remove).toEqual(expect.arrayContaining([R.verified, R.sgt, R.officer]));
    expect((await http().get(`/api/v1/bot/verify/whois?discordId=${U1}`).set(bot)).body.link).toMatchObject({ robloxName: 'builderman_vf', discordName: 'disc_user' });
    const admin = (await login(app, 'vf_admin')).agent;
    expect((await admin.get('/api/v1/verification/links?q=builderman_vf')).body).toMatchObject({ total: 1, items: [{ discordId: U1 }] });
    expect((await (await login(app, 'vf_off')).agent.delete(`/api/v1/verification/links/${U1}`)).status).toBe(403);
    expect((await admin.delete(`/api/v1/verification/links/${U1}`)).status).toBe(200);
    expect((await prisma.discordOutbox.findFirst({ where: { type: 'verify.member' }, orderBy: { createdAt: 'desc' } }))?.payload).toEqual({ discordId: U1 });
    expect((await admin.delete(`/api/v1/verification/links/${U1}`)).status).toBe(404);
    expect((await admin.delete('/api/v1/verification/links/abc')).status).toBe(400);
  });
});
