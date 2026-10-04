import { assertGuildId, discordSyncRepository, guildRepository, prisma } from '@nexus/database';

/**
 * Büro-Warteraum: ein vom Administrator **gewählter, bereits vorhandener** Sprachkanal (Auswahl-Slot
 * `office-waiting-voice`). NEXUS behandelt ihn ausschließlich als konfigurierten Warteraum – es werden weder Kanäle
 * angelegt noch Mitglieder verschoben, stummgeschaltet oder getrennt. Diese Funktionen lesen nur.
 */
export const SLOT = 'office-waiting-voice';
/** Discord-Kanaltypen für Sprache: 2 = Voice, 13 = Stage. */
const VOICE_TYPES = [2, 13];

export type WaitingRoomState = 'not-configured' | 'ok' | 'channel-missing' | 'not-voice' | 'conflict-radio';

export interface WaitingRoom {
  state: WaitingRoomState;
  channelId: string | null;
  name: string | null;
  /** Verständlicher Hinweis für Dashboard/Bot, wenn `state` ≠ `ok`. */
  message: string;
}

const MESSAGES: Record<WaitingRoomState, string> = {
  'not-configured': 'Es ist noch kein Büro-Warteraum festgelegt (Einstellungen → Rollen & Kanäle wählen).',
  ok: 'Der Büro-Warteraum ist eingerichtet.',
  'channel-missing': 'Der gewählte Kanal existiert nicht mehr – bitte einen neuen Warteraum wählen.',
  'not-voice': 'Der gewählte Kanal ist kein Sprachkanal – bitte einen Voice-Channel wählen.',
  'conflict-radio': 'Der Warteraum ist zugleich als Funkkanal eingerichtet – Funk würde dort Mitglieder trennen. Bitte einen der beiden ändern.',
};

export async function getWaitingRoom(guildId: string): Promise<WaitingRoom> {
  const gid = assertGuildId(guildId);
  const channelId = (await guildRepository.getSelections(gid))[SLOT] ?? null;
  const done = (state: WaitingRoomState, name: string | null = null): WaitingRoom => ({ state, channelId, name, message: MESSAGES[state] });
  if (!channelId) return done('not-configured');
  const ch = (await discordSyncRepository.listChannels(gid)).find((c) => c.discordId === channelId);
  if (!ch) return done('channel-missing');
  if (!VOICE_TYPES.includes(ch.type)) return done('not-voice', ch.name);
  if (await prisma.radioChannel.count({ where: { guildId: gid, channelId } })) return done('conflict-radio', ch.name);
  return done('ok', ch.name);
}

/** Ist dieser Kanal der konfigurierte Büro-Warteraum? */
export async function isWaitingRoom(guildId: string, channelId: string): Promise<boolean> {
  return (await guildRepository.getSelections(assertGuildId(guildId)))[SLOT] === channelId;
}
