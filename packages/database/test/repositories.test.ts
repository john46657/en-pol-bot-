import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GuildContextError,
  auditRepository,
  discordSyncRepository,
  guildRepository,
  permissionRepository,
  prisma,
  userRepository,
} from '../src/index.js';

const G1 = 'test-guild-1';
const G2 = 'test-guild-2';

async function cleanup() {
  await prisma.guild.deleteMany({ where: { id: { in: [G1, G2] } } });
  await prisma.user.deleteMany({ where: { id: 'test-user-1' } });
}
beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('Phase 1 – Abnahme', () => {
  it('1. speichert einen Server samt Default-Einstellungen und aktualisiert ihn idempotent', async () => {
    const g = await guildRepository.upsert({ id: G1, name: 'Eins' });
    expect(g.settings?.locale).toBe('de');
    const again = await guildRepository.upsert({ id: G1, name: 'Eins (umbenannt)' });
    expect(again.name).toBe('Eins (umbenannt)');
    expect(await prisma.guildSettings.count({ where: { guildId: G1 } })).toBe(1);
    await guildRepository.upsert({ id: G2, name: 'Zwei' });
  });

  it('2. speichert einen Benutzer', async () => {
    await userRepository.upsert({ id: 'test-user-1', username: 'alice' });
    const u = await userRepository.upsert({
      id: 'test-user-1',
      username: 'alice2',
      globalName: 'Alice',
    });
    expect(u.username).toBe('alice2');
    expect(u.lastSeenAt).not.toBeNull();
  });

  it('3. speichert Rollen und Kanäle; Sync markiert fehlende als gelöscht und ist guild-isoliert', async () => {
    await discordSyncRepository.syncRoles(G1, [
      { discordId: 'r1', name: 'A', position: 2 },
      { discordId: 'r2', name: 'B', position: 1 },
    ]);
    await discordSyncRepository.syncRoles(G2, [{ discordId: 'r1', name: 'Andere Guild' }]);
    const res = await discordSyncRepository.syncRoles(G1, [
      { discordId: 'r1', name: 'A2', position: 2 },
    ]);
    expect(res.removed).toBe(1);
    const roles = await discordSyncRepository.listRoles(G1);
    expect(roles.map((r) => r.name)).toEqual(['A2']);
    expect((await discordSyncRepository.listRoles(G2))[0]?.name).toBe('Andere Guild');

    await discordSyncRepository.syncChannels(G1, [
      { discordId: 'c1', name: 'text', type: 0 },
      { discordId: 'c2', name: 'voice', type: 2 },
    ]);
    expect((await discordSyncRepository.listChannels(G1, 2)).map((c) => c.name)).toEqual(['voice']);
  });

  it('4. speichert Einstellungen und Permission-Zuordnungen', async () => {
    const s = await guildRepository.updateSettings(G1, { timezone: 'UTC', data: { foo: 1 } });
    expect(s.timezone).toBe('UTC');
    expect(await permissionRepository.setRolesForKey(G1, 'applications.manage', ['r1'])).toBe(1);
    expect(await permissionRepository.getRoleIdsForKey(G1, 'applications.manage')).toEqual(['r1']);
    expect(await permissionRepository.getKeysForRoles(G1, ['r1'])).toEqual(['applications.manage']);
    expect(await permissionRepository.getKeysForRoles(G2, ['r1'])).toEqual([]);
    await expect(permissionRepository.setRolesForKey(G1, 'x', ['gibt-es-nicht'])).rejects.toThrow();
    // Rolle einer fremden Guild darf nicht zugeordnet werden
    await discordSyncRepository.syncRoles(G2, [{ discordId: 'only-g2', name: 'x' }]);
    await expect(permissionRepository.setRolesForKey(G1, 'x', ['only-g2'])).rejects.toThrow();
  });

  it('5. erstellt Audit-Logs mit alten/neuen Daten', async () => {
    await auditRepository.create({
      guildId: G1,
      actorType: 'USER',
      actorId: 'test-user-1',
      action: 'settings.update',
      resourceType: 'GuildSettings',
      resourceId: G1,
      before: { timezone: 'Europe/Berlin' },
      after: { timezone: 'UTC' },
    });
    const logs = await auditRepository.list(G1, { action: 'settings.update' });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.before).toEqual({ timezone: 'Europe/Berlin' });
    expect(await auditRepository.list(G2)).toHaveLength(0);
  });

  it('verweigert Zugriffe ohne Guild Context', async () => {
    await expect(guildRepository.get('')).rejects.toBeInstanceOf(GuildContextError);
    await expect(auditRepository.list('')).rejects.toBeInstanceOf(GuildContextError);
  });

  it('markiert verlassene Server, ohne Daten zu löschen, und reaktiviert sie', async () => {
    await guildRepository.markLeft(G1);
    expect((await guildRepository.get(G1))?.leftAt).not.toBeNull();
    await guildRepository.upsert({ id: G1, name: 'Eins' });
    expect((await guildRepository.get(G1))?.leftAt).toBeNull();
    expect(await discordSyncRepository.listRoles(G1)).toHaveLength(1);
  });
});
