import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DiscordAccessService } from '../src/authz/discord-access.service';

const TOKEN = 'b'.repeat(40);
const GUILD = '555555555555555555';
const ACCESS_ROLE = '700000000000000001';
const MOD_ROLE = '700000000000000002';
const D = { mod: '710000000000000001', sup: '710000000000000002' };
const bot = () => ({ Authorization: `Bot ${TOKEN}` });
let app: INestApplication; let prisma: PrismaService;
const id: Record<string, string> = {};
/** Nachgestelltes Discord: Rollen je Mitglied auf dem Server. */
const members = new Map<string, string[]>();
const realFetch = globalThis.fetch;

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  process.env.DISCORD_TOKEN = `${Buffer.from('123456789012345678').toString('base64')}.xxxxxx.yyyyyyyyyyyyyyyyyyyyyyyy`;
  process.env.DISCORD_GUILD_ID = GUILD;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (!url.startsWith('https://discord.com/')) return realFetch(input, init);
    const m = url.match(/\/guilds\/(\d+)\/members\/(\d+)$/);
    const roles = m ? members.get(m[2]!) : undefined;
    return new Response(JSON.stringify(roles ? { roles } : { message: 'Unknown Member' }), { status: roles ? 200 : 404 });
  });
  ({ app, prisma } = await createTestApp());
  for (const [n, roles] of Object.entries({ r_admin: ['System Administrator'], r_lead: ['Police Administration'], r_sup: ['Supervisor'], r_off: ['Police Member'] })) id[n] = (await makeUser(prisma, n, roles)).id;
  // Leitung darf Rollen verwalten (Rang 10), aber besitzt z. B. kein ticket.delete
  const lead = await prisma.role.findUniqueOrThrow({ where: { name: 'Police Administration' } });
  await prisma.rolePermission.createMany({ data: [{ roleId: lead.id, permissionKey: 'roles.manage', effect: 'ALLOW' }, { roleId: lead.id, permissionKey: 'users.manage', effect: 'ALLOW' }], skipDuplicates: true });
  await prisma.rolePermission.deleteMany({ where: { roleId: lead.id, permissionKey: { in: ['ticket.delete', 'ticket.*'] } } });
});
afterAll(async () => {
  vi.restoreAllMocks();
  // gemeinsame Einstellungen nicht für andere Testdateien verändert lassen
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['auth.discord', 'team.structure', 'team.rankOrder'] } } });
  await prisma.role.updateMany({ where: { discordRoleIds: { isEmpty: false } }, data: { discordRoleIds: [] } });
  for (const k of ['BOT_API_TOKEN', 'DISCORD_TOKEN', 'DISCORD_GUILD_ID']) delete process.env[k];
  await app.close();
});

