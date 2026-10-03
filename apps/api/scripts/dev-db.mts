/** Startet ein lokales eingebettetes PostgreSQL für Entwicklung (Produktion: Docker Compose). */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import path from 'node:path';

const dir = process.env.DEV_DB_DIR ? path.resolve(process.env.DEV_DB_DIR) : path.resolve(import.meta.dirname, '../.pgdata');
const port = Number(process.env.DEV_DB_PORT ?? 54329);

async function main() {
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'enrp', password: 'enrp', port, persistent: true });
  if (!existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
  await pg.start();
  try { await pg.createDatabase('enrp'); } catch { /* exists */ }
  try { await pg.createDatabase('enrp_test'); } catch { /* exists */ }
  console.log(`dev postgres ready: postgresql://enrp:enrp@localhost:${port}/enrp`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
