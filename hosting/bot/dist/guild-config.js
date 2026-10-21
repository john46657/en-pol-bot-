"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorOf = exports.GuildConfigStore = exports.configKey = exports.memoryKeyValue = exports.apiKeyValue = exports.ConfigConflictError = exports.ConfigValidationError = exports.defaultGuildConfig = exports.guildConfigSchema = exports.SECTION_SCHEMAS = exports.TOGGLE_MODULES = exports.CHANNEL_LABEL = exports.SETUP_CHANNELS = exports.LEVEL_LABEL = exports.ACCESS_LEVELS = exports.GUILD_CONFIG_VERSION = void 0;
exports.parseGuildConfig = parseGuildConfig;
exports.setupWelcome = setupWelcome;
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const safety_1 = require("./safety");
/**
 * Einstellungen je Discord-Server, eingerichtet über `/setup`. Gespeichert über die vorhandene API-Route `/bot/state`
 * (Schlüssel `guildcfg:<Server-ID>`) – überlebt Neustarts, liegt in der Datenbank und ist Teil der Datenbank-Sicherung.
 * Server sind über die ID im Schlüssel strikt getrennt.
 */
exports.GUILD_CONFIG_VERSION = 1;
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const hex = zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe bitte als #RRGGBB');
const httpsUrl = zod_1.z.string().trim().max(500).url().regex(/^https:\/\//i, 'Bild-Link muss mit https:// beginnen');
const roleList = zod_1.z.array(sf).max(10).default([]);
/** Stufen des Rechtesystems (höchste zuerst). */
exports.ACCESS_LEVELS = ['admin', 'leadership', 'instructor', 'officer', 'readonly'];
exports.LEVEL_LABEL = { admin: 'Serveradministrator', leadership: 'Polizeiführung', instructor: 'Ausbilder', officer: 'Beamter', readonly: 'Nur lesender Zugriff' };
/** Kanäle, die `/setup` einrichtet. */
exports.SETUP_CHANNELS = ['welcome', 'log', 'exams'];
exports.CHANNEL_LABEL = { welcome: 'Begrüßung', log: 'Bot-Meldungen (Admins)', exams: 'Prüfungs-Ankündigungen' };
/** Module, die im Bot je Server ausgeblendet werden können (Grundsystem ist immer an). */
exports.TOGGLE_MODULES = shared_1.MODULES.filter((m) => !('system' in m && m.system)).map((m) => ({ key: m.key, name: m.name }));
const section = (s) => s.default({}).catch(() => s.parse({}));
/** Abschnitte streng (für die Prüfung von Eingaben); im Gesamtschema tolerant (kaputte Altwerte → Standard). */
exports.SECTION_SCHEMAS = {
    branding: zod_1.z.object({
        serverName: zod_1.z.string().trim().max(100).nullable().default(null),
        /** Anzeigename = Spitzname des Bots auf diesem Server */
        displayName: zod_1.z.string().trim().max(32).nullable().default(null),
        logoUrl: httpsUrl.nullable().default(null),
        bannerUrl: httpsUrl.nullable().default(null),
        /** Farben auch auf die Antworten der übrigen Bot-Befehle anwenden */
        applyToAll: zod_1.z.boolean().default(false),
    }).passthrough(),
    colors: zod_1.z.object({ primary: hex.default('#3b82f6'), success: hex.default('#22c55e'), warning: hex.default('#f59e0b'), danger: hex.default('#ef4444') }).passthrough(),
    welcome: zod_1.z.object({
        enabled: zod_1.z.boolean().default(false),
        title: zod_1.z.string().max(256).default('Willkommen auf {server}!'),
        text: zod_1.z.string().max(2000).default('Hallo {user}, schön dass du da bist! Du bist Mitglied Nr. {memberCount}.'),
        goodbyeEnabled: zod_1.z.boolean().default(false),
        goodbyeText: zod_1.z.string().max(2000).default('{displayName} hat den Server verlassen.'),
    }).passthrough(),
    channels: zod_1.z.object(Object.fromEntries(exports.SETUP_CHANNELS.map((k) => [k, sf.nullable().default(null)]))).passthrough(),
    roles: zod_1.z.object(Object.fromEntries(exports.ACCESS_LEVELS.map((k) => [k, roleList]))).passthrough(),
    modules: zod_1.z.object({ disabled: zod_1.z.array(zod_1.z.string().max(40)).max(50).default([]) }).passthrough(),
};
exports.guildConfigSchema = zod_1.z.object({
    version: zod_1.z.number().int().min(1).default(exports.GUILD_CONFIG_VERSION),
    /** Zählt bei jedem Speichern hoch (erkennt gleichzeitige Änderungen, z. B. während einer geplanten Wiederherstellung). */
    revision: zod_1.z.number().int().min(0).default(0),
    setupDone: zod_1.z.boolean().default(false),
    branding: section(exports.SECTION_SCHEMAS.branding),
    colors: section(exports.SECTION_SCHEMAS.colors),
    welcome: section(exports.SECTION_SCHEMAS.welcome),
    channels: section(exports.SECTION_SCHEMAS.channels),
    roles: section(exports.SECTION_SCHEMAS.roles),
    modules: section(exports.SECTION_SCHEMAS.modules),
    updatedAt: zod_1.z.string().nullable().default(null),
    updatedBy: sf.nullable().default(null),
}).passthrough();
const defaultGuildConfig = () => exports.guildConfigSchema.parse({});
exports.defaultGuildConfig = defaultGuildConfig;
/** Gespeicherten Wert tolerant lesen: kaputte Abschnitte → Standardwerte, unbekannte Felder bleiben erhalten. */
function parseGuildConfig(raw) {
    const r = exports.guildConfigSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
    if (r.success)
        return r.data;
    // einzelne ungültige Top-Level-Felder (z. B. revision als Text) verwerfen, Rest übernehmen
    const ok = Object.fromEntries(Object.entries(raw).filter(([k, v]) => {
        const field = exports.guildConfigSchema.shape[k];
        return !field || field.safeParse(v).success;
    }));
    return exports.guildConfigSchema.parse(ok);
}
/** Tiefes Zusammenführen: Teile ersetzen nur, was sie angeben (Listen werden als Ganzes ersetzt). */
function merge(base, patch) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined)
            continue;
        const b = out[k];
        out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b) ? merge(b, v) : v;
    }
    return out;
}
class ConfigValidationError extends Error {
}
exports.ConfigValidationError = ConfigValidationError;
class ConfigConflictError extends Error {
    constructor() { super('Die Einstellungen wurden inzwischen geändert. Bitte erneut versuchen.'); }
}
exports.ConfigConflictError = ConfigConflictError;
const apiKeyValue = (api) => ({
    get: (key) => (0, safety_1.withRetry)(() => api.service('GET', `/bot/state/${key}`)).then((r) => r?.value ?? null),
    put: (key, value) => (0, safety_1.withRetry)(() => api.service('PUT', `/bot/state/${key}`, { value })).then(() => undefined),
});
exports.apiKeyValue = apiKeyValue;
const memoryKeyValue = (seed = {}) => {
    const data = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));
    return { data, async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; }, async put(k, v) { data.set(k, structuredClone(v)); } };
};
exports.memoryKeyValue = memoryKeyValue;
const configKey = (guildId) => {
    if (!/^\d{15,25}$/.test(guildId))
        throw new Error('invalid guild id');
    return `guildcfg:${guildId}`;
};
exports.configKey = configKey;
/** Serverkonfigurationen mit kurzem Zwischenspeicher (Lesen bei jeder Interaktion soll die API nicht fluten). */
class GuildConfigStore {
    kv;
    ttlMs;
    now;
    cache = new Map();
    constructor(kv, ttlMs = 15_000, now = () => Date.now()) {
        this.kv = kv;
        this.ttlMs = ttlMs;
        this.now = now;
    }
    async load(guildId, fresh = false) {
        const hit = this.cache.get(guildId);
        if (!fresh && hit && this.now() - hit.at < this.ttlMs)
            return hit;
        const stored = await this.kv.get((0, exports.configKey)(guildId));
        const raw = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
        const entry = { at: this.now(), cfg: parseGuildConfig(raw), raw };
        this.cache.set(guildId, entry);
        return entry;
    }
    async get(guildId, o = {}) { return structuredClone((await this.load(guildId, o.fresh)).cfg); }
    /** Gibt es schon gespeicherte Einstellungen für den Server? */
    async exists(guildId) { return Object.keys((await this.load(guildId, true)).raw).length > 0; }
    /**
     * Änderung speichern: frisch lesen, zusammenführen (unbekannte/ältere Felder bleiben), prüfen, Revision erhöhen.
     * `expectRevision`: nur speichern, wenn sich seitdem nichts geändert hat.
     */
    async update(guildId, patch, o = {}) {
        const cur = await this.load(guildId, true);
        if (o.expectRevision !== undefined && cur.cfg.revision !== o.expectRevision)
            throw new ConfigConflictError();
        const merged = merge(merge(cur.raw, cur.cfg), patch);
        // geänderte Abschnitte streng prüfen – ein ungültiger Wert darf nie still einen ganzen Abschnitt zurücksetzen
        for (const k of Object.keys(patch)) {
            if (!(k in exports.SECTION_SCHEMAS))
                continue;
            const r = exports.SECTION_SCHEMAS[k].safeParse(merged[k]);
            if (!r.success)
                throw new ConfigValidationError(`${k}.${r.error.issues[0]?.path.join('.') ?? ''}: ${r.error.issues[0]?.message ?? 'ungültig'}`);
        }
        const next = exports.guildConfigSchema.parse({ ...merged, version: Math.max(cur.cfg.version, exports.GUILD_CONFIG_VERSION), revision: cur.cfg.revision + 1, updatedAt: new Date(this.now()).toISOString(), updatedBy: o.by ?? null });
        await this.kv.put((0, exports.configKey)(guildId), next);
        this.cache.set(guildId, { at: this.now(), cfg: next, raw: next });
        return structuredClone(next);
    }
    /** Vollständigen Stand setzen (nur Wiederherstellung – vorher wird gesichert). */
    async replace(guildId, cfg, o = {}) {
        const cur = await this.load(guildId, true);
        if (o.expectRevision !== undefined && cur.cfg.revision !== o.expectRevision)
            throw new ConfigConflictError();
        const next = exports.guildConfigSchema.parse({ ...cfg, revision: cur.cfg.revision + 1, updatedAt: new Date(this.now()).toISOString(), updatedBy: o.by ?? null });
        await this.kv.put((0, exports.configKey)(guildId), next);
        this.cache.set(guildId, { at: this.now(), cfg: next, raw: next });
        return structuredClone(next);
    }
    forget(guildId) { if (guildId)
        this.cache.delete(guildId);
    else
        this.cache.clear(); }
}
exports.GuildConfigStore = GuildConfigStore;
/** „#3b82f6“ → 0x3b82f6 */
const colorOf = (c, fallback) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? parseInt(c.slice(1), 16) : fallback);
exports.colorOf = colorOf;
/** Begrüßung/Abschied aus `/setup` im Format der Willkommens-Funktion (Kanal „Begrüßung“, Farben und Banner des Servers). */
function setupWelcome(cfg, kind) {
    const w = cfg.welcome;
    const on = kind === 'welcome' ? w.enabled : w.goodbyeEnabled;
    if (!on || !cfg.channels.welcome || cfg.modules.disabled.includes('welcome'))
        return null;
    return kind === 'welcome'
        ? { enabled: true, channelId: cfg.channels.welcome, title: w.title, message: w.text, color: cfg.colors.primary, showAvatar: true, pingUser: true, image: cfg.branding.bannerUrl ?? '', imageMediaId: '' }
        : { enabled: true, channelId: cfg.channels.welcome, title: 'Auf Wiedersehen', message: w.goodbyeText, color: cfg.colors.warning, showAvatar: true, pingUser: false, image: '', imageMediaId: '' };
}
//# sourceMappingURL=guild-config.js.map