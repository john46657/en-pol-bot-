import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { createTestApp, login, makeUser } from './helpers';
import type { PrismaService } from '../src/prisma/prisma.service';
import { BOT_SERVICE_KEY, PERMISSION_KEY, PUBLIC_KEY } from '../src/authz/decorators';

let app: INestApplication; let prisma: PrismaService;
beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  await makeUser(prisma, 's_admin', ['System Administrator']);
  await makeUser(prisma, 's_hr', ['Police Member']);
  const hr = await prisma.user.findUniqueOrThrow({ where: { username: 's_hr' } });
  await prisma.userPermissionOverride.createMany({ data: [{ userId: hr.id, permissionKey: 'users.manage', effect: 'ALLOW' }, { userId: hr.id, permissionKey: 'users.view', effect: 'ALLOW' }] });
});
afterAll(async () => { await app.close(); });

/** Jede HTTP-Route muss entweder öffentlich sein, eine Permission verlangen oder explizit als „nur authentifiziert, Prüfung im Service“ gelistet sein. */
const AUTH_ONLY_ALLOWLIST = new Set([
  'AuthController.logout', 'AuthController.me', 'AuthController.discordLink', // discordLink: verknüpft nur das eigene Konto
  'AuthController.twoFactorStatus', 'AuthController.twoFactorSetup', 'AuthController.twoFactorEnable', 'AuthController.twoFactorDisable', 'AuthController.twoFactorRecovery', // 2FA: nur das eigene Konto
  'NotificationsController.list', 'NotificationsController.readAll', 'NotificationsController.read', 'NotificationsController.archive', // immer per userId gefiltert
  'SearchController.search', 'StudioController.config', 'DiscordController.link', 'DiscordController.linkCode', 'DiscordController.unlinkSelf', 'AnalyticsController.overview', // pro Entität/Kennzahl geprüft
  'ExportController.export', 'MediaController.upload', 'MediaController.list', 'MediaController.download', // Service-Ebene
]);

describe('route authorization coverage', () => {
  it('no route is accessible without an explicit decision', () => {
    const discovery = app.get(DiscoveryService); const reflector = app.get(Reflector);
    const missing: string[] = [];
    for (const w of discovery.getControllers()) {
      const proto = w.metatype?.prototype; if (!proto) continue;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
        void PATH_METADATA;
        const perms = reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [handler, w.metatype!]);
        const bot = reflector.getAllAndOverride<boolean>(BOT_SERVICE_KEY, [handler, w.metatype!]);
        const pub = reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [handler, w.metatype!]);
        const key = `${w.metatype!.name}.${name}`;
        if (!perms?.length && !pub && !bot && !AUTH_ONLY_ALLOWLIST.has(key)) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('privilege escalation', () => {
  it('users.manage alone cannot assign roles when creating a user', async () => {
    const hr = (await login(app, 's_hr')).agent;
    const admin = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
    const r = await hr.post('/api/v1/users').send({ username: 'sneaky', displayName: 'Sneaky', password: 'a-very-long-password', roleIds: [admin.id] });
    expect(r.status).toBe(403);
    expect(await prisma.user.count({ where: { username: 'sneaky' } })).toBe(0);
    expect((await hr.post('/api/v1/users').send({ username: 'plain', displayName: 'Plain', password: 'a-very-long-password' })).status).toBe(201);
  });
  it('nobody can change their own roles or permission overrides', async () => {
    const adm = (await login(app, 's_admin')).agent;
    const me = await prisma.user.findUniqueOrThrow({ where: { username: 's_admin' } });
    expect((await adm.put(`/api/v1/users/${me.id}/roles`).send({ roleIds: [] })).status).toBe(409);
    expect((await adm.put(`/api/v1/users/${me.id}/overrides`).send({ permission: 'audit.view', effect: 'DENY' })).status).toBe(409);
    expect((await adm.delete(`/api/v1/users/${me.id}/overrides/audit.view`)).status).toBe(409);
  });
  it('the last active system administrator cannot be disabled or stripped of the role', async () => {
    const adm = (await login(app, 's_admin')).agent;
    const me = await prisma.user.findUniqueOrThrow({ where: { username: 's_admin' } });
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'System Administrator' } });
    // s_admin soll der einzige Admin sein; ein zweiter Admin entsteht, wird entfernt, und der letzte ist geschützt
    await prisma.userRole.deleteMany({ where: { roleId: role.id, user: { username: { not: 's_admin' } } } });
    const second = await makeUser(prisma, 's_second', ['Police Member']);
    const third = await makeUser(prisma, 's_third', ['System Administrator']); // zweiter Admin
    expect((await adm.put(`/api/v1/users/${second.id}/roles`).send({ roleIds: [role.id] })).status).toBe(200);
    expect((await adm.put(`/api/v1/users/${second.id}/roles`).send({ roleIds: [] })).status).toBe(200); // bleibt noch ein Admin
    // third demotes/disables s_admin? s_admin is not 'last' while third exists
    const thirdAgent = (await login(app, 's_third')).agent;
    expect((await thirdAgent.put(`/api/v1/users/${me.id}/active`).send({ active: false })).status).toBe(200); // s_admin disabled, third remains
    // now third is the last admin: nobody (also not via another admin) may remove it
    const fourth = await makeUser(prisma, 's_fourth', ['Police Member']);
    await prisma.userPermissionOverride.createMany({ data: [{ userId: fourth.id, permissionKey: 'users.manage', effect: 'ALLOW' }, { userId: fourth.id, permissionKey: 'roles.manage', effect: 'ALLOW' }] });
    const fourthAgent = (await login(app, 's_fourth')).agent;
    // (Rang: ein Police Member darf einen Administrator gar nicht verwalten → 403, noch vor der Letzter-Admin-Prüfung)
    expect((await fourthAgent.put(`/api/v1/users/${third.id}/active`).send({ active: false })).status).toBe(403);
    expect((await fourthAgent.put(`/api/v1/users/${third.id}/roles`).send({ roleIds: [] })).status).toBe(403);
    // der letzte Administrator selbst ist ebenfalls geschützt (Selbst-Änderung)
    expect((await thirdAgent.put(`/api/v1/users/${third.id}/roles`).send({ roleIds: [] })).status).toBe(409);
  });
});
