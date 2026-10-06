import { Injectable } from '@nestjs/common';
import { can } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordLiveService, type LiveMember } from '../discord/discord-live.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { currentGuild, scopedKey } from '../common/guild-context';

export interface TeamStructure { teams: string[]; ranks: string[]; offices: string[] }
export interface RosterMember {
  key: string; userId: string | null; discordId: string | null; name: string; username: string | null; avatar: string | null;
  team: string | null; rank: string | null; office: string | null; serviceNumber: string | null; callsign: string | null;
  status: LiveMember['status']; joinedAt: string | null; discordRoles: string[];
}

const uniq = (v: (string | null | undefined)[]) => [...new Set(v.filter((x): x is string => !!x && !!x.trim()))];

/**
 * Teamliste: Personalakten (Team, Dienstgrad, Büro, Dienstnummer) + Discord-Teammitglieder (Avatar, Name, Online-Status).
 * Enthält bewusst KEINE Voice-Informationen – die liefert ausschließlich `/team/voice`.
 */
@Injectable()
export class RosterService {
  constructor(private readonly prisma: PrismaService, private readonly live: DiscordLiveService, private readonly discord: DiscordService, private readonly perms: PermissionService) {}

  /** Teams, Dienstgrade und Büros: aus den Einstellungen, ergänzt um Werte, die in Personalakten vorkommen. */
  /** Server-Einstellung, sonst die gemeinsame. */
  private async setting(key: string) {
    const g = currentGuild();
    return (g ? await this.prisma.systemSetting.findUnique({ where: { key: scopedKey(key, g) } }) : null) ?? this.prisma.systemSetting.findUnique({ where: { key } });
  }

  async structure(): Promise<TeamStructure> {
    const [cfg, order, used] = await Promise.all([
      this.setting('team.structure'),
      this.setting('team.rankOrder'),
      this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, select: { team: true, rank: true, office: true } }),
    ]);
    const s = (cfg?.value ?? {}) as Partial<TeamStructure>;
    return {
      teams: uniq([...(s.teams ?? []), ...used.map((u) => u.team)]),
      ranks: uniq([...((order?.value as string[] | undefined) ?? []), ...used.map((u) => u.rank)]),
      offices: uniq([...(s.offices ?? []), ...used.map((u) => u.office)]),
    };
  }

  async roster(): Promise<{ members: RosterMember[]; structure: TeamStructure; discordUpdatedAt: Date | null; generatedAt: Date }> {
    const [people, links, structure, guilds] = await Promise.all([
      this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] }, user: { active: true } }, include: { user: { select: { id: true, displayName: true, username: true } } } }),
      this.prisma.discordLink.findMany(),
      this.structure(),
      this.discord.guilds(),
    ]);
    // Server getrennt: nur Mitglieder des gewählten Servers (Personalakten nur, wenn die Person dort Teammitglied ist)
    const g = currentGuild();
    const { members: all, updatedAt } = this.live.getMembers();
    const live = g ? all.filter((m) => m.guildId === g) : [...new Map(all.map((m) => [m.id, m])).values()];
    const roleName = new Map(guilds.flatMap((x) => x.roles.map((r) => [r.id, r.name] as const)));
    const linkOf = new Map(links.map((l) => [l.userId, l.discordId]));
    const userOf = new Map(links.map((l) => [l.discordId, l.userId]));
    const byDiscord = new Map(live.map((m) => [m.id, m]));
    const out: RosterMember[] = [];
    const seen = new Set<string>();
    for (const p of people) {
      const discordId = linkOf.get(p.userId) ?? null;
      const d = discordId ? byDiscord.get(discordId) : undefined;
      if (g && !d) continue;
      if (discordId) seen.add(discordId);
      out.push({
        key: p.userId, userId: p.userId, discordId, name: d?.displayName ?? p.user.displayName, username: d?.username ?? p.user.username, avatar: d?.avatar ?? null,
        team: p.team, rank: p.rank, office: p.office, serviceNumber: p.serviceNumber, callsign: p.callsign,
        status: d?.status ?? (live.length ? 'offline' : 'unknown'), joinedAt: (d?.joinedAt ?? p.joinDate.toISOString()) || null,
        discordRoles: (d?.roleIds ?? []).map((r) => roleName.get(r) ?? r),
      });
    }
    // Teammitglieder nur auf Discord (Teamrolle, aber noch keine Personalakte)
    for (const d of live) {
      if (seen.has(d.id)) continue;
      out.push({
        key: `discord:${d.id}`, userId: userOf.get(d.id) ?? null, discordId: d.id, name: d.displayName, username: d.username, avatar: d.avatar,
        team: null, rank: null, office: null, serviceNumber: null, callsign: null, status: d.status, joinedAt: d.joinedAt, discordRoles: d.roleIds.map((r) => roleName.get(r) ?? r),
      });
    }
    const rankIdx = (r: string | null) => { const i = r ? structure.ranks.indexOf(r) : -1; return i < 0 ? 999 : i; };
    out.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || a.name.localeCompare(b.name));
    return { members: out, structure, discordUpdatedAt: updatedAt, generatedAt: new Date() };
  }

  /** Profil eines Teammitglieds. Discord-ID, Rollen und Beitrittsdatum nur mit `personnel.view` oder `users.view`. */
  async profile(viewerId: string, key: string) {
    const r = await this.roster();
    const m = r.members.find((x) => x.key === key || x.userId === key || x.discordId === key);
    if (!m) throw new AppError('NOT_FOUND', 'Team member not found.');
    const ctx = await this.perms.contextFor(viewerId);
    const details = can(ctx, 'personnel.view') || can(ctx, 'users.view');
    const personnelId = m.userId && can(ctx, 'personnel.view') ? (await this.prisma.personnel.findUnique({ where: { userId: m.userId }, select: { id: true } }))?.id ?? null : null;
    return { ...m, discordId: details ? m.discordId : null, discordRoles: details ? m.discordRoles : [], joinedAt: details ? m.joinedAt : null, personnelId, detailed: details };
  }

  /** Voice-Channels mit Personen (eigenes Widget, getrennt von der Teamliste). */
  voice() {
    const g = currentGuild();
    const v = this.live.getVoice();
    return { ...v, channels: g ? v.channels.filter((c) => c.guildId === g) : v.channels };
  }

  activity(limit: number) { return this.live.getChanges(limit, currentGuild()); }

  /** „Jetzt aktualisieren“: den Bot um einen sofortigen Bericht bitten (er meldet sonst ohnehin alle 60 Sekunden). */
  async requestSync() { await this.discord.enqueue('duty', 'members.sync', {}, { always: true }); }
}
