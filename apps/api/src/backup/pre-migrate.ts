/**
 * Sicherung vor Datenbank-Migrationen: läuft VOR `prisma migrate deploy` (Hosting-Start, Docker).
 *   node dist/backup/pre-migrate.js <Migrationsordner>
 * Stehen Migrationen aus und enthält die Datenbank bereits Daten, wird der vollständige Bestand als
 * `vor-migration-<Zeit>.json.gz` im Backup-Ordner gesichert (gleiches Format wie die Daten-Backups, im Dashboard einspielbar) und die Datei
 * sofort zurückgelesen und gezählt. Schlägt das fehl, bricht der Start ab – es wird nicht ohne Sicherung migriert.
 * Gelesen wird schema-unabhängig per SQL (der Prisma-Client kennt schon das NEUE Schema, die Datenbank noch das alte).
 * Leere/neue Datenbanken brauchen keine Sicherung.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/** Wie im BackupService: flüchtige Daten gehören nicht in ein Daten-Backup. */
const SKIP = new Set(['Session', 'DiscordOutbox', 'EditLock', 'DiscordLinkCode', 'RobloxVerifyCode', 'RobloxOAuthState', 'DiscordBackup', '_prisma_migrations']);

export async function preMigrationBackup(migrationsDir: string, storageDir: string, log: (m: string) => void = console.log): Promise<{ file: string | null; reason: string }> {
  const prisma = new PrismaClient();
  try {
    const t = (await prisma.$queryRawUnsafe<{ t: string | null }[]>(`SELECT to_regclass('public."_prisma_migrations"')::text AS t`))[0]?.t;
    if (!t) return { file: null, reason: 'Neue Datenbank – keine Sicherung nötig.' };
    const applied = new Set((await prisma.$queryRawUnsafe<{ migration_name: string }[]>(`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((r) => r.migration_name));
    const local = existsSync(migrationsDir) ? readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(path.join(migrationsDir, d.name, 'migration.sql'))).map((d) => d.name) : [];
    const pending = local.filter((m) => !applied.has(m)).sort();
    if (!pending.length) return { file: null, reason: 'Keine ausstehenden Migrationen.' };
    const tables = (await prisma.$queryRawUnsafe<{ tablename: string }[]>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).map((r) => r.tablename).filter((n) => !SKIP.has(n));
    // Zeitspalten ohne Zeitzone werden als UTC gespeichert → beim Lesen als ISO mit „Z“ ausgeben (sonst nicht wieder einspielbar)
    const cols = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string; data_type: string }[]>(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('timestamp without time zone', 'date')`);
    const out: Record<string, Record<string, unknown>[]> = {};
    let rows = 0;
    for (const table of tables) {
      const list = (await prisma.$queryRawUnsafe<{ r: Record<string, unknown> }[]>(`SELECT row_to_json(t) AS r FROM "${table.replace(/"/g, '')}" t`)).map((x) => x.r);
      const times = cols.filter((c) => c.table_name === table);
      for (const r of list) for (const c of times) {
        const v = r[c.column_name];
        if (typeof v === 'string') r[c.column_name] = c.data_type === 'date' ? `${v}T00:00:00.000Z` : `${v.replace(' ', 'T')}${/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z'}`;
      }
      out[table] = list;
      rows += list.length;
    }
    if (rows === 0) return { file: null, reason: 'Datenbank ohne Daten – keine Sicherung nötig.' };
    const last = [...applied].sort().pop() ?? null;
    const body = { app: 'en-polizei', version: 1, createdAt: new Date().toISOString(), migration: last, pendingMigrations: pending, tables: out };
    const dir = path.resolve(storageDir, 'backups');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const file = path.join(dir, `vor-migration-${stamp}.json.gz`);
    writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(body))));
    // Kontrolle: Datei zurücklesen und Zeilen zählen
    const check = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as { tables: Record<string, unknown[]> };
    const counted = Object.values(check.tables).reduce((n, l) => n + l.length, 0);
    if (counted !== rows) throw new Error(`Sicherung unvollständig (${counted} von ${rows} Zeilen).`);
    log(`Sicherung vor Migration: ${path.basename(file)} (${rows} Zeilen, ausstehend: ${pending.join(', ')})`);
    return { file, reason: `${pending.length} ausstehende Migration(en)` };
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  const dir = process.argv[2] ?? path.resolve(__dirname, '../../prisma/migrations');
  const storage = process.env.STORAGE_DIR ?? './uploads';
  preMigrationBackup(dir, storage, (m) => console.log(`[nexus] ${m}`))
    .then((r) => { if (!r.file) console.log(`[nexus] Sicherung vor Migration: ${r.reason}`); process.exit(0); })
    .catch((e: unknown) => { console.error(`[nexus] FEHLER: Sicherung vor der Migration fehlgeschlagen – Migration wird NICHT ausgeführt: ${e instanceof Error ? e.message : e}`); process.exit(1); });
}
