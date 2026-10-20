import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ALL_PERMISSIONS } from '@enrp/shared';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, login, makeUser, registerServer } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { WeeklyResetService, scopeOfSpace } from '../src/duty/weekly-reset';
import { ownSpace } from '../src/server-links/server-links.service';

const TOKEN = 'm'.repeat(40);
const A = '910000000000000001', B = '910000000000000002', C = '910000000000000003', NOPE = '910000000000000099';
const D_BOT = '920000000000000001', R_DISCORD = '930000000000000001', CH = '940000000000000001';
let app: INestApplication; let prisma: PrismaService;
const srv: Record<string, string> = {};
const uid: Record<string, string> = {};
const roleId: Record<string, string> = {};
const bot = (guild?: string, roles?: string[]) => ({ Authorization: `Bot ${TOKEN}`, 'X-Discord-User': D_BOT, ...(guild ? { 'X-Guild-Id': guild } : {}), ...(roles ? { 'X-Discord-Roles': roles.join(',') } : {}) });
const ADMIN_GRANTS = ['servers.view', 'servers.manage', 'modules.view', 'modules.manage', 'roles.view', 'roles.manage', 'audit.view', 'reports.*', 'team.*', 'cad.view', 'persons.view', 'incidents.view', 'dashboard.view'];
const OFFICER_GRANTS = ['reports.view', 'reports.create', 'reports.edit', 'reports.submit', 'team.view', 'cad.view', 'persons.view', 'incidents.view', 'dashboard.view'];

async function serverRole(guildId: string, name: string, grants: string[], priority: number) {
  const keys = grants.flatMap((g) => (g.endsWith('.*') ? ALL_PERMISSIONS.filter((p) => p.startsWith(g.slice(0, -1))) : [g]));
  const r = await prisma.role.create({ data: { guildId, name, priority, permissions: { create: keys.map((permissionKey) => ({ permissionKey, effect: 'ALLOW' })) } } });
  return r.id;
}

beforeAll(async () => {
  process.env.BOT_API_TOKEN = TOKEN;
  ({ app, prisma } = await createTestApp());
  for (const n of ['ms_gadmin']) uid[n] = (await makeUser(prisma, n, ['System Administrator'])).id;
  for (const n of ['ms_admina', 'ms_adminb', 'ms_offa', 'ms_offb', 'ms_bot']) uid[n] = (await makeUser(prisma, n, [])).id;
  srv.A = (await registerServer(prisma, A, [uid.ms_admina!, uid.ms_offa!], 'Polizei A')).id;
  srv.B = (await registerServer(prisma, B, [uid.ms_adminb!, uid.ms_offb!], 'Polizei B')).id;
  srv.C = (await registerServer(prisma, C, [], 'Fremd C')).id;
  roleId.adminA = await serverRole(A, 'Serveradmin', ADMIN_GRANTS, 10);
  roleId.adminB = await serverRole(B, 'Serveradmin', ADMIN_GRANTS, 10);
  // gleicher Rollenname auf zwei Servern = zwei verschiedene Rollen
  roleId.offA = await serverRole(A, 'Officer', OFFICER_GRANTS, 90);
  roleId.offB = await serverRole(B, 'Officer', OFFICER_GRANTS, 90);
  await prisma.userRole.createMany({ data: [{ userId: uid.ms_admina!, roleId: roleId.adminA }, { userId: uid.ms_adminb!, roleId: roleId.adminB }, { userId: uid.ms_offa!, roleId: roleId.offA }, { userId: uid.ms_offb!, roleId: roleId.offB }] });
  await prisma.discordLink.create({ data: { userId: uid.ms_bot!, discordId: D_BOT } });
});
afterAll(async () => { await app.close(); });

const as = async (n: string) => (await login(app, n)).agent;
const http = () => request(app.getHttpServer());

