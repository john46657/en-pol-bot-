import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import { pendingBody, queueSave } from './autosave';

/** Persönliche Einstellungen (nur für einen selbst, je Benutzer in der Datenbank – auf jedem Gerät gleich). */
export interface Preferences {
  theme: 'dark' | 'light' | 'system';
  accent?: string;
  background: { type: 'none' | 'color' | 'gradient' | 'image'; value: string };
  cardStyle: 'solid' | 'glass' | 'outline';
  transparency: number;
  radius: number;
  shadow: 'none' | 'soft' | 'strong';
  glow: boolean;
  animations: boolean;
  sidebarWidth: 'narrow' | 'normal' | 'wide';
  sidebarCollapsed: boolean;
  fontSize: number;
  density: 'compact' | 'comfortable';
  language: 'de' | 'en';
  timezone?: string;
  dateFormat: 'DD.MM.YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY';
  notifications: { muted: string[]; toasts?: boolean };
  favorites: string[];
  quickActions: string[];
  /** Zeilen pro Tabellenseite (große Seiten werden virtualisiert). */
  tablePageSize?: 25 | 50 | 100 | 250 | 500;
  teamList: { view: 'cards' | 'table'; search?: string; filters?: { team?: string; rank?: string; office?: string; status?: string } };
  /** Persönliche CAD-Ansicht (nur für diesen Benutzer). */
  cad?: { widgets?: string[]; hiddenLayers?: string[]; zoom?: number; center?: { x: number; y: number }; compact?: boolean; sidebar?: boolean; favoriteIncidents?: string[]; erlcServerId?: string; sound?: boolean; setupHidden?: boolean };
  voice: { channelIds: string[]; categoryIds: string[]; sort: 'members' | 'name' | 'position'; compact: boolean; maxChannels: number; showEmpty?: boolean; showDuration?: boolean };
}

export const DEFAULT_PREFS: Preferences = {
  theme: 'dark', background: { type: 'none', value: '' }, cardStyle: 'solid', transparency: 0, radius: 8, shadow: 'none', glow: false, animations: true,
  sidebarWidth: 'normal', sidebarCollapsed: false, fontSize: 14, density: 'comfortable', language: 'de', dateFormat: 'DD.MM.YYYY',
  notifications: { muted: [] }, favorites: [], quickActions: ['ticket-create', 'applications', 'team-search', 'member-search', 'search', 'radio'],
  teamList: { view: 'cards' }, voice: { channelIds: [], categoryIds: [], sort: 'members', compact: false, maxChannels: 10, showEmpty: false, showDuration: true },
};

export type WidgetSize = 'S' | 'M' | 'L' | 'XL';
export interface WidgetCfg { widget: string; size: WidgetSize; minimized: boolean; hidden: boolean }
export interface Layout { id: string; name: string; widgets: WidgetCfg[] }
export interface Layouts { active: string; items: Layout[] }

const w = (widget: string, size: WidgetSize = 'M'): WidgetCfg => ({ widget, size, minimized: false, hidden: false });
/** Vorlagen: Standard, Tickets, Team (der Benutzer kann sie ändern, umbenennen, löschen, eigene anlegen). */
export const DEFAULT_LAYOUTS: Layouts = {
  active: 'standard',
  items: [
    { id: 'standard', name: 'Standard', widgets: [w('stats', 'XL'), w('quick', 'M'), w('favorites', 'M'), w('notifications', 'M'), w('tickets', 'M'), w('applications', 'M'), w('teamlist', 'L'), w('voice', 'M'), w('radio', 'M'), w('teamchance', 'S'), w('incidents'), w('queue'), w('units'), w('wanted'), w('reports'), w('activity')] },
    { id: 'tickets', name: 'Tickets', widgets: [w('tickets', 'L'), w('my-tickets', 'M'), w('ticket-activity', 'M'), w('quick', 'M')] },
    { id: 'team', name: 'Team', widgets: [w('teamlist', 'XL'), w('ranks', 'M'), w('offices', 'M'), w('activity', 'M'), w('voice', 'M'), w('teamchance', 'M')] },
  ],
};

interface Stored { preferences: Partial<Preferences>; layouts: Layouts | null }

/**
 * Einstellungen laden und ändern. Änderungen gelten sofort (optimistisch) und werden automatisch gespeichert
 * (gesammelt, lokal zwischengespeichert, bei Fehlern wiederholt). Nach dem Neuladen gewinnen noch nicht
 * gesendete lokale Änderungen, bis sie gespeichert sind.
 */
