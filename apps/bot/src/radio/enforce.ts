import { REASON_TEXT, checkChannel } from '@nexus/radio';
import { log } from '../logger.js';

/**
 * Durchsetzung der Funk-Whitelist im Sprachkanal: ohne Zugriff wird das Mitglied getrennt (mit Hinweis per DM),
 * mit nur „Mithören“ stumm geschaltet. Läuft beim Betreten/Wechseln eines Kanals und zusätzlich als Kontrolle
 * (z. B. wenn die Schicht endet oder die Whitelist geändert wird). Der Bot braucht dafür „Mitglieder verschieben“
 * und „Mitglieder stummschalten“.
 */
export interface VoiceMemberLike {
  id: string;
  guild: { id: string };
  voice: {
    channelId: string | null;
    serverMute: boolean | null;
    disconnect(reason?: string): Promise<unknown>;
    setMute(mute: boolean, reason?: string): Promise<unknown>;
  };
  send?(options: { content: string }): Promise<unknown>;
}

/** Vom Bot stummgeschaltete Mitglieder (damit fremde Stummschaltungen nicht aufgehoben werden). */
const mutedByRadio = new Set<string>();
const key = (m: VoiceMemberLike) => `${m.guild.id}:${m.id}`;

export type EnforceResult = 'ignored' | 'allowed' | 'muted' | 'unmuted' | 'disconnected';

export async function enforceMember(member: VoiceMemberLike): Promise<EnforceResult> {
  const channelId = member.voice.channelId;
  if (!channelId) {
    mutedByRadio.delete(key(member));
    return 'ignored';
  }
  const check = await checkChannel(member.guild.id, member.id, channelId);
  if (!check) return releaseMute(member); // kein Funkkanal (mehr)
  try {
    if (check.access === 'none') {
      mutedByRadio.delete(key(member));
      await member.voice.disconnect(`Funk: ${REASON_TEXT[check.reason]}`);
      await member.send?.({ content: `📻 Du wurdest aus **${check.name}** getrennt: ${REASON_TEXT[check.reason]}` }).catch(() => undefined);
      return 'disconnected';
    }
    if (check.access === 'listen') {
      if (member.voice.serverMute) return 'allowed';
      mutedByRadio.add(key(member));
      await member.voice.setMute(true, 'Funk: nur Mithören');
      return 'muted';
    }
    return releaseMute(member, 'allowed');
  } catch (e) {
    log.warn({ err: String(e), userId: member.id, channelId }, 'Funk-Durchsetzung fehlgeschlagen (fehlen dem Bot Rechte?).');
    return 'ignored';
  }
}

async function releaseMute(member: VoiceMemberLike, fallback: EnforceResult = 'ignored'): Promise<EnforceResult> {
  if (!mutedByRadio.delete(key(member))) return fallback;
  await member.voice.setMute(false, 'Funk: Stummschaltung aufgehoben').catch(() => undefined);
  return 'unmuted';
}
