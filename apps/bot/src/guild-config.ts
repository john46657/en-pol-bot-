import { z } from 'zod';
import { MODULES, type WelcomeMessageDef } from '@enrp/shared';
import type { Api } from './api';
import { withRetry } from './safety';

/**
 * Einstellungen je Discord-Server, eingerichtet über `/setup`. Gespeichert über die vorhandene API-Route `/bot/state`
 * (Schlüssel `guildcfg:<Server-ID>`) – überlebt Neustarts, liegt in der Datenbank und ist Teil der Datenbank-Sicherung.
 * Server sind über die ID im Schlüssel strikt getrennt.
 */
export const GUILD_CONFIG_VERSION = 1;

const sf = z.string().regex(/^\d{15,25}$/);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe bitte als #RRGGBB');
const httpsUrl = z.string().trim().max(500).url().regex(/^https:\/\//i, 'Bild-Link muss mit https:// beginnen');
const roleList = z.array(sf).max(10).default([]);

/** Stufen des Rechtesystems (höchste zuerst). */
export const ACCESS_LEVELS = ['admin', 'leadership', 'instructor', 'officer', 'readonly'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const LEVEL_LABEL: Record<AccessLevel, string> = { admin: 'Serveradministrator', leadership: 'Polizeiführung', instructor: 'Ausbilder', officer: 'Beamter', readonly: 'Nur lesender Zugriff' };

/** Kanäle, die `/setup` einrichtet. */
export const SETUP_CHANNELS = ['welcome', 'log', 'exams'] as const;
export type SetupChannel = (typeof SETUP_CHANNELS)[number];
export const CHANNEL_LABEL: Record<SetupChannel, string> = { welcome: 'Begrüßung', log: 'Bot-Meldungen (Admins)', exams: 'Prüfungs-Ankündigungen' };

/** Module, die im Bot je Server ausgeblendet werden können (Grundsystem ist immer an). */
export const TOGGLE_MODULES = MODULES.filter((m) => !('system' in m && m.system)).map((m) => ({ key: m.key as string, name: m.name as string }));

const section = <T extends z.ZodTypeAny>(s: T) => s.default({}).catch(() => s.parse({}));

/** Abschnitte streng (für die Prüfung von Eingaben); im Gesamtschema tolerant (kaputte Altwerte → Standard). */
export const SECTION_SCHEMAS = {
  branding: z.object({
    serverName: z.string().trim().max(100).nullable().default(null),
    /** Anzeigename = Spitzname des Bots auf diesem Server */
    displayName: z.string().trim().max(32).nullable().default(null),
    logoUrl: httpsUrl.nullable().default(null),
    bannerUrl: httpsUrl.nullable().default(null),
    /** Farben auch auf die Antworten der übrigen Bot-Befehle anwenden */
    applyToAll: z.boolean().default(false),
  }).passthrough(),
  colors: z.object({ primary: hex.default('#3b82f6'), success: hex.default('#22c55e'), warning: hex.default('#f59e0b'), danger: hex.default('#ef4444') }).passthrough(),
  welcome: z.object({
    enabled: z.boolean().default(false),
    title: z.string().max(256).default('Willkommen auf {server}!'),
    text: z.string().max(2000).default('Hallo {user}, schön dass du da bist! Du bist Mitglied Nr. {memberCount}.'),
    goodbyeEnabled: z.boolean().default(false),
    goodbyeText: z.string().max(2000).default('{displayName} hat den Server verlassen.'),
  }).passthrough(),
  channels: z.object(Object.fromEntries(SETUP_CHANNELS.map((k) => [k, sf.nullable().default(null)])) as Record<SetupChannel, z.ZodDefault<z.ZodNullable<typeof sf>>>).passthrough(),
  roles: z.object(Object.fromEntries(ACCESS_LEVELS.map((k) => [k, roleList])) as Record<AccessLevel, typeof roleList>).passthrough(),
  modules: z.object({ disabled: z.array(z.string().max(40)).max(50).default([]) }).passthrough(),
};

export const guildConfigSchema = z.object({
  version: z.number().int().min(1).default(GUILD_CONFIG_VERSION),
  /** Zählt bei jedem Speichern hoch (erkennt gleichzeitige Änderungen, z. B. während einer geplanten Wiederherstellung). */
  revision: z.number().int().min(0).default(0),
  setupDone: z.boolean().default(false),
  branding: section(SECTION_SCHEMAS.branding),
  colors: section(SECTION_SCHEMAS.colors),
  welcome: section(SECTION_SCHEMAS.welcome),
  channels: section(SECTION_SCHEMAS.channels),
  roles: section(SECTION_SCHEMAS.roles),
  modules: section(SECTION_SCHEMAS.modules),
  updatedAt: z.string().nullable().default(null),
  updatedBy: sf.nullable().default(null),
}).passthrough();
export type GuildConfig = z.infer<typeof guildConfigSchema>;

export const defaultGuildConfig = (): GuildConfig => guildConfigSchema.parse({});

/** Gespeicherten Wert tolerant lesen: kaputte Abschnitte → Standardwerte, unbekannte Felder bleiben erhalten. */
export function parseGuildConfig(raw: unknown): GuildConfig {
  const r = guildConfigSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  if (r.success) return r.data;
  // einzelne ungültige Top-Level-Felder (z. B. revision als Text) verwerfen, Rest übernehmen
  const ok = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([k, v]) => {
    const field = (guildConfigSchema.shape as Record<string, z.ZodTypeAny>)[k];
    return !field || field.safeParse(v).success;
  }));
  return guildConfigSchema.parse(ok);
}

