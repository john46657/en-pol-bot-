import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(20, 'DISCORD_TOKEN missing'),
  /** Optional: Server-ID. Mit Wert werden Slash-Commands sofort (nur dort) registriert, sonst global (dauert bis zu 1 h). */
  DISCORD_GUILD_ID: z.string().regex(/^\d{15,25}$/).optional(),
  API_URL: z.string().url().default('http://localhost:3000'),
  BOT_API_TOKEN: z.string().min(32, 'BOT_API_TOKEN must be at least 32 characters (same value as in the API)'),
  OUTBOX_POLL_SECONDS: z.coerce.number().int().min(2).max(60).default(5),
});
export type BotConfig = z.infer<typeof schema>;

/** Einfacher .env-Parser (KEY=VALUE, # Kommentare, optionale Anführungszeichen). */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Liest eine .env neben bot.js bzw. im Arbeitsverzeichnis; echte Umgebungsvariablen des Panels haben Vorrang. */
export function loadDotEnv(env: NodeJS.ProcessEnv = process.env): void {
  const dirs = [process.cwd(), typeof __dirname === 'string' ? __dirname : undefined].filter(Boolean) as string[];
  for (const d of dirs) {
    const f = path.join(d, '.env');
    if (!existsSync(f)) continue;
    for (const [k, v] of Object.entries(parseDotEnv(readFileSync(f, 'utf8')))) if (env[k] === undefined) env[k] = v;
    return;
  }
}

/** Platzhalter aus der Vorlage (HIER_…) sind keine Werte – klare Fehlermeldung statt kryptischem Discord-Fehler. */
const isPlaceholder = (v: string) => /^HIER_/i.test(v);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const todo = Object.entries(env).filter(([k, v]) => /^(DISCORD_TOKEN|DISCORD_GUILD_ID|BOT_API_TOKEN|API_URL)$/.test(k) && v && isPlaceholder(v)).map(([k]) => k);
  if (todo.length) throw new Error(`Bitte in der .env bzw. im Env-Tab noch ausfüllen: ${todo.join(', ')} (dort steht noch ein Platzhalter "HIER_…").`);
  const r = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!r.success) throw new Error(`Invalid bot configuration:\n${r.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  return r.data;
}
