/**
 * Dashboard-Design (Phase 37): Konfigurationsmodell, Standardwerte und Normalisierung.
 * `normalizeConfig` wirft nie: ungültige oder fehlende Werte fallen einzeln auf den Standard zurück,
 * damit eine beschädigte Konfiguration das Dashboard nie unbenutzbar macht (Spezifikation 47).
 */
import { normalizeLayout, defaultLayout, type LayoutConfig } from './widgets.js';
import { isObj, color, num, bool, oneOf, text, safeUrl } from './primitives.js';
export { color, num, bool, oneOf, text, safeUrl, isObj };

export type Mode = 'dark' | 'light' | 'system';
export type Palette = Record<(typeof COLOR_KEYS)[number], string>;
export const COLOR_KEYS = [
  'primary',
  'primaryHover',
  'secondary',
  'background',
  'surface',
  'surfaceHover',
  'sidebar',
  'header',
  'textPrimary',
  'textSecondary',
  'border',
  'success',
  'warning',
  'danger',
  'info',
] as const;

export interface Background {
  type: 'solid' | 'gradient' | 'image' | 'gif';
  color: string;
  color2: string;
  angle: number;
  /** Nur lokale Uploads (/uploads/…) oder https-URLs */
  imageUrl: string;
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
  size: 'cover' | 'contain' | 'auto';
  opacity: number;
  blur: number;
  brightness: number;
  overlay: { enabled: boolean; color: string; opacity: number };
}
export interface NavGroup {
  id: string;
  name: string;
  icon: string;
  visible: boolean;
}
export interface NavItem {
  /** Seitenschlüssel (`tickets`, `overview`, …) oder `link-<id>` für einen eigenen Link */
  key: string;
  /** Leer = Standardtitel */
  title: string;
  /** Leer = Standard-Icon */
  icon: string;
  visible: boolean;
  /** Gruppen-ID oder leer (ohne Gruppe) */
  group: string;
  color: string;
  hoverColor: string;
  badge: string;
  /** Discord-Rollen-IDs; leer = für alle mit Zugriff. Nur Sichtbarkeit im Menü – der Zugriff wird serverseitig durch die Rechte geprüft. */
  roles: string[];
  /** Nur bei Link-Einträgen: https-Adresse */
  href: string;
}
export interface Typo {
  size: number;
  weight: number;
}
export interface DesignConfig {
  general: {
    nameMode: 'discord' | 'custom';
    customName: string;
    logo: {
      mode: 'discord' | 'upload' | 'none';
      url: string;
      width: number;
      height: number;
      radius: number;
      position: 'left' | 'center' | 'right';
    };
  };
  mode: Mode;
  colors: { dark: Palette; light: Palette };
  typography: {
    fontMain: string;
    fontHeading: string;
    h1: Typo;
    h2: Typo;
    body: Typo & { lineHeight: number; letterSpacing: number };
  };
  background: { global: Background; pages: Record<string, Background> };
  radius: number;
  glass: { enabled: boolean; opacity: number; blur: number; border: number; borderOpacity: number };
  shadow: { preset: 'none' | 'small' | 'medium' | 'large' | 'custom'; custom: string };
  navigation: { groups: NavGroup[]; items: NavItem[] };
  layout: LayoutConfig;
  sidebar: {
    enabled: boolean;
    width: number;
    position: 'left' | 'right';
    style: 'solid' | 'glass' | 'transparent';
    border: number;
    radius: number;
  };
  header: {
    height: number;
    opacity: number;
    blur: number;
    border: number;
    showLogo: boolean;
    showName: boolean;
    showSearch: boolean;
    showNotifications: boolean;
    showProfile: boolean;
  };
  cards: {
    radius: number | null;
    shadow: DesignConfig['shadow']['preset'] | null;
    glass: boolean | null;
    border: number;
  };
  buttons: { radius: number | null; shadow: DesignConfig['shadow']['preset'] | null };
  animation: {
    disabled: boolean;
    speed: 'slow' | 'normal' | 'fast';
    pageTransitions: boolean;
    cardHover: boolean;
    buttonHover: boolean;
    sidebar: boolean;
    modal: boolean;
    notification: boolean;
  };
  responsive: { mobileNav: 'drawer' | 'bottom' | 'hidden'; stackCards: boolean };
}

