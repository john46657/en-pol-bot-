import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guildRepository, nexusRoleRepository, permissionRepository, prisma } from '../src/index.js';

const G = 'nexusrole-guild';
const entry = (key: string, effect: 'ALLOW' | 'DENY' = 'ALLOW') => ({ key, effect, scope: 'SERVER' as const, scopeRef: '' });
beforeAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await guildRepository.upsert({ id: G, name: 'Rollen' });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Dashboard-Rollen', () => {
  it('Mitglieder erhalten die Rechte der Rolle, andere nicht', async () => {
    const r = await nexusRoleRepository.create(G, { name: 'Ausbilder', priority: 5, entries: [entry('applications.submissions.accept')] });
    await nexusRoleRepository.addMember(G, r.id, 'u1', 'boss', null);
    const mine = await permissionRepository.loadGrants(G, [], 'u1');
    expect(mine.map((g) => g.key)).toContain('applications.submissions.accept');
    expect(mine.find((g) => g.key === 'applications.submissions.accept')?.source).toMatchObject({ kind: 'role', roleName: 'Ausbilder' });
    expect(await permissionRepository.loadGrants(G, [], 'u2')).toEqual([]);
  });

  it('abgelaufene Mitgliedschaft und deaktivierte Rolle geben keine Rechte', async () => {
    const r = await nexusRoleRepository.create(G, { name: 'Temp', entries: [entry('tickets.close')] });
    await nexusRoleRepository.addMember(G, r.id, 'u3', 'boss', new Date(Date.now() - 1000));
    expect(await permissionRepository.loadGrants(G, [], 'u3')).toEqual([]);
    await nexusRoleRepository.addMember(G, r.id, 'u3', 'boss', new Date(Date.now() + 3_600_000));
    expect((await permissionRepository.loadGrants(G, [], 'u3')).map((g) => g.key)).toEqual(['tickets.close']);
    await nexusRoleRepository.update(G, r.id, { enabled: false });
    expect(await permissionRepository.loadGrants(G, [], 'u3')).toEqual([]);
  });

  it('Kopplung an eine Discord-Rolle: Träger erhalten die Rechte ohne Mitgliedschaft', async () => {
    await nexusRoleRepository.create(G, { name: 'Gekoppelt', discordRoleId: '700000000000000001', entries: [entry('office.view'), entry('tickets.close', 'DENY')] });
    const g = await permissionRepository.loadGrants(G, ['700000000000000001'], 'u4');
    expect(g.map((x) => `${x.effect}:${x.key}`).sort()).toEqual(['ALLOW:office.view', 'DENY:tickets.close']);
    expect(await permissionRepository.loadGrants(G, ['700000000000000002'], 'u4')).toEqual([]);
  });

  it('Name ist je Server eindeutig; Löschen entfernt Mitglieder; fremde Server bleiben unberührt', async () => {
    await expect(nexusRoleRepository.create(G, { name: 'Ausbilder', entries: [] })).rejects.toThrow();
    const all = await nexusRoleRepository.list(G);
    const ausb = all.find((r) => r.name === 'Ausbilder')!;
    expect(await nexusRoleRepository.remove('anderer-server', ausb.id)).toBe(false);
    expect(await nexusRoleRepository.remove(G, ausb.id)).toBe(true);
    expect(await prisma.nexusRoleMember.count({ where: { roleId: ausb.id } })).toBe(0);
  });
});
