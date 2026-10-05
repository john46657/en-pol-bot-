import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { permissions } from '@nexus/permissions';
import type { Permission } from '@nexus/types';

/**
 * Serverseitige Berechtigungsprüfung für Bot-Aktionen.
 * Discord-Administratoren dürfen immer; sonst zählen die in NEXUS zugeordneten Rollen
 * (zentrale Engine `@nexus/permissions`). Die Prüfung läuft immer im Bot/API, nie nur im Frontend.
 */
export function evaluatePermission(
  isAdministrator: boolean,
  grantedKeys: readonly string[],
  required: string,
): boolean {
  return isAdministrator || grantedKeys.includes(required);
}

export const permissionService = {
  isDiscordAdmin(member: GuildMember): boolean {
    return (
      member.id === member.guild.ownerId ||
      member.permissions.has(PermissionFlagsBits.Administrator)
    );
  },

  async can(member: GuildMember, key: string): Promise<boolean> {
    if (this.isDiscordAdmin(member)) return true;
    // dieselbe zentrale Engine wie die API: Profile, Sperren, Benutzerausnahmen, Ablauf, `.manage`, Sammelrechte
    return permissions.can(
      {
        guildId: member.guild.id,
        roleIds: [...member.roles.cache.keys()],
        bypass: false,
        userId: member.id,
      },
      key as Permission,
    );
  },

  /** Darf der Bot Nachrichten/Embeds in diesen Kanal senden? */
  canBotSendIn(guild: GuildMember['guild'], channelId: string): boolean {
    const channel = guild.channels.cache.get(channelId);
    const me = guild.members.me;
    if (!channel || !me || !('permissionsFor' in channel)) return false;
    return !!channel
      .permissionsFor(me)
      ?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ]);
  },
};
