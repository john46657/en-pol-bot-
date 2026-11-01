import { describeDiscordError } from '@enrp/shared';
import type { Api } from './api';
import { errorReply, type Reply } from './format';
import type { InteractionDef } from './commands/types';
import { mapError } from './commands/errors';

/** Discord-JSON einer Nachricht, wie die API sie fertig liefert (`toDiscordPayload` in @enrp/shared). */
export interface MbPayload { content?: string; embeds: unknown[]; components: unknown[]; allowed_mentions: { parse: ('users' | 'roles' | 'everyone')[] } }
interface Started {
  proceed: boolean; kind?: 'SEND' | 'EDIT'; guildId?: string | null; channelId?: string | null;
  /** bestehender Thread/Forum-Beitrag bzw. Titel eines neuen Forum-Beitrags */
  threadId?: string | null; threadName?: string | null;
  /** EDIT: zu bearbeitende Nachricht */
  messageId?: string;
  items?: { position: number; payload: MbPayload }[];
}

/** Ziel innerhalb des Kanals: bestehender Thread oder neuer Forum-Beitrag. */
export interface MbTarget { threadId?: string | null; threadName?: string | null; edit?: boolean }

/** Discord-Seite des Versands (im Bot mit discord.js, in Tests ersetzbar). */
export interface MbDiscord {
  /**
   * fehlende Bot-Rechte (leer = alles da); wirft, wenn der Kanal nicht zum Server gehört, kein passender Kanal ist oder
   * der Thread nicht zum Kanal gehört
   */
  missingPerms(guildId: string | null, channelId: string, payloads: MbPayload[], target?: MbTarget): Promise<string[]>;
  send(channelId: string, payload: MbPayload): Promise<{ id: string }>;
  /** Forum: neuen Beitrag mit der ersten Nachricht eröffnen → ID der Nachricht und des Beitrags (Threads) */
  createPost?(forumId: string, name: string, payload: MbPayload): Promise<{ id: string; channelId: string }>;
  /** eigene Nachricht des Bots bearbeiten (wirft, wenn sie nicht vom Bot stammt) */
  edit?(channelId: string, messageId: string, payload: MbPayload): Promise<{ id: string }>;
}

