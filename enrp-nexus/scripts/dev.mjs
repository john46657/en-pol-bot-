#!/usr/bin/env node
/**
 * Startet alles lokal mit EINEM Befehl:  pnpm dev:all
 * eingebettetes PostgreSQL → Migrationen → Seed → API → Web (+ Demo-Daten beim ersten Start)
 * Nur für Entwicklung/Test – nicht für Produktion.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const DB_PORT = 54329, API_PORT = 3000, WEB_PORT = 5173;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin-Demo-123456';
const botEnabled = !!process.env.DISCORD_TOKEN; // Bot nur starten, wenn ein Discord-Token vorhanden ist
const BOT_API_TOKEN = process.env.BOT_API_TOKEN ?? 'dev-only-bot-token-0123456789abcdefghij';
const env = { ...process.env, ...(botEnabled ? { BOT_API_TOKEN, API_URL: `http://localhost:${API_PORT}` } : {}), DATABASE_URL: `postgresql://enrp:enrp@localhost:${DB_PORT}/enrp`, ADMIN_PASSWORD, WEB_ORIGIN: `http://localhost:${WEB_PORT}`, NODE_ENV: 'development', LOGIN_RATE_LIMIT: '200' };
const children = [];
const color = { db: 36, api: 32, web: 35, bot: 34 };

function run(cmd, args, label, opts = {}) {
  const p = spawn(cmd, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const tag = `\x1b[${color[label] ?? 33}m[${label}]\x1b[0m`;
  const noise = /RouterExplorer|RoutesResolver|InstanceLoader|\[HTTP\]|checkpoint|WAL file|LOG:  /;
  for (const s of [p.stdout, p.stderr]) s.on('data', (d) => String(d).split('\n').filter((l) => l.trim() && !noise.test(l)).forEach((l) => console.log(`${tag} ${l}`)));
  children.push(p);
  return p;
}
function runSync(cmd, args, label) {
  const r = spawnSync(cmd, args, { cwd: root, env, encoding: 'utf8' });
  if (r.status !== 0) { console.error(`[${label}] failed\n${r.stdout}\n${r.stderr}`); shutdown(1); }
  return r;
}
const waitPort = (port, ms = 90_000) => new Promise((res, rej) => {
  const start = Date.now();
  const tryOnce = () => { const s = net.connect(port, 'localhost'); s.on('connect', () => { s.destroy(); res(); }); s.on('error', () => { s.destroy(); Date.now() - start > ms ? rej(new Error(`port ${port} timeout`)) : setTimeout(tryOnce, 400); }); };
  tryOnce();
});
function shutdown(code = 0) { for (const c of children) c.kill('SIGTERM'); setTimeout(() => process.exit(code), 500); }
process.on('SIGINT', () => shutdown(0)); process.on('SIGTERM', () => shutdown(0));

console.log('ENRP NEXUS — local dev environment');
if (!existsSync(path.join(root, 'node_modules'))) runSync('pnpm', ['install'], 'setup');
writeFileSync(path.join(root, 'apps/api/.env'), `DATABASE_URL=${env.DATABASE_URL}\n`);
runSync('pnpm', ['--filter', '@enrp/shared', 'build'], 'build');

run('pnpm', ['--filter', '@enrp/api', 'dev:db'], 'db');
await waitPort(DB_PORT);
runSync('pnpm', ['--filter', '@enrp/api', 'exec', 'prisma', 'migrate', 'deploy'], 'migrate');
runSync('pnpm', ['--filter', '@enrp/api', 'db:seed'], 'seed');
run('pnpm', ['--filter', '@enrp/api', 'dev'], 'api');
run('pnpm', ['--filter', '@enrp/web', 'dev'], 'web');
if (botEnabled) run('pnpm', ['--filter', '@enrp/bot', 'dev'], 'bot');
await waitPort(API_PORT); await waitPort(WEB_PORT);
await new Promise((r) => setTimeout(r, 1500));

const demo = spawnSync('node', ['scripts/demo-data.mjs'], { cwd: root, env: { ...env, API_URL: `http://localhost:${API_PORT}` }, encoding: 'utf8' });
console.log((demo.stdout || '').trim() || (demo.stderr || '').trim());
console.log(botEnabled ? '  Discord bot: started (DISCORD_TOKEN found)' : '  Discord bot: not started (set DISCORD_TOKEN to enable, see docs/discord-bot.md)');
console.log(`\n  Web:     http://localhost:${WEB_PORT}\n  API:     http://localhost:${API_PORT}/api/docs\n  Login:   see table above (admin / ${ADMIN_PASSWORD})\n  Stop:    Ctrl+C\n`);
