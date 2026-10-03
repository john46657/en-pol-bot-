import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  GuildContextError,
  auditRepository,
  discordSyncRepository,
  guildRepository,
  panelRepository,
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

describe('Auswahlen (settings.data.selections)', () => {
  it('speichert, überschreibt und löscht Auswahlen, ohne andere Settings-Daten zu verlieren', async () => {
    await guildRepository.upsert({ id: G1, name: 'Eins' });
    await guildRepository.updateSettings(G1, { data: { other: 'bleibt' } });
    expect(await guildRepository.setSelection(G1, 'log-channel', 'c1')).toEqual({
      before: null,
      after: 'c1',
    });
    expect(await guildRepository.setSelection(G1, 'log-channel', 'c2')).toEqual({
      before: 'c1',
      after: 'c2',
    });
    await guildRepository.setSelection(G1, 'office-waiting-voice', 'v1');
    expect(await guildRepository.getSelections(G1)).toEqual({
      'log-channel': 'c2',
      'office-waiting-voice': 'v1',
    });
    await guildRepository.setSelection(G1, 'log-channel', null);
    expect(await guildRepository.getSelections(G1)).toEqual({ 'office-waiting-voice': 'v1' });
    expect((await guildRepository.getSettings(G1))?.data).toMatchObject({ other: 'bleibt' });
  });
  it('verliert bei parallelen Änderungen verschiedener Felder nichts', async () => {
    await Promise.all(
      ['a', 'b', 'c', 'd'].map((k) => guildRepository.setSelection(G1, `slot-${k}`, `id-${k}`)),
    );
    expect(
      Object.keys(await guildRepository.getSelections(G1)).filter((k) => k.startsWith('slot-')),
    ).toHaveLength(4);
  });
});

describe('Permissions je Rolle & Audit-Paginierung', () => {
  const snap = (name: string) => ({ name });
  it('setzt, überschreibt und entfernt Permissions; legt unbekannte Rollen aus dem Snapshot an', async () => {
    await guildRepository.upsert({ id: G1, name: 'Eins' });
    expect(
      await permissionRepository.setPermissionsForRole(G1, 'pr1', ['b', 'a', 'a'], snap('R1')),
    ).toEqual({ before: [], after: ['a', 'b'] });
    await permissionRepository.setPermissionsForRole(G1, 'pr2', ['x'], snap('R2'));
    expect(await permissionRepository.setPermissionsForRole(G1, 'pr1', [])).toEqual({
      before: ['a', 'b'],
      after: [],
    });
    const grants = await permissionRepository.getGrants(G1);
    expect(grants.has('pr1')).toBe(false);
    expect(grants.get('pr2')).toMatchObject({ keys: ['x'], name: 'R2', deleted: false });
  });
  it('verlangt einen Snapshot für unbekannte Rollen, ignoriert aber leere Listen für unbekannte Rollen', async () => {
    await expect(permissionRepository.setPermissionsForRole(G1, 'neu', ['x'])).rejects.toThrow();
    expect(await permissionRepository.setPermissionsForRole(G1, 'neu', [])).toEqual({
      before: [],
      after: [],
    });
  });
  it('verliert bei parallelen Änderungen verschiedener Rollen nichts', async () => {
    await Promise.all(
      ['p1', 'p2', 'p3', 'p4'].map((r) =>
        permissionRepository.setPermissionsForRole(G1, r, ['x'], snap(r)),
      ),
    );
    const grants = await permissionRepository.getGrants(G1);
    expect(['p1', 'p2', 'p3', 'p4'].every((r) => grants.get(r)?.keys.length === 1)).toBe(true);
  });
  it('markiert Zuordnungen gelöschter Rollen und ist guild-isoliert', async () => {
    await discordSyncRepository.syncRoles(G1, []); // alle Rollen auf Discord weg
    expect((await permissionRepository.getGrants(G1)).get('p1')?.deleted).toBe(true);
    expect((await permissionRepository.getGrants(G2)).size).toBe(0);
    expect(await permissionRepository.getKeysForRoles(G1, ['p1'])).toEqual([]); // gelöschte Rollen gewähren nichts
  });
  it('lehnt unbekannte Server ab', async () => {
    await expect(
      permissionRepository.setPermissionsForRole('test-guild-none', 'r', ['x'], snap('x')),
    ).rejects.toThrow();
  });
  it('blättert das Audit-Log ohne Lücken oder Duplikate', async () => {
    for (let i = 0; i < 5; i++)
      await auditRepository.create({ guildId: G1, actorType: 'SYSTEM', action: `page.${i}` });
    const all = (await auditRepository.list(G1, { limit: 200 })).filter((l) =>
      l.action.startsWith('page.'),
    );
    const first = await auditRepository.list(G1, { limit: 2 });
    const second = await auditRepository.list(G1, { limit: 2, cursor: first.at(-1)!.id });
    expect(first.map((l) => l.id).filter((id) => second.some((s) => s.id === id))).toEqual([]);
    expect(all).toHaveLength(5);
  });
});