describe('roles & permissions editor', () => {
  it('roles carry priority, colour, icon, Discord roles; can be created, edited, duplicated, reordered, disabled and deleted', async () => {
    const adm = (await login(app, 'r_admin')).agent;
    const created = await adm.post('/api/v1/roles').send({ name: 'Moderator', color: '#5865F2', icon: '🛡️', description: 'Moderation', discordRoleIds: [MOD_ROLE] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Moderator', color: '#5865F2', icon: '🛡️', active: true, discordRoleIds: [MOD_ROLE] });
    const rid = created.body.id as string;
    expect((await adm.patch(`/api/v1/roles/${rid}/permissions`).send({ permission: 'ticket.close', effect: 'ALLOW' })).body.permissions).toEqual([{ permissionKey: 'ticket.close', effect: 'ALLOW' }]);
    const dup = await adm.post(`/api/v1/roles/${rid}/duplicate`).send({});
    expect(dup.body).toMatchObject({ name: 'Moderator (Kopie)', discordRoleIds: [], permissions: [{ permissionKey: 'ticket.close', effect: 'ALLOW' }] });
    const order = await adm.put('/api/v1/roles/order').send({ ids: [dup.body.id, rid] });
    expect(order.status).toBe(200);
    const list = order.body as { id: string; priority: number }[];
    expect(list.findIndex((r) => r.id === dup.body.id)).toBeLessThan(list.findIndex((r) => r.id === rid));
    expect((await adm.patch(`/api/v1/roles/${dup.body.id}`).send({ active: false })).body.active).toBe(false);
    expect((await adm.delete(`/api/v1/roles/${dup.body.id}`)).status).toBe(204);
    // Systemadministrator (Serverbesitzer) ist im Dashboard nicht änderbar
    const sa = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
    expect((await adm.patch(`/api/v1/roles/${sa.id}/permissions`).send({ permission: 'audit.view', effect: 'DENY' })).status).toBe(403);
    expect((await adm.delete(`/api/v1/roles/${sa.id}`)).status).toBe(403);
  });

  it('saving all permissions of a role at once (large set) works and audits each change', async () => {
    const adm = (await login(app, 'r_admin')).agent;
    const role = (await adm.post('/api/v1/roles').send({ name: 'Bulk Rolle' })).body;
    const all = ((await adm.get('/api/v1/permissions')).body as string[]).map((permission) => ({ permission, effect: 'ALLOW' }));
    const r = await adm.put(`/api/v1/roles/${role.id}/permissions`).send({ grants: all });
    expect(r.status).toBe(200);
    expect(r.body.permissions).toHaveLength(all.length);
    expect(await prisma.auditLog.count({ where: { entityId: role.id, action: 'role.permission.allow' } })).toBe(all.length);
    const less = await adm.put(`/api/v1/roles/${role.id}/permissions`).send({ grants: all.slice(1) });
    expect(less.body.permissions).toHaveLength(all.length - 1);
  });

  it('every permission change is audited with a readable sentence, actor and role', async () => {
    const adm = (await login(app, 'r_admin')).agent;
    const role = (await adm.post('/api/v1/roles').send({ name: 'Audit Rolle' })).body;
    await adm.patch(`/api/v1/roles/${role.id}/permissions`).send({ permission: 'ticket.delete', effect: 'ALLOW' });
    await adm.patch(`/api/v1/roles/${role.id}/permissions`).send({ permission: 'ticket.delete', effect: 'NONE' });
    const log = (await adm.get('/api/v1/audit').query({ module: 'permissions', entityId: role.id })).body.items as { action: string; summary: string; actor: { name: string }; before: unknown; after: unknown }[];
    expect(log[0]).toMatchObject({ action: 'role.permission.remove', actor: { name: 'r_admin' }, before: { role: 'Audit Rolle', permission: 'ticket.delete', effect: 'ALLOW' }, after: { effect: null } });
    expect(log[0]!.summary).toBe('r_admin hat der Rolle „Audit Rolle“ die Berechtigung ticket.delete entzogen (vorher erlaubt).');
    expect(log[1]!.summary).toContain('die Berechtigung ticket.delete erteilt');
  });

  it('no self-escalation: only roles below the own rank, only permissions one has, never own roles', async () => {
    const lead = (await login(app, 'r_lead')).agent;
    const roles = (await lead.get('/api/v1/roles')).body as { id: string; name: string }[];
    const byName = (n: string) => roles.find((r) => r.name === n)!.id;
    // eigene Rolle und höhere Rollen: nicht bearbeitbar
    expect((await lead.patch(`/api/v1/roles/${byName('Police Administration')}/permissions`).send({ permission: 'audit.export', effect: 'ALLOW' })).status).toBe(403);
    expect((await lead.patch(`/api/v1/roles/${byName('Police Administration')}`).send({ priority: 1 })).status).toBe(403);
    // niedrigere Rolle: ja – aber nur Rechte, die man selbst hat
    expect((await lead.patch(`/api/v1/roles/${byName('Supervisor')}/permissions`).send({ permission: 'personnel.view', effect: 'ALLOW' })).status).toBe(200);
    expect((await lead.patch(`/api/v1/roles/${byName('Supervisor')}/permissions`).send({ permission: 'ticket.delete', effect: 'ALLOW' })).status).toBe(403);
    expect((await lead.patch(`/api/v1/roles/${byName('Supervisor')}/permissions`).send({ permission: '*', effect: 'ALLOW' })).status).toBe(403);
    // verweigern (einschränken) darf man auch fremde Rechte
    expect((await lead.patch(`/api/v1/roles/${byName('Supervisor')}/permissions`).send({ permission: 'ticket.delete', effect: 'DENY' })).status).toBe(200);
    // neue Rolle über dem eigenen Rang anlegen: nein
    expect((await lead.post('/api/v1/roles').send({ name: 'Über mir', priority: 5 })).status).toBe(403);
    // Benutzer: eigene Rollen nie, höhere Rollen nicht vergeben, Rechte nur weitergeben, die man hat
    expect((await lead.put(`/api/v1/users/${id.r_lead!}/roles`).send({ roleIds: [byName('System Administrator')] })).status).toBe(409);
    expect((await lead.put(`/api/v1/users/${id.r_off!}/roles`).send({ roleIds: [byName('Police Member'), byName('System Administrator')] })).status).toBe(403);
    expect((await lead.put(`/api/v1/users/${id.r_off!}/roles`).send({ roleIds: [byName('Police Member'), byName('Supervisor')] })).status).toBe(200);
    expect((await lead.put(`/api/v1/users/${id.r_off!}/overrides`).send({ permission: 'ticket.delete', effect: 'ALLOW' })).status).toBe(403);
    expect((await lead.put(`/api/v1/users/${id.r_off!}/overrides`).send({ permission: 'ticket.delete', effect: 'DENY' })).status).toBe(200);
    // höherrangige Benutzer nicht verwalten (auch keine Sperre aufheben/setzen)
    expect((await lead.put(`/api/v1/users/${id.r_admin!}/active`).send({ active: false })).status).toBe(403);
  });

  it('user DENY beats an inherited ALLOW; user ALLOW adds a single permission', async () => {
    const adm = (await login(app, 'r_admin')).agent;
    await adm.put(`/api/v1/users/${id.r_sup!}/overrides`).send({ permission: 'applications.decide', effect: 'ALLOW' });
    await adm.put(`/api/v1/users/${id.r_sup!}/overrides`).send({ permission: 'reports.review', effect: 'DENY' });
    const me = (await (await login(app, 'r_sup')).agent.get('/api/v1/auth/me')).body.permissions as string[];
    expect(me).toContain('applications.decide');
    expect(me).not.toContain('reports.review');
  });

  it('disabled roles grant nothing; area permissions follow the module permissions of starter roles', async () => {
    const off = (await login(app, 'r_off')).agent;
    const before = (await off.get('/api/v1/auth/me')).body.permissions as string[];
    expect(before).toContain('dashboard.team.view');
    expect(before).not.toContain('dashboard.settings.view');
    const pm = await prisma.role.findUniqueOrThrow({ where: { name: 'Police Member' } });
    await prisma.role.update({ where: { id: pm.id }, data: { active: false } });
    expect((await off.get('/api/v1/auth/me')).body.permissions).not.toContain('dashboard.team.view');
    await prisma.role.update({ where: { id: pm.id }, data: { active: true } });
  });
});

describe('Discord role sync after login', () => {
  it('losing the access role ends the session at the next request; linked roles are given and taken', async () => {
    await (await login(app, 'r_admin')).agent.put('/api/v1/admin/settings/auth.discord').send({ value: { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [ACCESS_ROLE] } });
    const user = await makeUser(prisma, 'r_discord');
    await prisma.discordLink.create({ data: { userId: user.id, discordId: D.mod } });
    members.set(D.mod, [ACCESS_ROLE, MOD_ROLE]);
    const access = app.get(DiscordAccessService);
    access.forget();
    const agent = (await login(app, 'r_discord')).agent;
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.roles).toContain('Moderator'); // verknüpft über Rolle „Moderator“ → MOD_ROLE
    expect(me.body.permissions).toContain('ticket.close');
    // Moderator-Rolle auf Discord weg → Dashboard-Rolle weg
    members.set(D.mod, [ACCESS_ROLE]);
    access.forget(user.id);
    expect((await agent.get('/api/v1/auth/me')).body.roles).not.toContain('Moderator');
    // Zugangsrolle weg → Session sofort ungültig, auch für spätere Anfragen
    members.set(D.mod, []);
    access.forget(user.id);
    const denied = await agent.get('/api/v1/auth/me');
    expect(denied.status).toBe(401);
    expect(denied.body.details).toMatchObject({ reason: 'NO_ACCESS' });
    expect(await prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'auth.discord.access_revoked', entityId: user.id } })).toBe(1);
    // Zugangsrolle wieder da → erneute Anmeldung klappt sofort (kein veralteter Zwischenstand)
    members.set(D.mod, [ACCESS_ROLE]);
    const again = (await login(app, 'r_discord')).agent;
    expect((await again.get('/api/v1/auth/me')).status).toBe(200);
  });
});