/** Tiefes Zusammenführen: Teile ersetzen nur, was sie angeben (Listen werden als Ganzes ersetzt). */
function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) ? merge(b as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}

export type GuildConfigPatch = { [K in keyof GuildConfig]?: GuildConfig[K] extends Record<string, unknown> ? Partial<GuildConfig[K]> : GuildConfig[K] };

export class ConfigValidationError extends Error {}
export class ConfigConflictError extends Error {
  constructor() { super('Die Einstellungen wurden inzwischen geändert. Bitte erneut versuchen.'); }
}

/** Speicher-Backend (API-Route `/bot/state` oder im Test ein Speicher im Arbeitsspeicher). */
export interface KeyValue { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }

export const apiKeyValue = (api: Api): KeyValue => ({
  get: (key) => withRetry(() => api.service<{ value: unknown }>('GET', `/bot/state/${key}`)).then((r) => r?.value ?? null),
  put: (key, value) => withRetry(() => api.service('PUT', `/bot/state/${key}`, { value })).then(() => undefined),
});
export const memoryKeyValue = (seed: Record<string, unknown> = {}): KeyValue & { data: Map<string, unknown> } => {
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
  return { data, async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; }, async put(k, v) { data.set(k, structuredClone(v)); } };
};

export const configKey = (guildId: string) => {
  if (!/^\d{15,25}$/.test(guildId)) throw new Error('invalid guild id');
  return `guildcfg:${guildId}`;
};

/** Serverkonfigurationen mit kurzem Zwischenspeicher (Lesen bei jeder Interaktion soll die API nicht fluten). */
export class GuildConfigStore {
  private cache = new Map<string, { at: number; cfg: GuildConfig; raw: Record<string, unknown> }>();
  constructor(private readonly kv: KeyValue, private readonly ttlMs = 15_000, private readonly now = () => Date.now()) {}

  private async load(guildId: string, fresh = false) {
    const hit = this.cache.get(guildId);
    if (!fresh && hit && this.now() - hit.at < this.ttlMs) return hit;
    const stored = await this.kv.get(configKey(guildId));
    const raw = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
    const entry = { at: this.now(), cfg: parseGuildConfig(raw), raw };
    this.cache.set(guildId, entry);
    return entry;
  }

