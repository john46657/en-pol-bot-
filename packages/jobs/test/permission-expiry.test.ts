import { nexusRoleRepository, permissionRepository, prisma } from '@nexus/database';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { removeExpiredGrants } from '../src/index.js';

const G = 'permexp-guild';
const NOW = new Date('2026-10-05T12:00:00Z');
beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.guild.create({ data: { id: G, name: 'Ablauf', settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Temporäre Rechte entfernen', () => {
  it('abgelaufene Ausnahmen und Rollenmitgliedschaften werden gelöscht und protokolliert, laufende bleiben', async () => {
    await permissionRepository.addUserOverride(G, { userId: '900000000000960001', key: 'applications.view', effect: 'ALLOW', expiresAt: new Date(NOW.getTime() - 1000) });
    await permissionRepository.addUserOverride(G, { userId: '900000000000960002', key: 'applications.view', effect: 'ALLOW', expiresAt: new Date(NOW.getTime() + 86_400_000) });
    await permissionRepository.addUserOverride(G, { userId: '900000000000960003', key: 'tickets.view', effect: 'ALLOW' });
    const role = await nexusRoleRepository.create(G, { name: 'Aushilfe', entries: [] });
    await nexusRoleRepository.addMember(G, role.id, '900000000000960004', 'x', new Date(NOW.getTime() - 1000));
    await nexusRoleRepository.addMember(G, role.id, '900000000000960005', 'x', null);
    expect(await removeExpiredGrants(NOW)).toEqual({ overrides: 1, memberships: 1 });
    expect((await prisma.userPermission.findMany({ where: { guildId: G } })).map((u) => u.userId).sort()).toEqual(['900000000000960002', '900000000000960003']);
    expect((await prisma.nexusRoleMember.findMany({ where: { guildId: G } })).map((m) => m.userId)).toEqual(['900000000000960005']);
    expect(await prisma.auditLog.count({ where: { guildId: G, action: { in: ['permissions.user.override.expired', 'permissions.nexusrole.member.expired'] } } })).toBe(2);
    expect(await removeExpiredGrants(NOW)).toEqual({ overrides: 0, memberships: 0 });
  });
});
