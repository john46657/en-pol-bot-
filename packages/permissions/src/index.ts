import type { Permission, PermissionSet } from '@nexus/types';
import { PERMISSIONS } from '@nexus/types';

/**
 * Permission-Auflösung (§79/§114).
 *
 * Permissions stammen aus Discord-Rollen (Guild-spezifisch konfiguriert).
 * Die echte Prüfung passiert immer serverseitig (§114) – Frontend-Checks
 * sind nur UI.
 */

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

export function hasPermission(set: PermissionSet, required: Permission): boolean {
  return set.has(required) || set.has('applications.manage' as Permission);
}

export function hasAllPermissions(set: PermissionSet, required: readonly Permission[]): boolean {
  return required.every((r) => hasPermission(set, r));
}

export function hasAnyPermission(set: PermissionSet, required: readonly Permission[]): boolean {
  return required.some((r) => hasPermission(set, r));
}

/** Darf der User Applications verwalten (Erstellen/Bearbeiten/Veröffentlichen)? */
export function canManageApplications(set: PermissionSet): boolean {
  return hasPermission(set, 'applications.manage');
}

/** Darf der User Submissions einsehen? */
export function canViewSubmissions(set: PermissionSet): boolean {
  return hasPermission(set, 'applications.submissions.view');
}

/** Darf der User entscheiden (Accept/Deny)? */
export function canReviewSubmissions(set: PermissionSet): boolean {
  return hasAnyPermission(set, [
    'applications.submissions.accept',
    'applications.submissions.deny',
    'applications.submissions.review',
  ]);
}

export function isValidPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}