  async get(guildId: string, o: { fresh?: boolean } = {}): Promise<GuildConfig> { return structuredClone((await this.load(guildId, o.fresh)).cfg); }
  /** Gibt es schon gespeicherte Einstellungen für den Server? */
  async exists(guildId: string): Promise<boolean> { return Object.keys((await this.load(guildId, true)).raw).length > 0; }

  /**
   * Änderung speichern: frisch lesen, zusammenführen (unbekannte/ältere Felder bleiben), prüfen, Revision erhöhen.
   * `expectRevision`: nur speichern, wenn sich seitdem nichts geändert hat.
   */
  async update(guildId: string, patch: GuildConfigPatch, o: { by?: string; expectRevision?: number } = {}): Promise<GuildConfig> {
    const cur = await this.load(guildId, true);
    if (o.expectRevision !== undefined && cur.cfg.revision !== o.expectRevision) throw new ConfigConflictError();
    const merged = merge(merge(cur.raw, cur.cfg as Record<string, unknown>), patch as Record<string, unknown>);
    // geänderte Abschnitte streng prüfen – ein ungültiger Wert darf nie still einen ganzen Abschnitt zurücksetzen
    for (const k of Object.keys(patch) as (keyof typeof SECTION_SCHEMAS)[]) {
      if (!(k in SECTION_SCHEMAS)) continue;
      const r = SECTION_SCHEMAS[k].safeParse(merged[k]);
      if (!r.success) throw new ConfigValidationError(`${k}.${r.error.issues[0]?.path.join('.') ?? ''}: ${r.error.issues[0]?.message ?? 'ungültig'}`);
    }
    const next = guildConfigSchema.parse({ ...merged, version: Math.max(cur.cfg.version, GUILD_CONFIG_VERSION), revision: cur.cfg.revision + 1, updatedAt: new Date(this.now()).toISOString(), updatedBy: o.by ?? null });
    await this.kv.put(configKey(guildId), next);
    this.cache.set(guildId, { at: this.now(), cfg: next, raw: next as Record<string, unknown> });
    return structuredClone(next);
  }

  /** Vollständigen Stand setzen (nur Wiederherstellung – vorher wird gesichert). */
  async replace(guildId: string, cfg: GuildConfig, o: { by?: string; expectRevision?: number } = {}): Promise<GuildConfig> {
    const cur = await this.load(guildId, true);
    if (o.expectRevision !== undefined && cur.cfg.revision !== o.expectRevision) throw new ConfigConflictError();
    const next = guildConfigSchema.parse({ ...cfg, revision: cur.cfg.revision + 1, updatedAt: new Date(this.now()).toISOString(), updatedBy: o.by ?? null });
    await this.kv.put(configKey(guildId), next);
    this.cache.set(guildId, { at: this.now(), cfg: next, raw: next as Record<string, unknown> });
    return structuredClone(next);
  }

  forget(guildId?: string) { if (guildId) this.cache.delete(guildId); else this.cache.clear(); }
}

/** „#3b82f6“ → 0x3b82f6 */
export const colorOf = (c: string | undefined, fallback: number) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : fallback);

/** Begrüßung/Abschied aus `/setup` im Format der Willkommens-Funktion (Kanal „Begrüßung“, Farben und Banner des Servers). */
export function setupWelcome(cfg: GuildConfig, kind: 'welcome' | 'goodbye'): WelcomeMessageDef | null {
  const w = cfg.welcome;
  const on = kind === 'welcome' ? w.enabled : w.goodbyeEnabled;
  if (!on || !cfg.channels.welcome || cfg.modules.disabled.includes('welcome')) return null;
  return kind === 'welcome'
    ? { enabled: true, channelId: cfg.channels.welcome, title: w.title, message: w.text, color: cfg.colors.primary, showAvatar: true, pingUser: true, image: cfg.branding.bannerUrl ?? '', imageMediaId: '' }
    : { enabled: true, channelId: cfg.channels.welcome, title: 'Auf Wiedersehen', message: w.goodbyeText, color: cfg.colors.warning, showAvatar: true, pingUser: false, image: '', imageMediaId: '' };
}
