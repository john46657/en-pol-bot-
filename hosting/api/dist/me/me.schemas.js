"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.layoutsSchema = exports.preferencesSchema = void 0;
const zod_1 = require("zod");
const hex = zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/);
const path = zod_1.z.string().regex(/^\/[a-z0-9/_-]{0,80}$/);
/**
 * Persönliche Einstellungen – gelten nur für den Benutzer selbst. Unbekannte Felder werden verworfen,
 * alle Werte sind begrenzt (kein Ablageort für beliebige Daten).
 */
exports.preferencesSchema = zod_1.z.object({
    theme: zod_1.z.enum(['dark', 'light', 'system']).optional(),
    accent: hex.optional(),
    background: zod_1.z.object({ type: zod_1.z.enum(['none', 'color', 'gradient', 'image']), value: zod_1.z.string().max(500) })
        .refine((b) => b.type !== 'image' || /^https:\/\/\S+$/.test(b.value), 'Background image must be an https URL').optional(),
    cardStyle: zod_1.z.enum(['solid', 'glass', 'outline']).optional(),
    transparency: zod_1.z.number().int().min(0).max(90).optional(),
    radius: zod_1.z.number().int().min(0).max(24).optional(),
    shadow: zod_1.z.enum(['none', 'soft', 'strong']).optional(),
    glow: zod_1.z.boolean().optional(),
    animations: zod_1.z.boolean().optional(),
    sidebarWidth: zod_1.z.enum(['narrow', 'normal', 'wide']).optional(),
    sidebarCollapsed: zod_1.z.boolean().optional(),
    fontSize: zod_1.z.number().int().min(12).max(18).optional(),
    density: zod_1.z.enum(['compact', 'comfortable']).optional(),
    language: zod_1.z.enum(['de', 'en']).optional(),
    timezone: zod_1.z.string().max(64).optional(),
    dateFormat: zod_1.z.enum(['DD.MM.YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']).optional(),
    notifications: zod_1.z.object({ muted: zod_1.z.array(zod_1.z.string().max(40)).max(50), toasts: zod_1.z.boolean().optional() }).optional(),
    favorites: zod_1.z.array(path).max(30).optional(),
    quickActions: zod_1.z.array(zod_1.z.string().max(40)).max(20).optional(),
    /** Zeilen pro Tabellenseite (große Seiten werden virtualisiert dargestellt). */
    tablePageSize: zod_1.z.union([zod_1.z.literal(25), zod_1.z.literal(50), zod_1.z.literal(100), zod_1.z.literal(250), zod_1.z.literal(500)]).optional(),
    teamList: zod_1.z.object({
        view: zod_1.z.enum(['cards', 'table']),
        search: zod_1.z.string().max(80).optional(),
        filters: zod_1.z.object({ team: zod_1.z.string().max(64).optional(), rank: zod_1.z.string().max(64).optional(), office: zod_1.z.string().max(64).optional(), status: zod_1.z.string().max(20).optional() }).optional(),
    }).optional(),
    /** Persönliche CAD-Ansicht (nur für diesen Benutzer). */
    cad: zod_1.z.object({
        widgets: zod_1.z.array(zod_1.z.string().max(32)).max(20).optional(),
        hiddenLayers: zod_1.z.array(zod_1.z.string().max(32)).max(40).optional(),
        zoom: zod_1.z.number().min(0.02).max(8).optional(),
        center: zod_1.z.object({ x: zod_1.z.number().finite(), y: zod_1.z.number().finite() }).optional(),
        compact: zod_1.z.boolean().optional(),
        sidebar: zod_1.z.boolean().optional(),
        favoriteIncidents: zod_1.z.array(zod_1.z.string().uuid()).max(50).optional(),
        erlcServerId: zod_1.z.string().uuid().optional(),
        sound: zod_1.z.boolean().optional(),
        setupHidden: zod_1.z.boolean().optional(),
    }).optional(),
    voice: zod_1.z.object({
        channelIds: zod_1.z.array(zod_1.z.string().regex(/^\d{15,25}$/)).max(100),
        categoryIds: zod_1.z.array(zod_1.z.string().regex(/^\d{15,25}$/)).max(50),
        sort: zod_1.z.enum(['members', 'name', 'position']),
        compact: zod_1.z.boolean(),
        maxChannels: zod_1.z.number().int().min(1).max(50),
        showEmpty: zod_1.z.boolean().optional(),
        showDuration: zod_1.z.boolean().optional(),
    }).optional(),
});
const widget = zod_1.z.object({ widget: zod_1.z.string().regex(/^[a-z0-9_-]{1,40}$/), size: zod_1.z.enum(['S', 'M', 'L', 'XL']).default('M'), minimized: zod_1.z.boolean().default(false), hidden: zod_1.z.boolean().default(false) });
exports.layoutsSchema = zod_1.z.object({
    active: zod_1.z.string().max(40),
    items: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string().regex(/^[a-z0-9_-]{1,40}$/), name: zod_1.z.string().trim().min(1).max(40), widgets: zod_1.z.array(widget).max(40) })).min(1).max(10),
}).refine((l) => l.items.some((i) => i.id === l.active), 'Active layout must exist').refine((l) => new Set(l.items.map((i) => i.id)).size === l.items.length, 'Layout ids must be unique');
//# sourceMappingURL=me.schemas.js.map