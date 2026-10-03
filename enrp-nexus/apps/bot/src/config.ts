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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const r = schema.safeParse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')));
  if (!r.success) throw new Error(`Invalid bot configuration:\n${r.error.issues.map((i) => ` - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  return r.data;
}
