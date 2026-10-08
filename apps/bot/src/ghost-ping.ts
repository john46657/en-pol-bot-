import type { Api } from './api';

/** Gelöschte Nachricht, so wie der Bot sie aus dem Cache kennt. */
export interface DeletedMessage {
  guildId: string; channelId: string; authorId: string; authorBot: boolean; content: string; createdAt: Date;
  /** erwähnte Benutzer (ohne Rollen/@everyone) */
  mentions: { id: string; bot: boolean }[];
}
export interface GhostPingActions { post(channelId: string, m: { content: string; mentionUserIds: string[] }): Promise<void> }

/** Nur frisch gelöschte Nachrichten zählen – wer eine alte Nachricht aufräumt, „ghost-pingt“ niemanden. */
export const GHOST_PING_WINDOW_MS = 15 * 60_000;
const CACHE_MS = 60_000;

/** Wer wurde geghost-pinged? Erwähnte Personen ohne Bots und ohne den Absender selbst. */
export function ghostPingTargets(m: DeletedMessage, now = Date.now()): string[] {
  if (m.authorBot || now - m.createdAt.getTime() > GHOST_PING_WINDOW_MS) return [];
  return [...new Set(m.mentions.filter((u) => !u.bot && u.id !== m.authorId).map((u) => u.id))];
}

/** Text wie beim alten Bot: „@Person, Da war jemand sehr böse ! @Absender hat dich geghost-pinged mit dieser Nachricht !: "…"“. */
export function ghostPingText(m: DeletedMessage, targets: string[]): string {
  // @everyone/@here entschärfen; ohne Message-Content-Intent ist der Inhalt leer → die Erwähnungen zeigen
  const raw = m.content.trim() || targets.map((t) => `<@${t}>`).join(' ');
  const quoted = raw.replace(/@(everyone|here)/g, '@​$1').slice(0, 1500);
  return `${targets.map((t) => `<@${t}>`).join(', ')},\nDa war jemand sehr böse ! <@${m.authorId}> hat ${targets.length > 1 ? 'euch' : 'dich'} geghost-pinged mit dieser Nachricht !: "${quoted}"`;
}

/** Ghost-Ping-Meldung: an/aus im Dashboard (Einstellungen → Discord-Bot), Standard an. */
export function createGhostPing(api: Api, actions: GhostPingActions, log: (m: string) => void = console.error) {
  let cached: { at: number; enabled: boolean } | undefined;
  const enabled = async () => {
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.enabled;
    const r = await api.service<{ enabled: boolean }>('GET', '/bot/ghost-ping').catch(() => ({ enabled: cached?.enabled ?? true }));
    cached = { at: Date.now(), enabled: r.enabled !== false };
    return cached.enabled;
  };
  return {
    async deleted(m: DeletedMessage) {
      const targets = ghostPingTargets(m);
      if (!targets.length || !(await enabled())) return;
      // nur die Geghost-Pingten werden benachrichtigt, der Absender nur genannt
      await actions.post(m.channelId, { content: ghostPingText(m, targets), mentionUserIds: targets }).catch((e) => log(`ghost ping message failed: ${e instanceof Error ? e.message : e}`));
    },
  };
}
