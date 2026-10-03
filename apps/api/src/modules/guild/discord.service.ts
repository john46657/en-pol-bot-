import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtlCache, getBotMember, getGuildChannels, getGuildRoles } from '@nexus/discord';

export interface DashboardChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
}

export interface DashboardRole {
  id: string;
  name: string;
  color: number;
  position: number;
  mentionable: boolean;
  /** Kann der Bot diese Rolle verwalten (§30)? */
  manageable: boolean;
}

/**
 * Discord-Ressourcen einer Guild (§8/§30): Channels und Roles inklusive
 * Prüfung, ob der Bot sie verwalten kann.
 */
@Injectable()
export class DiscordService {
  private readonly cache = new TtlCache();

  constructor(private readonly config: ConfigService) {}

  private get botToken(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  async listChannels(guildId: string): Promise<DashboardChannel[]> {
    const channels = await getGuildChannels(this.botToken, guildId, this.cache);
    return channels.map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId }));
  }

  async listRoles(guildId: string): Promise<DashboardRole[]> {
    const [roles, botMember] = await Promise.all([
      getGuildRoles(this.botToken, guildId, this.cache),
      getBotMember(this.botToken, guildId, this.cache).catch(() => null),
    ]);

    const positions = new Map(roles.map((r) => [r.id, r.position]));
    const botTopRole = botMember?.roles.length
      ? Math.max(...botMember.roles.map((id) => positions.get(id) ?? 0))
      : 0;

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      mentionable: r.mentionable,
      // §30: Rolle liegt unter der höchsten Bot-Rolle + Bot hat Manage Roles.
      manageable: r.position < botTopRole && this.hasManageRoles(botMember?.roles ?? [], roles),
    }));
  }

  private hasManageRoles(
    botRoleIds: string[],
    roles: Array<{ id: string; permissions: string }>,
  ): boolean {
    const roleMap = new Map(roles.map((r) => [r.id, r.permissions]));
    const ADMINISTRATOR = (1n << 3n).toString();
    const MANAGE_ROLES = (1n << 28n).toString();
    return botRoleIds.some((id) => {
      const perms = roleMap.get(id);
      if (!perms) return false;
      return perms === ADMINISTRATOR || perms === MANAGE_ROLES;
    });
  }
}
