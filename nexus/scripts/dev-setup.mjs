#!/usr/bin/env node
/**
 * NEXUS Dev-Setup (`pnpm dev` ruft dies vor dem Start der Apps auf).
 *  1. legt .env aus .env.example an (inkl. generiertem AUTH_SECRET)
 *  2. stellt PostgreSQL + Redis bereit: Docker Compose, sonst lokal installierte Binaries
 *     (Daten unter .dev/, nicht im Git)
 *  3. wendet das Datenbankschema an (Migrationen, sonst db push)
 * Idempotent: bereits laufende Dienste werden nicht angefasst.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const devDir = join(root, '.dev');
const log = (m) => console.log(`[dev-setup] ${m}`);
const has = (bin) => spawnSync('which', [bin], { stdio: 'ignore' }).status === 0;
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    ...opts,
    env: { LC_ALL: 'en_US.UTF-8', ...process.env, ...opts.env },
  });

// 1. .env ---------------------------------------------------------------
const envPath = join(root, '.env');
if (!existsSync(envPath)) {
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  writeFileSync(
    envPath,
    example.replace(/^AUTH_SECRET=""/m, `AUTH_SECRET="${randomBytes(32).toString('hex')}"`),
  );
  log('.env aus .env.example erstellt – DISCORD_* Werte noch eintragen (docs/BOT-SETUP.md).');
}
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)="?([^"]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const dbUrl = new URL(env.DATABASE_URL);
const redisUrl = new URL(env.REDIS_URL);
const dbPort = Number(dbUrl.port || 5432);
const redisPort = Number(redisUrl.port || 6379);

// 2. Dienste ------------------------------------------------------------
const reachable = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    s.once('connect', () => (s.destroy(), resolve(true)));
    s.once('error', () => resolve(false));
  });
const waitFor = async (port, name) => {
  for (let i = 0; i < 40; i++) {
    if (await reachable(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} ist auf Port ${port} nicht erreichbar geworden.`);
};

const pgUp = await reachable(dbPort);
const redisUp = await reachable(redisPort);
const dockerOk = has('docker') && spawnSync('docker', ['info'], { stdio: 'ignore' }).status === 0;

if (!pgUp || !redisUp) {
  if (dockerOk) {
    log('Starte PostgreSQL + Redis über Docker Compose …');
    run('docker', ['compose', 'up', '-d', '--wait']);
  } else {
    log('Docker nicht verfügbar – nutze lokale PostgreSQL-/Redis-Installation (.dev/).');
    mkdirSync(devDir, { recursive: true });
    if (!pgUp) {
      if (!has('initdb') || !has('pg_ctl')) {
        throw new Error('Weder Docker noch PostgreSQL gefunden (brew install postgresql@17).');
      }
      const data = join(devDir, 'postgres');
      if (!existsSync(join(data, 'PG_VERSION'))) {
        run('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '-E', 'UTF8']);
      }
      run('pg_ctl', [
        '-D',
        data,
        '-l',
        join(devDir, 'postgres.log'),
        '-o',
        `-p ${dbPort} -k ${devDir}`,
        '-w',
        'start',
      ]);
      const psql = (sql, db = 'postgres') =>
        spawnSync(
          'psql',
          ['-h', '127.0.0.1', '-p', String(dbPort), '-U', 'postgres', '-d', db, '-tAc', sql],
          {
            encoding: 'utf8',
          },
        ).stdout.trim();
      const user = decodeURIComponent(dbUrl.username);
      const dbName = dbUrl.pathname.slice(1);
      if (!psql(`SELECT 1 FROM pg_roles WHERE rolname='${user}'`)) {
        psql(
          `CREATE ROLE "${user}" LOGIN SUPERUSER PASSWORD '${decodeURIComponent(dbUrl.password)}'`,
        );
      }
      if (!psql(`SELECT 1 FROM pg_database WHERE datname='${dbName}'`)) {
        psql(`CREATE DATABASE "${dbName}" OWNER "${user}"`);
      }
    }
    if (!redisUp) {
      if (!has('redis-server'))
        throw new Error('Weder Docker noch Redis gefunden (brew install redis).');
      run('redis-server', [
        '--port',
        String(redisPort),
        '--daemonize',
        'yes',
        '--dir',
        devDir,
        '--appendonly',
        'yes',
        '--logfile',
        join(devDir, 'redis.log'),
      ]);
    }
  }
}
await waitFor(dbPort, 'PostgreSQL');
await waitFor(redisPort, 'Redis');
log(`PostgreSQL :${dbPort} und Redis :${redisPort} laufen.`);

// 3. Schema -------------------------------------------------------------
const dbEnv = { ...process.env, ...env };
const hasMigrations = existsSync(join(root, 'packages/database/prisma/migrations'));
log(
  hasMigrations
    ? 'Wende Migrationen an …'
    : 'Keine Migrationen vorhanden – synchronisiere Schema (db push) …',
);
run(
  'pnpm',
  ['--filter', '@nexus/database', hasMigrations ? 'prisma:migrate:deploy' : 'prisma:push'],
  {
    env: dbEnv,
  },
);
run('pnpm', ['--filter', '@nexus/database', 'prisma:generate'], { env: dbEnv });
log('Bereit.');
