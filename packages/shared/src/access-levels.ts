import { ALL_PERMISSIONS, grantMatches, PERMISSION_CATALOG } from './permissions';

/**
 * Berechtigungsmatrix (zentraler Berechtigungseditor): je Rolle und Rechte-Bereich (Präfix des Rechts, z. B. `personnel`)
 * eine Zugriffsstufe. Die Stufen werden in die bestehenden Einzelrechte (RolePermission) übersetzt – es gibt KEINE zweite
 * Rechte-Logik: Prüfungen laufen weiter über `resolvePermission`.
 *
 * Priorität (unverändert, siehe resolvePermission): 1. Benutzer-Sperre (DENY) 2. Benutzer-Sonderrecht (ALLOW)
 * 3. höchste Rolle mit Angabe: DENY vor ALLOW 4. Standard: kein Zugriff.
 * Stufe `blocked` setzt eine ausdrückliche Sperre (`<bereich>.*` DENY) – sie gilt gegen ALLOW derselben oder niedrigerer Rollen.
 */
export const ACCESS_LEVELS = ['none', 'view', 'edit', 'full', 'blocked'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
/** Ergebnis beim Lesen: zusätzlich `custom`, wenn die Einzelrechte keiner Stufe genau entsprechen. */
export type AccessLevelState = AccessLevel | 'custom';
export const ACCESS_LEVEL_LABEL: Record<AccessLevelState, string> = {
  none: 'Kein Zugriff', view: 'Nur ansehen', edit: 'Bearbeiten', full: 'Vollzugriff', blocked: 'Gesperrt', custom: 'Individuell',
};

export type AccessArea = keyof typeof PERMISSION_CATALOG;
export const ACCESS_AREAS = Object.keys(PERMISSION_CATALOG) as AccessArea[];

const VIEW = /^(view|view_.*|history|logs|results)$/;
/** Verwaltende/kritische Aktionen: nur mit Vollzugriff. */
const ADMIN = /^(manage|manage_.*|delete|settings|restore|integration|roles|audit|transcript_delete|transcript_manage|bypass_limits|departments|hierarchy|notes_confidential|view_sensitive|edit_others|merge|erlc_command_critical)$/;

export function areaActions(area: AccessArea): readonly string[] { return PERMISSION_CATALOG[area]; }

/** Einzelrechte, die eine Stufe verleiht. */
export function accessLevelGrants(area: AccessArea, level: AccessLevel): { permission: string; effect: 'ALLOW' | 'DENY' }[] {
  const actions = areaActions(area);
  if (level === 'none') return [];
  if (level === 'blocked') return [{ permission: `${area}.*`, effect: 'DENY' }];
  if (level === 'full') return [{ permission: `${area}.*`, effect: 'ALLOW' }];
  const pick = actions.filter((a) => !ADMIN.test(a) && (VIEW.test(a) || level === 'edit'));
  // Bereiche ohne „view“-artige Aktion: Ansehen ist nicht abbildbar → leer
  return pick.map((a) => ({ permission: `${area}.${a}`, effect: 'ALLOW' as const }));
}

/** Stufe einer Rolle aus ihren Einzelrechten (nur die zum Bereich gehörigen zählen). */
export function accessLevelOf(area: AccessArea, grants: readonly { permission: string; effect: string }[]): AccessLevelState {
  const prefix = `${area}.`;
  const relevant = grants.filter((g) => g.permission === '*' || g.permission === `${area}.*` || g.permission.startsWith(prefix));
  if (!relevant.length) return 'none';
  if (relevant.some((g) => g.effect === 'DENY' && (g.permission === `${area}.*` || g.permission === '*'))) return 'blocked';
  if (relevant.some((g) => g.effect === 'DENY')) return 'custom';
  const allowed = new Set(areaActions(area).filter((a) => relevant.some((g) => grantMatches(g.permission, `${area}.${a}`))));
  const same = (level: AccessLevel) => {
    const want = new Set(accessLevelGrants(area, level).flatMap((g) => areaActions(area).filter((a) => grantMatches(g.permission, `${area}.${a}`))));
    return want.size === allowed.size && [...want].every((a) => allowed.has(a));
  };
  if (allowed.size === areaActions(area).length) return 'full';
  // Bereiche, in denen „Ansehen“ und „Bearbeiten“ dieselben Rechte ergeben (z. B. help), gelten als „Nur ansehen“
  if (same('view') && allowed.size > 0) return 'view';
  if (same('edit')) return 'edit';
  return allowed.size ? 'custom' : 'none';
}

/**
 * Neue Rechte-Liste einer Rolle nach dem Setzen einer Stufe: alle Einträge des Bereichs werden durch die Stufe ersetzt,
 * Rechte anderer Bereiche (und `*`) bleiben unverändert.
 */
export function applyAccessLevel(current: readonly { permission: string; effect: 'ALLOW' | 'DENY' }[], area: AccessArea, level: AccessLevel) {
  const prefix = `${area}.`;
  const kept = current.filter((g) => !(g.permission === `${area}.*` || g.permission.startsWith(prefix)));
  return [...kept, ...accessLevelGrants(area, level)];
}

/** Rechte, die sich zwischen zwei Rechte-Listen geändert haben (für Protokoll und Hinweise). */
export function accessDiff(before: readonly { permission: string; effect: string }[], after: readonly { permission: string; effect: string }[]) {
  const k = (g: { permission: string; effect: string }) => `${g.effect}:${g.permission}`;
  const b = new Set(before.map(k)); const a = new Set(after.map(k));
  return { added: [...a].filter((x) => !b.has(x)), removed: [...b].filter((x) => !a.has(x)) };
}

/** Rechte, die der Berechtigungseditor selbst braucht – ohne sie würde man sich aussperren. */
export const LOCKOUT_CRITICAL: readonly string[] = ['roles.view', 'roles.manage'];
export const isCatalogPermission = (p: string) => (ALL_PERMISSIONS as readonly string[]).includes(p);
