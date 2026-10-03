import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../.pgdata-test');
const port = 54330;
let pg: EmbeddedPostgres | undefined;

/** Startet für die Integrationstests ein isoliertes PostgreSQL und wendet alle Migrationen an. */
export async function setup() {
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  } else {
    rmSync(dir, { recursive: true, force: true });
    pg = new EmbeddedPostgres({ databaseDir: dir, user: 'enrp', password: 'enrp', port, persistent: false });
    if (!existsSync(path.join(dir, 'PG_VERSION'))) await pg.initialise();
    await pg.start();
    await pg.createDatabase('enrp_test');
    process.env.DATABASE_URL = `postgresql://enrp:enrp@localhost:${port}/enrp_test`;
  }
  execSync('npx prisma migrate deploy', { cwd: path.resolve(import.meta.dirname, '..'), env: process.env, stdio: 'pipe' });
}

export async function teardown() {
  await pg?.stop();
  rmSync(dir, { recursive: true, force: true });
}