describe('Mandantentrennung', () => {
  let reportId = '';
  it('Server-A-Benutzer sieht keine Daten von Server B; Datensatz-IDs helfen nicht', async () => {
    const offA = await as('ms_offa'), offB = await as('ms_offb');
    const r = await offA.post('/api/v1/reports').set('X-Guild-Id', A).send({ type: 'GENERAL', title: 'Nur Server A', content: { text: 'intern' } });
    expect(r.status).toBe(201);
    reportId = r.body.id;
    const listB = (await offB.get('/api/v1/reports?pageSize=100').set('X-Guild-Id', B)).body.items as { id: string }[];
    expect(listB.map((x) => x.id)).not.toContain(reportId);
    expect((await offB.get(`/api/v1/reports/${reportId}`).set('X-Guild-Id', B)).status).toBe(404);
  });

  it('manipulierte Server-IDs geben keinen Zugriff (kein Mitglied, nicht registriert, „Alle Server“ ohne globale Rolle)', async () => {
    const offA = await as('ms_offa');
    const viaB = await offA.get(`/api/v1/reports/${reportId}`).set('X-Guild-Id', B);
    expect(viaB.status).toBe(403);
    expect(viaB.body.details?.reason).toBe('NOT_MEMBER');
    expect((await offA.get('/api/v1/reports').set('X-Guild-Id', NOPE)).status).toBe(403);
    expect((await offA.get('/api/v1/reports')).status).toBe(403); // Server-Rollen gelten nicht serverübergreifend
    expect(await prisma.auditLog.count({ where: { action: 'access.denied', actorUserId: uid.ms_offa, result: 'DENIED' } })).toBeGreaterThan(0);
  });

  it('identische Rollennamen auf zwei Servern führen nicht zu gemeinsamer Autorisierung', async () => {
    // offA wird zusätzlich Mitglied auf B – seine Rolle „Officer“ (A) gilt dort trotzdem nicht
    await registerServer(prisma, B, [uid.ms_offa!]);
    const offA = await as('ms_offa');
    expect((await offA.get('/api/v1/reports').set('X-Guild-Id', B)).status).toBe(403);
    await prisma.serverMembership.update({ where: { serverId_userId: { serverId: srv.B!, userId: uid.ms_offa! } }, data: { status: 'LEFT' } });
  });

  it('Server-Admins verwalten nur ihren Server; fremde Server sind unsichtbar', async () => {
    const adminA = await as('ms_admina');
    const list = (await adminA.get('/api/v1/servers')).body as { guildId: string }[];
    expect(list.map((s) => s.guildId)).toEqual([A]);
    expect((await adminA.get(`/api/v1/servers/${srv.B}`)).status).toBe(404);
    expect((await adminA.get(`/api/v1/servers/${srv.B}/modules`)).status).toBe(404);
    expect((await adminA.get(`/api/v1/servers/${srv.B}/audit-logs`)).status).toBe(404);
    // Rolle eines anderen Servers über den eigenen Server-Pfad: nicht vorhanden
    expect((await adminA.patch(`/api/v1/servers/${srv.A}/roles/${roleId.offB}`).send({ name: 'gekapert' })).status).toBe(404);
    expect((await adminA.put(`/api/v1/servers/${srv.A}/roles/${roleId.offB}/permissions`).send({ grants: [] })).status).toBe(404);
  });
});

