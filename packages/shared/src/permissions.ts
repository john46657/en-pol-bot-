/** Zentraler Permission-Katalog. Einzige Quelle der Wahrheit für Backend und Frontend. */
export const PERMISSION_CATALOG = {
  dashboard: ['view', 'customize'],
  team: ['view', 'manage'],
  dispatch: ['view', 'create', 'edit', 'assign', 'close', 'manage'],
  incidents: ['view', 'create', 'edit', 'close', 'delete'],
  persons: ['view', 'create', 'edit', 'archive', 'merge'],
  vehicles: ['view', 'create', 'edit', 'archive'],
  reports: ['view', 'create', 'edit', 'submit', 'review', 'approve', 'reject', 'archive'],
  tickets: ['view', 'create', 'edit', 'void'],
  complaints: ['view', 'create', 'assign', 'investigate', 'resolve', 'close'],
  investigations: ['view', 'create', 'edit', 'close'],
  wanted: ['view', 'create', 'edit', 'activate', 'clear'],
  evidence: ['view', 'create', 'transfer', 'release'],
  personnel: ['view', 'create', 'edit', 'promote', 'discipline'],
  applications: ['view', 'review', 'decide'],
  academy: ['view', 'manage'],
  sek: ['view', 'report', 'manage'],
  qualifications: ['view', 'decide', 'manage'],
  communication: ['view', 'send', 'moderate'],
  analytics: ['view'],
  audit: ['view', 'export'],
  studio: ['view', 'manage'],
  settings: ['view', 'manage'],
  users: ['view', 'manage'],
  roles: ['view', 'manage'],
} as const;

type Catalog = typeof PERMISSION_CATALOG;
export type PermissionKey = {
  [M in keyof Catalog]: `${M & string}.${Catalog[M][number]}`;
}[keyof Catalog];

export const ALL_PERMISSIONS: readonly PermissionKey[] = Object.entries(PERMISSION_CATALOG).flatMap(
  ([module, actions]) => actions.map((a) => `${module}.${a}` as PermissionKey),
);

const PERMISSION_SET: ReadonlySet<string> = new Set(ALL_PERMISSIONS);
export const isPermissionKey = (v: string): v is PermissionKey => PERMISSION_SET.has(v);

export type Effect = 'ALLOW' | 'DENY';
export interface PermissionGrant {
  permission: string;
  effect: Effect;
}
export type ResolutionSource =
  | 'USER_DENY'
  | 'USER_ALLOW'
  | 'ROLE_DENY'
  | 'ROLE_ALLOW'
  | 'DEFAULT_DENY';

export interface Resolution {
  allowed: boolean;
  source: ResolutionSource;
}

export interface PermissionContext {
  /** Explizite Einzel-Overrides des Benutzers. */
  userOverrides: readonly PermissionGrant[];
  /** Grants aus allen Rollen und Gruppen des Benutzers. */
  roleGrants: readonly PermissionGrant[];
}

/**
 * Zentrale Auflösung (Spezifikation §12):
 * 1. User DENY  2. User ALLOW  3. Role/Group DENY  4. Role/Group ALLOW  5. Default DENY
 * Ein Wildcard `module.*` im Grant gilt für alle Aktionen des Moduls; `*` für alles.
 */
export function resolvePermission(ctx: PermissionContext, permission: string): Resolution {
  const matches = (g: PermissionGrant) => grantMatches(g.permission, permission);
  const user = ctx.userOverrides.filter(matches);
  if (user.some((g) => g.effect === 'DENY')) return { allowed: false, source: 'USER_DENY' };
  if (user.some((g) => g.effect === 'ALLOW')) return { allowed: true, source: 'USER_ALLOW' };
  const role = ctx.roleGrants.filter(matches);
  if (role.some((g) => g.effect === 'DENY')) return { allowed: false, source: 'ROLE_DENY' };
  if (role.some((g) => g.effect === 'ALLOW')) return { allowed: true, source: 'ROLE_ALLOW' };
  return { allowed: false, source: 'DEFAULT_DENY' };
}

export function grantMatches(grant: string, permission: string): boolean {
  if (grant === permission || grant === '*') return true;
  if (grant.endsWith('.*')) return permission.startsWith(grant.slice(0, -1));
  return false;
}

export const can = (ctx: PermissionContext, permission: string): boolean =>
  resolvePermission(ctx, permission).allowed;

/** Berechnet die effektive Menge erlaubter Katalog-Permissions (für Frontend-UI-Hinweise). */
export function effectivePermissions(ctx: PermissionContext): PermissionKey[] {
  return ALL_PERMISSIONS.filter((p) => can(ctx, p));
}
