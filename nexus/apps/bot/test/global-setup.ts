import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

/**
 * Integrationstests laufen gegen die eigene Datenbank `nexus_test` und Redis (Präfix `nexus-test`),
 * nie gegen Dev-Daten. Einheitstests mit Attrappen bleiben unberührt.
 */
export default async function setup(): Promise<void> {
  const env = readFileSync(fileURLToPath(new URL('../../../.env', import.meta.url)), 'utf8');
  const read = (k: string) => new RegExp(`^${k}="?([^"\\n]*)"?`, 'm').exec(env)?.[1];
  const base = process.env['DATABASE_URL'] ?? read('DATABASE_URL');
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
  process.env['REDIS_URL'] =
    process.env['REDIS_URL'] ?? read('REDIS_URL') ?? 'redis://localhost:6379';
  process.env['QUEUE_PREFIX'] = 'nexus-test';
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('../../../packages/database', import.meta.url)),
    stdio: 'pipe',
    env: process.env,
  });
}
