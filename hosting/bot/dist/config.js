"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.guildIds = void 0;
exports.parseDotEnv = parseDotEnv;
exports.loadDotEnv = loadDotEnv;
exports.loadConfig = loadConfig;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const zod_1 = require("zod");
const schema = zod_1.z.object({
    DISCORD_TOKEN: zod_1.z.string().min(20, 'DISCORD_TOKEN missing'),
    /** Optional: eine oder MEHRERE Server-IDs (mit Komma getrennt). Mit Wert werden Slash-Commands sofort (nur dort) registriert, sonst global (dauert bis zu 1 h). */
    DISCORD_GUILD_ID: zod_1.z.string().regex(/^\d{15,25}([\s,;]+\d{15,25})*$/, 'one or more server IDs, separated by comma').optional(),
    API_URL: zod_1.z.string().url().default('http://localhost:3000'),
    BOT_API_TOKEN: zod_1.z.string().min(32, 'BOT_API_TOKEN must be at least 32 characters (same value as in the API)'),
    OUTBOX_POLL_SECONDS: zod_1.z.coerce.number().int().min(2).max(60).default(5),
    /** Wie oft Teamliste und Gefahrenstatus-Panel mit dem System abgeglichen werden (bearbeitet wird nur bei Änderungen). */
    LIVE_REFRESH_SECONDS: zod_1.z.coerce.number().int().min(5).max(3600).default(5),
});
/** "111, 222" -> ["111","222"] (Duplikate entfernt). */
const guildIds = (cfg) => [...new Set((cfg.DISCORD_GUILD_ID ?? '').split(/[\s,;]+/).filter(Boolean))];
exports.guildIds = guildIds;
/** Einfacher .env-Parser (KEY=VALUE, # Kommentare, optionale Anführungszeichen). */
function parseDotEnv(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
        if (m && !line.trim().startsWith('#'))
            out[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
    return out;
}
/** Liest eine .env neben bot.js bzw. im Arbeitsverzeichnis; echte Umgebungsvariablen des Panels haben Vorrang. */
function loadDotEnv(env = process.env) {
    const dirs = [process.cwd(), typeof __dirname === 'string' ? __dirname : undefined].filter(Boolean);
    for (const d of dirs) {
        const f = node_path_1.default.join(d, '.env');
        if (!(0, node_fs_1.existsSync)(f))
            continue;
        for (const [k, v] of Object.entries(parseDotEnv((0, node_fs_1.readFileSync)(f, 'utf8'))))
            if (env[k] === undefined)
                env[k] = v;
        return;
    }
}
/** Platzhalter aus der Vorlage (HIER_…) sind keine Werte – klare Fehlermeldung statt kryptischem Discord-Fehler. */
const isPlaceholder = (v) => /HIER_/i.test(v);
function loadConfig(env = process.env) {
    const todo = Object.entries(env).filter(([k, v]) => /^(DISCORD_TOKEN|DISCORD_GUILD_ID|BOT_API_TOKEN|API_URL)$/.test(k) && v && isPlaceholder(v)).map(([k]) => k);
    if (todo.length)
        throw new Error(`Bitte in der .env bzw. im Env-Tab noch ausfüllen: ${todo.join(', ')} (dort steht noch ein Platzhalter "HIER_…").`);
    const r = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
    if (!r.success)
        throw new Error(`Ungültige Bot-Konfiguration:\n${r.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
    return r.data;
}
//# sourceMappingURL=config.js.map