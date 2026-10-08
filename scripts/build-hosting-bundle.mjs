#!/usr/bin/env node
/**
 * Baut ein ZIP für Panel-Hosting (bot-hosting.net o. Ä.):  pnpm bundle:hosting  →  dist-hosting/en-polizei-hosting.zip
 * Enthält vorkompilierte API, Web-Oberfläche und Bot. node_modules kommen NICHT mit (Linux-Binaries!) – das Panel führt `npm install` aus.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist-hosting');
const bundle = path.join(out, 'bundle');
const sh = (cmd, args, cwd = root) => { const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' }); if (r.status !== 0) { console.error(`fehlgeschlagen: ${cmd} ${args.join(' ')}`); process.exit(1); } };
const json = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

console.log('==> build');
sh('pnpm', ['build']);

rmSync(out, { recursive: true, force: true });
mkdirSync(bundle, { recursive: true });
const copy = (from, to) => cpSync(path.join(root, from), path.join(bundle, to), { recursive: true, filter: (src) => !src.endsWith('.map') });

copy('apps/api/dist', 'api/dist');
copy('apps/api/prisma/schema.prisma', 'api/prisma/schema.prisma');
copy('apps/api/prisma/migrations', 'api/prisma/migrations');
copy('apps/web/dist', 'web');
copy('apps/bot/dist', 'bot/dist');
copy('packages/shared/dist', 'packages/shared/dist');
const sharedPkg = json('packages/shared/package.json');
writeFileSync(path.join(bundle, 'packages/shared/package.json'), JSON.stringify({ name: sharedPkg.name, version: sharedPkg.version, main: sharedPkg.main, module: sharedPkg.module, types: sharedPkg.types, exports: sharedPkg.exports }, null, 2));
copy('scripts/hosting/start.js', 'start.js');
copy('scripts/hosting/env.example', '.env.example');
copy('scripts/hosting/bot.py', 'bot.py'); // Starter für Panels, die nur "python3 bot.py" können
copy('docs/hosting-bot-hosting.md', 'docs/hosting-bot-hosting.md');
copy('docs/discord-bot.md', 'docs/discord-bot.md');

const api = json('apps/api/package.json'), bot = json('apps/bot/package.json');
const deps = { ...bot.dependencies, ...api.dependencies, '@enrp/shared': 'file:./packages/shared' };
const prisma = deps.prisma;
writeFileSync(path.join(bundle, 'package.json'), JSON.stringify({
  name: 'en-polizei-hosting', version: json('package.json').version, private: true, main: 'start.js', engines: { node: '>=22' },
  scripts: { start: 'node start.js', postinstall: `prisma generate --schema api/prisma/schema.prisma` },
  dependencies: Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + '\n');
void prisma;

writeFileSync(path.join(bundle, 'LIES-MICH.txt'), `EN Polizei – Hosting-Paket
=========================
1. Alle Dateien (nicht den Ordner selbst) in dein Panel hochladen und entpacken.
2. Startdatei:  start.js   |   Startbefehl:  node start.js   (oder: npm start)
   Falls das Panel nur Python kann ("python3 bot.py"): die mitgelieferte bot.py lädt einmalig Node.js und startet start.js.
   (Dann muss 'npm install' trotzdem laufen – im Panel unter "Packages"/Shell:  .node/bin/npm install  – oder besser: auf Node.js umstellen.)
3. Umgebungsvariablen setzen (mindestens DATABASE_URL) – Vorlage: .env.example
4. Server starten. Beim ersten Start installiert das Panel die Pakete (npm install, kann einige Minuten dauern).
5. In der Konsole erscheint "Starte API + Web auf Port …" und ggf. das Admin-Passwort (EINMALIG).
6. Seite öffnen: http://<deine-IP>:<dein-Port>   → Anmeldung als "admin".
Komplette Anleitung: docs/hosting-bot-hosting.md (liegt in diesem Paket). Discord-Bot: docs/discord-bot.md.
`);

// Größe + ZIP
const size = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? size(path.join(d, e.name)) : statSync(path.join(d, e.name)).size), 0);
sh('zip', ['-r', '-q', path.join(out, 'en-polizei-hosting.zip'), '.'], bundle);
console.log(`\nBundle: ${(size(bundle) / 1e6).toFixed(1)} MB unkomprimiert, ZIP: ${(statSync(path.join(out, 'en-polizei-hosting.zip')).size / 1e6).toFixed(1)} MB`);
console.log(`→ ${path.join(out, 'en-polizei-hosting.zip')}`);
if (!existsSync(path.join(bundle, 'api/dist/main.js'))) { console.error('api/dist/main.js fehlt'); process.exit(1); }

// Auch als Ordner hosting/ ins Repo legen: Panels, die `main` von GitHub holen, starten es über die start.js im Hauptordner
const repoCopy = path.join(root, 'hosting');
rmSync(repoCopy, { recursive: true, force: true });
cpSync(bundle, repoCopy, { recursive: true, filter: (src) => !src.endsWith('.zip') && path.basename(src) !== 'bot.py' });
console.log(`→ ${repoCopy} (für Start aus main: node start.js)`);
