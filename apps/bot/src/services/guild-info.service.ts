import type { Guild } from 'discord.js';
import { channelService } from './channel.service.js';
import { roleService } from './role.service.js';

export interface GuildInfo {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  memberCount: number;
  roleCount: number;
  textChannels: number;
  voiceChannels: number;
  categories: number;
  botHighestRole: string | null;
}

export const guildInfoService = {
  get(guild: Guild): GuildInfo {
    const channels = channelService.list(guild);
    return {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL(),
      ownerId: guild.ownerId,
      memberCount: guild.memberCount,
      roleCount: roleService.list(guild).length,
      textChannels: channels.filter((c) => c.kind === 'text').length,
      voiceChannels: channels.filter((c) => c.kind === 'voice').length,
      categories: channels.filter((c) => c.kind === 'category').length,
      botHighestRole: guild.members.me?.roles.highest.name ?? null,
    };
  },
};