const dark: Palette = {
  primary: '#5865F2',
  primaryHover: '#4752C4',
  secondary: '#4F545C',
  background: '#0B0D10',
  surface: '#151820',
  surfaceHover: '#1C2029',
  sidebar: '#10131A',
  header: '#10131A',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A9B8',
  border: '#262B36',
  success: '#3BA55D',
  warning: '#FAA61A',
  danger: '#ED4245',
  info: '#3498DB',
};
const light: Palette = {
  primary: '#4752C4',
  primaryHover: '#3C45A5',
  secondary: '#747F8D',
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceHover: '#EEF0F3',
  sidebar: '#FFFFFF',
  header: '#FFFFFF',
  textPrimary: '#14161A',
  textSecondary: '#5C6370',
  border: '#DADDE3',
  success: '#2D7D46',
  warning: '#B97A0A',
  danger: '#C93B3E',
  info: '#1F78B4',
};
const bg = (color: string): Background => ({
  type: 'solid',
  color,
  color2: '#5865F2',
  angle: 135,
  imageUrl: '',
  position: 'center',
  size: 'cover',
  opacity: 100,
  blur: 0,
  brightness: 100,
  overlay: { enabled: false, color: '#000000', opacity: 40 },
});

export const DEFAULT_CONFIG: DesignConfig = {
  general: {
    nameMode: 'discord',
    customName: '',
    logo: { mode: 'discord', url: '', width: 36, height: 36, radius: 8, position: 'left' },
  },
  mode: 'dark',
  colors: { dark, light },
  typography: {
    fontMain: 'system',
    fontHeading: 'system',
    h1: { size: 32, weight: 700 },
    h2: { size: 24, weight: 600 },
    body: { size: 15, weight: 400, lineHeight: 1.5, letterSpacing: 0 },
  },
  background: { global: bg(dark.background), pages: {} },
  radius: 12,
  glass: { enabled: false, opacity: 70, blur: 20, border: 1, borderOpacity: 15 },
  shadow: { preset: 'small', custom: '' },
  navigation: { groups: [], items: [] },
  layout: defaultLayout(),
  sidebar: { enabled: true, width: 260, position: 'left', style: 'solid', border: 1, radius: 0 },
  header: {
    height: 56,
    opacity: 100,
    blur: 0,
    border: 1,
    showLogo: true,
    showName: true,
    showSearch: true,
    showNotifications: true,
    showProfile: true,
  },
  cards: { radius: null, shadow: null, glass: null, border: 1 },
  buttons: { radius: null, shadow: null },
  animation: {
    disabled: false,
    speed: 'normal',
    pageTransitions: true,
    cardHover: true,
    buttonHover: true,
    sidebar: true,
    modal: true,
    notification: true,
  },
  responsive: { mobileNav: 'drawer', stackCards: true },
};

/** Schriftarten, die ohne externen Download verfügbar sind oder über das Dashboard geladen werden dürfen. */
export const FONTS = ['system', 'Inter', 'Roboto', 'Poppins', 'Open Sans'] as const;

export const MAX_NAV_GROUPS = 12;
export const MAX_NAV_ITEMS = 80;
export const NAV_ID = /^[a-z0-9-]{1,24}$/;
export const NAV_KEY = /^(?:[a-z0-9-]{1,40}|link-[a-z0-9]{1,16})$/;
const ROLE_ID = /^\d{5,25}$/;
export const isLinkKey = (key: string) => key.startsWith('link-');

function navGroups(v: unknown): NavGroup[] {
  const out: NavGroup[] = [];
  for (const g of Array.isArray(v) ? v.slice(0, MAX_NAV_GROUPS) : []) {
    const o = isObj(g) ? g : {};
    const id = typeof o['id'] === 'string' && NAV_ID.test(o['id']) ? o['id'] : '';
    const name = text(o['name'], 30, '').trim();
    if (!id || !name || out.some((x) => x.id === id)) continue;
    out.push({ id, name, icon: text(o['icon'], 8, ''), visible: bool(o['visible'], true) });
  }
  return out;
}
function navItems(v: unknown, groups: NavGroup[]): NavItem[] {
  const out: NavItem[] = [];
  for (const i of Array.isArray(v) ? v.slice(0, MAX_NAV_ITEMS) : []) {
    const o = isObj(i) ? i : {};
    const key = typeof o['key'] === 'string' && NAV_KEY.test(o['key']) ? o['key'] : '';
    if (!key || out.some((x) => x.key === key)) continue;
    const group =
      typeof o['group'] === 'string' && groups.some((g) => g.id === o['group']) ? o['group'] : '';
    const col = (x: unknown) => (x === '' || x === undefined || x === null ? '' : color(x, ''));
    const roles = (Array.isArray(o['roles']) ? o['roles'] : []).filter(
      (r): r is string => typeof r === 'string' && ROLE_ID.test(r),
    );
    const href = isLinkKey(key) ? safeUrl(o['href'], '') : '';
    if (isLinkKey(key) && !href) continue; // Link ohne gültige Adresse ist nutzlos
    out.push({
      key,
      title: text(o['title'], 40, '').trim(),
      icon: text(o['icon'], 8, ''),
      visible: bool(o['visible'], true),
      group,
      color: col(o['color']),
      hoverColor: col(o['hoverColor']),
      badge: text(o['badge'], 12, '').trim(),
      roles: [...new Set(roles)].slice(0, 10),
      href,
    });
  }
  return out;
}

