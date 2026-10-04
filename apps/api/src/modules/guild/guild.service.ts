import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@nexus/database';
import { effectivePermissions, permissions } from '@nexus/permissions';
import type { Permission } from '@nexus/types';
import {
  TtlCache,
  getBotMember,
  getGuild,
  getGuildChannels,
  getGuildMember,
  getGuildRoles,
} from '@nexus/discord';

export interface GuildSelectionEntry {
  id: string;
  name: string;
  icon: string | null;
  /** Bot ist auf diesem Server (Guild in unserer DB). */
  botPresent: boolean;
  canManage: boolean;
  permissions: Permission[];
}

export interface GuildHealthEntry {
  ok: boolean;
  message: string;
}

export interface GuildOverview {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  applications: number;
  submissions: { total: number; pending: number; accepted: number; denied: number };
  health: GuildHealthEntry[];
}

const MANAGE_GUILD = 1 << 5;
const ADMINISTRATOR = 1 << 3;

/**
 * GuildService (§1/§2/§35/§36): Server des Users, Guild-Daten und
 * Configuration Health. Alles serverseitig via Bot-Token autoritativ.
 */
@Injectable()
export class GuildService {
  private readonly cache = new TtlCache();

  constructor(private readonly config: ConfigService) {}

  private get botToken(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  /**
   * Server, die der User verwalten darf (§1/§2): eigene Discord-Gilden des
   * Users, auf denen entweder der Bot ist (botPresent) oder die er über den
   * Invite-Flow hinzufügen kann.
   */
  async listUserGuilds(userId: string, accessToken: string): Promise<GuildSelectionEntry[]> {
    const [userGuilds, knownGuildIds] = await Promise.all([
      fetchUserGuilds(accessToken),
      prisma.guild.findMany({ where: { leftAt: null }, select: { id: true } }),
    ]);
    const known = new Set(knownGuildIds.map((g) => g.id));

    // Mitglieder-Abfragen parallel und gecacht (statt nacheinander je Server bei jedem Seitenaufruf)
    const entries = await Promise.all(
      userGuilds.map(async (guild): Promise<GuildSelectionEntry | null> => {
        const permissionsBit = BigInt(guild.permissions ?? '0');
        const isOwner = guild.owner ?? false;
        const hasDiscordPerms = (permissionsBit & BigInt(MANAGE_GUILD | ADMINISTRATOR)) !== 0n;

        // NEXUS-Permissions über die Rollen des Users in dieser Guild (zentrale Engine).
        let nexusPermissions: ReadonlySet<Permission> = new Set<Permission>();
        if (known.has(guild.id) && !(isOwner || hasDiscordPerms)) {
          const member = await getGuildMember(this.botToken, guild.id, userId, this.cache);
          nexusPermissions = await permissions.forRoles(guild.id, member?.roles ?? []);
        }

        const canManage = isOwner || hasDiscordPerms || nexusPermissions.has('applications.manage');
        if (!canManage && nexusPermissions.size === 0) return null;
        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          botPresent: known.has(guild.id),
          canManage,
          permissions: effectivePermissions(nexusPermissions),
        };
      }),
    );
    const result = entries.filter((e): e is GuildSelectionEntry => e !== null);
    return result.sort(
      (a, b) => Number(b.botPresent) - Number(a.botPresent) || a.name.localeCompare(b.name),
    );
  }

