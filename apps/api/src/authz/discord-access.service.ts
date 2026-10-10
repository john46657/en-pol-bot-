import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { loadEnv } from '../config/env';

const API = 'https://discord.com/api/v10';
/** Wie lange ein Abgleich gilt, bevor die Discord-Rollen erneut geprüft werden. */
const CHECK_TTL_MS = 2 * 60_000;
/** Regelmäßiger Abgleich aller angemeldeten Discord-Benutzer (auch ohne Aktivität). */
const SWEEP_MS = 5 * 60_000;

/** `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum Dashboard (leer = jedes Server-Mitglied). */
export interface DiscordLoginSettings { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[]; teamRoleIds: string[] }
export const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings = { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] };
export type Membership = { roles: string[] } | null | 'unknown';
export type AccessVerdict = 'ok' | 'not_member' | 'no_team_role';

/**
 * Discord-Rollen → Dashboard-Zugang und Dashboard-Rollen. Wird beim Login geprüft und danach laufend:
 * bei Anfragen (spätestens alle 2 Minuten je Benutzer) und im Hintergrund alle 5 Minuten.
 * Verliert jemand die freigeschaltete Discord-Rolle, werden seine Sessions sofort beendet; gewonnene/verlorene
 * verknüpfte Rollen werden vergeben bzw. entzogen. Ist Discord nicht erreichbar, bleibt der letzte Stand.
 */
