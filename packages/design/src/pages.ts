import { color, isObj, longText, oneOf, safeUrl, text } from './primitives.js';
import {
  MAX_LAYOUT_PAGES,
  PAGE_KEY_RE,
  buildWidget,
  emptyCta,
  normalizeCta,
  normalizePage,
  type Cta,
  type PageLayout,
  type Widget,
} from './widgets.js';

const ROLE_ID = /^\d{5,25}$/;
const BANNER_ID = /^[a-z0-9]{4,12}$/;

// --- Eigene Seiten ------------------------------------------------------------------------------
export const CUSTOM_PAGE_KEY = /^page-[a-z0-9-]{1,30}$/;
export const MAX_CUSTOM_PAGES = 20;
export const MAX_BANNERS = 10;
export const isCustomKey = (k: string) => CUSTOM_PAGE_KEY.test(k);
export const slugOf = (key: string) => key.replace(/^page-/, '');
export const keyOfSlug = (slug: string) => `page-${slug}`;
export interface CustomPage {
  /** `page-<url>` – so heißt die Seite im Menü, im Layout, bei Hintergründen und Bannern */
  key: string;
  name: string;
  icon: string;
  description: string;
  /** Discord-Rollen-IDs; leer = alle mit Dashboard-Zugang. Der Server liefert die Seite nur an diese Rollen aus. */
  roles: string[];
}
export interface BannerCfg {
  id: string;
  title: string;
  body: string;
  icon: string;
  image: string;
  cta: Cta;
  /** Akzentfarbe (Rand/Icon), Hintergrund, Textfarbe – leer = Standard */
  color: string;
  background: string;
  textColor: string;
  size: 'small' | 'medium' | 'large';
  visible: boolean;
  /** `*` = alle Seiten, sonst Seitenschlüssel (`overview`, `tickets`, `page-…`) */
  pages: string[];
  /** YYYY-MM-DD, leer = ohne Ablauf */
  expires: string;
  roles: string[];
}
export interface LayoutConfig {
  pages: Record<string, PageLayout>;
  custom: CustomPage[];
  banners: BannerCfg[];
}

export const emptyBanner = (id: string): BannerCfg => ({
  id,
  title: '',
  body: '',
  icon: '📢',
  image: '',
  cta: emptyCta(),
  color: '',
  background: '',
  textColor: '',
  size: 'medium',
  visible: true,
  pages: ['*'],
  expires: '',
  roles: [],
});
const optColor = (v: unknown) => (v === '' || v === undefined || v === null ? '' : color(v, ''));
const roleList = (v: unknown) =>
  [
    ...new Set(
      (Array.isArray(v) ? v : []).filter(
        (x): x is string => typeof x === 'string' && ROLE_ID.test(x),
      ),
    ),
  ].slice(0, 10);

function normalizeCustom(v: unknown): CustomPage[] {
  const out: CustomPage[] = [];
  for (const p of Array.isArray(v) ? v.slice(0, MAX_CUSTOM_PAGES) : []) {
    const o = isObj(p) ? p : {};
    const key = typeof o['key'] === 'string' && CUSTOM_PAGE_KEY.test(o['key']) ? o['key'] : '';
    const name = text(o['name'], 40, '').trim();
    if (!key || !name || out.some((x) => x.key === key)) continue;
    out.push({
      key,
      name,
      icon: text(o['icon'], 8, ''),
      description: text(o['description'], 200, '').trim(),
      roles: roleList(o['roles']),
    });
  }
  return out;
}
function normalizeBanners(v: unknown): BannerCfg[] {
  const out: BannerCfg[] = [];
  for (const b of Array.isArray(v) ? v.slice(0, MAX_BANNERS) : []) {
    const o = isObj(b) ? b : {};
    const id = typeof o['id'] === 'string' && BANNER_ID.test(o['id']) ? o['id'] : '';
    if (!id || out.some((x) => x.id === id)) continue;
    const pages = [
      ...new Set(
        (Array.isArray(o['pages']) ? o['pages'] : ['*']).filter(
          (x): x is string => typeof x === 'string' && (x === '*' || PAGE_KEY_RE.test(x)),
        ),
      ),
    ].slice(0, MAX_LAYOUT_PAGES);
    out.push({
      id,
      title: text(o['title'], 80, '').trim(),
      body: longText(o['body'], 400, ''),
      icon: text(o['icon'], 8, ''),
      image: safeUrl(o['image'], ''),
      cta: normalizeCta(o['cta']),
      color: optColor(o['color']),
      background: optColor(o['background']),
      textColor: optColor(o['textColor']),
      size: oneOf(o['size'], ['small', 'medium', 'large'] as const, 'medium'),
      visible: typeof o['visible'] === 'boolean' ? o['visible'] : true,
      pages: pages.length ? pages : ['*'],
      expires:
        typeof o['expires'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o['expires'])
          ? o['expires']
          : '',
      roles: roleList(o['roles']),
    });
  }
  return out;
}

