import type { Permission, PermissionSet } from '@nexus/types';
import { permissionRepository } from '@nexus/database';
import { hasAllPermissions, hasAnyPermission, hasPermission, isValidPermission } from './engine.js';
import type { AccessContext } from './engine.js';

/**
 * Einheitliche, asynchrone Prüfung gegen die gespeicherte Rollen-Zuordnung.
 * Wird von API-Guard und Bot gleichermaßen genutzt (Quelle: Tabelle `permissions`).
 */
export const permissions = {
  /** Effektive (direkt zugeordnete) Permissions der angegebenen Rollen. */
  async forRoles(guildId: string, roleIds: readonly string[]): Promise<PermissionSet> {
    const keys = await permissionRepository.getKeysForRoles(guildId, [...roleIds]);
    return new Set(keys.filter(isValidPermission));
  },

  async can(ctx: AccessContext, required: Permission): Promise<boolean> {
    if (ctx.bypass) return true;
    return hasPermission(await this.forRoles(ctx.guildId, ctx.roleIds), required);
  },

  async canAll(ctx: AccessContext, required: readonly Permission[]): Promise<boolean> {
    if (ctx.bypass) return true;
    return hasAllPermissions(await this.forRoles(ctx.guildId, ctx.roleIds), required);
  },

  async canAny(ctx: AccessContext, required: readonly Permission[]): Promise<boolean> {
    if (ctx.bypass) return true;
    return hasAnyPermission(await this.forRoles(ctx.guildId, ctx.roleIds), required);
  },
};
