import { describe, expect, it, vi } from 'vitest';

const row = (key: string, effect: 'ALLOW' | 'DENY' = 'ALLOW', scope = 'SERVER', scopeRef = '') => ({
  key,
  effect,
  scope,
  scopeRef,
  source: { kind: 'role', roleId: 'r1', roleName: 'R' },
});
const loadGrants = vi.fn(async (_g: string, roles: string[], _u?: string) =>
  roles.includes('r1')
    ? [row('training.manage')]
    : roles.includes('deny')
      ? [row('training.manage'), row('training.view', 'DENY')]
      : roles.includes('team')
        ? [row('team.member.manage', 'ALLOW', 'TEAM')]
        : [],
);
vi.mock('@nexus/database', () => ({ permissionRepository: { loadGrants } }));
const { permissions } = await import('../src/service.js');

const ctx = (roleIds: string[], extra: Record<string, unknown> = {}) => ({
  guildId: 'G',
  roleIds,
  bypass: false,
  ...extra,
});

describe('permissions-Service', () => {
  it('Bypass (Admin/Besitzer) gewährt alles ohne Datenbankzugriff', async () => {
    loadGrants.mockClear();
    expect(await permissions.can({ guildId: 'G', roleIds: [], bypass: true }, 'sek.manage')).toBe(
      true,
    );
    expect(await permissions.hasAnyPermission({ guildId: 'G', roleIds: [], bypass: true })).toBe(
      true,
    );
    expect(loadGrants).not.toHaveBeenCalled();
  });

  it('prüft inkl. Modul-manage; reicht userId durch', async () => {
    expect(await permissions.can(ctx(['r1'], { userId: 'u1' }), 'training.view')).toBe(true);
    expect(loadGrants).toHaveBeenLastCalledWith('G', ['r1'], 'u1');
    expect(await permissions.can(ctx(['r1']), 'sek.view')).toBe(false);
    expect([...(await permissions.forRoles('G', ['r1']))]).toContain('training.view');
  });

  it('eine Sperre überstimmt die Erlaubnis aus „manage“', async () => {
    expect(await permissions.can(ctx(['deny']), 'training.view')).toBe(false);
    expect(await permissions.can(ctx(['deny']), 'training.edit')).toBe(true);
    expect(await permissions.canAll(ctx(['deny']), ['training.edit', 'training.view'])).toBe(false);
    expect(await permissions.canAny(ctx(['deny']), ['training.edit', 'training.view'])).toBe(true);
  });

  it('Team-Zuordnung: nur mit passendem Team; ohne Teambezug kein serverweites Recht', async () => {
    const c = ctx(['team'], { teamIds: ['streife'] });
    expect(await permissions.can(c, 'team.member.manage', { teamId: 'streife' })).toBe(true);
    expect(await permissions.can(c, 'team.member.manage', { teamId: 'sek' })).toBe(false);
    expect(await permissions.can(c, 'team.member.manage')).toBe(false);
    expect(await permissions.hasAnyScope(c, 'team.member.manage')).toBe(true);
    expect(await permissions.hasAnyPermission(c)).toBe(true);
  });

  it('ohne passende Rolle: verweigert (fail closed)', async () => {
    const c = ctx(['andere']);
    expect(await permissions.can(c, 'training.view')).toBe(false);
    expect(await permissions.canAll(c, ['training.view'])).toBe(false);
    expect(await permissions.canAny(c, ['training.view'])).toBe(false);
    expect(await permissions.hasAnyPermission(c)).toBe(false);
  });
});