describe('Panels', () => {
  const config = { embed: { title: 'T' }, buttons: [] };
  it('legt an, liest, ändert und löscht – strikt je Server', async () => {
    await guildRepository.upsert({ id: G2, name: 'Zwei' });
    const p = await panelRepository.create(G1, { name: 'Willkommen', config, createdBy: 'u' });
    expect(p.autoUpdate).toBe(true);
    expect((await panelRepository.list(G1)).map((x) => x.id)).toContain(p.id);
    expect(await panelRepository.list(G2)).toEqual([]);
    // Fremder Server sieht, ändert und löscht nichts
    expect(await panelRepository.get(G2, p.id)).toBeNull();
    expect(await panelRepository.update(G2, p.id, { name: 'Hack' })).toBeNull();
    expect(await panelRepository.markSent(G2, p.id, 'c', 'm')).toBe(false);
    expect(await panelRepository.delete(G2, p.id)).toBe(false);
    expect((await panelRepository.get(G1, p.id))?.name).toBe('Willkommen');
    // Eigener Server
    expect((await panelRepository.update(G1, p.id, { name: 'Neu' }))?.name).toBe('Neu');
    expect(await panelRepository.markSent(G1, p.id, 'c1', 'm1')).toBe(true);
    expect(await panelRepository.get(G1, p.id)).toMatchObject({ channelId: 'c1', messageId: 'm1' });
    await panelRepository.clearSent(G1, p.id);
    expect((await panelRepository.get(G1, p.id))?.messageId).toBeNull();
    expect(await panelRepository.delete(G1, p.id)).toBe(true);
    await expect(panelRepository.list('')).rejects.toBeInstanceOf(GuildContextError);
  });
  it('wird mit dem Server gelöscht (Cascade)', async () => {
    await panelRepository.create(G2, { name: 'x', config });
    await prisma.guild.delete({ where: { id: G2 } });
    expect(await prisma.panel.count({ where: { guildId: G2 } })).toBe(0);
  });
});

