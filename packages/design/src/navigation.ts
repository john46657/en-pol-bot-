import {
  MAX_NAV_ITEMS,
  isLinkKey,
  type DesignConfig,
  type NavGroup,
  type NavItem,
} from './config.js';

/** Eingebauter Menüpunkt des Dashboards (Seitenschlüssel, Standardtitel, Standard-Icon). */
export interface BuiltinNav {
  key: string;
  label: string;
  icon: string;
}

export const emptyItem = (key: string): NavItem => ({
  key,
  title: '',
  icon: '',
  visible: true,
  group: '',
  color: '',
  hoverColor: '',
  badge: '',
  roles: [],
  href: '',
});

/**
 * Vollständige Eintragsliste für den Editor: zuerst die gespeicherten Einträge in ihrer Reihenfolge (unbekannte
 * Seiten fallen weg), danach alle eingebauten, die noch fehlen – neue Dashboard-Seiten erscheinen so von selbst.
 */
export function materializeItems(
  builtins: readonly BuiltinNav[],
  cfg: DesignConfig['navigation'],
): NavItem[] {
  const known = new Set(builtins.map((b) => b.key));
  const out = cfg.items.filter((i) => isLinkKey(i.key) || known.has(i.key));
  for (const b of builtins) if (!out.some((i) => i.key === b.key)) out.push(emptyItem(b.key));
  return out.slice(0, MAX_NAV_ITEMS);
}

export interface NavContext {
  /** Server-Verwalter sehen alle Einträge (Rollen-Sichtbarkeit gilt für sie nicht) – kein Aussperren möglich. */
  isAdmin: boolean;
  roleIds: readonly string[];
  /** Darf der Benutzer die Seite überhaupt sehen? (Rechte-Prüfung der Oberfläche; der Server prüft ohnehin selbst.) */
  allowed: (key: string) => boolean;
  /** Einträge, die nie verschwinden dürfen (z. B. „design“ für Benutzer mit Design-Recht), damit man sich nicht aussperrt. */
  pinned?: readonly string[];
}
export interface ResolvedItem {
  key: string;
  title: string;
  icon: string;
  color: string;
  hoverColor: string;
  badge: string;
  /** Nur Link-Einträge */
  href: string;
}
export interface ResolvedSection {
  group: NavGroup | null;
  items: ResolvedItem[];
}

/** Menü, wie es dieser Benutzer sieht: ungruppierte Einträge zuerst, dann die Gruppen in ihrer Reihenfolge. */
export function resolveNavigation(
  builtins: readonly BuiltinNav[],
  cfg: DesignConfig['navigation'],
  ctx: NavContext,
): ResolvedSection[] {
  const byKey = new Map(builtins.map((b) => [b.key, b]));
  const pinned = new Set(ctx.pinned ?? []);
  const visible = materializeItems(builtins, cfg).filter((i) => {
    if (pinned.has(i.key)) return ctx.allowed(i.key);
    if (!i.visible) return false;
    if (!isLinkKey(i.key) && !ctx.allowed(i.key)) return false;
    if (i.roles.length > 0 && !ctx.isAdmin && !i.roles.some((r) => ctx.roleIds.includes(r)))
      return false;
    return true;
  });
  const toResolved = (i: NavItem): ResolvedItem => {
    const b = byKey.get(i.key);
    return {
      key: i.key,
      title: i.title || b?.label || i.key,
      icon: i.icon || b?.icon || '🔗',
      color: i.color,
      hoverColor: i.hoverColor,
      badge: i.badge,
      href: i.href,
    };
  };
  const sections: ResolvedSection[] = [];
  const loose = visible.filter((i) => i.group === '');
  if (loose.length) sections.push({ group: null, items: loose.map(toResolved) });
  for (const g of cfg.groups) {
    if (!g.visible) continue;
    const items = visible.filter((i) => i.group === g.id).map(toResolved);
    if (items.length) sections.push({ group: g, items });
  }
  return sections;
}

/** Neue, eindeutige Gruppen-ID aus einem Namen. */
export function newGroupId(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 18) || 'gruppe';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
export function newLinkKey(taken: readonly string[]): string {
  for (;;) {
    const key = `link-${Math.random().toString(36).slice(2, 8)}`;
    if (!taken.includes(key)) return key;
  }
}

/** Element von `from` nach `to` verschieben (Drag & Drop und Pfeiltasten). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length)
    return [...list];
  const copy = [...list];
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x as T);
  return copy;
}