describe('Module je Server', () => {
  it('deaktiviertes CAD ist über API und Discord-Befehl gesperrt; MDT geht weiter; Server B unberührt', async () => {
    const adminA = await as('ms_admina');
    const mods = (await adminA.get(`/api/v1/servers/${srv.A}/modules`)).body as { key: string; enabled: boolean; version: number }[];
    const cad = mods.find((m) => m.key === 'cad')!;
    expect(cad).toMatchObject({ enabled: true, version: 0 });
    const off = await adminA.patch(`/api/v1/servers/${srv.A}/modules/cad`).send({ enabled: false, version: 0 });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ enabled: false, version: 1 });
    const offA = await as('ms_offa'), offB = await as('ms_offb');
    const denied = await offA.get('/api/v1/cad/incidents').set('X-Guild-Id', A);
    expect(denied.status).toBe(403);
    expect(denied.body.details?.reason).toBe('MODULE_DISABLED');
    expect((await offA.get('/api/v1/persons').set('X-Guild-Id', A)).status).toBe(200); // MDT ohne CAD
    expect((await offB.get('/api/v1/cad/incidents').set('X-Guild-Id', B)).status).toBe(200); // anderer Server unberührt
    // effektive Rechte (serverseitig berechnet) und /auth/me ohne CAD-Rechte
    const eff = (await offA.get(`/api/v1/servers/${srv.A}/users/${uid.ms_offa}/effective-permissions`)).body;
    expect(eff.allowed).not.toContain('cad.view');
    expect(eff.details.find((d: { permission: string }) => d.permission === 'cad.view')).toMatchObject({ allowed: false, blockedBy: 'MODULE_DISABLED' });
    expect((await offA.get('/api/v1/auth/me').set('X-Guild-Id', A)).body.permissions).not.toContain('cad.view');
    // Discord-Befehl (Bot im Namen eines Mitglieds) prüft dasselbe
    await prisma.discordRoleMapping.create({ data: { serverId: srv.A!, discordRoleId: R_DISCORD, roleId: roleId.offA! } });
    expect((await http().get('/api/v1/cad/incidents').set(bot(A, [R_DISCORD]))).status).toBe(403);
    // wieder an (aktueller Stand: Version 1)
    expect((await adminA.patch(`/api/v1/servers/${srv.A}/modules/cad`).send({ enabled: true, version: 1 })).status).toBe(200);
  });

  it('veraltete Ansicht überschreibt nichts (409); Systemmodul nicht abschaltbar; Einstellungen streng validiert und dauerhaft', async () => {
    const adminA = await as('ms_admina');
    const stale = await adminA.patch(`/api/v1/servers/${srv.A}/modules/cad`).send({ enabled: false, version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.details?.reason).toBe('VERSION_CONFLICT');
    expect((await adminA.get(`/api/v1/servers/${srv.A}/modules/cad`)).body).toMatchObject({ enabled: true, version: 2 });
    expect((await adminA.patch(`/api/v1/servers/${srv.A}/modules/core`).send({ enabled: false, version: 0 })).status).toBe(400);
    expect((await adminA.patch(`/api/v1/servers/${srv.A}/modules/shift_logs`).send({ settings: { unbekannt: true }, version: 0 })).status).toBe(400);
    const ok = await adminA.patch(`/api/v1/servers/${srv.A}/modules/shift_logs`).send({ settings: { weeklyReset: { enabled: true, channelId: CH, topN: 3 } }, version: 0 });
    expect(ok.status).toBe(200);
    // nach „Neuladen“ (neue Sitzung) und direkt in der Datenbank vorhanden
    expect((await (await as('ms_admina')).get(`/api/v1/servers/${srv.A}/modules/shift_logs`)).body.settings).toEqual({ weeklyReset: { enabled: true, channelId: CH, topN: 3, mention: true } });
    expect(await prisma.auditLog.count({ where: { action: { in: ['module.disable', 'module.enable', 'module.settings'] }, serverId: A } })).toBeGreaterThanOrEqual(3);
  });
});