const nullable = <T>(v: unknown, f: (x: unknown) => T): T | null =>
  v === null || v === undefined ? null : f(v);

function palette(v: unknown, d: Palette): Palette {
  const o = isObj(v) ? v : {};
  return Object.fromEntries(COLOR_KEYS.map((k) => [k, color(o[k], d[k])])) as Palette;
}
function background(v: unknown, d: Background): Background {
  const o = isObj(v) ? v : {};
  const ov = isObj(o['overlay']) ? o['overlay'] : {};
  return {
    type: oneOf(o['type'], ['solid', 'gradient', 'image', 'gif'], d.type),
    color: color(o['color'], d.color),
    color2: color(o['color2'], d.color2),
    angle: num(o['angle'], 0, 360, d.angle),
    imageUrl: safeUrl(o['imageUrl'], d.imageUrl),
    position: oneOf(o['position'], ['center', 'top', 'bottom', 'left', 'right'], d.position),
    size: oneOf(o['size'], ['cover', 'contain', 'auto'], d.size),
    opacity: num(o['opacity'], 0, 100, d.opacity),
    blur: num(o['blur'], 0, 40, d.blur),
    brightness: num(o['brightness'], 20, 200, d.brightness),
    overlay: {
      enabled: bool(ov['enabled'], d.overlay.enabled),
      color: color(ov['color'], d.overlay.color),
      opacity: num(ov['opacity'], 0, 100, d.overlay.opacity),
    },
  };
}
const typo = (v: unknown, d: Typo): Typo => {
  const o = isObj(v) ? v : {};
  return {
    size: num(o['size'], 10, 64, d.size),
    weight: Math.round(num(o['weight'], 100, 900, d.weight) / 100) * 100,
  };
};
const SHADOWS = ['none', 'small', 'medium', 'large', 'custom'] as const;
export const PAGE_KEY = /^[a-z0-9-]{1,40}$/;
const MAX_PAGES = 50;

