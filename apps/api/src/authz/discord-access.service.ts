import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { loadEnv } from '../config/env';
import { homeGuild } from '../common/guild-context';

const API = 'https://discord.com/api/v10';
/** Wie lange ein Abgleich gilt, bevor die Discord-Rollen erneut geprüft werden. */
const CHECK_TTL_MS = 2 * 60_000;
/** Regelmäßiger Abgleich aller angemeldeten Discord-Benutzer (auch ohne Aktivität). */
const SWEEP_MS = 5 * 60_000;

/** `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum Dashboard (leer = jedes Server-Mitglied). */
export interface DiscordLoginSettings { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[]; teamRoleIds: string[] }
export const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings = { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] };
/** `roles` = Discord-Rollen auf dem Server (Zugangsprüfung), `byGuild` = dieselben Rollen mit Server-ID (für den Rollenabgleich). */
export type Membership = { roles: string[]; byGuild: Record<string, string[]> } | null | 'unknown';
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

  /** Mitglied auf dem Discord-Server dieses Systems? `null` = nein, `unknown` = nicht prüfbar. */
  async membership(discordId: string): Promise<Membership> {
    const token = this.env.DISCORD_TOKEN;
    if (!token) return 'unknown';
    const bot = this.bot(token);
    try {
      const g = await this.guildId(bot);
      if (!g) return 'unknown';
      const r = await bot(`/guilds/${g}/members/${discordId}`);
      if (r.status === 404) return null;
      if (!r.ok) return 'unknown';
      const roles = ((await r.json()) as { roles?: string[] }).roles ?? [];
      return { roles, byGuild: { [g]: roles } };
    } catch { return 'unknown'; }
  }

  private bot(token: string) { return (path: string) => fetch(`${API}${path}`, { headers: { authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) }); }

  /**
   * Discord-Server dieses Systems. Ist noch keiner eingerichtet, gilt der Server des Bots – aber nur, wenn es genau einer ist
   * (sonst wäre unklar, wo geprüft wird). `null` = Discord nicht erreichbar bzw. kein eindeutiger Server.
   */
  private async guildId(bot: (path: string) => Promise<Response>): Promise<string | null> {
    const home = homeGuild();
    if (home) return home;
    const r = await bot('/users/@me/guilds?limit=200');
    if (!r.ok) return null;
    const guilds = (await r.json()) as { id: string }[];
    return guilds.length === 1 ? guilds[0]!.id : null;
  }

  /** Server-Mitglieder per Name suchen (Discord: Benutzer- oder Servername beginnt mit `query`). Ohne Token/Discord: leer. */
  async searchMembers(query: string, limit = 25): Promise<{ id: string; username: string; displayName: string; avatar: string | null }[]> {
    const token = this.env.DISCORD_TOKEN;
    if (!token || !query.trim()) return [];
    const bot = this.bot(token);
    try {
      const g = await this.guildId(bot);
      const found = new Map<string, { id: string; username: string; displayName: string; avatar: string | null }>();
      if (g) {
        const r = await bot(`/guilds/${g}/members/search?query=${encodeURIComponent(query.trim())}&limit=${limit}`);
        if (r.ok) for (const m of (await r.json()) as { nick?: string | null; user: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean } }[]) {
          if (m.user.bot || found.has(m.user.id)) continue;
          found.set(m.user.id, { id: m.user.id, username: m.user.username, displayName: m.nick || m.user.global_name || m.user.username, avatar: m.user.avatar ? `https://cdn.discordapp.com/avatars/${m.user.id}/${m.user.avatar}.png?size=64` : null });
        }
      }
      return [...found.values()].slice(0, limit);
    } catch { return []; }
  }

  private readonly avatarCache = new Map<string, { url: string | null; at: number }>();
  /** Profilbilder zu Discord-IDs (Discord-API, 6 h zwischengespeichert). Ohne Token/Discord: leer. */
  async avatars(ids: string[]): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    const token = this.env.DISCORD_TOKEN;
    const now = Date.now();
    const missing: string[] = [];
    for (const id of new Set(ids)) {
      const c = this.avatarCache.get(id);
      if (c && now - c.at < 6 * 3_600_000) out.set(id, c.url); else missing.push(id);
    }
    if (!token || !missing.length) return out;
    const bot = this.bot(token);
    await Promise.all(missing.slice(0, 100).map(async (id) => {
      try {
        const r = await bot(`/users/${id}`);
        if (!r.ok) return;
        const u = (await r.json()) as { avatar?: string | null };
        const url = u.avatar ? `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.png?size=64` : null;
        this.avatarCache.set(id, { url, at: now });
        out.set(id, url);
      } catch { /* Profilbild ist nur Deko */ }
    }));
    if (this.avatarCache.size > 5000) this.avatarCache.clear();
    return out;
  }

  /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
  verdict(member: { roles: string[] } | null, s: DiscordLoginSettings): AccessVerdict {
    if ((s.requireGuild || s.teamRoleIds.length) && member === null) return 'not_member';
    if (s.teamRoleIds.length && !member!.roles.some((r) => s.teamRoleIds.includes(r))) return 'no_team_role';
    return 'ok';
  }

  /**
   * Discord-Rolle → Dashboard-Rolle: verknüpfte Rollen (Rollen-Editor `discordRoleIds`, ältere Zuordnungsliste der
   * Einstellungen). Über Discord vergebene Zuweisungen merken sich den Discord-Server (`UserRole.guildIds`), damit der Abgleich
   * sie wieder entziehen kann; manuell vergebene Rollen (ohne Server) und „System Administrator“ bleiben unangetastet.
   * `byGuild` enthält höchstens den Discord-Server dieses Systems (Rollen anderer Server werden ignoriert).
   */
  async syncRoles(userId: string, byGuild: Record<string, string[]>, s?: DiscordLoginSettings) {
    const home = homeGuild() ?? Object.keys(byGuild)[0] ?? null;
    if (!home || !byGuild[home]) return;
    const have = byGuild[home]!;
    const settings = s ?? (await this.settings());
    const names = [...new Set(settings.roleMap.map((m) => m.role))];
    const roles = await this.prisma.role.findMany({ where: { guildId: null, name: { not: 'System Administrator' }, OR: [{ name: { in: names } }, { discordRoleIds: { isEmpty: false } }] } });
    if (!roles.length) return;
    const wanted = (r: (typeof roles)[number]) => r.discordRoleIds.some((d) => have.includes(d)) || settings.roleMap.some((m) => m.role === r.name && have.includes(m.discordRoleId));
    const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: roles.map((r) => r.id) } } });
    const changes: { name: string; added: boolean }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const r of roles) {
        const row = current.find((c) => c.roleId === r.id);
        if (row && !row.guildIds.length) continue; // manuell vergeben: bleibt
        if (wanted(r)) {
          if (!row) { await tx.userRole.create({ data: { userId, roleId: r.id, guildIds: [home] } }); changes.push({ name: r.name, added: true }); }
          else if (row.guildIds.length !== 1 || row.guildIds[0] !== home) await tx.userRole.update({ where: { userId_roleId: { userId, roleId: r.id } }, data: { guildIds: [home] } });
        } else if (row) {
          await tx.userRole.delete({ where: { userId_roleId: { userId, roleId: r.id } } });
          changes.push({ name: r.name, added: false });
        }
      }
      if (changes.length) await this.audit.record({ userId: null }, { action: 'auth.discord.roles_synced', module: 'permissions', entityType: 'User', entityId: userId, after: { added: changes.filter((c) => c.added).map((c) => c.name), removed: changes.filter((c) => !c.added).map((c) => c.name) } }, tx);
    });
    if (changes.length) this.rt.publishToUser(userId, 'permissions.changed', {});
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
    await this.syncRoles(userId, member!.byGuild, s);
    return true;
  }

  /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
  async sweep() {
    const sessions = await this.prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true }, distinct: ['userId'], take: 500 });
    for (const s of sessions) await this.verify(s.userId, true);
  }
}
