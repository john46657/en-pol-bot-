import type { Guild, GuildMember } from 'discord.js';

export interface MemberInfo {
  id: string;
  username: string;
  displayName: string;
  bot: boolean;
  roleIds: string[];
  joinedAt: Date | null;
}

export function toMemberInfo(member: GuildMember): MemberInfo {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    bot: member.user.bot,
    roleIds: [...member.roles.cache.keys()].filter((id) => id !== member.guild.id),
    joinedAt: member.joinedAt,
  };
}

export const memberService = {
  async get(guild: Guild, userId: string): Promise<MemberInfo | null> {
    const member = await guild.members.fetch(userId).catch(() => null);
    return member ? toMemberInfo(member) : null;
  },

  /** Mitglieder per Namenssuche (ein API-Aufruf, begrenzt) – für Auswahlfelder, nie ein Komplett-Fetch. */
  async search(guild: Guild, query: string, limit = 25): Promise<MemberInfo[]> {
    const found = await guild.members.search({ query, limit: Math.min(limit, 100) });
    return [...found.values()].map(toMemberInfo);
  },

  /** Zählt Mitglieder ohne Fetch (Gateway-Wert). */
  count(guild: Guild): number {
    return guild.memberCount;
  },
};
