import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { ApplicationService } from './service.js';
import { createRoblox } from './roblox.js';
import { createClient, wireBot } from './discord/bot.js';
import { createDiscordAdapter } from './discord/adapter.js';
import { DmFlow } from './discord/flow.js';
import { createApplyLink, createWebServer } from './web/server.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** `.env` im Projektordner einlesen (ohne Zusatzpaket); echte Umgebungsvariablen haben Vorrang. */
function loadDotEnv(file = path.join(root, '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function loadConfig(env = process.env) {
  const missing = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'PUBLIC_URL', 'SESSION_SECRET'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Fehlende Einstellungen in .env: ${missing.join(', ')} (Vorlage: .env.example)`);
  if (env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET muss mindestens 32 Zeichen lang sein.');
  return {
    token: env.DISCORD_TOKEN, clientId: env.DISCORD_CLIENT_ID, clientSecret: env.DISCORD_CLIENT_SECRET,
    publicUrl: env.PUBLIC_URL.replace(/\/+$/, ''), secret: env.SESSION_SECRET,
    port: Number(env.PORT || env.SERVER_PORT || 3000),
    dataDir: path.resolve(root, env.DATA_DIR || './data'),
    membersIntent: env.MEMBERS_INTENT === 'true',
    roblox: env.ROBLOX_LOOKUP !== 'off',
    timeZone: env.TIMEZONE || 'Europe/Berlin',
  };
}

const log = { info: (...a) => console.log(new Date().toISOString(), ...a), error: (...a) => console.error(new Date().toISOString(), ...a) };

async function main() {
  loadDotEnv();
  const cfg = loadConfig();
  const store = new Store(cfg.dataDir);
  const roblox = createRoblox({ enabled: cfg.roblox });
  const client = createClient({ membersIntent: cfg.membersIntent });
  const discord = createDiscordAdapter(client, { store, publicUrl: cfg.publicUrl, log });
  const service = new ApplicationService({ store, discord, roblox, log });
  const flow = new DmFlow({ service, store, roblox, send: (id, p) => discord.sendDm(id, p), webLink: createApplyLink({ secret: cfg.secret, publicUrl: cfg.publicUrl }), log });
  // Bot-Neustart: laufende DM-Bewerbungen sind weg – also auch aus „in Bearbeitung“
  store.data.progress = store.data.progress.filter((p) => p.source === 'WEB');
  wireBot(client, { service, store, flow, publicUrl: cfg.publicUrl, log });

  const web = createWebServer({ store, service, discord, secret: cfg.secret, publicUrl: cfg.publicUrl, oauth: { clientId: cfg.clientId, clientSecret: cfg.clientSecret }, timeZone: cfg.timeZone, log });
  web.listen(cfg.port, () => log.info(`Dashboard: ${cfg.publicUrl} (Port ${cfg.port})`));
  await client.login(cfg.token);

  const stop = async () => { log.info('Beenden …'); await store.flush().catch(() => undefined); client.destroy(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
