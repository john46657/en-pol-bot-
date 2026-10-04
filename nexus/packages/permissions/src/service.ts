import type { Permission, PermissionSet } from '@nexus/types';
import { permissionRepository } from '@nexus/database';
import type { AccessContext } from './engine.js';
import { decide, effective, stateOf, type Grant, type Resource } from './grants.js';

/**
 * Einheitliche, asynchrone Prüfung gegen die gespeicherten Zuordnungen (direkt je Rolle, über Profile,
 * benutzerbezogen). Von API-Guard und Bot gleichermaßen genutzt.
 */
async function load(ctx: Pick<AccessContext, 'guildId' | 'roleIds' | 'userId'>): Promise<Grant[]> {
  return permissionRepository.loadGrants(ctx.guildId, [...ctx.roleIds], ctx.userId);
}

const subject = (ctx: AccessContext) => ({ teamIds: ctx.teamIds });

export const permissions = {
  grants: load,

  /** Serverweit erlaubte Permissions (inkl. der über `<modul>.manage` eingeschlossenen). */
  async forRoles(
    guildId: string,
    roleIds: readonly string[],
    userId?: string,
  ): Promise<PermissionSet> {
    const grants = await load({ guildId, roleIds, userId });
    return new Set(
      effective(grants)
        .filter((e) => e.state === 'allowed')
        .map((e) => e.key as Permission),
    );
  },

  /** Alle Schlüssel mit ihrem Zustand (erlaubt / eingeschränkt / gesperrt / keine). */
  async effective(ctx: AccessContext) {
    return effective(await load(ctx));
  },

  async can(ctx: AccessContext, required: Permission, resource: Resource = {}): Promise<boolean> {
    if (ctx.bypass) return true;
    return decide(await load(ctx), required, resource, subject(ctx)).allowed;
  },

  async canAll(
    ctx: AccessContext,
    required: readonly Permission[],
    resource: Resource = {},
  ): Promise<boolean> {
    if (ctx.bypass) return true;
    const grants = await load(ctx);
    return required.every((k) => decide(grants, k, resource, subject(ctx)).allowed);
  },

  async canAny(
    ctx: AccessContext,
    required: readonly Permission[],
    resource: Resource = {},
  ): Promise<boolean> {
    if (ctx.bypass) return true;
    const grants = await load(ctx);
    return required.some((k) => decide(grants, k, resource, subject(ctx)).allowed);
  },

  /** Hat der Nutzer das Recht irgendwo (auch nur eingeschränkt)? Für Menüs/Listen, nicht zur Durchsetzung. */
  async hasAnyScope(ctx: AccessContext, key: Permission): Promise<boolean> {
    if (ctx.bypass) return true;
    const s = stateOf(await load(ctx), key);
    return s === 'allowed' || s === 'limited';
  },

  /** Besitzt der Nutzer überhaupt irgendeine Berechtigung? (Dashboard-Zugang) */
  async hasAnyPermission(ctx: AccessContext): Promise<boolean> {
    if (ctx.bypass) return true;
    return effective(await load(ctx)).some((e) => e.state === 'allowed' || e.state === 'limited');
  },
};
