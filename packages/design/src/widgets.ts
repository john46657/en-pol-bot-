import { bool, color, isObj, longText, num, oneOf, safeUrl, text } from './primitives.js';

/** 12-Spalten-Raster; Zeilen sind frei wählbar. */
export const GRID_COLS = 12;
export const MAX_ROWS = 80;
export const MAX_WIDGETS = 60;
export const MAX_LAYOUT_PAGES = 30;
export const PAGE_KEY_RE = /^[a-z0-9-]{1,40}$/;
const WIDGET_ID = /^[a-z0-9]{4,12}$/;
const ROLE_ID = /^\d{5,25}$/;

export const WIDGET_TYPES = [
  'stat',
  'tickets',
  'applications',
  'team',
  'chart',
  'activity',
  'date',
  'text',
  'link',
  'image',
  'banner',
  'health',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];
export const WIDGET_LABEL: Record<WidgetType, { label: string; icon: string; hint: string }> = {
  stat: { label: 'Statistik', icon: '📊', hint: 'Eine Kennzahl, z. B. offene Tickets' },
  tickets: { label: 'Tickets', icon: '🎫', hint: 'Liste der offenen Tickets' },
  applications: { label: 'Bewerbungen', icon: '📋', hint: 'Offene Bewerbungen' },
  team: { label: 'Team', icon: '👥', hint: 'Wer ist gerade im Dienst' },
  chart: { label: 'Diagramm', icon: '📈', hint: 'Balkendiagramm nach Status' },
  activity: { label: 'Aktivität', icon: '🕘', hint: 'Letzte Ereignisse (Audit-Log)' },
  date: { label: 'Datum', icon: '📅', hint: 'Datum und Uhrzeit' },
  text: { label: 'Text', icon: '📝', hint: 'Eigener Text mit einfacher Formatierung' },
  link: { label: 'Link', icon: '🔗', hint: 'Karte mit Button' },
  image: { label: 'Bild', icon: '🖼️', hint: 'Eigenes Bild, optional verlinkt' },
  banner: { label: 'Banner', icon: '📢', hint: 'Hinweis mit Button und Ablaufdatum' },
  health: { label: 'Konfigurations-Check', icon: '✅', hint: 'Zustand der Server-Einrichtung' },
};

/** Kennzahlen für Statistik-Widgets: Beschriftung, Icon und das Recht, das zum Sehen nötig ist (serverseitig geprüft). */
export const METRICS = {
  openTickets: { label: 'Offene Tickets', icon: '🎫', permission: 'tickets.view' },
  pendingSubmissions: {
    label: 'Offene Bewerbungen',
    icon: '📋',
    permission: 'applications.submissions.view',
  },
  acceptedSubmissions: {
    label: 'Angenommene Bewerbungen',
    icon: '🟢',
    permission: 'applications.submissions.view',
  },
  deniedSubmissions: {
    label: 'Abgelehnte Bewerbungen',
    icon: '🔴',
    permission: 'applications.submissions.view',
  },
  onDuty: { label: 'Im Dienst', icon: '👮', permission: 'shifts.view' },
  activeOperations: { label: 'Laufende Einsätze', icon: '🚨', permission: 'operations.view' },
  activeWanted: { label: 'Aktive Fahndungen', icon: '📣', permission: 'wanted.view' },
  personnel: { label: 'Beamte', icon: '👥', permission: 'personnel.view' },
  pendingAbsences: { label: 'Offene Abmeldungen', icon: '🏖️', permission: 'absence.view' },
} as const;
export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
export const CHART_SOURCES = {
  tickets: { label: 'Tickets nach Status', permission: 'tickets.view' },
  submissions: { label: 'Bewerbungen nach Status', permission: 'applications.submissions.view' },
  operations: { label: 'Einsätze nach Status', permission: 'operations.view' },
} as const;
export type ChartSource = keyof typeof CHART_SOURCES;
/** Rechte je Listen-Widget */
export const LIST_PERMISSION = {
  tickets: 'tickets.view',
  applications: 'applications.submissions.view',
  team: 'shifts.view',
  activity: 'audit.view',
} as const;

