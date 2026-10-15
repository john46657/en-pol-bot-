import { describeDiscordError } from '@enrp/shared';
import type { Api } from './api';
import { errorReply, type Reply } from './format';
import type { InteractionDef } from './commands/types';
import { mapError } from './commands/errors';

/** Discord-JSON einer Nachricht, wie die API sie fertig liefert (`toDiscordPayload` in @enrp/shared). */
export interface MbPayload { content?: string; embeds: unknown[]; components: unknown[]; allowed_mentions: { parse: ('users' | 'roles' | 'everyone')[] } }
interface Started { proceed: boolean; guildId?: string | null; channelId?: string | null; items?: { position: number; payload: MbPayload }[] }

/** Discord-Seite des Versands (im Bot mit discord.js, in Tests ersetzbar). */
export interface MbDiscord {
  /** fehlende Bot-Rechte im Kanal (leer = alles da); wirft, wenn der Kanal nicht zum Server gehört oder kein Textkanal ist */
  missingPerms(guildId: string | null, channelId: string, payloads: MbPayload[]): Promise<string[]>;
  send(channelId: string, payload: MbPayload): Promise<{ id: string }>;
}

/** Discord-/discord.js-Fehler → verständlicher Text (ohne Token). */
export function discordErrorText(e: unknown): string {
  const x = e as { status?: unknown; code?: unknown; message?: unknown; name?: unknown };
  if (x?.name === 'RateLimitError') return describeDiscordError({ status: 429 });
  return describeDiscordError({ status: typeof x?.status === 'number' ? x.status : undefined, code: typeof x?.code === 'number' ? x.code : undefined, message: typeof x?.message === 'string' ? x.message : String(e) });
}

/** Ergebnis an die API melden – bei kurzer Störung bis zu 3 Versuche (sonst bliebe der Status falsch). */
async function report(api: Api, path: string, body: unknown, log: (m: string) => void) {
  for (let i = 1; i <= 3; i++) {
    try { await api.service('POST', path, body); return; } catch (e) {
      if (i === 3) log(`message builder: could not report ${path}: ${e instanceof Error ? e.message : e}`);
      else await new Promise((r) => setTimeout(r, 500 * i));
    }
  }
}

/**
 * Versandauftrag aus dem Dashboard: Nachrichten in Reihenfolge einzeln senden, Ergebnis je Nachricht melden.
 * Schlägt eine fehl, werden die folgenden nicht gesendet (Reihenfolge bleibt erhalten). Discord-Rate-Limits wartet discord.js ab.
 * Die API gibt den Auftrag nur einmal heraus (`proceed`), damit eine Wiederholung nie doppelt sendet.
 */
export async function runMbSend(api: Api, sendId: string, discord: MbDiscord, log: (m: string) => void = console.log): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(sendId)) throw new Error('invalid send id');
  const s = await api.service<Started>('POST', `/bot/message-builder/sends/${sendId}/start`);
  if (!s.proceed || !s.items) return;
  const base = `/bot/message-builder/sends/${sendId}`;
  const channelId = s.channelId ?? '';
  let stop: string | null = null;
  try {
    const miss = await discord.missingPerms(s.guildId ?? null, channelId, s.items.map((i) => i.payload));
    if (miss.length) stop = `Dem Bot fehlen in diesem Kanal Rechte: ${miss.join(', ')}.`;
  } catch (e) { stop = e instanceof Error ? e.message : String(e); }
  if (stop) {
    await report(api, `${base}/items/${s.items[0]?.position ?? 0}`, { ok: false, error: stop }, log);
    await report(api, `${base}/finish`, { error: 'Nicht gesendet.' }, log);
    return;
  }
  for (const item of s.items) {
    try {
      const msg = await discord.send(channelId, item.payload);
      await report(api, `${base}/items/${item.position}`, { ok: true, messageId: msg.id }, log);
    } catch (e) {
      const error = discordErrorText(e);
      log(`message builder ${sendId}: message ${item.position + 1} failed: ${error}`);
      await report(api, `${base}/items/${item.position}`, { ok: false, error }, log);
      stop = 'Nicht gesendet, weil eine vorherige Nachricht fehlschlug.';
      break;
    }
  }
  await report(api, `${base}/finish`, stop ? { error: stop } : {}, log);
}

type Resolved = { type: 'reply'; text: string } | { type: 'role'; roleId: string; mode: 'toggle' | 'add' | 'remove' } | { type: 'gone' };

/** Buttons/Menüs aus dem Message Builder (`mb:<aktion>`): Antwort nur für die Person oder Rolle geben/nehmen. */
export const MB_INTERACTION: InteractionDef = {
  prefix: 'mb',
  async run(c): Promise<Reply> {
    const [actionId] = c.args;
    if (!/^[0-9a-f-]{36}$/.test(actionId ?? '')) return errorReply('Unbekannte Aktion.');
    try {
      const a = await c.api.service<Resolved>('POST', '/bot/message-builder/interactions', { actionId, guildId: c.guildId ?? null, discordId: c.discordId, ...(c.values?.[0] ? { value: c.values[0] } : {}) });
      if (a.type === 'reply') return { ephemeral: true, content: a.text.slice(0, 2000) };
      if (a.type === 'gone') return errorReply('Diese Aktion ist nicht mehr verfügbar.');
      if (!c.guildId || !c.discord?.setRole) return errorReply('Das geht nur auf dem Discord-Server.');
      try {
        const r = await c.discord.setRole(c.guildId, c.discordId, a.roleId, a.mode);
        const text = { added: `✅ Du hast jetzt die Rolle <@&${a.roleId}>.`, removed: `✅ Die Rolle <@&${a.roleId}> wurde dir entfernt.`, unchanged: `ℹ️ Keine Änderung an <@&${a.roleId}>.` }[r];
        return { ephemeral: true, content: text };
      } catch (e) {
        return errorReply(`Die Rolle konnte nicht geändert werden: ${discordErrorText(e)} (Die Bot-Rolle muss über dieser Rolle stehen und „Rollen verwalten“ haben.)`);
      }
    } catch (e) { return mapError(e); }
  },
};
