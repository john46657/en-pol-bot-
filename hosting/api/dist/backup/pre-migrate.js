"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preMigrationBackup = preMigrationBackup;
/**
 * Sicherung vor Datenbank-Migrationen: läuft VOR `prisma migrate deploy` (Hosting-Start, Docker).
 *   node dist/backup/pre-migrate.js <Migrationsordner>
 * Stehen Migrationen aus und enthält die Datenbank bereits Daten, wird der vollständige Bestand als
 * `vor-migration-<Zeit>.json.gz` im Backup-Ordner gesichert (gleiches Format wie die Daten-Backups, im Dashboard einspielbar) und die Datei
 * sofort zurückgelesen und gezählt. Schlägt das fehl, bricht der Start ab – es wird nicht ohne Sicherung migriert.
 * Gelesen wird schema-unabhängig per SQL (der Prisma-Client kennt schon das NEUE Schema, die Datenbank noch das alte).
 * Leere/neue Datenbanken brauchen keine Sicherung.
 */
const client_1 = require("@prisma/client");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_zlib_1 = require("node:zlib");
/** Wie im BackupService: flüchtige Daten gehören nicht in ein Daten-Backup. */
const SKIP = new Set(['Session', 'DiscordOutbox', 'EditLock', 'DiscordLinkCode', 'RobloxVerifyCode', 'RobloxOAuthState', 'DiscordBackup', '_prisma_migrations']);
async function preMigrationBackup(migrationsDir, storageDir, log = console.log) {
    const prisma = new client_1.PrismaClient();
    try {
        const t = (await prisma.$queryRawUnsafe(`SELECT to_regclass('public."_prisma_migrations"')::text AS t`))[0]?.t;
        if (!t)
            return { file: null, reason: 'Neue Datenbank – keine Sicherung nötig.' };
        const applied = new Set((await prisma.$queryRawUnsafe(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((r) => r.migration_name));
        const local = (0, node_fs_1.existsSync)(migrationsDir) ? (0, node_fs_1.readdirSync)(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && (0, node_fs_1.existsSync)(node_path_1.default.join(migrationsDir, d.name, 'migration.sql'))).map((d) => d.name) : [];
        const pending = local.filter((m) => !applied.has(m)).sort();
        if (!pending.length)
            return { file: null, reason: 'Keine ausstehenden Migrationen.' };
        const tables = (await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).map((r) => r.tablename).filter((n) => !SKIP.has(n));
        // Zeitspalten ohne Zeitzone werden als UTC gespeichert → beim Lesen als ISO mit „Z“ ausgeben (sonst nicht wieder einspielbar)
        const cols = await prisma.$queryRawUnsafe(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('timestamp without time zone', 'date')`);
        const out = {};
        let rows = 0;
        for (const table of tables) {
            const list = (await prisma.$queryRawUnsafe(`SELECT row_to_json(t) AS r FROM "${table.replace(/"/g, '')}" t`)).map((x) => x.r);
            const times = cols.filter((c) => c.table_name === table);
            for (const r of list)
                for (const c of times) {
                    const v = r[c.column_name];
                    if (typeof v === 'string')
                        r[c.column_name] = c.data_type === 'date' ? `${v}T00:00:00.000Z` : `${v.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z'}`;
                }
            out[table] = list;
            rows += list.length;
        }
        if (rows === 0)
            return { file: null, reason: 'Datenbank ohne Daten – keine Sicherung nötig.' };
        const last = [...applied].sort().pop() ?? null;
        const body = { app: 'en-polizei', version: 1, createdAt: new Date().toISOString(), migration: last, pendingMigrations: pending, tables: out };
        const dir = node_path_1.default.resolve(storageDir, 'backups');
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
        const file = node_path_1.default.join(dir, `vor-migration-${stamp}.json.gz`);
        (0, node_fs_1.writeFileSync)(file, (0, node_zlib_1.gzipSync)(Buffer.from(JSON.stringify(body))));
        // Kontrolle: Datei zurücklesen und Zeilen zählen
        const check = JSON.parse((0, node_zlib_1.gunzipSync)((0, node_fs_1.readFileSync)(file)).toString('utf8'));
        const counted = Object.values(check.tables).reduce((n, l) => n + l.length, 0);
        if (counted !== rows)
            throw new Error(`Sicherung unvollständig (${counted} von ${rows} Zeilen).`);
        log(`Sicherung vor Migration: ${node_path_1.default.basename(file)} (${rows} Zeilen, ausstehend: ${pending.join(', ')})`);
        return { file, reason: `${pending.length} ausstehende Migration(en)` };
    }
    finally {
        await prisma.$disconnect();
    }
}
if (require.main === module) {
    const dir = process.argv[2] ?? node_path_1.default.resolve(__dirname, '../../prisma/migrations');
    const storage = process.env.STORAGE_DIR ?? './uploads';
    preMigrationBackup(dir, storage, (m) => console.log(`[nexus] ${m}`))
        .then((r) => { if (!r.file)
        console.log(`[nexus] Sicherung vor Migration: ${r.reason}`); process.exit(0); })
        .catch((e) => { console.error(`[nexus] FEHLER: Sicherung vor der Migration fehlgeschlagen – Migration wird NICHT ausgeführt: ${e instanceof Error ? e.message : e}`); process.exit(1); });
}
//# sourceMappingURL=pre-migrate.js.map