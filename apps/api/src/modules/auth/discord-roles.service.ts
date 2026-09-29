import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchGuildMemberRoles } from '@nexus/auth';

/**
 * Discord-Rollen eines Users (§114: authoritativ serverseitig).
 *
 * Der Bot liest die Mitgliedschaft über seinen Token – Frontend-Angaben sind
 * nie vertrauenswürdig. Ergebnisse werden kurz (60s) im Speicher gehalten,
 * damit Discord nicht bei jedem Request angefragt wird.
 */
@Injectable()
export class DiscordRolesService {
  private readonly cache = new Map<string, { roles: string[]; expiresAt: number }>();
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
}