// --- Aktions-Button ("Button-Builder") ------------------------------------------------------------
export const CTA_KINDS = ['none', 'page', 'url', 'discord', 'ticket', 'application'] as const;
export type CtaKind = (typeof CTA_KINDS)[number];
export const CTA_LABEL: Record<CtaKind, string> = {
  none: 'Kein Button',
  page: 'Dashboard-Seite öffnen',
  url: 'Externe Adresse (https)',
  discord: 'Discord-Link',
  ticket: 'Tickets öffnen',
  application: 'Bewerbungen öffnen',
};
const SHADOW = ['none', 'small', 'medium', 'large'] as const;
export type ShadowPreset = (typeof SHADOW)[number];
export interface Cta {
  text: string;
  icon: string;
  kind: CtaKind;
  /** page: Seitenschlüssel · url/discord: https-Adresse */
  target: string;
  color: string;
  hoverColor: string;
  textColor: string;
  radius: number | null;
  border: number;
  shadow: ShadowPreset | null;
}
export const emptyCta = (): Cta => ({
  text: '',
  icon: '',
  kind: 'none',
  target: '',
  color: '',
  hoverColor: '',
  textColor: '',
  radius: null,
  border: 0,
  shadow: null,
});
const optColor = (v: unknown) => (v === '' || v === undefined || v === null ? '' : color(v, ''));
const DISCORD_HOSTS = new Set([
  'discord.gg',
  'discord.com',
  'www.discord.com',
  'discordapp.com',
  'discord.new',
]);
export function normalizeCta(raw: unknown): Cta {
  const o = isObj(raw) ? raw : {};
  const kind = oneOf(o['kind'], CTA_KINDS, 'none');
  let target = '';
  if (kind === 'page')
    target = typeof o['target'] === 'string' && PAGE_KEY_RE.test(o['target']) ? o['target'] : '';
  else if (kind === 'url') target = safeUrl(o['target'], '');
  else if (kind === 'discord') {
    target = safeUrl(o['target'], '');
    try {
      if (!DISCORD_HOSTS.has(new URL(target).hostname)) target = '';
    } catch {
      target = '';
    }
  }
  // Die Art bleibt auch bei leerem/ungültigem Ziel erhalten (der Editor braucht das beim Tippen); ohne Ziel gibt es keinen Button (ctaTarget → null).
  const nul = <T>(v: unknown, f: (x: unknown) => T): T | null =>
    v === null || v === undefined ? null : f(v);
  return {
    text: text(o['text'], 40, '').trim(),
    icon: text(o['icon'], 8, ''),
    kind,
    target,
    color: optColor(o['color']),
    hoverColor: optColor(o['hoverColor']),
    textColor: optColor(o['textColor']),
    radius: nul(o['radius'], (x) => num(x, 0, 48, 8)),
    border: num(o['border'], 0, 4, 0),
    shadow: nul(o['shadow'], (x) => oneOf(x, SHADOW, 'none')),
  };
}
/** Ziel eines Buttons: interne Seiten über den Router, externe Adressen in neuem Tab. `null` = kein Button. */
export function ctaTarget(cta: Cta, guildId: string): { href: string; external: boolean } | null {
  switch (cta.kind) {
    case 'page':
      return cta.target
        ? {
            href: `/guilds/${guildId}/${cta.target === 'overview' ? '' : cta.target}`,
            external: false,
          }
        : null;
    case 'ticket':
      return { href: `/guilds/${guildId}/tickets`, external: false };
    case 'application':
      return { href: `/guilds/${guildId}/applications`, external: false };
    case 'url':
    case 'discord':
      return cta.target ? { href: cta.target, external: true } : null;
    default:
      return null;
  }
}

// --- Widgets -------------------------------------------------------------------------------------
export interface WidgetStyle {
  background: string;
  color: string;
  border: number | null;
  radius: number | null;
  shadow: ShadowPreset | null;
  glass: boolean | null;
}
export interface Widget {
  id: string;
  type: WidgetType;
  /** Spalte 1–12, Zeile ab 1 */
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  icon: string;
  visible: boolean;
  /** Discord-Rollen-IDs; leer = für alle. Nur Sichtbarkeit – Daten werden serverseitig nach Recht geliefert. */
  roles: string[];
  style: WidgetStyle;
  props: Record<string, unknown>;
}
export interface PageLayout {
  widgets: Widget[];
}
export interface LayoutConfig {
  pages: Record<string, PageLayout>;
}

