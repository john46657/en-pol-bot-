#!/usr/bin/env node
/**
 * Startet API (inkl. Dashboard), Bot und Worker in EINEM Container – für Hosting mit nur einem Startbefehl
 * (z. B. bot-hosting.net). Vorher werden fehlende Datenbank-Migrationen eingespielt (`RUN_MIGRATIONS=false` schaltet das ab).
 * Stürzt ein Dienst ab, wird er mit wachsender Wartezeit neu gestartet; SIGTERM/SIGINT beenden alle sauber
 * (zuerst die Anwendung, dann Redis, zuletzt PostgreSQL).
 *
 * `LOCAL_SERVICES=true`: PostgreSQL und Redis laufen im selben Container (Binärdateien aus `scripts/hosting-local-services.sh`,
 * Daten unter `$NEXUS_LOCAL`, nur an 127.0.0.1, Passwörter werden einmalig erzeugt). `DATABASE_URL`/`REDIS_URL` sind dann
 * optional; sind sie gesetzt, gelten sie.
 * Umgebung: .env.production (falls vorhanden) bzw. die Variablen des Hosters.
 */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env.production');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
process.env.NODE_ENV ??= 'production';
const dash = path.join(root, 'apps/dashboard/dist');
if (!process.env.DASHBOARD_STATIC_DIR && existsSync(path.join(dash, 'index.html'))) process.env.DASHBOARD_STATIC_DIR = dash;
if (process.env.PORT && !process.env.API_PORT) process.env.API_PORT = process.env.PORT; // viele Hoster geben den Port als PORT vor