/** Nachricht für „Nachricht per Link laden“. */
export interface MbFetched {
  author: 'bot' | 'webhook' | 'other'; webhookId?: string; channelId: string; parentId: string | null; channelName?: string;
  message: { content: string; embeds: unknown[]; components: unknown[] };
}
export interface MbFetchDiscord { fetch(guildId: string | null, channelId: string, messageId: string): Promise<MbFetched> }

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
  const edit = s.kind === 'EDIT';
  let stop: string | null = null;
  try {
    if (edit && (!s.messageId || !discord.edit)) throw new Error('Bearbeiten wird von dieser Bot-Version nicht unterstützt.');
    if (s.threadName && !discord.createPost) throw new Error('Forum-Beiträge werden von dieser Bot-Version nicht unterstützt.');
    const miss = await discord.missingPerms(s.guildId ?? null, channelId, s.items.map((i) => i.payload), { threadId: s.threadId ?? null, threadName: s.threadName ?? null, edit });
    if (miss.length) stop = `Dem Bot fehlen in diesem Kanal Rechte: ${miss.join(', ')}.`;
  } catch (e) { stop = e instanceof Error ? e.message : String(e); }
  if (stop) {
    await report(api, `${base}/items/${s.items[0]?.position ?? 0}`, { ok: false, error: stop }, log);
    await report(api, `${base}/finish`, { error: 'Nicht gesendet.' }, log);
    return;
  }
  // Ziel: bearbeitete Nachricht liegt in channelId (bei Threads ist das die Thread-ID); sonst Thread bzw. neuer Forum-Beitrag
  let where = edit ? channelId : s.threadId || channelId;
  for (const item of s.items) {
    try {
      let msg: { id: string };
      if (edit) msg = await discord.edit!(where, s.messageId!, item.payload);
      else if (s.threadName && where === channelId) {
        const post = await discord.createPost!(channelId, s.threadName, item.payload);
        where = post.channelId;
        msg = post;
      } else msg = await discord.send(where, item.payload);
      await report(api, `${base}/items/${item.position}`, { ok: true, messageId: msg.id, ...(where !== channelId ? { channelId: where } : {}) }, log);
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

/** Nachricht per Link laden: Inhalt und Absender (Bot, Webhook, fremd) an die API melden. */
export async function runMbFetch(api: Api, id: string, discord: MbFetchDiscord, log: (m: string) => void = console.log): Promise<void> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('invalid message id');
  const t = await api.service<{ proceed: boolean; guildId?: string | null; channelId?: string; messageId?: string }>('GET', `/bot/message-builder/messages/${id}`);
  if (!t.proceed || !t.channelId || !t.messageId) return;
  let body: Record<string, unknown>;
  try {
    const f = await discord.fetch(t.guildId ?? null, t.channelId, t.messageId);
    body = { ok: true, author: f.author, ...(f.webhookId ? { webhookId: f.webhookId } : {}), channelId: f.channelId, parentId: f.parentId, ...(f.channelName ? { channelName: f.channelName.slice(0, 100) } : {}), message: f.message };
  } catch (e) {
    body = { ok: false, error: e instanceof Error && !('status' in e) ? e.message.slice(0, 500) : discordErrorText(e) };
  }
  await report(api, `/bot/message-builder/messages/${id}/loaded`, body, log);
}

type Action = { type: 'reply'; text: string } | { type: 'role'; roleId: string; mode: 'toggle' | 'add' | 'remove' };
type Resolved = Action | { type: 'gone' } | { type: 'multi'; actions: Action[] };

/** Buttons/Menüs aus dem Message Builder (`mb:<aktion>`): Antwort nur für die Person oder Rolle geben/nehmen. */
export const MB_INTERACTION: InteractionDef = {
  prefix: 'mb',
  async run(c): Promise<Reply> {
    const [actionId] = c.args;
    if (!/^[0-9a-f-]{36}$/.test(actionId ?? '')) return errorReply('Unbekannte Aktion.');
    try {
      // Auswahlmenü: alle gewählten Werte (Mehrfachauswahl); ein Wert zusätzlich als `value` (ältere API-Versionen)
      const values = c.values ?? [];
      const sel = c.values !== undefined ? { values, ...(values[0] ? { value: values[0] } : {}) } : {};
      const a = await c.api.service<Resolved>('POST', '/bot/message-builder/interactions', { actionId, guildId: c.guildId ?? null, discordId: c.discordId, ...sel });
      if (a.type === 'gone') return errorReply('Diese Aktion ist nicht mehr verfügbar.');
      const list = a.type === 'multi' ? a.actions : [a];
      const out: string[] = [];
      for (const x of list) {
        if (x.type === 'reply') { out.push(x.text); continue; }
        if (!c.guildId || !c.discord?.setRole) return errorReply('Das geht nur auf dem Discord-Server.');
        try {
          const r = await c.discord.setRole(c.guildId, c.discordId, x.roleId, x.mode);
          out.push({ added: `✅ Du hast jetzt die Rolle <@&${x.roleId}>.`, removed: `✅ Die Rolle <@&${x.roleId}> wurde dir entfernt.`, unchanged: `ℹ️ Keine Änderung an <@&${x.roleId}>.` }[r]);
        } catch (e) {
          const err = `Die Rolle konnte nicht geändert werden: ${discordErrorText(e)} (Die Bot-Rolle muss über dieser Rolle stehen und „Rollen verwalten“ haben.)`;
          if (list.length === 1) return errorReply(err);
          out.push(`❌ ${err}`);
        }
      }
      return { ephemeral: true, content: out.join('\n\n').slice(0, 2000) };
    } catch (e) { return mapError(e); }
  },
};