export function normalizeLayout(raw: unknown, base: LayoutConfig = defaultLayout()): LayoutConfig {
  const o = isObj(raw) ? raw : {};
  const custom = normalizeCustom(o['custom']);
  const pagesRaw = isObj(o['pages']) ? o['pages'] : {};
  const allowed = new Set(['overview', ...custom.map((c) => c.key)]);
  const pages: LayoutConfig['pages'] = {};
  for (const [k, v] of Object.entries(pagesRaw).slice(0, MAX_LAYOUT_PAGES + 1))
    if (allowed.has(k)) pages[k] = normalizePage(v);
  // Die Übersicht gibt es immer (Standard-Widgets), solange sie nicht ausdrücklich angepasst wurde; jede eigene Seite hat ein Layout
  if (!pages['overview'] && base.pages['overview'])
    pages['overview'] = structuredClone(base.pages['overview']);
  for (const c of custom) pages[c.key] ??= { widgets: [] };
  return { pages, custom, banners: normalizeBanners(o['banners']) };
}

/** Standard-Übersicht: dieselben Informationen wie vor dem Widget-System. */
export function defaultLayout(): LayoutConfig {
  return {
    pages: {
      overview: {
        widgets: [
          buildWidget('stat0001', 'stat', 1, 1, { metric: 'openTickets' }),
          buildWidget('stat0002', 'stat', 4, 1, { metric: 'pendingSubmissions' }),
          buildWidget('stat0003', 'stat', 7, 1, { metric: 'onDuty' }),
          buildWidget('stat0004', 'stat', 10, 1, { metric: 'activeOperations' }),
          buildWidget('list0001', 'tickets', 1, 3, {}),
          buildWidget('list0002', 'applications', 7, 3, {}),
          buildWidget('health01', 'health', 1, 8, {}),
        ],
      },
    },
    custom: [],
    banners: [],
  };
}