/** Baut aus beliebiger Eingabe eine vollständige, gültige Konfiguration. Wirft nie. */
export function normalizeConfig(raw: unknown, base: DesignConfig = DEFAULT_CONFIG): DesignConfig {
  const r = isObj(raw) ? raw : {};
  const g = isObj(r['general']) ? r['general'] : {};
  const lg = isObj(g['logo']) ? g['logo'] : {};
  const col = isObj(r['colors']) ? r['colors'] : {};
  const ty = isObj(r['typography']) ? r['typography'] : {};
  const body = isObj(ty['body']) ? ty['body'] : {};
  const bgs = isObj(r['background']) ? r['background'] : {};
  const pagesRaw = isObj(bgs['pages']) ? bgs['pages'] : {};
  const gl = isObj(r['glass']) ? r['glass'] : {};
  const sh = isObj(r['shadow']) ? r['shadow'] : {};
  const nv = isObj(r['navigation']) ? r['navigation'] : {};
  const navG = navGroups(nv['groups']);
  const sb = isObj(r['sidebar']) ? r['sidebar'] : {};
  const hd = isObj(r['header']) ? r['header'] : {};
  const cd = isObj(r['cards']) ? r['cards'] : {};
  const bt = isObj(r['buttons']) ? r['buttons'] : {};
  const an = isObj(r['animation']) ? r['animation'] : {};
  const rs = isObj(r['responsive']) ? r['responsive'] : {};
  const b = base;
  const globalBg = background(bgs['global'], b.background.global);
  const pages: Record<string, Background> = {};
  for (const [k, v] of Object.entries(pagesRaw).slice(0, MAX_PAGES))
    if (PAGE_KEY.test(k)) pages[k] = background(v, globalBg);
  return {
    general: {
      nameMode: oneOf(g['nameMode'], ['discord', 'custom'], b.general.nameMode),
      customName: text(g['customName'], 60, b.general.customName),
      logo: {
        mode: oneOf(lg['mode'], ['discord', 'upload', 'none'], b.general.logo.mode),
        url: safeUrl(lg['url'], b.general.logo.url),
        width: num(lg['width'], 16, 200, b.general.logo.width),
        height: num(lg['height'], 16, 200, b.general.logo.height),
        radius: num(lg['radius'], 0, 100, b.general.logo.radius),
        position: oneOf(lg['position'], ['left', 'center', 'right'], b.general.logo.position),
      },
    },
    mode: oneOf(r['mode'], ['dark', 'light', 'system'], b.mode),
    colors: {
      dark: palette(col['dark'], b.colors.dark),
      light: palette(col['light'], b.colors.light),
    },
    typography: {
      fontMain: oneOf(ty['fontMain'], FONTS, b.typography.fontMain as (typeof FONTS)[number]),
      fontHeading: oneOf(
        ty['fontHeading'],
        FONTS,
        b.typography.fontHeading as (typeof FONTS)[number],
      ),
      h1: typo(ty['h1'], b.typography.h1),
      h2: typo(ty['h2'], b.typography.h2),
      body: {
        ...typo(body, b.typography.body),
        lineHeight: num(body['lineHeight'], 1, 2.5, b.typography.body.lineHeight),
        letterSpacing: num(body['letterSpacing'], -2, 10, b.typography.body.letterSpacing),
      },
    },
    background: { global: globalBg, pages },
    radius: num(r['radius'], 0, 48, b.radius),
    glass: {
      enabled: bool(gl['enabled'], b.glass.enabled),
      opacity: num(gl['opacity'], 10, 100, b.glass.opacity),
      blur: num(gl['blur'], 0, 40, b.glass.blur),
      border: num(gl['border'], 0, 4, b.glass.border),
      borderOpacity: num(gl['borderOpacity'], 0, 100, b.glass.borderOpacity),
    },
    shadow: {
      preset: oneOf(sh['preset'], SHADOWS, b.shadow.preset),
      custom: shadowCss(sh['custom']),
    },
    navigation: { groups: navG, items: navItems(nv['items'], navG) },
    layout: normalizeLayout(r['layout'], b.layout),
    sidebar: {
      enabled: bool(sb['enabled'], b.sidebar.enabled),
      width: num(sb['width'], 180, 400, b.sidebar.width),
      position: oneOf(sb['position'], ['left', 'right'], b.sidebar.position),
      style: oneOf(sb['style'], ['solid', 'glass', 'transparent'], b.sidebar.style),
      border: num(sb['border'], 0, 4, b.sidebar.border),
      radius: num(sb['radius'], 0, 48, b.sidebar.radius),
    },
    header: {
      height: num(hd['height'], 40, 120, b.header.height),
      opacity: num(hd['opacity'], 0, 100, b.header.opacity),
      blur: num(hd['blur'], 0, 40, b.header.blur),
      border: num(hd['border'], 0, 4, b.header.border),
      showLogo: bool(hd['showLogo'], b.header.showLogo),
      showName: bool(hd['showName'], b.header.showName),
      showSearch: bool(hd['showSearch'], b.header.showSearch),
      showNotifications: bool(hd['showNotifications'], b.header.showNotifications),
      showProfile: bool(hd['showProfile'], b.header.showProfile),
    },
    cards: {
      radius: nullable(cd['radius'], (x) => num(x, 0, 48, b.radius)),
      shadow: nullable(cd['shadow'], (x) => oneOf(x, SHADOWS, 'small')),
      glass: nullable(cd['glass'], (x) => bool(x, false)),
      border: num(cd['border'], 0, 4, b.cards.border),
    },
    buttons: {
      radius: nullable(bt['radius'], (x) => num(x, 0, 48, b.radius)),
      shadow: nullable(bt['shadow'], (x) => oneOf(x, SHADOWS, 'none')),
    },
    animation: {
      disabled: bool(an['disabled'], b.animation.disabled),
      speed: oneOf(an['speed'], ['slow', 'normal', 'fast'], b.animation.speed),
      pageTransitions: bool(an['pageTransitions'], b.animation.pageTransitions),
      cardHover: bool(an['cardHover'], b.animation.cardHover),
      buttonHover: bool(an['buttonHover'], b.animation.buttonHover),
      sidebar: bool(an['sidebar'], b.animation.sidebar),
      modal: bool(an['modal'], b.animation.modal),
      notification: bool(an['notification'], b.animation.notification),
    },
    responsive: {
      mobileNav: oneOf(rs['mobileNav'], ['drawer', 'bottom', 'hidden'], b.responsive.mobileNav),
      stackCards: bool(rs['stackCards'], b.responsive.stackCards),
    },
  };
}
/** Eigener Schatten: nur Zahlen, Farben und Leerzeichen – keine Funktionen/URLs (CSS-Injektion). */
function shadowCss(v: unknown): string {
  return typeof v === 'string' &&
    /^-?\d{1,3}(?:px)?(?: -?\d{1,3}(?:px)?){1,3} #(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v)
    ? v
    : '';
}