describe('Profile, Sperren und Ausnahmen', () => {
  const snap = (name: string) => ({ name });
  const allow = (key: string) => ({
    key,
    effect: 'ALLOW' as const,
    scope: 'SERVER' as const,
    scopeRef: '',
  });
  const deny = (key: string) => ({
    key,
    effect: 'DENY' as const,
    scope: 'SERVER' as const,
    scopeRef: '',
  });

  beforeAll(async () => {
    await guildRepository.upsert({ id: G1, name: 'Eins' });
    await guildRepository.upsert({ id: G2, name: 'Zwei' });
  });

  it('speichert direkte Sperren neben Erlaubnissen und trennt sie in getGrants', async () => {
    await permissionRepository.setPermissionsForRole(
      G1,
      'ro1',
      [allow('promotions.manage'), deny('promotions.approve')],
      snap('Stv'),
    );
    const g = (await permissionRepository.getGrants(G1)).get('ro1')!;
    expect(g.keys).toEqual(['promotions.manage']);
    expect(g.deny).toEqual(['promotions.approve']);
    // Sperren gewähren nichts (getKeysForRoles zählt nur ALLOW)
    expect(await permissionRepository.getKeysForRoles(G1, ['ro1'])).toEqual(['promotions.manage']);
  });

  it('Profile: anlegen, Rollen zuordnen, in loadGrants mit Herkunft erscheinen', async () => {
    const p = await permissionRepository.createProfile(G1, {
      name: 'Personalverwaltung',
      entries: [
        allow('applications.submissions.accept'),
        { ...allow('team.view'), scope: 'TEAM' },
        deny('config.edit'),
      ],
      templateKey: 'personalabteilung',
    });
    await permissionRepository.setProfilesForRole(G1, 'ro2', [p.id], snap('Personalabteilung'));
    const grants = await permissionRepository.loadGrants(G1, ['ro2']);
    expect(grants).toHaveLength(3);
    expect(grants[0]?.source).toMatchObject({
      kind: 'profile',
      roleName: 'Personalabteilung',
      profileName: 'Personalverwaltung',
    });
    expect(grants.find((x) => x.key === 'team.view')?.scope).toBe('TEAM');
    expect(await permissionRepository.loadGrants(G1, ['andere'])).toEqual([]);
    // Eine Änderung am Profil wirkt sofort für alle zugeordneten Rollen
    await permissionRepository.updateProfile(G1, p.id, { entries: [allow('team.view')] });
    expect(await permissionRepository.loadGrants(G1, ['ro2'])).toHaveLength(1);
    expect((await permissionRepository.listProfiles(G1)).find((x) => x.id === p.id)?.roles).toEqual(
      [{ id: 'ro2', name: 'Personalabteilung' }],
    );
  });

  it('Profile sind guild-isoliert; fremde Profile lassen sich weder lesen, ändern, löschen noch zuordnen', async () => {
    const p = await permissionRepository.createProfile(G1, { name: 'Geheim', entries: [] });
    expect(await permissionRepository.getProfile(G2, p.id)).toBeNull();
    expect(await permissionRepository.updateProfile(G2, p.id, { name: 'Hack' })).toBeNull();
    expect(await permissionRepository.deleteProfile(G2, p.id)).toBe(false);
    await expect(
      permissionRepository.setProfilesForRole(G2, 'rx', [p.id], snap('X')),
    ).rejects.toThrow(/Profil/);
    expect(await permissionRepository.listProfiles(G2)).toEqual([]);
  });

  it('Profilnamen sind je Server eindeutig', async () => {
    await permissionRepository.createProfile(G1, { name: 'Doppelt', entries: [] });
    await expect(
      permissionRepository.createProfile(G1, { name: 'Doppelt', entries: [] }),
    ).rejects.toThrow();
    await expect(
      permissionRepository.createProfile(G2, { name: 'Doppelt', entries: [] }),
    ).resolves.toBeTruthy();
  });

  it('Rollenzuordnung ersetzen und entfernen; Löschen eines Profils löst die Zuordnung', async () => {
    const [a, b] = await Promise.all([
      permissionRepository.createProfile(G1, { name: 'P-A', entries: [allow('shifts.view')] }),
      permissionRepository.createProfile(G1, { name: 'P-B', entries: [allow('shifts.manage')] }),
    ]);
    await permissionRepository.setProfilesForRole(G1, 'ro3', [a.id, b.id], snap('R3'));
    expect(await permissionRepository.loadGrants(G1, ['ro3'])).toHaveLength(2);
    expect((await permissionRepository.setProfilesForRole(G1, 'ro3', [b.id])).after).toEqual([
      b.id,
    ]);
    await permissionRepository.deleteProfile(G1, b.id);
    expect(await permissionRepository.loadGrants(G1, ['ro3'])).toEqual([]);
  });

  it('gelöschte Rollen liefern keine Zuordnungen (auch nicht über Profile)', async () => {
    await discordSyncRepository.syncRoles(G1, []);
    expect(await permissionRepository.loadGrants(G1, ['ro1', 'ro2', 'ro3'])).toEqual([]);
  });

  it('Benutzer-Ausnahmen: Erlaubnis und Sperre, nur für diesen Benutzer, idempotent', async () => {
    await permissionRepository.addUserOverride(G1, {
      userId: 'u1',
      key: 'audit.view',
      effect: 'ALLOW',
      note: 'Vertretung',
    });
    await permissionRepository.addUserOverride(G1, {
      userId: 'u1',
      key: 'audit.view',
      effect: 'ALLOW',
      note: 'Vertretung 2',
    });
    await permissionRepository.addUserOverride(G1, {
      userId: 'u1',
      key: 'report.view',
      effect: 'DENY',
      scope: 'TEAM',
      scopeRef: 'sek',
    });
    const list = await permissionRepository.listUserOverrides(G1, 'u1');
    expect(list).toHaveLength(2);
    const grants = await permissionRepository.loadGrants(G1, [], 'u1');
    expect(grants.map((x) => `${x.effect}:${x.key}:${x.scope}:${x.scopeRef}`).sort()).toEqual([
      'ALLOW:audit.view:SERVER:',
      'DENY:report.view:TEAM:sek',
    ]);
    expect(grants.every((x) => x.source.kind === 'user')).toBe(true);
    expect(await permissionRepository.loadGrants(G1, [], 'u2')).toEqual([]);
    expect(await permissionRepository.loadGrants(G2, [], 'u1')).toEqual([]);
    expect(await permissionRepository.removeUserOverride(G2, list[0]!.id)).toBe(false);
    expect(await permissionRepository.removeUserOverride(G1, list[0]!.id)).toBe(true);
  });

  it('Audit-Log speichert Ergebnis, Berechtigung, Automation und Grund', async () => {
    await auditRepository.create({
      guildId: G1,
      actorType: 'AUTOMATION',
      action: 'role.change',
      result: 'failed',
      permission: 'promotions.approve',
      automation: 'promotion-flow',
      reason: 'Bot-Rolle zu niedrig',
    });
    const [row] = await auditRepository.list(G1, { action: 'role.change' });
    expect(row).toMatchObject({
      result: 'failed',
      permission: 'promotions.approve',
      automation: 'promotion-flow',
      reason: 'Bot-Rolle zu niedrig',
    });
  });
});