describe('team list, voice and personal settings', () => {
  it('team list merges personnel files with Discord members, never contains voice data; voice has its own endpoint and area permission', async () => {
    const adm = (await login(app, 'r_admin')).agent;
    await adm.put('/api/v1/admin/settings/team.structure').send({ value: { teams: ['Polizei', 'Support'], offices: ['Verwaltung'] } });
    await adm.put('/api/v1/admin/settings/team.rankOrder').send({ value: ['Moderator', 'Supporter'] });
    await adm.post('/api/v1/personnel').send({ userId: id.r_sup!, rank: 'Moderator', team: 'Polizei', office: 'Verwaltung', serviceNumber: '1024' });
    members.set(D.sup, [ACCESS_ROLE]);
    await prisma.discordLink.create({ data: { userId: id.r_sup!, discordId: D.sup } });
    const http = request(app.getHttpServer());
    expect((await http.get('/api/v1/bot/team-roles').set(bot())).body.roleIds).toContain(ACCESS_ROLE);
    const member = (did: string, name: string, status: string) => ({ id: did, guildId: GUILD, username: name.toLowerCase(), displayName: name, avatar: 'https://cdn.discordapp.com/a.png', status, roleIds: [ACCESS_ROLE], joinedAt: new Date('2026-01-01').toISOString() });
    expect((await http.put('/api/v1/bot/members').set(bot()).send({ members: [member(D.sup, 'Max', 'online'), member('710000000000000009', 'Neu', 'idle')] })).status).toBe(204);
    expect((await http.put('/api/v1/bot/voice').set(bot()).send({ channels: [{ id: '720000000000000001', guildId: GUILD, name: 'Funk 1', parentId: null, parentName: null, position: 0, members: [{ id: D.sup, displayName: 'Max', avatar: null, selfMute: true, selfDeaf: false, serverMute: false, serverDeaf: false, video: false, streaming: true, since: new Date().toISOString() }] }] })).status).toBe(204);

    const off = (await login(app, 'r_off')).agent;
    const r = (await off.get('/api/v1/team/roster')).body;
    const max = r.members.find((m: { userId: string }) => m.userId === id.r_sup!);
    expect(max).toMatchObject({ name: 'Max', team: 'Polizei', rank: 'Moderator', office: 'Verwaltung', serviceNumber: '1024', status: 'online', avatar: 'https://cdn.discordapp.com/a.png' });
    expect(r.members.some((m: { name: string; userId: string | null }) => m.name === 'Neu' && m.userId === null)).toBe(true);
    expect(r.structure).toMatchObject({ teams: ['Polizei', 'Support'], offices: ['Verwaltung'], ranks: expect.arrayContaining(['Moderator']) });
    expect(JSON.stringify(r)).not.toMatch(/selfMute|streaming|voice/i);
    // Profil: Discord-ID und Rollen nur mit personnel.view/users.view
    const plain = (await login(app, (await makeUser(prisma, 'r_plain', ['Police Member'])).username)).agent;
    expect((await plain.get(`/api/v1/team/roster/${id.r_sup!}`)).body).toMatchObject({ name: 'Max', discordId: null, detailed: false });
    expect((await adm.get(`/api/v1/team/roster/${id.r_sup!}`)).body).toMatchObject({ discordId: D.sup, detailed: true });
    // Voice getrennt
    const v = (await off.get('/api/v1/team/voice')).body;
    expect(v.channels[0]).toMatchObject({ name: 'Funk 1', members: [{ displayName: 'Max', selfMute: true, streaming: true }] });
    const pm = await prisma.role.findUniqueOrThrow({ where: { name: 'Police Member' } });
    await prisma.rolePermission.deleteMany({ where: { roleId: pm.id, permissionKey: 'dashboard.voice.view' } });
    expect((await off.get('/api/v1/team/voice')).status).toBe(403);
    // Änderungen werden erkannt (Status, Austritt)
    await http.put('/api/v1/bot/members').set(bot()).send({ members: [member(D.sup, 'Max', 'offline')] });
    const act = (await off.get('/api/v1/team/activity')).body as { kind: string; name: string }[];
    expect(act.map((a) => `${a.kind}:${a.name}`)).toEqual(expect.arrayContaining(['status:Max', 'left:Neu']));
    // „Jetzt aktualisieren“ bittet den Bot um einen sofortigen Bericht
    expect((await off.post('/api/v1/team/roster/refresh')).status).toBe(200);
    expect(await prisma.discordOutbox.count({ where: { type: 'members.sync', sentAt: null } })).toBeGreaterThan(0);
    // Suche findet Teammitglieder über Dienstnummer und Büro
    const hits = (await off.get('/api/v1/search').query({ q: '1024' })).body.results;
    expect(hits).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'member', label: 'r_sup' })]));
  });

  it('personal preferences and layouts are stored per user, validated, and never affect others', async () => {
    const off = (await login(app, 'r_off')).agent;
    const prefs = { theme: 'light', accent: '#7289DA', radius: 12, favorites: ['/support-tickets'], teamList: { view: 'table', filters: { team: 'Polizei' } }, voice: { channelIds: [], categoryIds: [], sort: 'members', compact: true, maxChannels: 5 }, notifications: { muted: ['RADIO'] }, junk: 'x' };
    expect((await off.put('/api/v1/me/preferences').send({ preferences: prefs })).status).toBe(200);
    const layouts = { active: 'tickets', items: [{ id: 'standard', name: 'Standard', widgets: [{ widget: 'stats' }] }, { id: 'tickets', name: 'Tickets', widgets: [{ widget: 'tickets', size: 'L' }, { widget: 'voice', minimized: true }] }] };
    expect((await off.put('/api/v1/me/layouts').send({ layouts })).status).toBe(200);
    const got = (await (await login(app, 'r_off')).agent.get('/api/v1/me/preferences')).body; // anderes „Gerät“
    expect(got.preferences).toMatchObject({ theme: 'light', accent: '#7289DA', teamList: { view: 'table' } });
    expect(got.preferences.junk).toBeUndefined();
    expect(got.layouts.items[1].widgets[0]).toMatchObject({ widget: 'tickets', size: 'L', minimized: false, hidden: false });
    expect((await (await login(app, (await makeUser(prisma, 'r_other', ['Police Member'])).username)).agent.get('/api/v1/me/preferences')).body.preferences).toEqual({});
    expect((await off.put('/api/v1/me/preferences').send({ preferences: { accent: 'red' } })).status).toBe(400);
    expect((await off.put('/api/v1/me/preferences').send({ preferences: { background: { type: 'image', value: 'javascript:alert(1)' } } })).status).toBe(400);
    expect((await off.put('/api/v1/me/layouts').send({ layouts: { active: 'nope', items: [{ id: 'a', name: 'A', widgets: [] }] } })).status).toBe(400);
    // ausgeblendete Benachrichtigungsarten erscheinen nicht
    await prisma.notification.createMany({ data: [{ userId: id.r_off!, type: 'RADIO', title: 'Funk' }, { userId: id.r_off!, type: 'PERSONNEL', title: 'Rang' }] });
    const n = (await off.get('/api/v1/notifications')).body;
    expect(n.items.map((x: { type: string }) => x.type)).toEqual(['PERSONNEL']);
    expect(n.unread).toBe(1);
  });
});

