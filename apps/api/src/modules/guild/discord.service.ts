import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TtlCache, getBotMember, getGuildChannels, getGuildRoles } from '@nexus/discord';
import {
  channelKind,
  checkBotPermissions,
  checkRoleManageable,
  computeBotAccess,
  type BlockedReason,
  type ChannelKind,
} from './bot-access.js';

export interface DashboardChannel {
  id: string;
  name: string;
  type: number;
  kind: ChannelKind;
  parentId: string | null;
}

export interface DashboardRole {
  id: string;
  name: string;
  color: number;
  position: number;
  mentionable: boolean;
  /** Kann der Bot diese Rolle verwalten (Rechte + Hierarchie)? */
  manageable: boolean;
  blockedReason?: BlockedReason;
}

/**
 * Discord-Ressourcen einer Guild: Kanäle und Rollen (live per Bot-Token, kurz gecacht)
 * inklusive Prüfung, ob der Bot sie verwalten kann.
 */
@Injectable()
export class DiscordService {
  private readonly cache = new TtlCache();

  constructor(private readonly config: ConfigService) {}

  private get botToken(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  async listChannels(guildId: string, kind?: ChannelKind): Promise<DashboardChannel[]> {
    const channels = await getGuildChannels(this.botToken, guildId, this.cache);
    return channels
      .map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        kind: channelKind(c.type),
        parentId: c.parentId,
      }))
      .filter((c) => (kind ? c.kind === kind : c.kind !== 'other'));
  }

  async listRoles(guildId: string): Promise<DashboardRole[]> {
    const { roles, access } = await this.load(guildId);
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      mentionable: r.mentionable,
      ...checkRoleManageable(guildId, r, access),
    }));
  }

  /** Prüft, ob der Bot die für NEXUS nötigen Server-Rechte besitzt. */
  async getBotPermissions(guildId: string) {
    const { access } = await this.load(guildId);
    const checks = checkBotPermissions(access);
    return { ok: checks.every((c) => c.ok), administrator: access.administrator, checks };
  }

  private async load(guildId: string) {
    const [roles, botMember] = await Promise.all([
      getGuildRoles(this.botToken, guildId, this.cache),
      getBotMember(this.botToken, guildId, this.cache),
    ]);
    return { roles, access: computeBotAccess(guildId, roles, botMember.roles) };
  }
}
