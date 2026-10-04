#!/usr/bin/env node
/**
 * Startet API (inkl. Dashboard), Bot und Worker in EINEM Container – für Hosting mit nur einem Startbefehl
 * (z. B. bot-hosting.net). Vorher werden fehlende Datenbank-Migrationen eingespielt (`RUN_MIGRATIONS=false` schaltet das ab).
 * Stürzt ein Dienst ab, wird er mit wachsender Wartezeit neu gestartet; SIGTERM/SIGINT beenden alle sauber.
 * Umgebung: .env.production (falls vorhanden) bzw. die Variablen des Hosters.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
for (const need of ['DATABASE_URL', 'REDIS_URL', 'AUTH_SECRET', 'DISCORD_TOKEN']) {
  if (!process.env[need]) {
    log('start', `FEHLER: ${need} fehlt (siehe .env.production.example).`);
    process.exit(1);
  }
}

if (process.env.RUN_MIGRATIONS !== 'false') {
  log('migrate', 'Datenbank-Migrationen …');
  const r = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { cwd: path.join(root, 'packages/database'), stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    log('migrate', 'FEHLER bei den Migrationen – Start abgebrochen.');
    process.exit(1);
  }
}

const SERVICES = [
  { name: 'api', dir: 'apps/api', file: 'dist/main.js' },
  { name: 'worker', dir: 'apps/worker', file: 'dist/index.js' },
  { name: 'bot', dir: 'apps/bot', file: 'dist/index.js' },
];
let stopping = false;
const children = new Map();

function run(svc, attempt = 0) {
  const started = Date.now();
  const child = spawn(process.execPath, [svc.file], { cwd: path.join(root, svc.dir), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.set(svc.name, child);
  const pipe = (s) => s.on('data', (d) => String(d).split('\n').filter(Boolean).forEach((l) => log(svc.name, l)));
  pipe(child.stdout);
  pipe(child.stderr);
  child.on('exit', (code, signal) => {
    children.delete(svc.name);
    if (stopping) return;
    // lief der Dienst länger als 60 s, beginnt die Wartezeit von vorn
    const next = Date.now() - started > 60_000 ? 0 : attempt + 1;
    const wait = Math.min(2 ** next, 60) * 1000;
    log(svc.name, `beendet (${signal ?? code}) – Neustart in ${wait / 1000} s`);
    setTimeout(() => !stopping && run(svc, next), wait);
  });
}

for (const s of ['SIGTERM', 'SIGINT']) {
  process.on(s, () => {
    stopping = true;
    log('start', 'Beende alle Dienste …');
    for (const c of children.values()) c.kill('SIGTERM');
    setTimeout(() => process.exit(0), 8000).unref();
  });
}
SERVICES.forEach((s) => run(s));
log('start', `NEXUS läuft: API auf Port ${process.env.API_PORT ?? 3000}${process.env.DASHBOARD_STATIC_DIR ? ' (Dashboard eingebaut)' : ''}, Worker, Bot.`);