const log = (tag, msg) => process.stdout.write(`[${tag}] ${msg}\n`);
const die = (msg) => {
  log('start', `FEHLER: ${msg}`);
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let stopping = false;
const children = new Map();

/** Dienst starten und bei Absturz mit wachsender Wartezeit neu starten. */
function run(svc, attempt = 0) {
  const started = Date.now();
  const child = spawn(svc.cmd, svc.args, { cwd: svc.cwd, env: { ...process.env, ...(svc.env ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.set(svc.name, { child, svc });
  const pipe = (s) => s.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => log(svc.name, l)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('error', (e) => log(svc.name, `konnte nicht gestartet werden: ${e.message}`));
  child.on('exit', (code, signal) => {
    children.delete(svc.name);
    if (stopping) return;
    const next = Date.now() - started > 60_000 ? 0 : attempt + 1; // lief er länger als 60 s, beginnt die Wartezeit von vorn
    const wait = Math.min(2 ** next, 60) * 1000;
    log(svc.name, `beendet (${signal ?? code}) – Neustart in ${wait / 1000} s`);
    setTimeout(() => !stopping && run(svc, next), wait);
  });
}

async function waitForPort(port, label, timeoutMs = 90_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const ok = await new Promise((resolve) => {
      const s = net.connect({ host: '127.0.0.1', port }, () => (s.destroy(), resolve(true)));
      s.on('error', () => resolve(false));
    });
    if (ok) return;
    await sleep(500);
  }
  die(`${label} wurde nicht rechtzeitig bereit (Port ${port}).`);
}

// --- Optional: PostgreSQL und Redis im selben Container ---------------------------------------------------------------------
const local = process.env.LOCAL_SERVICES === 'true';
if (local) {
  const home = path.resolve(process.env.NEXUS_LOCAL ?? path.join(root, '..', 'nexus-local'));
  const pgBin = process.env.NEXUS_PG_BIN ?? path.join(home, 'pgsql', 'bin');
  const redisBin = process.env.NEXUS_REDIS_BIN ?? path.join(home, 'redis', 'bin');
  const pgPort = Number(process.env.LOCAL_PG_PORT ?? 5432);
  const redisPort = Number(process.env.LOCAL_REDIS_PORT ?? 6379);
  for (const [bin, name] of [[path.join(pgBin, 'postgres'), 'PostgreSQL'], [path.join(pgBin, 'initdb'), 'initdb'], [path.join(redisBin, 'redis-server'), 'Redis']])
    if (!existsSync(bin)) die(`${name} nicht gefunden (${bin}). Zuerst ausführen: ./scripts/hosting-local-services.sh`);
  mkdirSync(home, { recursive: true });

  // Passwörter einmalig erzeugen (Datei nur für den Besitzer lesbar)
  const secretsFile = path.join(home, 'secrets.json');
  if (!existsSync(secretsFile)) writeFileSync(secretsFile, JSON.stringify({ pg: crypto.randomBytes(24).toString('hex'), redis: crypto.randomBytes(24).toString('hex') }), { mode: 0o600 });
  const secrets = JSON.parse(readFileSync(secretsFile, 'utf8'));

  const pgData = path.join(home, 'pgdata');
  if (!existsSync(path.join(pgData, 'PG_VERSION'))) {
    log('postgres', 'Datenbank wird eingerichtet (einmalig) …');
    const pwFile = path.join(home, '.pgpw');
    writeFileSync(pwFile, secrets.pg, { mode: 0o600 });
    const r = spawnSync(path.join(pgBin, 'initdb'), ['-D', pgData, '-U', 'nexus', '--auth=scram-sha-256', `--pwfile=${pwFile}`, '-E', 'UTF8', '--locale=C'], { stdio: 'inherit' });
    rmSync(pwFile, { force: true });
    if (r.status !== 0) die('initdb ist fehlgeschlagen.');
  }
  const redisData = path.join(home, 'redisdata');
  mkdirSync(redisData, { recursive: true });
  const runDir = path.join(home, 'run');
  mkdirSync(runDir, { recursive: true });

  run({
    name: 'postgres',
    cmd: path.join(pgBin, 'postgres'),
    args: ['-D', pgData, '-p', String(pgPort), '-c', 'listen_addresses=127.0.0.1', '-c', `unix_socket_directories=${runDir}`, '-c', 'shared_buffers=128MB', '-c', 'max_connections=60', '-c', 'fsync=on'],
    cwd: home,
  });
  run({
    name: 'redis',
    cmd: path.join(redisBin, 'redis-server'),
    args: ['--port', String(redisPort), '--bind', '127.0.0.1', '--requirepass', secrets.redis, '--dir', redisData, '--appendonly', 'yes', '--maxmemory-policy', 'noeviction', '--save', '60 1000'],
    cwd: home,
  });
  await waitForPort(pgPort, 'PostgreSQL');
  await waitForPort(redisPort, 'Redis');

  // Datenbank „nexus“ anlegen, falls es sie noch nicht gibt
  const psql = path.join(pgBin, 'psql');
  const pgEnv = { ...process.env, PGPASSWORD: secrets.pg };
  const q = (sql) => spawnSync(psql, ['-h', '127.0.0.1', '-p', String(pgPort), '-U', 'nexus', '-d', 'postgres', '-tAc', sql], { env: pgEnv, encoding: 'utf8' });
  const exists = q("select 1 from pg_database where datname='nexus'");
  if (exists.status !== 0) die(`PostgreSQL nicht erreichbar: ${(exists.stderr || '').trim().slice(0, 200)}`);
  if (!exists.stdout.trim()) {
    const c = q('create database nexus');
    if (c.status !== 0) die(`Datenbank konnte nicht angelegt werden: ${(c.stderr || '').trim().slice(0, 200)}`);
    log('postgres', 'Datenbank „nexus“ angelegt.');
  }
  process.env.DATABASE_URL ||= `postgresql://nexus:${secrets.pg}@127.0.0.1:${pgPort}/nexus?schema=public`;
  process.env.REDIS_URL ||= `redis://:${secrets.redis}@127.0.0.1:${redisPort}`;
}

for (const need of ['DATABASE_URL', 'REDIS_URL', 'AUTH_SECRET', 'DISCORD_TOKEN']) {
  if (!process.env[need]) die(`${need} fehlt (siehe .env.production.example).`);
}

if (process.env.RUN_MIGRATIONS !== 'false') {
  log('migrate', 'Datenbank-Migrationen …');
  const r = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd: path.join(root, 'packages/database'), stdio: 'inherit', env: process.env });
  if (r.status !== 0) die('Migrationen fehlgeschlagen – Start abgebrochen.');
}

const node = process.execPath;
for (const [name, dir, file] of [['api', 'apps/api', 'dist/main.js'], ['worker', 'apps/worker', 'dist/index.js'], ['bot', 'apps/bot', 'dist/index.js']])
  run({ name, cmd: node, args: [file], cwd: path.join(root, dir) });

/** Beenden in Reihenfolge: Anwendung → Redis → PostgreSQL (schneller Shutdown mit SIGINT). */
async function shutdown() {
  if (stopping) return;
  stopping = true;
  log('start', 'Beende alle Dienste …');
  const stop = async (names, signal) => {
    const procs = names.flatMap((n) => (children.has(n) ? [children.get(n).child] : []));
    for (const p of procs) p.kill(signal);
    await Promise.race([Promise.all(procs.map((p) => new Promise((r) => (p.exitCode !== null || p.signalCode ? r() : p.once('exit', r))))), sleep(10_000)]);
  };
  await stop(['bot', 'worker', 'api'], 'SIGTERM');
  await stop(['redis'], 'SIGTERM');
  await stop(['postgres'], 'SIGINT');
  process.exit(0);
}
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => void shutdown());
log('start', `NEXUS läuft: API auf Port ${process.env.API_PORT ?? 3000}${process.env.DASHBOARD_STATIC_DIR ? ' (Dashboard eingebaut)' : ''}, Worker, Bot${local ? ', PostgreSQL und Redis im Container' : ''}.`);
