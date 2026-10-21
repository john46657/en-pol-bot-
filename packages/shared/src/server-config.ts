/**
 * Server-Konfiguration je Discord-Server (Mandant = Guild-ID): Name, Branding, Bilder, Design, Einrichtungsassistent.
 * Dieselben Regeln gelten im Dashboard (Live-Vorschau, Formularprüfung) und auf dem Server (Speichern).
 */
import { z } from 'zod';

/** Bildarten und ihre Grenzen (Dateigröße in Bytes, Abmessungen in Pixel, Seitenverhältnis Breite/Höhe). */
export const BRANDING_IMAGES = {
  logo: { label: 'Serverlogo', maxBytes: 2 * 1024 * 1024, minW: 64, minH: 64, maxW: 4096, maxH: 4096, ratio: [0.5, 2] },
  avatar: { label: 'Profilbild (rund)', maxBytes: 2 * 1024 * 1024, minW: 64, minH: 64, maxW: 4096, maxH: 4096, ratio: [0.8, 1.25] },
  banner: { label: 'Dashboard-Banner', maxBytes: 5 * 1024 * 1024, minW: 600, minH: 100, maxW: 8192, maxH: 4096, ratio: [2, 12] },
  background: { label: 'Hintergrundbild', maxBytes: 5 * 1024 * 1024, minW: 800, minH: 450, maxW: 8192, maxH: 8192, ratio: [0.4, 4] },
  area: { label: 'Bereichsbild', maxBytes: 5 * 1024 * 1024, minW: 600, minH: 100, maxW: 8192, maxH: 4096, ratio: [2, 12] },
} as const;
export type BrandingImageKind = keyof typeof BRANDING_IMAGES;
export const BRANDING_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Dashboard-Bereiche mit eigenem Kopfbild (nur Bereiche, die es im Dashboard tatsächlich gibt). */
export const BRANDING_AREAS = { dashboard: 'Dashboard (Startseite)', tickets: 'Ticket-Center', team: 'Team' } as const;
export type BrandingArea = keyof typeof BRANDING_AREAS;