  /** Guild-Overview (§4) + Configuration Health (§35/§36). */
  async getOverview(guildId: string): Promise<GuildOverview> {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });

    const [applications, statusCounts, discordGuild] = await Promise.all([
      prisma.application.count({ where: { guildId } }),
      prisma.applicationSubmission.groupBy({ by: ['status'], where: { guildId }, _count: true }),
      getGuild(this.botToken, guildId, this.cache).catch(() => null),
    ]);

    const counts = new Map(statusCounts.map((r) => [r.status, r._count]));

    const overview: GuildOverview = {
      id: guildId,
      name: discordGuild?.name ?? guild?.name ?? 'Unbekannter Server',
      icon: discordGuild?.icon ?? null,
      memberCount: 0,
      applications,
      submissions: {
        total: [...counts.values()].reduce((a, b) => a + b, 0),
        pending: (counts.get('SUBMITTED') ?? 0) + (counts.get('UNDER_REVIEW') ?? 0),
        accepted: counts.get('ACCEPTED') ?? 0,
        denied: counts.get('DENIED') ?? 0,
      },
      health: [],
    };

    if (!guild) {
      overview.health.push({ ok: false, message: 'Bot ist nicht mit diesem Server verbunden.' });
      return overview;
    }

    overview.memberCount = await this.getMemberCount(guildId);

    // Configuration Health: konfigurierte Channels/Rollen aller Applications
    // prüfen (§35).
    const [channels, roles, botMember] = await Promise.all([
      getGuildChannels(this.botToken, guildId, this.cache).catch(() => []),
      getGuildRoles(this.botToken, guildId, this.cache).catch(() => []),
      getBotMember(this.botToken, guildId, this.cache).catch(() => null),
    ]);
    const channelIds = new Set(channels.map((c) => c.id));
    const roleMap = new Map(roles.map((r) => [r.id, r]));
    const botTopRole = botMember?.roles.length
      ? Math.max(...botMember.roles.map((id) => roleMap.get(id)?.position ?? 0))
      : 0;

    overview.health.push({ ok: true, message: 'Bot mit Server verbunden.' });

    if (botMember) {
      const botRolesMissing = botMember.roles.length === 0;
      overview.health.push(
        botRolesMissing
          ? {
              ok: false,
              message: 'Dem Bot sind keine Rollen zugewiesen – Rollenverwaltung deaktiviert.',
            }
          : { ok: true, message: 'Bot-Rollen erkannt.' },
      );
    }

    const apps = await prisma.application.findMany({
      where: { guildId },
      select: { id: true, name: true, config: true, status: true },
    });

    for (const app of apps) {
      const config = (app.config ?? {}) as {
        review?: { submissionChannelId?: string };
        questions?: unknown[];
      };
      const reviewChannel = config.review?.submissionChannelId;
      if (reviewChannel && !channelIds.has(reviewChannel)) {
        overview.health.push({
          ok: false,
          message: `⚠️ ${app.name}: Der konfigurierte Submission-Channel existiert nicht mehr.`,
        });
      }
      if (
        app.status === 'PUBLISHED' &&
        !(config.questions && Array.isArray(config.questions) && config.questions.length > 0)
      ) {
        overview.health.push({
          ok: false,
          message: `⚠️ ${app.name}: Veröffentlicht, aber ohne Fragen.`,
        });
      }
      const roleRules = await prisma.applicationRoleRule.findMany({
        where: { applicationId: app.id },
      });
      for (const rule of roleRules) {
        const role = roleMap.get(rule.roleId);
        if (!role) {
          overview.health.push({
            ok: false,
            message: `⚠️ ${app.name}: Die konfigurierte Rolle für "${rule.type}" existiert nicht mehr.`,
          });
        } else if (role.position >= botTopRole) {
          overview.health.push({
            ok: false,
            message: `⚠️ ${app.name}: Rolle "@${role.name}" liegt über der Bot-Rolle – nicht verwaltbar.`,
          });
        }
      }
    }

    return overview;
  }

  async getMemberCount(guildId: string): Promise<number> {
    const guild = await getGuild(this.botToken, guildId, this.cache).catch(() => null);
    return guild ? await this.fetchApproximateMemberCount(guildId) : 0;
  }

  private async fetchApproximateMemberCount(guildId: string): Promise<number> {
    const key = `guild-count:${guildId}`;
    const cached = this.cache.get<number>(key);
    if (cached !== undefined) return cached;

    const response = await fetch(
      `${process.env['DISCORD_API_BASE'] ?? 'https://discord.com/api/v10'}/guilds/${guildId}?with_counts=true`,
      {
        headers: { Authorization: `Bot ${this.botToken}` },
      },
    );
    const data = (await response.json().catch(() => null)) as {
      approximate_member_count?: number;
    } | null;
    const count = data?.approximate_member_count ?? 0;
    this.cache.set(key, count);
    return count;
  }
}

interface UserGuild {
  id: string;
  name: string;
  icon: string | null;
  owner?: boolean;
  permissions?: string;
}

async function fetchUserGuilds(accessToken: string): Promise<UserGuild[]> {
  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
  }>;
  return data.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    owner: g.owner,
    permissions: g.permissions,
  }));
}