describe('Rechte: global vs. Server', () => {
  it('Registrieren/Deaktivieren nur globale Systemadministratoren; Serveradmin nur auf eigenem Server', async () => {
    const adminA = await as('ms_admina'), gadmin = await as('ms_gadmin');
    expect((await adminA.post('/api/v1/servers').send({ guildId: '910000000000000004', name: 'Neu' })).status).toBe(403);
    const reg = await gadmin.post('/api/v1/servers').send({ guildId: '910000000000000004', name: 'Neu' });
    expect(reg.status).toBe(201);
    expect((await gadmin.post('/api/v1/servers').send({ guildId: '910000000000000004', name: 'Doppelt' })).status).toBe(409);
    const s = (await adminA.get(`/api/v1/servers/${srv.A}`)).body;
    expect((await adminA.patch(`/api/v1/servers/${srv.A}`).send({ status: 'DISABLED', version: s.version })).status).toBe(403);
    expect((await adminA.patch(`/api/v1/servers/${srv.A}`).send({ name: 'Polizei Alpha', version: s.version })).body.name).toBe('Polizei Alpha');
    // Archivieren („Löschen“) behält alle Daten
    expect((await gadmin.delete(`/api/v1/servers/${reg.body.id}`)).body.archivedAt).toBeTruthy();
    expect(await prisma.discordServer.count({ where: { id: reg.body.id } })).toBe(1);
  });

  it('Rollenänderungen wirken auf effektive Rechte; reservierter Name; nur eigene Rechte vergeben', async () => {
    const adminA = await as('ms_admina'), offA = await as('ms_offa');
    expect((await offA.get(`/api/v1/servers/${srv.A}/users/${uid.ms_offa}/effective-permissions`)).body.allowed).not.toContain('reports.review');
    const cur = (await adminA.get(`/api/v1/servers/${srv.A}/roles/${roleId.offA}/permissions`)).body as { permission: string; effect: 'ALLOW' | 'DENY' }[];
    const put = await adminA.put(`/api/v1/servers/${srv.A}/roles/${roleId.offA}/permissions`).send({ grants: [...cur, { permission: 'reports.review', effect: 'ALLOW' }, { permission: 'persons.view', effect: 'DENY' }] });
    expect(put.status).toBe(200);
    const eff = (await offA.get(`/api/v1/servers/${srv.A}/users/${uid.ms_offa}/effective-permissions`)).body.allowed as string[];
    expect(eff).toContain('reports.review');
    expect(eff).not.toContain('persons.view'); // DENY vor ALLOW
    expect((await offA.get('/api/v1/persons').set('X-Guild-Id', A)).status).toBe(403);
    // Rechte, die man selbst nicht hat, kann man nicht vergeben
    expect((await adminA.put(`/api/v1/servers/${srv.A}/roles/${roleId.offA}/permissions`).send({ grants: [{ permission: 'users.manage', effect: 'ALLOW' }] })).status).toBe(403);
    expect((await adminA.post(`/api/v1/servers/${srv.A}/roles`).send({ name: 'System Administrator' })).status).toBe(409);
    const created = await adminA.post(`/api/v1/servers/${srv.A}/roles`).send({ name: 'Officer' });
    expect(created.status).toBe(409); // gleicher Name nur auf DIESEM Server verboten …
    expect((await adminA.post(`/api/v1/servers/${srv.A}/roles`).send({ name: 'Leitstelle' })).body.guildId).toBe(A);
  });

  it('Discord-Befehle: Mitgliedschaft und Rollen-Zuordnung gelten nur auf dem Server der Interaktion', async () => {
    expect((await http().get('/api/v1/incidents').set(bot(A, [R_DISCORD]))).status).toBe(200);
    const m = await prisma.serverMembership.findUniqueOrThrow({ where: { serverId_userId: { serverId: srv.A!, userId: uid.ms_bot! } } });
    expect(m).toMatchObject({ status: 'MEMBER', source: 'DISCORD', discordRoleIds: [R_DISCORD] });
    expect((await http().get('/api/v1/incidents').set(bot(B, [R_DISCORD]))).status).toBe(403); // Zuordnung gilt nur auf A
    expect((await http().get('/api/v1/incidents').set(bot(undefined, [R_DISCORD]))).status).toBe(403); // DM: keine Server-Rechte
    // Discord-Rolle verloren → Rolle auf A weg
    expect((await http().get('/api/v1/incidents').set(bot(A, []))).status).toBe(403);
  });
});

