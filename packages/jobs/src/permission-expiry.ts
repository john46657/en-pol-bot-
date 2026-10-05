import { auditRepository, prisma } from '@nexus/database';

/**
 * Temporäre Rechte und befristete Dashboard-Rollen nach Ablauf entfernen. Wirksam sind sie schon ab dem Ablauf nicht
 * mehr (die Rechteprüfung ignoriert sie); hier werden sie gelöscht und je Eintrag im Audit-Log festgehalten.
 */
export async function removeExpiredGrants(now = new Date()): Promise<{ overrides: number; memberships: number }> {
  const overrides = await prisma.userPermission.findMany({ where: { expiresAt: { lte: now } }, take: 500 });
  for (const o of overrides) {
    const r = await prisma.userPermission.deleteMany({ where: { id: o.id, expiresAt: { lte: now } } });
    if (r.count === 0) continue;
    await auditRepository.create({ guildId: o.guildId, actorType: 'SYSTEM', actorId: null, action: 'permissions.user.override.expired', resourceType: 'User', resourceId: o.userId, before: { key: o.key, effect: o.effect, scope: o.scope, expiresAt: o.expiresAt?.toISOString() } as never, automation: 'permission-expiry', result: 'success' });
  }
  const members = await prisma.nexusRoleMember.findMany({ where: { expiresAt: { lte: now } }, take: 500, include: { role: { select: { name: true } } } });
  for (const m of members) {
    const r = await prisma.nexusRoleMember.deleteMany({ where: { id: m.id, expiresAt: { lte: now } } });
    if (r.count === 0) continue;
    await auditRepository.create({ guildId: m.guildId, actorType: 'SYSTEM', actorId: null, action: 'permissions.nexusrole.member.expired', resourceType: 'NexusRole', resourceId: m.roleId, before: { role: m.role.name, userId: m.userId, expiresAt: m.expiresAt?.toISOString() } as never, automation: 'permission-expiry', result: 'success' });
  }
  return { overrides: overrides.length, memberships: members.length };
}
