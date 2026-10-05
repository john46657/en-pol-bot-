import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const audit = vi.fn(async (_i: unknown) => ({}));
const getGrants = vi.fn(async () => new Map<string, any>());
const getProfilesByRole = vi.fn(async () => new Map<string, string[]>());
const listProfiles = vi.fn(async () => [] as any[]);
const getGuildMember = vi.fn(async (..._a: unknown[]) => ({ roles: ['low'] }) as any);
const nexusGet = vi.fn(async (..._a: unknown[]) => null as any);
const nexusMine = vi.fn(async (..._a: unknown[]) => [] as any[]);
const forRoles = vi.fn(async (..._a: unknown[]) => ['applications.view', 'applications.manage']);

vi.mock('@nexus/database', () => ({
  auditRepository: { create: audit },
  permissionRepository: { getGrants, getProfilesByRole, listProfiles },
  nexusRoleRepository: { get: nexusGet, rolesOfUser: nexusMine },
}));
vi.mock('@nexus/discord', () => ({
  getGuild: vi.fn(async () => ({ ownerId: 'owner' })),
  getGuildMember,
}));
vi.mock('@nexus/permissions', () => ({ permissions: { forRoles } }));

const { RightsService } = await import('../src/modules/guild/rights.service.js');

const discord = {
  listRoles: vi.fn(async () => [
    { id: 'low', position: 1 },
    { id: 'mid', position: 5 },
    { id: 'high', position: 9 },
  ]),
};
const config = { get: () => 'token' };
const svc = new RightsService(discord as never, config as never);
const acc = (userId: string, roleIds: string[], bypass = false) => ({ userId, roleIds, bypass }) as never;

beforeEach(() => {
  audit.mockClear();
  getGrants.mockResolvedValue(new Map());
  getGuildMember.mockResolvedValue({ roles: ['low'] });
});

describe('RightsService', () => {
  it('verweigert Rollen auf gleichem oder höherem Rang und schreibt ins Audit-Log', async () => {
    await expect(svc.forSetRole('G', acc('u1', ['mid']), 'high', { allow: [] })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.forSetRole('G', acc('u1', ['mid']), 'mid', { allow: [] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(audit).toHaveBeenCalledTimes(2);
    await expect(svc.forSetRole('G', acc('u1', ['mid']), 'low', { allow: [] })).resolves.toBeUndefined();
  });

  it('erlaubt nur Rechte, die man selbst besitzt', async () => {
    await expect(svc.forSetRole('G', acc('u1', ['mid']), 'low', { allow: ['applications.view'] })).resolves.toBeUndefined();
    await expect(svc.forSetRole('G', acc('u1', ['mid']), 'low', { allow: ['config.edit'] })).rejects.toThrow(/config\.edit/);
  });

  it('Server-Verwalter besitzen alle Rechte, bleiben aber an die Rangfolge gebunden', async () => {
    await expect(svc.forSetRole('G', acc('u1', ['mid'], true), 'low', { allow: ['config.edit'] })).resolves.toBeUndefined();
    await expect(svc.forSetRole('G', acc('u1', ['mid'], true), 'high', { allow: [] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('der Serverbesitzer ist von der Rangfolge ausgenommen', async () => {
    await expect(svc.forSetRole('G', acc('owner', [], true), 'high', { allow: ['config.edit'] })).resolves.toBeUndefined();
  });

  it('neue Profile: nur eigene Rechte', async () => {
    await expect(svc.forProfileCreate('G', acc('u1', ['mid']), ['applications.manage'])).resolves.toBeUndefined();
    await expect(svc.forProfileCreate('G', acc('u1', ['mid']), ['config.edit'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Profiländerung: keine zugeordnete Rolle darf höher stehen', async () => {
    listProfiles.mockResolvedValueOnce([{ id: 'p', roles: [{ id: 'high' }], entries: [] }]);
    await expect(svc.forProfileChange('G', acc('u1', ['mid']), 'p')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Ausnahmen: nicht für sich selbst, den Besitzer oder Höherrangige', async () => {
    await expect(svc.forOverride('G', acc('u1', ['mid']), 'u1')).rejects.toThrow(/eigenen/);
    await expect(svc.forOverride('G', acc('u1', ['mid']), 'owner')).rejects.toThrow(/Serverbesitzer/);
    getGuildMember.mockResolvedValueOnce({ roles: ['high'] });
    await expect(svc.forOverride('G', acc('u1', ['mid']), 'u2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.forOverride('G', acc('u1', ['mid']), 'u2', { key: 'applications.view', effect: 'ALLOW' })).resolves.toBeUndefined();
    await expect(svc.forOverride('G', acc('u1', ['mid']), 'u2', { key: 'config.edit', effect: 'ALLOW' })).rejects.toBeInstanceOf(ForbiddenException);
    // Einschränken (DENY) braucht das Recht nicht
    await expect(svc.forOverride('G', acc('u1', ['mid']), 'u2', { key: 'config.edit', effect: 'DENY' })).resolves.toBeUndefined();
  });
});

describe('Dashboard-Rollen (Priorität)', () => {
  const role = (priority: number, keys: string[] = []) => ({ id: 'r', priority, entries: keys.map((key) => ({ key, effect: 'ALLOW' })) });
  beforeEach(() => {
    nexusMine.mockResolvedValue([{ priority: 5 }]);
  });
  it('nur Rollen unterhalb der eigenen Priorität bearbeiten', async () => {
    nexusGet.mockResolvedValue(role(5));
    await expect(svc.forNexusRole('G', acc('u1', ['mid']), { roleId: 'r' })).rejects.toBeInstanceOf(ForbiddenException);
    nexusGet.mockResolvedValue(role(4));
    await expect(svc.forNexusRole('G', acc('u1', ['mid']), { roleId: 'r' })).resolves.toBeUndefined();
  });
  it('keine Priorität auf oder über der eigenen vergeben', async () => {
    await expect(svc.forNexusRole('G', acc('u1', ['mid']), { priority: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.forNexusRole('G', acc('u1', ['mid']), { priority: 4 })).resolves.toBeUndefined();
  });
  it('nur Rechte vergeben, die man besitzt; Verwalter und Besitzer sind ausgenommen', async () => {
    await expect(svc.forNexusRole('G', acc('u1', ['mid']), { priority: 1, allowKeys: ['config.edit'] })).rejects.toThrow(/config\.edit/);
    await expect(svc.forNexusRole('G', acc('u1', ['mid'], true), { priority: 9999, allowKeys: ['config.edit'] })).resolves.toBeUndefined();
  });
  it('Mitglieder: nicht sich selbst, nicht Rollen darüber, Rechte der Rolle müssen vorhanden sein', async () => {
    nexusGet.mockResolvedValue(role(1, ['applications.view']));
    await expect(svc.forNexusMember('G', acc('u1', ['mid']), 'r', ['u1'], true)).rejects.toThrow(/selbst/);
    await expect(svc.forNexusMember('G', acc('u1', ['mid']), 'r', ['u2'], true)).resolves.toBeUndefined();
    nexusGet.mockResolvedValue(role(1, ['config.edit']));
    await expect(svc.forNexusMember('G', acc('u1', ['mid']), 'r', ['u2'], true)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.forNexusMember('G', acc('u1', ['mid']), 'r', ['u2'], false)).resolves.toBeUndefined();
    nexusGet.mockResolvedValue(role(7));
    await expect(svc.forNexusMember('G', acc('u1', ['mid']), 'r', ['u2'], false)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