describe('Shift Logs je Server', () => {
  it('eigene Wochenrangliste und eigener Kanal je Server; Archive fremder Server unsichtbar', async () => {
    const svc = app.get(WeeklyResetService);
    const space = ownSpace(A), scope = scopeOfSpace(space);
    const W1 = new Date('2031-03-02T23:00:00Z'), W2 = new Date('2031-03-09T23:00:00Z'); // Mo 03.03.2031 00:00 MEZ
    expect(await svc.tick(new Date(W1.getTime() + 3_600_000), [scope])).toEqual({ archived: [], posted: 0 });
    await prisma.dutySession.createMany({ data: [
      { userId: uid.ms_offa!, serverId: space, status: 'ON_DUTY', startedAt: new Date(W1.getTime() + 10 * 3_600_000), endedAt: new Date(W1.getTime() + 12 * 3_600_000) },
      { userId: uid.ms_offb!, serverId: ownSpace(B), status: 'ON_DUTY', startedAt: new Date(W1.getTime() + 10 * 3_600_000), endedAt: new Date(W1.getTime() + 15 * 3_600_000) },
    ] });
    const r = await svc.tick(new Date(W2.getTime() + 60_000), [scope]);
    expect(r).toEqual({ archived: [`${scope}|2031-03-03`], posted: 1 });
    const arch = await prisma.dutyWeekArchive.findUniqueOrThrow({ where: { scope_weekStart: { scope, weekStart: W1 } } });
    expect((arch.ranking as { userId: string; minutes: number }[]).map((x) => [x.userId, x.minutes])).toEqual([[uid.ms_offa, 120]]); // nur Server A
    expect(arch.discordChannelId).toBe(CH);
    const post = await prisma.discordOutbox.findFirstOrThrow({ where: { type: 'message.post', payload: { path: ['stateKey'], equals: `wr-${A}-2031-03-03` } } });
    expect(post.payload).toMatchObject({ channelId: CH });
    expect(await svc.tick(new Date(W2.getTime() + 120_000), [scope])).toEqual({ archived: [], posted: 0 }); // kein doppelter Reset
    const offA = await as('ms_offa'), offB = await as('ms_offb');
    expect((await offA.get('/api/v1/team/week/archives').set('X-Guild-Id', A)).body.map((x: { id: string }) => x.id)).toContain(arch.id);
    expect((await offB.get('/api/v1/team/week/archives').set('X-Guild-Id', B)).body.map((x: { id: string }) => x.id)).not.toContain(arch.id);
    const adminB = await as('ms_adminb');
    expect((await adminB.get(`/api/v1/team/week/archives/${arch.id}`).set('X-Guild-Id', B)).status).toBe(404);
    expect((await offA.get('/api/v1/team/week').set('X-Guild-Id', A)).body).toMatchObject({ scope, enabled: true });
  });
});

describe('Audit-Logs je Server', () => {
  it('nur Berechtigte lesen; Einträge enthalten Server, Aktion, Ergebnis; Audit bleibt unveränderlich', async () => {
    const adminA = await as('ms_admina'), offA = await as('ms_offa');
    const items = (await adminA.get(`/api/v1/servers/${srv.A}/audit-logs?pageSize=200`)).body.items as { action: string; serverId: string; result: string }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.serverId === A)).toBe(true);
    expect(items.map((i) => i.action)).toEqual(expect.arrayContaining(['module.disable', 'module.enable']));
    expect((await offA.get(`/api/v1/servers/${srv.A}/audit-logs`)).status).toBe(403);
    const one = await prisma.auditLog.findFirstOrThrow({ where: { serverId: A } });
    await expect(prisma.auditLog.update({ where: { id: one.id }, data: { action: 'x' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: one.id } })).rejects.toThrow();
  });
});

