import { PermissionFlagsBits, type Guild, type Role } from 'discord.js';

export interface RoleInfo {
  id: string;
  name: string;
  color: number;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
  hoist: boolean;
  isEveryone: boolean;
  /** Kann der Bot diese Rolle vergeben/entziehen? (Rechte + Rollen-Hierarchie) */
  botCanManage: boolean;
  /** Warum nicht (nur gesetzt, wenn `botCanManage` false ist). */
  botBlockedReason?: 'missing-manage-roles' | 'managed-role' | 'everyone' | 'hierarchy';
}

/** Prüft Rechte und Hierarchie des Bots für eine Rolle. Reine Logik, ohne API-Aufruf. */
export function checkBotRoleAccess(
  guild: Guild,
  role: Pick<Role, 'id' | 'managed' | 'position'>,
): Pick<RoleInfo, 'botCanManage' | 'botBlockedReason'> {
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { botCanManage: false, botBlockedReason: 'missing-manage-roles' };
  }
  if (role.id === guild.id) return { botCanManage: false, botBlockedReason: 'everyone' };
  if (role.managed) return { botCanManage: false, botBlockedReason: 'managed-role' };
  if (me.roles.highest.position <= role.position) {
    return { botCanManage: false, botBlockedReason: 'hierarchy' };
  }
  return { botCanManage: true };
}

export const roleService = {
  /** Alle Rollen eines Servers (höchste Position zuerst), inkl. Verwaltbarkeit durch den Bot. */
  list(guild: Guild): RoleInfo[] {
    return [...guild.roles.cache.values()]
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        color: role.color,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        managed: role.managed,
        mentionable: role.mentionable,
        hoist: role.hoist,
        isEveryone: role.id === guild.id,
        ...checkBotRoleAccess(guild, role),
      }));
  },

  async get(guild: Guild, roleId: string): Promise<RoleInfo | null> {
    const role =
      guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    return role ? (this.list(guild).find((r) => r.id === role.id) ?? null) : null;
  },
};