/** Prüft Bildmaße gegen die Regeln der Bildart; liefert den Grund oder null. */
export function checkBrandingImage(kind: BrandingImageKind, meta: { mime: string; size: number; width: number; height: number }): string | null {
  const r = BRANDING_IMAGES[kind];
  if (!(BRANDING_IMAGE_TYPES as readonly string[]).includes(meta.mime)) return 'Nur PNG, JPG oder WebP sind erlaubt.';
  if (meta.size > r.maxBytes) return `Die Datei ist zu groß (höchstens ${Math.round(r.maxBytes / 1048576)} MB).`;
  if (meta.width < r.minW || meta.height < r.minH) return `Das Bild ist zu klein (mindestens ${r.minW} × ${r.minH} Pixel, ist ${meta.width} × ${meta.height}).`;
  if (meta.width > r.maxW || meta.height > r.maxH) return `Das Bild ist zu groß (höchstens ${r.maxW} × ${r.maxH} Pixel, ist ${meta.width} × ${meta.height}).`;
  const ratio = meta.width / meta.height;
  if (ratio < r.ratio[0] || ratio > r.ratio[1]) return `Das Seitenverhältnis passt nicht (${r.label}: Breite ÷ Höhe zwischen ${r.ratio[0]} und ${r.ratio[1]}, ist ${ratio.toFixed(2)}).`;
  return null;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #rrggbb');
const assetId = z.string().uuid().nullable().default(null);
const text = (max: number) => z.string().trim().max(max).default('');

/** Gespeicherte Konfiguration eines Servers (Bilder nur als ID eines eigenen hochgeladenen Bildes – nie als externe URL). */
export const serverConfigSchema = z.object({
  general: z.object({
    displayName: z.string().trim().min(1, 'Bitte einen Namen angeben.').max(80),
    shortName: z.string().trim().max(16).default(''),
    dashboardTitle: text(80),
    welcomeText: text(1000),
  }).strict(),
  branding: z.object({
    logo: assetId, avatar: assetId, banner: assetId, background: assetId,
    areas: z.object({ dashboard: assetId, tickets: assetId, team: assetId }).strict().default({}),
  }).strict().default({}),
  design: z.object({
    primary: hex.default('#1e3a8a'),
    accent: hex.default('#3b82f6'),
    /** user = persönliche Einstellung jedes Benutzers; dark/light = Standard dieses Servers (wenn der Benutzer „System“ gewählt hat) */
    mode: z.enum(['user', 'dark', 'light']).default('user'),
    useBackground: z.boolean().default(false),
  }).strict().default({}),
}).strict();
export type ServerConfigData = z.infer<typeof serverConfigSchema>;
export const defaultServerConfig = (displayName: string): ServerConfigData => serverConfigSchema.parse({ general: { displayName: displayName.slice(0, 80) || 'Server' } });

/** Alle in einer Konfiguration verwendeten Bild-IDs (zum Prüfen der Zugehörigkeit und vor dem Entfernen). */
export const configAssetIds = (c: ServerConfigData): string[] =>
  [c.branding.logo, c.branding.avatar, c.branding.banner, c.branding.background, ...Object.values(c.branding.areas)].filter((x): x is string => !!x);

/** Schritte des Einrichtungsassistenten. */
export const SETUP_STEPS = [
  { key: 'connect', label: 'Bot verbinden' },
  { key: 'server', label: 'Server & Berechtigungen' },
  { key: 'names', label: 'Name & Anzeige' },
  { key: 'images', label: 'Logo & Bilder' },
  { key: 'design', label: 'Farben & Design' },
  { key: 'modules', label: 'Module' },
  { key: 'review', label: 'Prüfen & speichern' },
  { key: 'finish', label: 'Vorschau & Abschluss' },
] as const;
export type SetupStepKey = typeof SETUP_STEPS[number]['key'];

/** Discord-Rechte, die der Bot auf dem Server braucht (Kanäle/Rollen für Tickets, Nachrichten, Dateien). */
export const REQUIRED_BOT_PERMISSIONS = {
  viewChannel: 'Kanäle ansehen', sendMessages: 'Nachrichten senden', embedLinks: 'Links einbetten', attachFiles: 'Dateien anhängen',
  readMessageHistory: 'Nachrichtenverlauf lesen', manageChannels: 'Kanäle verwalten', manageRoles: 'Rollen verwalten',
} as const;
export type BotPermissionKey = keyof typeof REQUIRED_BOT_PERMISSIONS;
export type GuildBotPermissions = Partial<Record<BotPermissionKey | 'administrator', boolean>>;
export function missingBotPermissions(p: GuildBotPermissions | null | undefined): BotPermissionKey[] | null {
  if (!p) return null; // unbekannt (Bot hat noch nichts gemeldet)
  if (p.administrator) return [];
  return (Object.keys(REQUIRED_BOT_PERMISSIONS) as BotPermissionKey[]).filter((k) => !p[k]);
}

/** Lesbare Schriftfarbe auf einer Farbe (#rrggbb). */
export function readableTextOn(color: string): '#ffffff' | '#111827' {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => { const c = parseInt(h, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (lum + 0.05) >= 3 ? '#ffffff' : '#111827';
}

/**
 * Echter Bildtyp und Abmessungen aus den Dateibytes (PNG, JPEG, WebP). Alles andere – auch SVG/HTML mit Bild-Endung – ergibt null.
 * Funktioniert im Browser (Vorabprüfung) und auf dem Server (verbindliche Prüfung).
 */
export function imageInfo(b: Uint8Array): { mime: 'image/png' | 'image/jpeg' | 'image/webp'; width: number; height: number } | null {
  const u16be = (i: number) => (b[i]! << 8) | b[i + 1]!;
  const u32be = (i: number) => ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
  const u24le = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16);
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));
  const ok = (mime: 'image/png' | 'image/jpeg' | 'image/webp', width: number, height: number) => (width > 0 && height > 0 ? { mime, width, height } : null);
  if (b.length >= 24 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) {
    return ascii(12, 4) === 'IHDR' ? ok('image/png', u32be(16), u32be(20)) : null;
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1]!;
      if (marker === 0xff) { i++; continue; } // Füllbytes
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = u16be(i + 2);
      if (len < 2) return null;
      // SOF-Marker (Baseline, progressiv …), nicht DHT/JPG/DAC
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return ok('image/jpeg', u16be(i + 7), u16be(i + 5));
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const chunk = ascii(12, 4);
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return ok('image/webp', (b[26]! | (b[27]! << 8)) & 0x3fff, (b[28]! | (b[29]! << 8)) & 0x3fff);
    if (chunk === 'VP8L' && b[20] === 0x2f) return ok('image/webp', 1 + (((b[22]! & 0x3f) << 8) | b[21]!), 1 + (((b[24]! & 0x0f) << 10) | (b[23]! << 2) | ((b[22]! & 0xc0) >> 6)));
    if (chunk === 'VP8X') return ok('image/webp', 1 + u24le(24), 1 + u24le(27));
  }
  return null;
}