// --- Überschreibungen: Custom > Theme > Standard -------------------------------------------------
/** Tiefes Zusammenführen: Werte aus `over` (nur vorhandene Schlüssel) ersetzen die aus `base`. */
export function mergeDeep(base: unknown, over: unknown): unknown {
  if (!isObj(over)) return over === undefined ? base : over;
  if (!isObj(base)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = k in base ? mergeDeep(base[k], v) : v;
  return out;
}
/** Die endgültige Konfiguration: Standard ← Theme ← Server-Überschreibungen. */
export function resolveConfig(theme: unknown, overrides: unknown): DesignConfig {
  return normalizeConfig(mergeDeep(theme, overrides));
}
/** Entfernt aus einer Teilkonfiguration alle Schlüssel, die es im Modell nicht gibt (Pfad-Whitelist). */
export function pruneToModel(raw: unknown, model: unknown = DEFAULT_CONFIG, depth = 0): unknown {
  if (!isObj(raw) || !isObj(model) || depth > 6) return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (k === 'pages' && depth === 1) {
      out[k] = v;
      continue;
    }
    if (!(k in model)) continue;
    out[k] = isObj(model[k]) ? pruneToModel(v, model[k], depth + 1) : v;
  }
  return out;
}

// --- Vergleich ------------------------------------------------------------------------------------
/** JSON mit sortierten Schlüsseln – damit die Reihenfolge von Objektschlüsseln keinen Unterschied macht. */
export const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
export function leaves(v: unknown, path = ''): Map<string, unknown> {
  const m = new Map<string, unknown>();
  if (isObj(v))
    for (const [k, x] of Object.entries(v))
      for (const [p, y] of leaves(x, path ? `${path}.${k}` : k)) m.set(p, y);
  else m.set(path, v);
  return m;
}
/** Pfade, an denen sich zwei Konfigurationen unterscheiden. */
export function changedPaths(a: unknown, b: unknown): string[] {
  const la = leaves(a),
    lb = leaves(b);
  const keys = new Set([...la.keys(), ...lb.keys()]);
  return [...keys].filter((k) => stable(la.get(k)) !== stable(lb.get(k))).sort();
}
/** Eingabewerte, die beim Normalisieren verworfen oder geändert würden (für verständliche Fehlermeldungen). */
export function findIssues(raw: unknown): string[] {
  const pruned = pruneToModel(raw);
  const norm = normalizeConfig(pruned);
  const out: string[] = [];
  for (const [p, v] of leaves(pruned)) {
    if (p === '') continue;
    const n = leaves(norm).get(p);
    if (n === undefined && p.startsWith('background.pages.')) continue;
    if (stable(n) !== stable(v)) out.push(p);
  }
  return out;
}

export const SECTION_LABEL: Record<string, string> = {
  general: 'Allgemein',
  navigation: 'Navigation',
  layout: 'Widgets',
  mode: 'Modus',
  colors: 'Farben',
  typography: 'Typografie',
  background: 'Hintergrund',
  radius: 'Rundung',
  glass: 'Glas-Effekt',
  shadow: 'Schatten',
  sidebar: 'Sidebar',
  header: 'Header',
  cards: 'Karten',
  buttons: 'Buttons',
  animation: 'Animationen',
  responsive: 'Mobile Ansicht',
};
/** „Farben: dark.primary; Hintergrund: global.type“ – kurze Zusammenfassung für Versionsverlauf und Audit-Log. */
export function summarizeChange(a: unknown, b: unknown): string {
  const by = new Map<string, string[]>();
  for (const p of changedPaths(a, b)) {
    const [sec = '', ...rest] = p.split('.');
    by.set(sec, [...(by.get(sec) ?? []), rest.join('.') || sec]);
  }
  if (by.size === 0) return 'Keine Änderung';
  return [...by]
    .map(
      ([s, ps]) =>
        `${SECTION_LABEL[s] ?? s}: ${ps.slice(0, 3).join(', ')}${ps.length > 3 ? ` (+${ps.length - 3})` : ''}`,
    )
    .join('; ')
    .slice(0, 300);
}
