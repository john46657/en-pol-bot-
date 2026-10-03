import type { Api } from './api';
import { renderOutbox, type EmbedData } from './format';

interface OutboxItem { id: string; type: string; channelKey: string; payload: Record<string, unknown> }
export type Sender = (channelId: string, embed: EmbedData) => Promise<void>;

/**
 * Holt offene Benachrichtigungen aus der System-API, postet sie und quittiert.
 * Fehlgeschlagene Sendungen werden gemeldet (die API zählt Versuche und gibt nach 5 Fehlversuchen auf).
 */
export async function pollOnce(api: Api, send: Sender, log: (m: string) => void = console.log): Promise<number> {
  const [channels, items] = await Promise.all([api.service<Record<string, string | undefined>>('GET', '/bot/config'), api.service<OutboxItem[]>('GET', '/bot/outbox?limit=20')]);
  let sent = 0;
  for (const item of items) {
    const channelId = channels[item.channelKey];
    const embed = renderOutbox(item.type, item.payload);
    try {
      if (!channelId) throw new Error(`channel "${item.channelKey}" not configured`);
      if (!embed) throw new Error(`unknown type "${item.type}"`);
      await send(channelId, embed);
      await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: true });
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'send failed';
      log(`outbox ${item.id} (${item.type}) failed: ${msg}`);
      await api.service('POST', `/bot/outbox/${item.id}/ack`, { ok: false, error: msg }).catch(() => undefined);
    }
  }
  return sent;
}

/** Läuft dauerhaft; überlappende Durchläufe werden vermieden, Fehler (z. B. API kurz down) beenden die Schleife nicht. */
export function startOutboxLoop(api: Api, send: Sender, seconds: number, log: (m: string) => void = console.log) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await pollOnce(api, send, log); } catch (e) { log(`outbox poll failed: ${e instanceof Error ? e.message : e}`); } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), seconds * 1000);
  void tick();
  return () => clearInterval(timer);
}