describe('servers run separately', () => {
  const A = '800000000000000001', B = '800000000000000002';
  it('server roles only apply on their server; team list, voice and settings are per server', async () => {
    const adm = (await login(app, 'r_admin')).agent;
    const role = (await adm.post('/api/v1/roles').set('X-Guild-Id', A).send({ name: 'Mod Server A' })).body;
    expect(role.guildId).toBe(A);
    await adm.patch(`/api/v1/roles/${role.id}/permissions`).set('X-Guild-Id', A).send({ permission: 'audit.view', effect: 'ALLOW' });
    const u = await makeUser(prisma, 'r_server');
    await adm.put(`/api/v1/users/${u.id}/roles`).set('X-Guild-Id', A).send({ roleIds: [role.id] });
    const agent = (await login(app, 'r_server')).agent;
    const inA = (await agent.get('/api/v1/auth/me').set('X-Guild-Id', A)).body;
    expect(inA).toMatchObject({ roles: ['Mod Server A'], servers: [A], guildId: A });
    expect(inA.permissions).toContain('audit.view');
    expect((await agent.get('/api/v1/audit').set('X-Guild-Id', A)).status).toBe(200);
    // anderer Server und „Alle Server“: die Rolle gilt dort nicht
    expect((await agent.get('/api/v1/audit').set('X-Guild-Id', B)).status).toBe(403);
    expect((await agent.get('/api/v1/audit')).status).toBe(403);
    // Rollen anderer Server sind im Server-Kontext unsichtbar und nicht bearbeitbar
    expect(((await adm.get('/api/v1/roles').set('X-Guild-Id', B)).body as { id: string }[]).some((r) => r.id === role.id)).toBe(false);
    expect((await adm.patch(`/api/v1/roles/${role.id}`).set('X-Guild-Id', B).send({ name: 'xx' })).status).toBe(404);
    // Teamliste und Voice je Server
    const http = request(app.getHttpServer());
    const mem = (g: string, did: string, name: string) => ({ id: did, guildId: g, username: name, displayName: name, avatar: null, status: 'online', roleIds: [ACCESS_ROLE], joinedAt: null });
    await http.put('/api/v1/bot/members').set(bot()).send({ members: [mem(A, '730000000000000001', 'NurA'), mem(B, '730000000000000002', 'NurB')] });
    await http.put('/api/v1/bot/voice').set(bot()).send({ channels: [A, B].map((g, i) => ({ id: `74000000000000000${i}`, guildId: g, name: `Funk ${g === A ? 'A' : 'B'}`, parentId: null, parentName: null, position: 0, members: [] })) });
    const names = async (g: string) => ((await adm.get('/api/v1/team/roster').set('X-Guild-Id', g)).body.members as { name: string }[]).map((m) => m.name);
    expect(await names(A)).toEqual(['NurA']);
    expect(await names(B)).toEqual(['NurB']);
    expect(((await adm.get('/api/v1/team/voice').set('X-Guild-Id', B)).body.channels as { name: string }[]).map((c) => c.name)).toEqual(['Funk B']);
    // Einstellungen: Server-Wert überschreibt den gemeinsamen nur auf diesem Server
    expect((await adm.put(`/api/v1/admin/settings/team.structure@${A}`).send({ value: { teams: ['Team A'], offices: [] } })).status).toBe(200);
    expect((await adm.put(`/api/v1/admin/settings/auth.discord@${A}`).send({ value: {} })).status).toBe(400);
    expect((await adm.get('/api/v1/team/structure').set('X-Guild-Id', A)).body.teams).toContain('Team A');
    expect((await adm.get('/api/v1/team/structure').set('X-Guild-Id', B)).body.teams).not.toContain('Team A');
  });
});
