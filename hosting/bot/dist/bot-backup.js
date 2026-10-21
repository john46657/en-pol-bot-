"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotBackupService = exports.defaultBackupDir = exports.checksumOf = exports.BACKUP_VERSION = exports.BACKUP_FORMAT = void 0;
exports.stableJson = stableJson;
exports.insideProduction = insideProduction;
exports.fsBackupFiles = fsBackupFiles;
exports.memoryBackupFiles = memoryBackupFiles;
exports.diffConfig = diffConfig;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const guild_config_1 = require("./guild-config");
const safety_1 = require("./safety");
/**
 * Sicherungen der Bot-Einstellungen je Server. Jede Sicherung liegt an ZWEI Orten:
 *  1. als Datei in `BOT_BACKUP_DIR` (Standard: Benutzerordner, nicht im Bot-/Produktionsordner), nur für den Bot-Benutzer lesbar,
 *  2. in der Datenbank des Systems (über `/bot/state`, letzte Sicherungen vollständig).
 * Inhalte werden vor dem Schreiben von Geheimnissen befreit und mit einer SHA-256-Prüfsumme versehen.
 * Datenbank-Daten (Ausbildungen, Prüfungen, Personal – mit allen Beziehungen) sichert das System selbst; die Bot-Sicherung
 * verweist auf die dabei angelegte Datenbank-Sicherung.
 */
exports.BACKUP_FORMAT = 'enpol-bot-backup';
exports.BACKUP_VERSION = 1;
const NAME = /^bot-(manuell|vor-wiederherstellung|vor-migration)-\d{8}-\d{6}(?:-\d{1,3})?\.json$/;
const MIRROR_KEEP_FULL = 5;
const MIRROR_KEEP_META = 30;
/** JSON mit sortierten Schlüsseln (gleiche Inhalte → gleiche Prüfsumme). */
function stableJson(v) {
    if (Array.isArray(v))
        return `[${v.map(stableJson).join(',')}]`;
    if (v && typeof v === 'object')
        return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
    return JSON.stringify(v ?? null);
}
const checksumOf = (contents) => (0, node_crypto_1.createHash)('sha256').update(stableJson(contents)).digest('hex');
exports.checksumOf = checksumOf;
const safeGuild = (g) => { if (!/^\d{15,25}$/.test(g))
    throw new Error('invalid guild id'); return g; };
const safeName = (n) => { if (!NAME.test(n))
    throw new Error('invalid backup name'); return n; };
