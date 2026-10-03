'use strict';
/**
 * ENRP NEXUS – Start für Panel-Hosting (z. B. bot-hosting.net): ein Prozess-Start für API + Web-Oberfläche (+ Discord-Bot).
 *   1) liest .env (falls vorhanden)  2) erzeugt/merkt sich Geheimnisse  3) Datenbank-Migrationen  4) erster Admin  5) startet API (+ Bot)
 */
const { spawn, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const log = (m) => console.log(`[nexus] ${m}`);
const die = (m) => { console.error(`[nexus] FEHLER: ${m}`); process.exit(1); };

// .env laden (echte Umgebungsvariablen des Panels haben Vorrang)
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
for (const [k, v] of Object.entries(process.env)) if (v === '') delete process.env[k];

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || process.env.SERVER_PORT || '3000';
process.env.WEB_DIST = process.env.WEB_DIST || path.join(root, 'web');

if (/HIER_/i.test(process.env.DATABASE_URL || '')) die('DATABASE_URL ist noch nicht ausgefüllt (Platzhalter "HIER_…"). Trage die PostgreSQL-Verbindung ein.');
if (!process.env.DATABASE_URL) die('DATABASE_URL fehlt. Trage die PostgreSQL-Verbindung aus deinem Panel ein (siehe .env.example).');
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL)) die('DATABASE_URL muss mit postgresql:// beginnen (es wird PostgreSQL benötigt, kein MySQL).');

// Geheimnisse, die nicht gesetzt sind, einmalig erzeugen und im data-Ordner behalten (überleben Neustarts/Updates)
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });
function persisted(name, bytes) {
  const f = path.join(dataDir, name);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const v = crypto.randomBytes(bytes).toString('hex');
  fs.writeFileSync(f, v, { mode: 0o600 });
  return v;
}
process.env.SESSION_SECRET = process.env.SESSION_SECRET || persisted('session-secret', 32);
if (process.env.DISCORD_TOKEN) process.env.BOT_API_TOKEN = process.env.BOT_API_TOKEN || persisted('bot-api-token', 32);
process.env.STORAGE_DIR = process.env.STORAGE_DIR || path.join(dataDir, 'uploads');

if (!process.env.COOKIE_SECURE) {
  process.env.COOKIE_SECURE = 'false';
  log('WARNUNG: COOKIE_SECURE ist nicht gesetzt → es wird OHNE HTTPS gearbeitet. Passwörter und Sitzungen laufen dann unverschlüsselt durchs Internet.');
  log('         Nutze HTTPS (z. B. eigene Domain über Cloudflare) und setze dann COOKIE_SECURE=true. Siehe docs/hosting-bot-hosting.md.');
}

function runNode(label, args) {
  const r = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: 'inherit' });
  if (r.status !== 0) die(`${label} ist fehlgeschlagen (Exit ${r.status}). Prüfe DATABASE_URL und die Logs oben.`);
}

log('Datenbank-Migrationen …');
runNode('prisma migrate deploy', [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(root, 'api/prisma/schema.prisma')]);
log('Erster Administrator (nur falls noch kein Benutzer existiert) …');
runNode('seed', [path.join(root, 'api/dist/seed/run.js')]);

const children = new Set();
let stopping = false;
function start(name, script, extraEnv, restart) {
  const p = spawn(process.execPath, [path.join(root, script)], { cwd: root, env: { ...process.env, ...extraEnv }, stdio: 'inherit' });
  children.add(p);
  p.on('exit', (code) => {
    children.delete(p);
    if (stopping) return;
    log(`${name} beendet (Exit ${code}).`);
    if (restart) setTimeout(() => start(name, script, extraEnv, restart), 10_000);
    else shutdown(code || 1); // API weg → alles beenden, das Panel startet neu
  });
}
function shutdown(code = 0) {
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGTERM', () => shutdown(0));
process.on('SIGINT', () => shutdown(0));

log(`Starte API + Web auf Port ${process.env.PORT} …`);
start('API', 'api/dist/main.js', {}, false);
if (process.env.DISCORD_TOKEN) {
  log('Starte Discord-Bot …');
  start('Bot', 'bot/dist/index.js', { API_URL: process.env.API_URL || `http://127.0.0.1:${process.env.PORT}` }, true);
} else {
  log('Discord-Bot nicht gestartet (DISCORD_TOKEN nicht gesetzt).');
}