describe('Server von Grund auf getrennt', () => {
  it('Personalakte je Server: gleiche Person, eigener Dienstgrad und Rufname je Server', async () => {
    const gadmin = await as('ms_gadmin');
    const target = uid.ms_bot!;
    const a = await gadmin.post('/api/v1/personnel').set('X-Guild-Id', A).send({ userId: target, rank: 'Kommissar', callsign: 'MS-1' });
    expect(a.status).toBe(201);
    const b = await gadmin.post('/api/v1/personnel').set('X-Guild-Id', B).send({ userId: target, rank: 'Anwärter', callsign: 'MS-1' }); // gleicher Rufname auf anderem Server erlaubt
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
    expect((await gadmin.post('/api/v1/personnel').set('X-Guild-Id', A).send({ userId: target, rank: 'Doppelt' })).status).toBe(409); // eine Akte je Server
    const listA = (await gadmin.get('/api/v1/personnel?pageSize=200').set('X-Guild-Id', A)).body.items as { id: string; rank: string }[];
    const listB = (await gadmin.get('/api/v1/personnel?pageSize=200').set('X-Guild-Id', B)).body.items as { id: string; rank: string }[];
    expect(listA.find((p) => p.id === a.body.id)?.rank).toBe('Kommissar');
    expect(listA.some((p) => p.id === b.body.id)).toBe(false);
    expect(listB.find((p) => p.id === b.body.id)?.rank).toBe('Anwärter');
    expect((await gadmin.get(`/api/v1/personnel/${a.body.id}`).set('X-Guild-Id', B)).status).toBe(404);
  });

  it('Rollen je Server: serverübergreifende Rollen wirken auf keinem Server; neue Server starten mit eigenen Startrollen ohne Zuweisungen', async () => {
    // globale Rolle (manuell) gibt im Server-Kontext nichts
    const police = await prisma.role.findFirstOrThrow({ where: { guildId: null, name: 'Police Member' } });
    await prisma.userRole.create({ data: { userId: uid.ms_offb!, roleId: police.id } });
    const offB = await as('ms_offb');
    expect((await offB.get('/api/v1/auth/me').set('X-Guild-Id', A)).body.roles).toEqual([]);
    expect((await offB.get('/api/v1/auth/me').set('X-Guild-Id', B)).body.roles).toEqual(['Officer']);
    // neuer Server: Startrollen als eigene Kopien, aber ohne Zuweisungen
    const gadmin = await as('ms_gadmin');
    const reg = await gadmin.post('/api/v1/servers').send({ guildId: '910000000000000005', name: 'Neu getrennt' });
    expect(reg.status).toBe(201);
    const roles = await prisma.role.findMany({ where: { guildId: '910000000000000005' }, include: { _count: { select: { users: true } } } });
    expect(roles.map((r) => r.name)).toContain('Police Member');
    expect(roles.every((r) => r._count.users === 0)).toBe(true);
    expect(roles.some((r) => r.name === 'System Administrator')).toBe(false);
  });

  it('Einstellungen je Server: Werte eines Servers sind auf anderen unsichtbar und dort nicht änderbar', async () => {
    const gadmin = await as('ms_gadmin');
    expect((await gadmin.put('/api/v1/admin/settings/org.name').set('X-Guild-Id', A).send({ value: 'Polizei Alpha' })).status).toBe(200);
    expect((await gadmin.put('/api/v1/admin/settings/discord.ghostPing').set('X-Guild-Id', A).send({ value: { enabled: false } })).status).toBe(200);
    const onB = (await gadmin.get('/api/v1/admin/settings').set('X-Guild-Id', B)).body.settings as Record<string, unknown>;
    expect(onB['org.name']).toBeUndefined();
    expect(onB['discord.ghostPing']).toBeUndefined();
    expect(Object.keys(onB).some((k) => k.includes(A))).toBe(false);
    const onA = (await gadmin.get('/api/v1/admin/settings').set('X-Guild-Id', A)).body.settings as Record<string, unknown>;
    expect(onA['org.name']).toBe('Polizei Alpha');
    expect(onA['discord.ghostPing']).toEqual({ enabled: false });
    // aus dem Kontext von B den Wert von A schreiben: verboten
    expect((await gadmin.put(`/api/v1/admin/settings/${encodeURIComponent(`org.name@${A}`)}`).set('X-Guild-Id', B).send({ value: 'gekapert' })).status).toBe(403);
    expect(await prisma.systemSetting.findUnique({ where: { key: `org.name@${A}` } })).toMatchObject({ value: 'Polizei Alpha' });
  });

  it('Leitstelle, Tatbestände je Server: gleiche Rufnamen/Codes erlaubt, fremde unsichtbar', async () => {
    const gadmin = await as('ms_gadmin');
    const uA = await gadmin.post('/api/v1/cad/units').set('X-Guild-Id', A).send({ callsign: 'ADAM-9' });
    const uB = await gadmin.post('/api/v1/cad/units').set('X-Guild-Id', B).send({ callsign: 'ADAM-9' });
    expect([uA.status, uB.status]).toEqual([201, 201]);
    const unitsB = (await gadmin.get('/api/v1/cad/units').set('X-Guild-Id', B)).body as { id: string }[];
    expect(unitsB.map((u) => u.id)).toContain(uB.body.id);
    expect(unitsB.map((u) => u.id)).not.toContain(uA.body.id);
    const code = { code: 'MS-1', title: 'Test', category: 'Test', penalty: { fine: 10 } };
    expect((await gadmin.post('/api/v1/legal-codes').set('X-Guild-Id', A).send(code)).status).toBe(201);
    expect((await gadmin.post('/api/v1/legal-codes').set('X-Guild-Id', B).send(code)).status).toBe(201);
    const codesB = (await gadmin.get('/api/v1/legal-codes').set('X-Guild-Id', B)).body as { code: string }[] | { items: { code: string }[] };
    expect((Array.isArray(codesB) ? codesB : codesB.items).filter((c) => c.code === 'MS-1')).toHaveLength(1);
  });
});
