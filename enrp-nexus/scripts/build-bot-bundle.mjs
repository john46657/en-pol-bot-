#!/usr/bin/env node
/**
 * Baut ein eigenständiges Bot-Paket:  pnpm bundle:bot  →  dist-bot/enrp-nexus-bot.zip
 *  - bot.js          : EINE Datei mit allem (inkl. discord.js) – läuft ohne `npm install`  (node bot.js)
 *  - src/            : kompletter TypeScript-Quellcode des Bots
 *  - package.json    : für Hoster, die Pakete installieren wollen (Start: node dist/index.js bzw. bot.js)
 */
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist-bot');
const dir = path.join(out, 'enrp-nexus-bot');
rmSync(out, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

await build({
  entryPoints: [path.join(root, 'apps/bot/src/index.ts')], bundle: true, platform: 'node', target: 'node22', format: 'cjs', outfile: path.join(dir, 'bot.js'), minify: false,
  // optionale native Beschleuniger von ws/discord.js – nicht nötig, nicht mitbündeln
  external: ['bufferutil', 'utf-8-validate', 'zlib-sync', '@discordjs/opus', 'erlpack'], logLevel: 'warning',
});
cpSync(path.join(root, 'apps/bot/src'), path.join(dir, 'src'), { recursive: true });
const pkg = JSON.parse(readFileSync(path.join(root, 'apps/bot/package.json'), 'utf8'));
writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
  name: 'enrp-nexus-bot', version: pkg.version, private: true, main: 'bot.js', engines: { node: '>=22' },
  scripts: { start: 'node bot.js' }, dependencies: {},
}, null, 2) + '\n');
writeFileSync(path.join(dir, '.env.example'), `# ENRP NEXUS Discord-Bot – Einstellungen (als Umgebungsvariablen im Panel setzen)

# Bot-Token aus dem Discord Developer Portal (Application → Bot → Token)
DISCORD_TOKEN=
# Server-ID (Entwicklermodus an → Rechtsklick auf den Server → ID kopieren). Mit Wert erscheinen die /-Befehle sofort.
DISCORD_GUILD_ID=
# Adresse deines ENRP-NEXUS-Systems (muss vom Bot aus erreichbar sein), ohne "/" am Ende:
API_URL=http://DEINE-IP-ODER-DOMAIN:PORT
# Gemeinsames Geheimnis – MUSS EXAKT dem BOT_API_TOKEN des Systems entsprechen (mind. 32 Zeichen).
# Im Hosting-Paket des Systems steht es in der Datei data/bot-api-token; auf dem VPS in der .env.
BOT_API_TOKEN=
# Wie oft (Sekunden) neue Benachrichtigungen abgeholt werden
OUTBOX_POLL_SECONDS=5
`);
writeFileSync(path.join(dir, 'LIES-MICH.txt'), `ENRP NEXUS – Discord-Bot (eigenständig)
======================================
Wann brauchst du das? Wenn das System (API + Web) schon irgendwo läuft und du NUR den Bot separat hosten willst.
(Wenn du das komplette Hosting-Paket benutzt, startet der Bot dort bereits automatisch mit – dieses Paket brauchst du dann nicht.)

1. Dateien in ein Node.js-Panel (Version 22+) hochladen/entpacken. node_modules / npm install sind NICHT nötig.
2. Startdatei: bot.js   |   Startbefehl: node bot.js
3. Umgebungsvariablen setzen (Vorlage: .env.example): DISCORD_TOKEN, BOT_API_TOKEN, API_URL, optional DISCORD_GUILD_ID.
4. Starten. Erwartet in der Konsole:  "Logged in as …"  und  "… slash commands registered …".
5. Bot muss mit dem Scope "applications.commands" eingeladen sein. Details: docs/discord-bot.md im Projekt.

Quellcode: src/ (TypeScript). Neue Befehle: src/commands/index.ts.
Das System gibt dem Bot nur Rechte, die der verknüpfte Benutzer selbst hat (Verknüpfung per Einmal-Code im Web).
`);
cpSync(path.join(root, 'docs/discord-bot.md'), path.join(dir, 'docs/discord-bot.md'), { recursive: true });
const z = spawnSync('zip', ['-r', '-q', path.join(out, 'enrp-nexus-bot.zip'), 'enrp-nexus-bot'], { cwd: out, stdio: 'inherit' });
if (z.status !== 0) process.exit(1);
console.log(`bot.js: ${(statSync(path.join(dir, 'bot.js')).size / 1e6).toFixed(1)} MB, ZIP: ${(statSync(path.join(out, 'enrp-nexus-bot.zip')).size / 1e6).toFixed(1)} MB\n→ ${path.join(out, 'enrp-nexus-bot.zip')}`);
