import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setPermissionsForRole = vi.fn(async (_g: string, _r: string, p: string[], _s?: unknown) => ({
  before: ['applications.view'],
  after: p,
}));
const getGrants = vi.fn(
  async () =>
    new Map([
      ['111111', { keys: ['applications.view'], name: 'Polizei', deleted: false }],
      ['999999', { keys: ['applications.manage'], name: 'Weg', deleted: true }],
    ]),
);
const audit = vi.fn(async () => ({}));
const findGuild = vi.fn(async () => ({ id: 'G' }));
vi.mock('@nexus/database', () => ({
  guildRepository: { get: findGuild },
  permissionRepository: { setPermissionsForRole, getGrants },
  auditRepository: { create: audit },
}));
vi.mock('@nexus/permissions', () => ({
  permissions: {
    canAll: vi.fn(
      async (ctx: { bypass: boolean; roleIds: string[] }, req: string[]) =>
        ctx.bypass || (ctx.roleIds.includes('ok') && req.length > 0),
    ),
  },
}));
const { PermissionsAdminService } = await import('../src/modules/guild/permissions.service.js');
const { PermissionGuard } = await import('../src/common/guards/permission.guard.js');
const { GUILD_ADMIN_KEY } = await import('../src/common/decorators/guild-admin.decorator.js');

const discord = {
  listRoles: vi.fn(async () => [
    { id: '111111', name: 'Polizei', color: 0, position: 3, manageable: true },
    { id: '222222', name: 'Leitung', color: 0, position: 4, manageable: true },
    {
      id: 'G',
      name: '@everyone',
      color: 0,
      position: 0,
      manageable: false,
      blockedReason: 'everyone',
    },
  ]),
};
const service = new PermissionsAdminService(discord as never);
beforeEach(() => vi.clearAllMocks());

describe('PermissionsAdminService', () => {
  it('liefert Rollen mit Zuordnung, ohne @everyone, und meldet verwaiste Zuordnungen', async () => {
    const o = await service.overview('G');
    expect(o.roles.map((r) => r.id)).toEqual(['111111', '222222']);
    expect(o.roles[0]?.permissions).toEqual(['applications.view']);
    expect(o.orphaned).toEqual([
      { roleId: '999999', name: 'Weg', permissions: ['applications.manage'] },
    ]);
    expect(o.catalog.map((m) => m.module)).toContain('shifts');
    expect(o.catalog.flatMap((m) => m.permissions.map((p) => p.key))).toContain(
      'applications.manage',
    );
  });
  it('speichert gültige Permissions und schreibt Audit mit alt/neu', async () => {
    await service.setForRole('G', 'u1', '222222', ['applications.manage']);
    expect(setPermissionsForRole).toHaveBeenCalledWith('G', '222222', ['applications.manage'], {
      name: 'Leitung',
      position: 4,
      color: 0,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'permissions.role.set',
        before: { permissions: ['applications.view'] },
        after: { permissions: ['applications.manage'] },
      }),
    );
  });
  it('lehnt unbekannte Permissions, unbekannte Rollen und @everyone ab', async () => {
    await expect(service.setForRole('G', 'u', '222222', ['gibt.es.nicht'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.setForRole('G', 'u', '777777', ['applications.view']),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setForRole('G', 'u', 'G', ['applications.view'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(setPermissionsForRole).not.toHaveBeenCalled();
  });
  it('erlaubt das Entfernen der Zuordnung einer verwaisten Rolle', async () => {
    await service.setForRole('G', 'u', '999999', []);
    expect(setPermissionsForRole).toHaveBeenCalledWith('G', '999999', [], undefined);
  });
  it('verlangt einen verbundenen Server', async () => {
    findGuild.mockResolvedValueOnce(null as never);
    await expect(service.setForRole('G', 'u', '222222', [])).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PermissionGuard – nur Server-Verwalter', () => {
  const ctx = (userId: string) =>
    ({
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: userId, roleIds: ['r'] }, params: { guildId: 'G' } }),
      }),
    }) as never;
  const reflector = {
    getAllAndOverride: (key: string) => (key === GUILD_ADMIN_KEY ? true : undefined),
  };
  const make = (canManageGuild: boolean) =>
    new PermissionGuard(
      reflector as never,
      {
        getMemberAccess: async () => ({ canManageGuild }),
        getMemberRoles: async () => [],
      } as never,
    );

  it('lässt Verwalter durch', async () => {
    expect(await make(true).canActivate(ctx('a'))).toBe(true);
  });
  it('weist alle anderen ab – auch mit NEXUS-Rolle „applications.manage“', async () => {
    await expect(make(false).canActivate(ctx('b'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PermissionGuard – zentrale Engine', () => {
  const reflector = (req: string[] | undefined) => ({
    getAllAndOverride: (key: string) => (key === 'nexus:permissions' ? req : undefined),
  });
  const ctx = (roleIds: string[]) =>
    ({
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u', roleIds }, params: { guildId: 'G' } }),
      }),
    }) as never;
  const make = (req: string[] | undefined, canManageGuild = false) =>
    new PermissionGuard(
      reflector(req) as never,
      {
        getMemberAccess: async () => ({ canManageGuild }),
        getMemberRoles: async () => [],
      } as never,
    );

  it('lässt Endpunkte ohne Anforderung offen', async () => {
    expect(await make(undefined).canActivate(ctx([]))).toBe(true);
  });
  it('erlaubt mit passender Rolle, verweigert ohne', async () => {
    expect(await make(['shifts.start']).canActivate(ctx(['ok']))).toBe(true);
    await expect(make(['shifts.start']).canActivate(ctx(['nein']))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('Server-Verwalter umgehen die Zuordnung', async () => {
    expect(await make(['shifts.start'], true).canActivate(ctx([]))).toBe(true);
  });
});