/** Größen wie in der Spezifikation (1x1 … 4x2); eine Einheit = 3 von 12 Spalten, 2 Zeilen. */
export const SIZE_PRESETS = [
  ['1x1', 3, 2],
  ['2x1', 6, 2],
  ['3x1', 9, 2],
  ['4x1', 12, 2],
  ['2x2', 6, 4],
  ['3x2', 9, 4],
  ['4x2', 12, 4],
] as const;
export const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  stat: { w: 3, h: 2 },
  tickets: { w: 6, h: 5 },
  applications: { w: 6, h: 5 },
  team: { w: 6, h: 5 },
  chart: { w: 6, h: 4 },
  activity: { w: 6, h: 5 },
  date: { w: 3, h: 2 },
  text: { w: 6, h: 3 },
  link: { w: 4, h: 3 },
  image: { w: 6, h: 4 },
  banner: { w: 12, h: 3 },
  health: { w: 12, h: 4 },
};

export function defaultProps(type: WidgetType): Record<string, unknown> {
  switch (type) {
    case 'stat':
      return { metric: 'openTickets', description: '', trend: '' };
    case 'tickets':
    case 'applications':
    case 'team':
    case 'activity':
      return { limit: 5 };
    case 'chart':
      return { source: 'tickets' };
    case 'date':
      return { format: 'datetime' };
    case 'text':
      return { body: '' };
    case 'link':
      return { description: '', cta: { ...emptyCta(), text: 'Öffnen', kind: 'none' } };
    case 'image':
      return { src: '', alt: '', fit: 'cover', cta: emptyCta() };
    case 'banner':
      return { body: '', image: '', cta: emptyCta(), expires: '' };
    case 'health':
      return {};
  }
}
function normalizeProps(type: WidgetType, raw: unknown): Record<string, unknown> {
  const o = isObj(raw) ? raw : {};
  const d = defaultProps(type);
  switch (type) {
    case 'stat':
      return {
        metric: oneOf(o['metric'], METRIC_KEYS, d['metric'] as MetricKey),
        description: text(o['description'], 120, ''),
        trend: text(o['trend'], 60, ''),
      };
    case 'tickets':
    case 'applications':
    case 'team':
    case 'activity':
      return { limit: Math.round(num(o['limit'], 1, 10, 5)) };
    case 'chart':
      return { source: oneOf(o['source'], Object.keys(CHART_SOURCES) as ChartSource[], 'tickets') };
    case 'date':
      return { format: oneOf(o['format'], ['date', 'datetime', 'time'] as const, 'datetime') };
    case 'text':
      return { body: longText(o['body'], 2000, '') };
    case 'link':
      return { description: text(o['description'], 200, ''), cta: normalizeCta(o['cta']) };
    case 'image':
      return {
        src: safeUrl(o['src'], ''),
        alt: text(o['alt'], 120, ''),
        fit: oneOf(o['fit'], ['cover', 'contain'] as const, 'cover'),
        cta: normalizeCta(o['cta']),
      };
    case 'banner':
      return {
        body: longText(o['body'], 400, ''),
        image: safeUrl(o['image'], ''),
        cta: normalizeCta(o['cta']),
        expires:
          typeof o['expires'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o['expires'])
            ? o['expires']
            : '',
      };
    case 'health':
      return {};
  }
}
export function emptyStyle(): WidgetStyle {
  return { background: '', color: '', border: null, radius: null, shadow: null, glass: null };
}
function normalizeStyle(raw: unknown): WidgetStyle {
  const o = isObj(raw) ? raw : {};
  const nul = <T>(v: unknown, f: (x: unknown) => T): T | null =>
    v === null || v === undefined ? null : f(v);
  return {
    background: optColor(o['background']),
    color: optColor(o['color']),
    border: nul(o['border'], (x) => num(x, 0, 4, 1)),
    radius: nul(o['radius'], (x) => num(x, 0, 48, 12)),
    shadow: nul(o['shadow'], (x) => oneOf(x, SHADOW, 'none')),
    glass: nul(o['glass'], (x) => bool(x, false)),
  };
}
const clampRect = (x: number, y: number, w: number, h: number) => {
  const W = Math.round(num(w, 1, GRID_COLS, 3));
  const H = Math.round(num(h, 1, 12, 2));
  return {
    x: Math.round(num(x, 1, GRID_COLS - W + 1, 1)),
    y: Math.round(num(y, 1, MAX_ROWS, 1)),
    w: W,
    h: H,
  };
};

