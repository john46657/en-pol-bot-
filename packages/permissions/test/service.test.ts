import { describe, expect, it, vi } from 'vitest';

const getKeysForRoles = vi.fn(async (_g: string, roles: string[]) =>
  roles.includes('r1') ? ['training.manage', 'bogus.key'] : [],
);
vi.mock('@nexus/database', () => ({ permissionRepository: { getKeysForRoles } }));
const { permissions } = await import('../src/service.js');

describe('permissions-Service', () => {
  it('Bypass (Admin/Besitzer) gewährt alles ohne Datenbankzugriff', async () => {
    getKeysForRoles.mockClear();
    expect(await permissions.can({ guildId: 'G', roleIds: [], bypass: true }, 'sek.manage')).toBe(
      true,
    );
    expect(getKeysForRoles).not.toHaveBeenCalled();
  });
  it('prüft gegen die Rollen-Zuordnung inkl. Modul-manage und ignoriert ungültige Schlüssel', async () => {
    const ctx = { guildId: 'G', roleIds: ['r1'], bypass: false };
    expect(await permissions.can(ctx, 'training.view')).toBe(true);
    expect(await permissions.can(ctx, 'sek.view')).toBe(false);
    expect([...(await permissions.forRoles('G', ['r1']))]).toEqual(['training.manage']);
  });
  it('ohne passende Rolle: verweigert (fail closed)', async () => {
    const ctx = { guildId: 'G', roleIds: ['andere'], bypass: false };
    expect(await permissions.can(ctx, 'training.view')).toBe(false);
    expect(await permissions.canAll(ctx, ['training.view'])).toBe(false);
    expect(await permissions.canAny(ctx, ['training.view'])).toBe(false);
  });
});