// --- Seiten-Vorlagen ----------------------------------------------------------------------------
export const PAGE_TEMPLATES = ['empty', 'stats', 'team', 'info', 'management'] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];
export const TEMPLATE_LABEL: Record<PageTemplate, { label: string; hint: string }> = {
  empty: { label: 'Leere Seite', hint: 'Ohne Widgets – du baust alles selbst.' },
  stats: { label: 'Statistik-Seite', hint: 'Vier Kennzahlen und zwei Diagramme.' },
  team: { label: 'Team-Seite', hint: 'Wer ist im Dienst, Personalzahlen, ein Begrüßungstext.' },
  info: { label: 'Info-Seite', hint: 'Text, Link zum Handbuch und ein Hinweis-Banner.' },
  management: {
    label: 'Management-Seite',
    hint: 'Kennzahlen, offene Bewerbungen und Tickets, Aktivität.',
  },
};
/** Widgets einer Vorlage; IDs sind je Aufruf neu, damit mehrere Seiten sich nie überschneiden. */
export function templateWidgets(t: PageTemplate, idPrefix: string): Widget[] {
  const id = (n: number) => `${idPrefix}${String(n).padStart(2, '0')}`.slice(0, 12);
  const w = buildWidget;
  switch (t) {
    case 'empty':
      return [];
    case 'stats':
      return [
        w(id(1), 'stat', 1, 1, { metric: 'openTickets' }),
        w(id(2), 'stat', 4, 1, { metric: 'pendingSubmissions' }),
        w(id(3), 'stat', 7, 1, { metric: 'onDuty' }),
        w(id(4), 'stat', 10, 1, { metric: 'activeOperations' }),
        w(id(5), 'chart', 1, 3, { source: 'tickets' }),
        w(id(6), 'chart', 7, 3, { source: 'submissions' }),
      ];
    case 'team':
      return [
        w(
          id(1),
          'text',
          1,
          1,
          { body: '# Unser Team\nHier siehst du, wer gerade im Dienst ist.' },
          { w: 12, h: 2 },
        ),
        w(id(2), 'stat', 1, 3, { metric: 'onDuty' }),
        w(id(3), 'stat', 4, 3, { metric: 'personnel' }),
        w(id(4), 'team', 1, 5, { limit: 10 }, { w: 12, h: 6 }),
      ];
    case 'info':
      return [
        {
          ...w(id(1), 'banner', 1, 1, {
            body: 'Wichtige Information: Hier steht, was alle wissen sollen.',
          }),
          title: 'Hinweis',
        },
        w(
          id(2),
          'text',
          1,
          4,
          {
            body: '# Willkommen\nHier stehen **wichtige Informationen** für alle.\n- Erster Punkt\n- Zweiter Punkt',
          },
          { w: 8, h: 5 },
        ),
        w(
          id(3),
          'link',
          9,
          4,
          {
            description: 'Alle Regeln und Abläufe auf einen Blick.',
            cta: { ...emptyCta(), text: 'Öffnen', icon: '📚' },
          },
          { w: 4, h: 3 },
        ),
      ];
    case 'management':
      return [
        w(id(1), 'stat', 1, 1, { metric: 'pendingSubmissions' }),
        w(id(2), 'stat', 4, 1, { metric: 'pendingAbsences' }),
        w(id(3), 'stat', 7, 1, { metric: 'openTickets' }),
        w(id(4), 'stat', 10, 1, { metric: 'activeWanted' }),
        w(id(5), 'applications', 1, 3, {}),
        w(id(6), 'tickets', 7, 3, {}),
        w(id(7), 'activity', 1, 8, {}, { w: 12, h: 5 }),
      ];
  }
}
/** Neue Seiten-Adresse aus einem Namen; eindeutig unter den vorhandenen. */
export function newPageKey(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'seite';
  let key = keyOfSlug(base);
  for (let n = 2; taken.includes(key); n++) key = keyOfSlug(`${base}-${n}`);
  return key;
}

// --- Sichtweise eines Benutzers (serverseitig angewendet) ---------------------------------------
export interface Viewer {
  isAdmin: boolean;
  roleIds: readonly string[];
}
const sees = (roles: readonly string[], v: Viewer) =>
  roles.length === 0 || v.isAdmin || roles.some((r) => v.roleIds.includes(r));
/**
 * Schneidet aus einer Konfiguration heraus, was dieser Benutzer nicht sehen darf: Seiten, Widgets, Banner und
 * Menüeinträge mit Rollen-Einschränkung. Läuft auf dem Server – ein Browser erhält nie, was ihm nicht zusteht.
 */
export function filterForViewer<
  T extends { layout: LayoutConfig; navigation: { items: { key: string; roles: string[] }[] } },
>(config: T, v: Viewer): T {
  if (v.isAdmin) return config;
  const hiddenPages = new Set(
    config.layout.custom.filter((c) => !sees(c.roles, v)).map((c) => c.key),
  );
  const pages: LayoutConfig['pages'] = {};
  for (const [k, p] of Object.entries(config.layout.pages))
    if (!hiddenPages.has(k)) pages[k] = { widgets: p.widgets.filter((w) => sees(w.roles, v)) };
  return {
    ...config,
    layout: {
      pages,
      custom: config.layout.custom.filter((c) => !hiddenPages.has(c.key)),
      banners: config.layout.banners
        .filter((b) => sees(b.roles, v))
        .map((b) => ({ ...b, pages: b.pages.filter((p) => !hiddenPages.has(p)) }))
        .filter((b) => b.pages.length > 0),
    },
    navigation: {
      ...config.navigation,
      items: config.navigation.items.filter((i) => !hiddenPages.has(i.key) && sees(i.roles, v)),
    },
  };
}
/** Banner dieser Seite: sichtbar, nicht abgelaufen, für die Seite bestimmt (höchstens drei). */
export function bannersFor(
  banners: readonly BannerCfg[],
  page: string,
  expired: (date: string) => boolean,
): BannerCfg[] {
  return banners
    .filter(
      (b) =>
        b.visible &&
        (b.title || b.body) &&
        (b.pages.includes('*') || b.pages.includes(page)) &&
        !expired(b.expires),
    )
    .slice(0, 3);
}
