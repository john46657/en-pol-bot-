import type { Prisma, PrismaClient } from '@prisma/client';

export const ADMIN_ROLE_NAME = 'System Administrator';

/**
 * Rollen eines Servers anlegen: Kopien der serverübergreifenden Vorlagen (Startrollen bzw. bisherige Rollen) mit Rechten und
 * Discord-Verknüpfung – danach unabhängig von allen anderen Servern. „System Administrator“ bleibt global und wird nie kopiert.
 *
 * `withAssignments`: nur für Server, die es VOR der Trennung schon gab (Migration) bzw. den eingestellten Haupt-Server –
 * bisherige Zuweisungen werden übernommen, damit niemand den Zugang verliert. Neue Server starten ohne Zuweisungen.
 * Idempotent: läuft genau einmal je Server (`rolesInitializedAt`), auch bei mehreren Instanzen (Sperre je Server).
 */
export async function initServerRoles(prisma: PrismaClient | Prisma.TransactionClient, serverId: string, withAssignments: boolean) {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`server-roles:${serverId}`}))`;
    const server = await tx.discordServer.findUnique({ where: { id: serverId } });
    if (!server || server.rolesInitializedAt) return 0;
    const templates = await tx.role.findMany({ where: { guildId: null, name: { not: ADMIN_ROLE_NAME } }, include: { permissions: true } });
    let created = 0;
    for (const t of templates) {
      let copy = await tx.role.findFirst({ where: { guildId: server.guildId, name: t.name } });
      if (!copy) {
        copy = await tx.role.create({
          data: {
            guildId: server.guildId, name: t.name, description: t.description, system: t.system, priority: t.priority, color: t.color, icon: t.icon, active: t.active, discordRoleIds: t.discordRoleIds,
            permissions: { create: t.permissions.map((p) => ({ permissionKey: p.permissionKey, effect: p.effect })) },
          },
        });
        created++;
      }
      if (!withAssignments) continue;
      // bisherige Zuweisungen: manuell vergeben (überall gültig) oder über Discord genau auf diesem Server
      const holders = await tx.userRole.findMany({ where: { roleId: t.id, OR: [{ guildIds: { isEmpty: true } }, { guildIds: { has: server.guildId } }] }, select: { userId: true, guildIds: true } });
      if (holders.length) await tx.userRole.createMany({ data: holders.map((h) => ({ userId: h.userId, roleId: copy!.id, guildIds: h.guildIds.length ? [server.guildId] : [] })), skipDuplicates: true });
    }
    await tx.discordServer.update({ where: { id: serverId }, data: { rolesInitializedAt: new Date() } });
    return created;
  };
  return '$transaction' in prisma ? (prisma as PrismaClient).$transaction(run, { timeout: 60_000 }) : run(prisma as Prisma.TransactionClient);
}
