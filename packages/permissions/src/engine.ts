import type { Permission, PermissionSet } from '@nexus/types';
import { PERMISSIONS } from '@nexus/types';

/**
 * Zentrale Permission-Engine (reine Logik, ohne I/O).
 *
 * Permissions stammen aus Discord-Rollen (je Server zugeordnet). Alle Prüfungen laufen serverseitig –
 * API und Bot verwenden dieselben Funktionen; Frontend-Prüfungen sind nur UI.
 *
 * Regel: `<modul>.manage` schließt alle Permissions desselben Moduls ein, aber keine anderer Module.
 */

export const moduleOf = (permission: string): string => permission.split('.')[0] ?? '';

export function resolvePermissions(
  /** roleId → gewährte Permissions. */
  rolePermissions: ReadonlyMap<string, readonly Permission[]>,
  memberRoleIds: readonly string[],
): PermissionSet {
  const result = new Set<Permission>();
  for (const roleId of memberRoleIds) {
    const perms = rolePermissions.get(roleId);
    if (!perms) continue;
    for (const p of perms) result.add(p);
  }
  return result;
}

/** Besitzt das Set die Permission – direkt oder über `<modul>.manage`? */
export function hasPermission(set: PermissionSet, required: Permission): boolean {
  return set.has(required) || set.has(`${moduleOf(required)}.manage` as Permission);
}

export function hasAllPermissions(set: PermissionSet, required: readonly Permission[]): boolean {
  return required.every((r) => hasPermission(set, r));
}

export function hasAnyPermission(set: PermissionSet, required: readonly Permission[]): boolean {
  return required.some((r) => hasPermission(set, r));
}

/** Alle Permissions, die das Set effektiv gewährt (inkl. durch `.manage` eingeschlossener). */
export function effectivePermissions(set: PermissionSet): Permission[] {
  return PERMISSIONS.filter((p) => hasPermission(set, p));
}

export function isValidPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Zugriffskontext einer Prüfung. `bypass` = Server-Besitzer/Administrator (Discord-seitig ermittelt). */
export interface AccessContext {
  guildId: string;
  roleIds: readonly string[];
  bypass: boolean;
  /** Discord-ID des Handelnden (für benutzerbezogene Ausnahmen). */
  userId?: string | undefined;
  /** Teams des Handelnden (für TEAM-Zuordnungen); leer, solange es keine Teams gibt. */
  teamIds?: readonly string[] | undefined;
}