export function usePrefs() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me-prefs', user?.id], enabled: !!user && can('dashboard.view'), staleTime: 60_000, refetchOnWindowFocus: true,
    queryFn: async () => {
      const r = await api<Stored>('/me/preferences');
      const p = pendingBody<{ preferences: Partial<Preferences> }>('me:prefs');
      const l = pendingBody<{ layouts: Layouts | null }>('me:layouts');
      return { preferences: p?.preferences ?? r.preferences, layouts: l ? l.layouts : r.layouts } satisfies Stored;
    },
  });
  const stored = q.data;
  const prefs: Preferences = { ...DEFAULT_PREFS, ...(stored?.preferences ?? {}) };
  const layouts: Layouts = stored?.layouts ?? DEFAULT_LAYOUTS;
  const key = ['me-prefs', user?.id];

  const update = useCallback((patch: Partial<Preferences>) => {
    const cur = qc.getQueryData<Stored>(key) ?? { preferences: {}, layouts: null };
    const next = { ...cur.preferences, ...patch };
    qc.setQueryData<Stored>(key, { ...cur, preferences: next });
    queueSave('me:prefs', { method: 'PUT', path: '/me/preferences', body: { preferences: next }, guildId: null, label: 'Persönliche Einstellungen' });
  }, [qc, user?.id]);

  const setLayouts = useCallback((l: Layouts | null) => {
    const cur = qc.getQueryData<Stored>(key) ?? { preferences: {}, layouts: null };
    qc.setQueryData<Stored>(key, { ...cur, layouts: l });
    queueSave('me:layouts', { method: 'PUT', path: '/me/layouts', body: { layouts: l }, guildId: null, label: 'Dashboard-Layout' });
  }, [qc, user?.id]);

  return { prefs, layouts, update, setLayouts, loading: q.isLoading, ready: !!stored };
}

// ---- Darstellung anwenden ----
let dateCfg: { format: Preferences['dateFormat']; tz?: string; lang: string } = { format: 'DD.MM.YYYY', lang: 'de' };
/** Datum/Uhrzeit im persönlichen Format und in der persönlichen Zeitzone. */
export function formatDate(iso: string | Date, withTime = true) {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: dateCfg.tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d).map((p) => [p.type, p.value]));
  const date = dateCfg.format === 'YYYY-MM-DD' ? `${parts.year}-${parts.month}-${parts.day}` : dateCfg.format === 'MM/DD/YYYY' ? `${parts.month}/${parts.day}/${parts.year}` : `${parts.day}.${parts.month}.${parts.year}`;
  return withTime ? `${date} ${parts.hour}:${parts.minute}` : date;
}

const SHADOWS = { none: 'none', soft: '0 4px 14px rgb(0 0 0 / 0.18)', strong: '0 10px 30px rgb(0 0 0 / 0.35)' } as const;
const SIDEBAR = { narrow: '13rem', normal: '15rem', wide: '18rem' } as const;

/** Setzt CSS-Variablen/Attribute am Dokument. Wirkt nur im eigenen Browser für den eigenen Benutzer. */
export function useApplyPrefs(p: Preferences, studioAccent: string) {
  useEffect(() => {
    const root = document.documentElement;
    const dark = p.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : p.theme !== 'light';
    root.dataset.theme = dark ? 'dark' : 'light';
    root.style.setProperty('--color-primary', p.accent ?? studioAccent);
    root.style.setProperty('--card-radius', `${p.radius}px`);
    root.style.setProperty('--radius-lg', `${p.radius}px`);
    root.style.setProperty('--card-alpha', `${100 - p.transparency}%`);
    root.style.setProperty('--card-shadow', SHADOWS[p.shadow]);
    root.style.setProperty('--sidebar-width', SIDEBAR[p.sidebarWidth]);
    root.style.setProperty('--app-font-size', `${p.fontSize}px`);
    root.dataset.cardStyle = p.cardStyle;
    root.dataset.glow = p.glow ? 'on' : 'off';
    root.dataset.motion = p.animations ? 'on' : 'off';
    root.dataset.density = p.density;
    root.lang = p.language;
    const bg = p.background;
    root.style.setProperty('--app-bg', bg.type === 'color' && /^#[0-9a-f]{6}$/i.test(bg.value) ? bg.value
      : bg.type === 'gradient' ? GRADIENTS[bg.value] ?? 'var(--color-bg)'
      : bg.type === 'image' && /^https:\/\/[^\s"'()]+$/.test(bg.value) ? `center / cover no-repeat fixed url("${bg.value}")` : 'var(--color-bg)');
    dateCfg = { format: p.dateFormat, tz: p.timezone || undefined, lang: p.language };
  }, [p, studioAccent]);
}

export const GRADIENTS: Record<string, string> = {
  nacht: 'linear-gradient(135deg, #0b0e14 0%, #1a2340 100%)',
  polizei: 'linear-gradient(135deg, #0b1a33 0%, #10345f 60%, #0b0e14 100%)',
  aurora: 'linear-gradient(135deg, #0f172a 0%, #134e4a 50%, #312e81 100%)',
  sonnenuntergang: 'linear-gradient(135deg, #1e1b2e 0%, #4c1d3d 60%, #7c2d12 100%)',
  hell: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
};