export function normalizeWidget(raw: unknown): Widget | null {
  const o = isObj(raw) ? raw : {};
  const type = oneOf(o['type'], WIDGET_TYPES, '' as WidgetType);
  const id = typeof o['id'] === 'string' && WIDGET_ID.test(o['id']) ? o['id'] : '';
  if (!type || !id) return null;
  const size = DEFAULT_SIZE[type];
  const r = clampRect(
    typeof o['x'] === 'number' ? o['x'] : 1,
    typeof o['y'] === 'number' ? o['y'] : 1,
    typeof o['w'] === 'number' ? o['w'] : size.w,
    typeof o['h'] === 'number' ? o['h'] : size.h,
  );
  const roles = (Array.isArray(o['roles']) ? o['roles'] : []).filter(
    (x): x is string => typeof x === 'string' && ROLE_ID.test(x),
  );
  return {
    id,
    type,
    ...r,
    title: text(o['title'], 60, '').trim(),
    icon: text(o['icon'], 8, ''),
    visible: bool(o['visible'], true),
    roles: [...new Set(roles)].slice(0, 10),
    style: normalizeStyle(o['style']),
    props: normalizeProps(type, o['props']),
  };
}

// --- Raster-Algorithmen (rein, getestet) ---------------------------------------------------------
type Rect = { x: number; y: number; w: number; h: number };
export const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const byPosition = (a: Widget, b: Widget) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id);

/** Schiebt überlappende Widgets nach unten, bis nichts mehr überlappt. `pin` bleibt, wo es ist. */
export function resolveOverlaps(widgets: readonly Widget[], pin?: string): Widget[] {
  const pinned = widgets.filter((w) => w.id === pin);
  const rest = widgets
    .filter((w) => w.id !== pin)
    .map((w) => ({ ...w }))
    .sort(byPosition);
  const placed: Widget[] = pinned.map((w) => ({ ...w }));
  for (const w of rest) {
    for (;;) {
      const hit = placed.find((p) => overlaps(p, w));
      if (!hit) break;
      w.y = hit.y + hit.h;
    }
    placed.push(w);
  }
  return placed.map(
    (p) => widgets.find((w) => w.id === p.id) && { ...p, y: Math.min(p.y, MAX_ROWS + 20) },
  ) as Widget[];
}
/** Zieht alle Widgets so weit nach oben, wie Platz ist (wie „Aufräumen“). */
export function compact(widgets: readonly Widget[]): Widget[] {
  const placed: Widget[] = [];
  for (const w of [...widgets].map((x) => ({ ...x })).sort(byPosition)) {
    w.y = 1;
    for (;;) {
      const hit = placed.find((p) => overlaps(p, w));
      if (!hit) break;
      w.y = hit.y + hit.h;
    }
    placed.push(w);
  }
  return widgets.map((w) => placed.find((p) => p.id === w.id)!);
}
/** Verschiebt/vergrößert ein Widget; andere weichen nach unten aus. */
export function placeWidget(widgets: readonly Widget[], id: string, rect: Partial<Rect>): Widget[] {
  const cur = widgets.find((w) => w.id === id);
  if (!cur) return [...widgets];
  const r = clampRect(rect.x ?? cur.x, rect.y ?? cur.y, rect.w ?? cur.w, rect.h ?? cur.h);
  return resolveOverlaps(
    widgets.map((w) => (w.id === id ? { ...w, ...r } : w)),
    id,
  );
}
export function newWidgetId(taken: readonly string[]): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
    if (WIDGET_ID.test(id) && !taken.includes(id)) return id;
  }
}
export function createWidget(type: WidgetType, taken: readonly string[]): Widget {
  const s = DEFAULT_SIZE[type];
  return {
    id: newWidgetId(taken),
    type,
    x: 1,
    y: 1,
    ...s,
    title: '',
    icon: '',
    visible: true,
    roles: [],
    style: emptyStyle(),
    props: defaultProps(type),
  };
}
/** Fügt ein Widget unten ein (erste freie Zeile unter allen anderen). */
export function addWidget(widgets: readonly Widget[], w: Widget): Widget[] {
  const bottom = widgets.reduce((m, x) => Math.max(m, x.y + x.h), 1);
  return [...widgets, { ...w, x: 1, y: Math.min(bottom, MAX_ROWS) }].slice(0, MAX_WIDGETS);
}
export function duplicateWidget(widgets: readonly Widget[], id: string): Widget[] {
  const src = widgets.find((w) => w.id === id);
  if (!src || widgets.length >= MAX_WIDGETS) return [...widgets];
  const copy: Widget = {
    ...structuredClone(src),
    id: newWidgetId(widgets.map((w) => w.id)),
    y: src.y + src.h,
  };
  return resolveOverlaps([...widgets, copy], copy.id);
}