@Injectable()
export class DiscordAccessService implements OnModuleInit, OnModuleDestroy {
  private readonly env = loadEnv();
  private readonly log = new Logger('DiscordAccess');
  private readonly checked = new Map<string, { at: number; ok: boolean }>();
  private readonly inflight = new Map<string, Promise<boolean>>();
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test' || !this.env.DISCORD_TOKEN) return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.log.warn(`sweep failed: ${e instanceof Error ? e.message : e}`)), SWEEP_MS);
    this.timer.unref?.();
  }
  onModuleDestroy() { clearInterval(this.timer); }

  isOwnerId(discordId: string) { return (this.env.ADMIN_DISCORD_IDS ?? '').split(/[\s,;]+/).includes(discordId); }

  async settings(): Promise<DiscordLoginSettings> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'auth.discord' } }))?.value as Partial<DiscordLoginSettings> | undefined;
    return { ...DEFAULT_DISCORD_LOGIN, ...(v ?? {}) };
  }

  /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
  async membership(discordId: string): Promise<Membership> {
    const token = this.env.DISCORD_TOKEN;
    if (!token) return 'unknown';
    const bot = this.bot(token);
    try {
      const guilds = await this.guildIds(bot);
      if (!guilds) return 'unknown';
      let isMember = false;
      const roles: string[] = [];
      for (const g of guilds) {
        const r = await bot(`/guilds/${g}/members/${discordId}`);
        if (r.status === 404) continue;
        if (!r.ok) return 'unknown';
        isMember = true;
        roles.push(...(((await r.json()) as { roles?: string[] }).roles ?? []));
      }
      return isMember ? { roles } : null;
    } catch { return 'unknown'; }
  }

  private bot(token: string) { return (path: string) => fetch(`${API}${path}`, { headers: { authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) }); }

  /** Eingestellte Server bzw. alle Server des Bots (max. 20); `null` = Discord nicht erreichbar. */
  private async guildIds(bot: (path: string) => Promise<Response>): Promise<string[] | null> {
    const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
    let guilds = [cfg?.guildId, this.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
    if (!guilds.length) {
      const r = await bot('/users/@me/guilds?limit=200');
      if (!r.ok) return null;
      guilds = ((await r.json()) as { id: string }[]).map((g) => g.id);
    }
    return [...new Set(guilds)].slice(0, 20);
  }

  /** Server-Mitglieder per Name suchen (Discord: Benutzer- oder Servername beginnt mit `query`). Ohne Token/Discord: leer. */
  async searchMembers(query: string, limit = 25): Promise<{ id: string; username: string; displayName: string; avatar: string | null }[]> {
    const token = this.env.DISCORD_TOKEN;
    if (!token || !query.trim()) return [];
    const bot = this.bot(token);
    try {
      const guilds = (await this.guildIds(bot)) ?? [];
      const found = new Map<string, { id: string; username: string; displayName: string; avatar: string | null }>();
      for (const g of guilds) {
        const r = await bot(`/guilds/${g}/members/search?query=${encodeURIComponent(query.trim())}&limit=${limit}`);
        if (!r.ok) continue;
        for (const m of (await r.json()) as { nick?: string | null; user: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean } }[]) {
          if (m.user.bot || found.has(m.user.id)) continue;
          found.set(m.user.id, { id: m.user.id, username: m.user.username, displayName: m.nick || m.user.global_name || m.user.username, avatar: m.user.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64` : null });
        }
      }
      return [...found.values()].slice(0, limit);
    } catch { return []; }
  }

  /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
  verdict(member: { roles: string[] } | null, s: DiscordLoginSettings): AccessVerdict {
    if ((s.requireGuild || s.teamRoleIds.length) && member === null) return 'not_member';
    if (s.teamRoleIds.length && !member!.roles.some((r) => s.teamRoleIds.includes(r))) return 'no_team_role';
    return 'ok';
  }

  /**
   * Discord-Rolle → Dashboard-Rolle: verknüpfte Rollen (Rollen-Editor) und die ältere Zuordnungsliste (Einstellungen).
   * Vergeben/entzogen werden nur Rollen, die überhaupt mit Discord verknüpft sind; manuell vergebene Rollen bleiben.
   */
  async syncRoles(userId: string, discordRoles: string[], s?: DiscordLoginSettings) {
    const settings = s ?? (await this.settings());
    const names = [...new Set(settings.roleMap.map((m) => m.role))];
    const roles = await this.prisma.role.findMany({ where: { OR: [{ name: { in: names } }, { discordRoleIds: { isEmpty: false } }] } });
    if (!roles.length) return;
    const want = new Set([
      ...settings.roleMap.filter((m) => discordRoles.includes(m.discordRoleId)).map((m) => m.role),
      ...roles.filter((r) => r.discordRoleIds.some((d) => discordRoles.includes(d))).map((r) => r.name),
    ]);
    const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: roles.map((r) => r.id) } } });
    const add = roles.filter((r) => want.has(r.name) && !current.some((c) => c.roleId === r.id));
    const remove = roles.filter((r) => !want.has(r.name) && current.some((c) => c.roleId === r.id) && r.name !== 'System Administrator');
    if (!add.length && !remove.length) return;
    await this.prisma.$transaction(async (tx) => {
      if (add.length) await tx.userRole.createMany({ data: add.map((r) => ({ userId, roleId: r.id })), skipDuplicates: true });
      if (remove.length) await tx.userRole.deleteMany({ where: { userId, roleId: { in: remove.map((r) => r.id) } } });
      await this.audit.record({ userId: null }, { action: 'auth.discord.roles_synced', module: 'permissions', entityType: 'User', entityId: userId, after: { added: add.map((r) => r.name), removed: remove.map((r) => r.name) } }, tx);
    });
    this.rt.publishToUser(userId, 'permissions.changed', {});
  }

  /** Abgleich nach dem Login merken (kein zweiter Discord-Aufruf direkt danach). */
  remember(userId: string, ok: boolean) { this.checked.set(userId, { at: Date.now(), ok }); }
  forget(userId?: string) { if (userId) this.checked.delete(userId); else this.checked.clear(); }

  /** Laufende Prüfung (AuthGuard). `false` = kein Zugriff mehr – Sessions sind dann bereits beendet. */
  async verify(userId: string, force = false): Promise<boolean> {
    const c = this.checked.get(userId);
    if (!force && c && Date.now() - c.at < CHECK_TTL_MS) return c.ok;
    const running = this.inflight.get(userId);
    if (running) return running;
    const p = this.check(userId).then((ok) => { this.remember(userId, ok); return ok; }, () => c?.ok ?? true).finally(() => this.inflight.delete(userId));
    this.inflight.set(userId, p);
    return p;
  }

  private async check(userId: string): Promise<boolean> {
    if (!this.env.DISCORD_TOKEN) return true;
    const link = await this.prisma.discordLink.findUnique({ where: { userId } });
    if (!link || this.isOwnerId(link.discordId)) return true; // Passwort-Konten und Besitzer: kein Discord-Zwang
    const member = await this.membership(link.discordId);
    if (member === 'unknown') return this.checked.get(userId)?.ok ?? true; // Discord nicht erreichbar → letzter Stand
    const s = await this.settings();
    const verdict = this.verdict(member, s);
    if (verdict !== 'ok') {
      const r = await this.prisma.session.updateMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (r.count) {
        await this.audit.record({ userId: null }, { action: 'auth.discord.access_revoked', module: 'permissions', entityType: 'User', entityId: userId, after: { reason: verdict, sessionsEnded: r.count } });
        this.rt.publishToUser(userId, 'session.revoked', { reason: verdict });
      }
      return false;
    }
    await this.syncRoles(userId, member!.roles, s);
    return true;
  }

  /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
  async sweep() {
    const sessions = await this.prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true }, distinct: ['userId'], take: 500 });
    for (const s of sessions) await this.verify(s.userId, true);
  }
}
