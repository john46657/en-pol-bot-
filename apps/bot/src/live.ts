import type { Api } from './api';
import { dangerButtons, dangerEmbed, teamlistEmbed, type DangerState, type TeamMember } from './format';
import type { DiscordConfig, Platform } from './platform';

export type LiveKind = 'danger' | 'teamlist';
interface Placement { channelId: string; messageId?: string }
const STATE_KEY: Record<LiveKind, string> = { danger: 'danger-panel', teamlist: 'teamlist' };

/**
 * Selbst aktualisierende Nachrichten (Gefahrenstatus-Panel, Teamliste).
 * Wo die Nachricht steht, speichert die API (`/bot/state/...`) – so überlebt es Neustarts des Bots.
 * Bearbeitet wird nur, wenn sich der Inhalt geändert hat (keine unnötigen Discord-Aufrufe).
 */
export function createLive(api: Api, platform: Platform, log: (m: string) => void = console.log) {
  const lastContent: Partial<Record<LiveKind, string>> = {};

  async function render(kind: LiveKind) {
    if (kind === 'danger') {
      const s = await api.service<DangerState>('GET', '/bot/danger');
      return { embed: dangerEmbed(s), buttons: dangerButtons(s) };
    }
    const t = await api.service<{ rankOrder: string[]; members: TeamMember[] }>('GET', '/bot/team');
    return { embed: teamlistEmbed(t.members, t.rankOrder), buttons: undefined };
  }

  /**
   * Zeichnet die Nachricht neu. `channelId` setzt den Ort (z. B. per Befehl); sonst gilt der gespeicherte Ort,
   * bei der Teamliste vorrangig der in den Einstellungen konfigurierte Channel.
   */
  async function refresh(kind: LiveKind, o: { channelId?: string; force?: boolean } = {}): Promise<Placement | null> {
    const stored = (await api.service<{ value: Placement | null }>('GET', `/bot/state/${STATE_KEY[kind]}`)).value;
    let channelId = o.channelId ?? stored?.channelId;
    if (!o.channelId && kind === 'teamlist') channelId = (await api.service<DiscordConfig>('GET', '/bot/config')).teamlist ?? channelId;
    if (!channelId) return null;
    const { embed, buttons } = await render(kind);
    const content = JSON.stringify(embed);
    const sameSpot = stored?.channelId === channelId && !!stored.messageId;
    if (sameSpot && !o.force && lastContent[kind] === content) return stored;
    const messageId = await platform.postOrEdit({ channelId, messageId: sameSpot ? stored.messageId : undefined, embed, buttons });
    lastContent[kind] = content;
    // Neu platziert (anderer Kanal) → altes Panel entfernen, damit nur eins existiert
    if (!sameSpot && stored?.messageId && o.force && platform.deleteMessage) await platform.deleteMessage(stored.channelId, stored.messageId).catch(() => undefined);
    const placement = { channelId, messageId };
    if (!sameSpot || stored?.messageId !== messageId) await api.service('PUT', `/bot/state/${STATE_KEY[kind]}`, { value: placement });
    return placement;
  }

  /** Regelmäßiger Abgleich (z. B. Dienststatus aus dem Web, Gefahrenstatus aus der Leitstelle). Fehler beenden die Schleife nicht. */
  function start(seconds: number) {
    let running = false;
    let lastError: string | undefined;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        for (const k of ['danger', 'teamlist'] as const) await refresh(k);
        lastError = undefined;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== lastError) { log(`Live-Nachrichten: Aktualisierung fehlgeschlagen: ${msg} (wird still weiter versucht)`); lastError = msg; }
      } finally { running = false; }
    };
    const timer = setInterval(() => void tick(), seconds * 1000);
    void tick();
    return () => clearInterval(timer);
  }

  return { refresh, start };
}
