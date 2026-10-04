import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const { PrismaClient } = createRequire(`${process.cwd()}/packages/database/package.json`)(
  '@prisma/client',
) as typeof import('@prisma/client');

/** Wird vor dem API-Start ausgeführt (`pnpm exec tsx e2e/prepare-db.mts`). Der Browser-Test läuft gegen eine frische Datenbank `nexus_e2e` (nie gegen Dev-Daten). */
async function setup(): Promise<void> {
  const base = /^DATABASE_URL="?([^"\n]*)"?/m.exec(readFileSync('.env', 'utf8'))?.[1];
  if (!base) throw new Error('DATABASE_URL fehlt in .env');
  const admin = new URL(base);
  admin.pathname = '/postgres';
  const client = new PrismaClient({ datasourceUrl: admin.toString() });
  await client.$executeRawUnsafe('DROP DATABASE IF EXISTS nexus_e2e WITH (FORCE)');
  await client.$executeRawUnsafe('CREATE DATABASE nexus_e2e');
  await client.$disconnect();
  const url = new URL(base);
  url.pathname = '/nexus_e2e';
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: `${process.cwd()}/packages/database`,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}

await setup();
