import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const path = z.string().regex(/^\/[a-z0-9/_-]{0,80}$/);

/**
 * Persönliche Einstellungen – gelten nur für den Benutzer selbst. Unbekannte Felder werden verworfen,
 * alle Werte sind begrenzt (kein Ablageort für beliebige Daten).
 */
export const preferencesSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  accent: hex.optional(),
  background: z.object({ type: z.enum(['none', 'color', 'gradient', 'image']), value: z.string().max(500) })
    .refine((b) => b.type !== 'image' || /^https:\/\/\S+$/.test(b.value), 'Background image must be an https URL').optional(),
  cardStyle: z.enum(['solid', 'glass', 'outline']).optional(),
  transparency: z.number().int().min(0).max(90).optional(),
  radius: z.number().int().min(0).max(24).optional(),
  shadow: z.enum(['none', 'soft', 'strong']).optional(),
  glow: z.boolean().optional(),
  animations: z.boolean().optional(),
  sidebarWidth: z.enum(['narrow', 'normal', 'wide']).optional(),
  sidebarCollapsed: z.boolean().optional(),
  fontSize: z.number().int().min(12).max(18).optional(),
  density: z.enum(['compact', 'comfortable']).optional(),
  language: z.enum(['de', 'en']).optional(),
  timezone: z.string().max(64).optional(),
  dateFormat: z.enum(['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']).optional(),
  notifications: z.object({ muted: z.array(z.string().max(40)).max(50), toasts: z.boolean().optional() }).optional(),
  favorites: z.array(path).max(30).optional(),
  quickActions: z.array(z.string().max(40)).max(20).optional(),
  teamList: z.object({
    view: z.enum(['cards', 'table']),
    search: z.string().max(80).optional(),
    filters: z.object({ team: z.string().max(64).optional(), rank: z.string().max(64).optional(), office: z.string().max(64).optional(), status: z.string().max(20).optional() }).optional(),
  }).optional(),
  /** Persönliche CAD-Ansicht (nur für diesen Benutzer). */
  cad: z.object({
    widgets: z.array(z.string().max(32)).max(20).optional(),
    hiddenLayers: z.array(z.string().max(32)).max(40).optional(),
    zoom: z.number().min(0.02).max(8).optional(),
    center: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
    compact: z.boolean().optional(),
    sidebar: z.boolean().optional(),
    favoriteIncidents: z.array(z.string().uuid()).max(50).optional(),
    erlcServerId: z.string().uuid().optional(),
    sound: z.boolean().optional(),
  }).optional(),
  voice: z.object({
    channelIds: z.array(z.string().regex(/^\d{15,25}$/)).max(100),
    categoryIds: z.array(z.string().regex(/^\d{15,25}$/)).max(50),
    sort: z.enum(['members', 'name', 'position']),
    compact: z.boolean(),
    maxChannels: z.number().int().min(1).max(50),
    showEmpty: z.boolean().optional(),
    showDuration: z.boolean().optional(),
  }).optional(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

const widget = z.object({ widget: z.string().regex(/^[a-z0-9_-]{1,40}$/), size: z.enum(['S', 'M', 'L', 'XL']).default('M'), minimized: z.boolean().default(false), hidden: z.boolean().default(false) });
export const layoutsSchema = z.object({
  active: z.string().max(40),
  items: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), name: z.string().trim().min(1).max(40), widgets: z.array(widget).max(40) })).min(1).max(10),
}).refine((l) => l.items.some((i) => i.id === l.active), 'Active layout must exist').refine((l) => new Set(l.items.map((i) => i.id)).size === l.items.length, 'Layout ids must be unique');
export type Layouts = z.infer<typeof layoutsSchema>;
