import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtlCache, getGuild, getGuildMember, getGuildRoles } from '@nexus/discord';
import { computeMemberAccess, type MemberAccess } from './member-access.js';

/**
 * Discord-Rollen und -Rechte eines Users (§114: authoritativ serverseitig).
 *
 * Der Bot liest die Mitgliedschaft über seinen Token – Frontend-Angaben sind
 * nie vertrauenswürdig. Ergebnisse werden kurz (60s) im Speicher gehalten,
 * damit Discord nicht bei jedem Request angefragt wird.
 */
@Injectable()
export class DiscordRolesService {
  private readonly cache = new Map<
    string,
    { roles: string[]; isMember: boolean; expiresAt: number }
  >();
  private readonly discordCache = new TtlCache();
  private readonly ttlMs = 60_000;

  constructor(private readonly config: ConfigService) {}

  /** Mitgliedschaft + Rollen (60 s gecacht). Ohne Bot-Token: unbekannt → kein Mitglied (fail closed). */
  async getMember(
    guildId: string,
    userId: string,
  ): Promise<{ isMember: boolean; roleIds: string[] }> {
    const key = `${guildId}:${userId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return { isMember: hit.isMember, roleIds: hit.roles };

    const botToken = this.config.get<string>('DISCORD_TOKEN');
    if (!botToken) return { isMember: false, roleIds: [] };

    const member = await getGuildMember(botToken, guildId, userId); // null bei 404 = nicht (mehr) auf dem Server
    const value = {
      isMember: member !== null,
      roles: member?.roles ?? [],
      expiresAt: Date.now() + this.ttlMs,
    };
    this.cache.set(key, value);
    return { isMember: value.isMember, roleIds: value.roles };
  }

  async getMemberRoles(guildId: string, userId: string): Promise<string[]> {
    return (await this.getMember(guildId, userId)).roleIds;
  }

  /** Besitzer/Administrator/„Server verwalten“ – ohne Bot-Token oder bei Discord-Fehlern: kein Zugriff (fail closed). */
  async getMemberAccess(
    guildId: string,
    userId: string,
    memberRoleIds: string[],
  ): Promise<MemberAccess> {
    const none: MemberAccess = { isOwner: false, isAdmin: false, canManageGuild: false };
    const botToken = this.config.get<string>('DISCORD_TOKEN');
    if (!botToken) return none;
    try {
      const [guild, roles] = await Promise.all([
        getGuild(botToken, guildId, this.discordCache),
        getGuildRoles(botToken, guildId, this.discordCache),
      ]);
      return computeMemberAccess({ guildId, ownerId: guild.ownerId, userId, memberRoleIds, roles });
    } catch {
      return none;
    }
  }
}
