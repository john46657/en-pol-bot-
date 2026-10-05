'use strict';
/**
 * EN Polizei – Panel-Start direkt aus dem GitHub-Branch `main` (z. B. bot-hosting.net: Startdatei start.js).
 * Startet das fertig gebaute Paket aus ./hosting (API + Web + Discord-Bot; erzeugt mit `pnpm bundle:hosting` – nicht von Hand ändern).
 *   1) .env im Hauptordner laden  2) Pakete in ./hosting installieren (nur wenn nötig)  3) Prisma-Client erzeugen  4) hosting/start.js starten
 */
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'hosting');
const log = (m) => console.log(`[nexus] ${m}`);
const die = (m) => { console.error(`[nexus] FEHLER: ${m}`); process.exit(1); };
if (!fs.existsSync(path.join(dir, 'start.js'))) die('Der Ordner hosting/ fehlt – bitte im Panel unter GitHub erneut „Pull“ ausführen.');

// .env im Hauptordner (Variablen aus dem Panel haben Vorrang)
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// npm neben dem laufenden Node (auch für das von bot.py geladene Node), sonst aus dem PATH
const npmLocal = path.join(path.dirname(process.execPath), 'npm');
const npm = fs.existsSync(npmLocal) ? npmLocal : 'npm';
const run = (label, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: dir, env: process.env, stdio: 'inherit' });
  if (r.status !== 0) die(`${label} ist fehlgeschlagen (Exit ${r.status ?? r.error?.message}). Zu wenig Speicher? → im Panel „Adjust resources“.`);
};

// Pakete nur neu installieren, wenn sich hosting/package.json geändert hat
const stamp = path.join(dir, 'node_modules', '.en-polizei-stamp');
const want = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'package.json'))).digest('hex');
const have = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : '';
if (have !== want) {
  log('Installiere Pakete für API + Web + Bot (beim ersten Start einige Minuten) …');
  run('npm install', npm, ['install', '--omit=dev', '--no-fund', '--no-audit']);
  // Neuere npm-Versionen blockieren Installationsskripte – den Prisma-Client daher immer selbst erzeugen
  log('Erzeuge Prisma-Client …');
  run('prisma generate', process.execPath, [path.join(dir, 'node_modules/prisma/build/index.js'), 'generate', '--schema', path.join(dir, 'api/prisma/schema.prisma')]);
  fs.writeFileSync(stamp, want);
}

require(path.join(dir, 'start.js'));
