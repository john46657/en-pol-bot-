import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchGuildMemberRoles } from '@nexus/auth';
import { TtlCache, getGuild, getGuildRoles } from '@nexus/discord';
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
  private readonly cache = new Map<string, { roles: string[]; expiresAt: number }>();
  private readonly discordCache = new TtlCache();
  private readonly ttlMs = 60_000;

  constructor(private readonly config: ConfigService) {}

  async getMemberRoles(guildId: string, userId: string): Promise<string[]> {
    const key = `${guildId}:${userId}`;
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.roles;

    const botToken = this.config.get<string>('DISCORD_TOKEN');
    // Ohne Bot-Token können keine Rollen bestimmt werden → leere Menge.
    // Sichere Default: fehlende Rollen führen im Guard zu Forbidden.
    if (!botToken) return [];

    const roles = await fetchGuildMemberRoles({ guildId, userId, botToken });
    this.cache.set(key, { roles, expiresAt: Date.now() + this.ttlMs });
    return roles;
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