export function normalizePage(raw: unknown): PageLayout {
  const list =
    isObj(raw) && Array.isArray(raw['widgets']) ? raw['widgets'].slice(0, MAX_WIDGETS) : [];
  const widgets: Widget[] = [];
  for (const r of list) {
    const w = normalizeWidget(r);
    if (w && !widgets.some((x) => x.id === w.id)) widgets.push(w);
  }
  return { widgets: resolveOverlaps(widgets) };
}
export function normalizeLayout(raw: unknown, base: LayoutConfig = defaultLayout()): LayoutConfig {
  const o = isObj(raw) ? raw : {};
  const pagesRaw = isObj(o['pages']) ? o['pages'] : {};
  const pages: LayoutConfig['pages'] = {};
  for (const [k, v] of Object.entries(pagesRaw).slice(0, MAX_LAYOUT_PAGES))
    if (PAGE_KEY_RE.test(k)) pages[k] = normalizePage(v);
  // Die Übersicht gibt es immer (Standard-Widgets), solange sie nicht ausdrücklich angepasst wurde
  if (!pages['overview'] && base.pages['overview'])
    pages['overview'] = structuredClone(base.pages['overview']);
  return { pages };
}

const mk = (
  id: string,
  type: WidgetType,
  x: number,
  y: number,
  props: Record<string, unknown>,
  size?: { w: number; h: number },
): Widget => ({
  id,
  type,
  x,
  y,
  ...(size ?? DEFAULT_SIZE[type]),
  title: '',
  icon: '',
  visible: true,
  roles: [],
  style: emptyStyle(),
  props: { ...defaultProps(type), ...props },
});
/** Standard-Übersicht: dieselben Informationen wie vor dem Widget-System. */
export function defaultLayout(): LayoutConfig {
  return {
    pages: {
      overview: {
        widgets: [
          mk('stat0001', 'stat', 1, 1, { metric: 'openTickets' }),
          mk('stat0002', 'stat', 4, 1, { metric: 'pendingSubmissions' }),
          mk('stat0003', 'stat', 7, 1, { metric: 'onDuty' }),
          mk('stat0004', 'stat', 10, 1, { metric: 'activeOperations' }),
          mk('list0001', 'tickets', 1, 3, {}),
          mk('list0002', 'applications', 7, 3, {}),
          mk('health01', 'health', 1, 8, {}),
        ],
      },
    },
  };
}

// --- Einfache, sichere Text-Formatierung ---------------------------------------------------------
export type Inline =
  | { t: 'text'; s: string }
  | { t: 'b'; children: Inline[] }
  | { t: 'i'; children: Inline[] }
  | { t: 'a'; href: string; children: Inline[] };
export type Block =
  | { t: 'h'; level: 1 | 2 | 3; inline: Inline[] }
  | { t: 'p'; inline: Inline[] }
  | { t: 'ul'; items: Inline[][] };

const INLINE_RE = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/;
/** `**fett**`, `*kursiv*`, `[Text](https://…)`. Links mit unsicherer Adresse bleiben einfacher Text. Es entsteht nie HTML. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = INLINE_RE.exec(rest);
    if (!m) {
      out.push({ t: 'text', s: rest });
      break;
    }
    if (m.index > 0) out.push({ t: 'text', s: rest.slice(0, m.index) });
    if (m[1] !== undefined) out.push({ t: 'b', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: 'i', children: parseInline(m[2]) });
    else {
      const href = safeUrl(m[4], '');
      if (href && href.startsWith('https://'))
        out.push({ t: 'a', href, children: [{ t: 'text', s: m[3]! }] });
      else out.push({ t: 'text', s: m[0] });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}
export function parseRichText(src: string): Block[] {
  const blocks: Block[] = [];
  let list: Inline[][] | null = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const li = /^\s*[-*•]\s+(.+)$/.exec(line);
    if (li) {
      (list ??= []).push(parseInline(li[1]!));
      continue;
    }
    if (list) {
      blocks.push({ t: 'ul', items: list });
      list = null;
    }
    if (!line.trim()) continue;
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) blocks.push({ t: 'h', level: h[1]!.length as 1 | 2 | 3, inline: parseInline(h[2]!) });
    else blocks.push({ t: 'p', inline: parseInline(line) });
  }
  if (list) blocks.push({ t: 'ul', items: list });
  return blocks;
}
/** Banner abgelaufen? (Ablaufdatum gilt bis Ende des Tages, Berliner Datum.) */
export function isExpired(expires: string, now: Date = new Date()): boolean {
  if (!expires) return false;
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);
  return today > expires;
}