/** Standardordner: im Benutzerordner (außerhalb des Bot-Ordners), überschreibbar mit BOT_BACKUP_DIR. */
const defaultBackupDir = (env = process.env) => node_path_1.default.resolve(env.BOT_BACKUP_DIR || node_path_1.default.join(node_os_1.default.homedir(), '.en-polizei-bot', 'backups'));
exports.defaultBackupDir = defaultBackupDir;
/** Liegt der Sicherungsordner im Produktionsordner (dort, wo bot.js/.env liegen)? Dann warnen. */
function insideProduction(dir, prodDirs) {
    const d = node_path_1.default.resolve(dir) + node_path_1.default.sep;
    return prodDirs.some((p) => d.startsWith(node_path_1.default.resolve(p) + node_path_1.default.sep));
}
function fsBackupFiles(dir) {
    const gdir = (g) => node_path_1.default.join(dir, safeGuild(g));
    return {
        location: dir,
        async list(g) { return (await (0, promises_1.readdir)(gdir(g)).catch(() => [])).filter((n) => NAME.test(n)); },
        async read(g, n) { return (0, promises_1.readFile)(node_path_1.default.join(gdir(g), safeName(n)), 'utf8').catch(() => null); },
        async write(g, n, text) {
            await (0, promises_1.mkdir)(gdir(g), { recursive: true, mode: 0o700 });
            await (0, promises_1.chmod)(dir, 0o700).catch(() => undefined);
            const f = node_path_1.default.join(gdir(g), safeName(n));
            await (0, promises_1.writeFile)(f, text, { mode: 0o600, flag: 'wx' }); // nie eine vorhandene Sicherung überschreiben
        },
    };
}
function memoryBackupFiles(location = 'memory') {
    const data = new Map();
    return {
        location, data,
        async list(g) { return [...data.keys()].filter((k) => k.startsWith(`${g}/`)).map((k) => k.slice(g.length + 1)); },
        async read(g, n) { return data.get(`${g}/${n}`) ?? null; },
        async write(g, n, t) { if (data.has(`${g}/${n}`))
            throw new Error('exists'); data.set(`${safeGuild(g)}/${safeName(n)}`, t); },
    };
}
const mirrorKey = (g) => `botbak:${safeGuild(g)}`;
/** Unterschiede zwischen aktuellem und gesichertem Stand (lesbar, ohne Revision/Zeitstempel). */
function diffConfig(cur, next) {
    const out = [];
    const skip = new Set(['revision', 'updatedAt', 'updatedBy', 'version']);
    const walk = (a, b, p) => {
        if (stableJson(a) === stableJson(b))
            return;
        if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
            for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
                if (!(p === '' && skip.has(k)))
                    walk(a[k], b[k], p ? `${p}.${k}` : k);
            return;
        }
        const show = (v) => { const s = JSON.stringify(v ?? null); return s.length > 60 ? `${s.slice(0, 57)}…` : s; };
        out.push(`${p}: ${show(a)} → ${show(b)}`);
    };
    walk(cur, next, '');
    return out;
}
class BotBackupService {
    store;
    files;
    db;
    now;
    constructor(store, files, db, now = () => new Date()) {
        this.store = store;
        this.files = files;
        this.db = db;
        this.now = now;
    }
    stamp() { return this.now().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15); }
    async readMirror(g) {
        const v = (await this.db.get(mirrorKey(g)));
        return { items: Array.isArray(v?.items) ? v.items : [], snapshots: v?.snapshots && typeof v.snapshots === 'object' ? v.snapshots : {} };
    }
    /** Sicherung anlegen (Datei + Datenbank). Schlägt nur fehl, wenn KEIN Ort geschrieben werden konnte. */
    async create(guildId, o) {
        const cfg = (0, safety_1.scrubSecrets)(await this.store.get(guildId, { fresh: true }));
        const contents = { guildConfig: cfg };
        const taken = new Set([...(await this.files.list(guildId).catch(() => [])), ...(await this.readMirror(guildId).catch(() => ({ items: [] }))).items.map((x) => x.name)]);
        let name = `bot-${o.reason}-${this.stamp()}.json`;
        for (let n = 2; taken.has(name); n++)
            name = `bot-${o.reason}-${this.stamp()}-${n}.json`;
        const snap = { format: exports.BACKUP_FORMAT, version: exports.BACKUP_VERSION, name, createdAt: this.now().toISOString(), reason: o.reason, guildId, guildName: o.guildName ?? null, createdBy: o.by ?? null, database: o.database ?? null, contents, checksum: (0, exports.checksumOf)(contents) };
        if ((0, safety_1.containsSecret)(snap))
            throw new Error('Sicherung abgebrochen: Inhalt sieht nach einem Geheimnis aus.');
        const problems = [];
        const locations = [];
        try {
            await this.files.write(guildId, name, JSON.stringify(snap, null, 2));
            locations.push('Datei');
        }
        catch (e) {
            problems.push(`Datei nicht geschrieben (${this.files.location}): ${e instanceof Error ? e.message : e}`);
        }
        try {
            const m = await this.readMirror(guildId);
            const meta = { name, createdAt: snap.createdAt, reason: snap.reason, checksum: snap.checksum, createdBy: snap.createdBy, database: snap.database };
            const items = [meta, ...m.items.filter((x) => x.name !== name)].slice(0, MIRROR_KEEP_META);
            const keep = new Set(items.slice(0, MIRROR_KEEP_FULL).map((x) => x.name));
            const snapshots = Object.fromEntries(Object.entries({ ...m.snapshots, [name]: snap }).filter(([k]) => keep.has(k)));
            await this.db.put(mirrorKey(guildId), { items, snapshots });
            locations.push('Datenbank');
        }
        catch (e) {
            problems.push(`Kopie in der Datenbank nicht gespeichert: ${e instanceof Error ? e.message : e}`);
        }
        if (!locations.length)
            throw new Error(`Sicherung fehlgeschlagen: ${problems.join(' · ')}`);
        return { meta: { name, createdAt: snap.createdAt, reason: snap.reason, checksum: snap.checksum, createdBy: snap.createdBy, database: snap.database, locations }, problems };
    }
    /** Alle Sicherungen eines Servers (neueste zuerst), mit Ablageort. */
    async list(guildId) {
        const [names, m] = await Promise.all([this.files.list(guildId).catch(() => []), this.readMirror(guildId).catch(() => ({ items: [], snapshots: {} }))]);
        const byName = new Map();
        for (const it of m.items)
            byName.set(it.name, { ...it, locations: ['Datenbank'] });
        for (const n of names) {
            const hit = byName.get(n);
            if (hit)
                hit.locations = ['Datei', ...(m.snapshots[n] ? ['Datenbank'] : [])];
            else {
                const s = this.parse(await this.files.read(guildId, n));
                byName.set(n, { name: n, createdAt: s?.createdAt ?? '', reason: s?.reason ?? 'manuell', checksum: s?.checksum ?? '', createdBy: s?.createdBy ?? null, database: s?.database ?? null, locations: ['Datei'] });
            }
        }
        // nur Metadaten in der Datenbank (vollständige Kopie dort schon aufgeräumt) und keine Datei → nicht wiederherstellbar
        for (const [n, b] of byName)
            if (!names.includes(n) && !m.snapshots[n])
                byName.set(n, { ...b, locations: [] });
        return [...byName.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    parse(text) {
        if (!text)
            return null;
        try {
            return JSON.parse(text);
        }
        catch {
            return null;
        }
    }
    /** Sicherung laden: bevorzugt die Datei, sonst die Kopie in der Datenbank. */
    async load(guildId, name) {
        safeName(name);
        return this.parse(await this.files.read(guildId, name).catch(() => null)) ?? (await this.readMirror(guildId).catch(() => null))?.snapshots[name] ?? null;
    }
    /** Formale Prüfung: Format, Version, Server, Prüfsumme, keine Geheimnisse, gültige Einstellungen. */
    verify(s, guildId) {
        if (!s || typeof s !== 'object')
            return ['Datei fehlt oder ist kein gültiges JSON.'];
        const p = [];
        if (s.format !== exports.BACKUP_FORMAT)
            p.push('Unbekanntes Format.');
        if (typeof s.version !== 'number' || s.version > exports.BACKUP_VERSION)
            p.push(`Version ${String(s.version)} wird von diesem Bot nicht unterstützt.`);
        if (s.guildId !== guildId)
            p.push('Die Sicherung gehört zu einem anderen Discord-Server.');
        if (!s.contents?.guildConfig)
            p.push('Keine Einstellungen enthalten.');
        else {
            if ((0, exports.checksumOf)(s.contents) !== s.checksum)
                p.push('Prüfsumme stimmt nicht – die Datei wurde verändert oder ist beschädigt.');
            if (!guild_config_1.guildConfigSchema.safeParse(s.contents.guildConfig).success)
                p.push('Die gesicherten Einstellungen sind ungültig.');
        }
        if ((0, safety_1.containsSecret)(s))
            p.push('Die Datei enthält etwas, das wie ein Geheimnis aussieht – wird nicht eingespielt.');
        return p;
    }
    /** Testwiederherstellung in einer abgeschotteten Umgebung (eigener Speicher, nichts Echtes wird berührt). */
    async sandboxRestore(s) {
        try {
            const kv = (0, guild_config_1.memoryKeyValue)();
            const sandbox = new guild_config_1.GuildConfigStore(kv, 0);
            const want = (0, guild_config_1.parseGuildConfig)(s.contents.guildConfig);
            await sandbox.replace(s.guildId, want);
            const got = await new guild_config_1.GuildConfigStore(kv, 0).get(s.guildId); // wie nach einem Neustart frisch gelesen
            const diff = diffConfig(want, got);
            return diff.length ? { ok: false, problems: [`Test-Wiederherstellung weicht ab: ${diff.slice(0, 3).join('; ')}`] } : { ok: true, problems: [] };
        }
        catch (e) {
            return { ok: false, problems: [`Test-Wiederherstellung fehlgeschlagen: ${e instanceof Error ? e.message : e}`] };
        }
    }
    /** Wiederherstellungsplan: Prüfung, Testlauf, Änderungen, Hinweise zu nicht mehr vorhandenen Kanälen/Rollen. Ändert nichts. */
    async plan(guildId, name, present) {
        const snapshot = await this.load(guildId, name);
        const problems = this.verify(snapshot, guildId);
        const cur = await this.store.get(guildId, { fresh: true });
        if (!snapshot || problems.length)
            return { guildId, name, checksum: snapshot?.checksum ?? '', currentRevision: cur.revision, snapshot: snapshot, changes: [], warnings: [], problems, sandboxOk: false };
        const sandbox = await this.sandboxRestore(snapshot);
        const next = (0, guild_config_1.parseGuildConfig)(snapshot.contents.guildConfig);
        const warnings = [];
        if (present) {
            const gone = (ids, have) => ids.filter((x) => !!x && !have.includes(x)).length;
            const ch = gone(Object.values(next.channels), present.channelIds);
            const ro = gone(Object.values(next.roles).flat(), present.roleIds);
            if (ch)
                warnings.push(`${ch} gesicherte(r) Kanal/Kanäle existiert nicht mehr – danach unter /setup neu wählen.`);
            if (ro)
                warnings.push(`${ro} gesicherte Rolle(n) existiert nicht mehr – Stufen danach prüfen.`);
        }
        return { guildId, name, checksum: snapshot.checksum, currentRevision: cur.revision, snapshot, changes: diffConfig(cur, next), warnings, problems: sandbox.problems, sandboxOk: sandbox.ok };
    }
    /**
     * Einspielen eines geprüften Plans: Datei erneut prüfen (unverändert?), aktuellen Stand sichern (Pflicht),
     * dann nur, wenn sich die Einstellungen seit dem Plan nicht geändert haben.
     */
    async apply(plan, o) {
        if (plan.problems.length || !plan.sandboxOk)
            throw new Error('Der Plan ist nicht geprüft – Wiederherstellung abgelehnt.');
        const again = await this.load(plan.guildId, plan.name);
        const problems = this.verify(again, plan.guildId);
        if (problems.length || again.checksum !== plan.checksum)
            throw new Error('Die Sicherung hat sich seit der Prüfung verändert – bitte neu planen.');
        const cur = await this.store.get(plan.guildId, { fresh: true });
        if (cur.revision !== plan.currentRevision)
            throw new Error('Die Einstellungen wurden seit der Prüfung geändert – bitte neu planen.');
        const { meta: safety } = await this.create(plan.guildId, { reason: 'vor-wiederherstellung', by: o.by, guildName: o.guildName ?? null });
        const config = await this.store.replace(plan.guildId, (0, guild_config_1.parseGuildConfig)(again.contents.guildConfig), { by: o.by, expectRevision: plan.currentRevision });
        return { safety, config };
    }
}
exports.BotBackupService = BotBackupService;
//# sourceMappingURL=bot-backup.js.map