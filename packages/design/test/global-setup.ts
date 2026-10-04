import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

/** Integrationstests laufen gegen eine eigene Datenbank `nexus_test` (nie gegen die Dev-Daten). */
export default async function setup(): Promise<void> {
  const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
  let base = process.env['DATABASE_URL'];
  if (!base) {
    base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync(envFile, 'utf8'))?.[1];
  }
  if (!base) throw new Error('DATABASE_URL fehlt (.env oder Umgebung).');
  const url = new URL(base);
  url.pathname = '/nexus_test';
  const admin = new URL(base);
  admin.pathname = '/postgres';

  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  const exists = await client.$queryRaw<
    unknown[]
  >`SELECT 1 FROM pg_database WHERE datname='nexus_test'`;
  if (exists.length === 0) await client.$executeRawUnsafe('CREATE DATABASE nexus_test');
  await client.$disconnect();

  process.env['DATABASE_URL'] = url.toString();
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../database', import.meta.url)),
    stdio: 'pipe',
    env: process.env,
  });
}
