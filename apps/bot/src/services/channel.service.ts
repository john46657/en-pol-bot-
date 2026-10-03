import { ChannelType, type Guild } from 'discord.js';

export type ChannelKind = 'text' | 'voice' | 'category' | 'other';

export interface ChannelInfo {
  id: string;
  name: string;
  type: ChannelType;
  kind: ChannelKind;
  parentId: string | null;
  position: number;
}

export function channelKind(type: ChannelType): ChannelKind {
  switch (type) {
    case ChannelType.GuildText:
    case ChannelType.GuildAnnouncement:
      return 'text';
    case ChannelType.GuildVoice:
    case ChannelType.GuildStageVoice:
      return 'voice';
    case ChannelType.GuildCategory:
      return 'category';
    default:
      return 'other';
  }
}

export const channelService = {
  /** Alle Kanäle (optional nach Art gefiltert), Reihenfolge wie in Discord. Threads werden ausgelassen. */
  list(guild: Guild, kind?: ChannelKind): ChannelInfo[] {
    return [...guild.channels.cache.values()]
      .filter((c) => !c.isThread())
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        kind: channelKind(c.type),
        parentId: c.parentId,
        position: 'rawPosition' in c ? c.rawPosition : 0,
      }))
      .filter((c) => (kind ? c.kind === kind : true))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  },
};
