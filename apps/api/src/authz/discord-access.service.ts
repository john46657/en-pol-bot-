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
/** `roles` = alle Discord-Rollen (Zugangsprüfung), `byGuild` = Rollen je geprüftem Server (Mitglied), `checked` = geprüfte Server. */
export type Membership = { roles: string[]; byGuild: Record<string, string[]>; checked: string[] } | null | 'unknown';
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
      const byGuild: Record<string, string[]> = {};
      for (const g of guilds) {
        const r = await bot(`/guilds/${g}/members/${discordId}`);
        if (r.status === 404) continue;
        if (!r.ok) return 'unknown';
        byGuild[g] = ((await r.json()) as { roles?: string[] }).roles ?? [];
      }
      return Object.keys(byGuild).length ? { roles: Object.values(byGuild).flat(), byGuild, checked: guilds } : null;
    } catch { return 'unknown'; }
  }

  private bot(token: string) { return (path: string) => fetch(`${API}${path}`, { headers: { authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) }); }

  /** Eingestellte und registrierte Server bzw. alle Server des Bots (max. 20); `null` = Discord nicht erreichbar. */
  private async guildIds(bot: (path: string) => Promise<Response>): Promise<string[] | null> {
    const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
    const registered = (await this.prisma.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true }, take: 20 })).map((s) => s.guildId);
    let guilds = [cfg?.guildId, this.env.DISCORD_GUILD_ID, ...registered].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
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
   * Mitgliedschaften je registriertem Server festhalten: geprüft und Mitglied → MEMBER (mit Discord-Rollen), geprüft und
   * nicht Mitglied → LEFT. Manuelle Mitgliedschaften (Konten ohne Discord) bleiben unangetastet.
   */
  async recordMemberships(userId: string, byGuild: Record<string, string[]>, checked: string[]) {
    await this.ensureConfiguredServers();
    const servers = await this.prisma.discordServer.findMany({ where: { guildId: { in: checked } }, select: { id: true, guildId: true } });
    const now = new Date();
    for (const sv of servers) {
      const roles = byGuild[sv.guildId];
      const status = roles ? 'MEMBER' : 'LEFT';
      await this.prisma.serverMembership.upsert({
        where: { serverId_userId: { serverId: sv.id, userId } },
        create: { serverId: sv.id, userId, status, source: 'DISCORD', discordRoleIds: roles ?? [], lastVerifiedAt: now },
        update: { status, source: 'DISCORD', discordRoleIds: roles ?? [], lastVerifiedAt: now },
      }).catch(() => undefined);
    }
  }

  /**
   * Discord-Rolle → Dashboard-Rolle, JE SERVER: verknüpfte Rollen (Rollen-Editor `discordRoleIds`, Zuordnungstabelle
   * `DiscordRoleMapping`, ältere Zuordnungsliste der Einstellungen). Die Zuweisung merkt sich, auf welchen Servern sie gilt
   * (`UserRole.guildIds`) – eine Discord-Rolle auf Server A verleiht nie Rechte auf Server B. Nur die in `byGuild`/`checked`
   * geprüften Server werden geändert; Rollen ohne Discord-Verknüpfung und „System Administrator“ bleiben unangetastet.
   */
  async syncRoles(userId: string, byGuild: Record<string, string[]>, s?: DiscordLoginSettings, checked: string[] = Object.keys(byGuild)) {
    const settings = s ?? (await this.settings());
    const names = [...new Set(settings.roleMap.map((m) => m.role))];
    const roles = await this.prisma.role.findMany({
      where: { name: { not: 'System Administrator' }, OR: [{ name: { in: names } }, { discordRoleIds: { isEmpty: false } }, { discordMappings: { some: {} } }] },
      include: { discordMappings: { include: { server: { select: { guildId: true } } } } },
    });
    if (!roles.length) return;
    const wantedGuilds = (r: (typeof roles)[number]) => checked.filter((g) => {
      if (r.guildId && r.guildId !== g) return false; // Server-Rolle gilt nur auf ihrem Server
      const have = byGuild[g];
      if (!have) return false;
      return r.discordRoleIds.some((d) => have.includes(d))
        || r.discordMappings.some((m) => m.server.guildId === g && have.includes(m.discordRoleId))
        || settings.roleMap.some((m) => m.role === r.name && have.includes(m.discordRoleId));
    });
    const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: roles.map((r) => r.id) } } });
    const changes: { name: string; before: string[]; after: string[] }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const r of roles) {
        const row = current.find((c) => c.roleId === r.id);
        // bisherige Server behalten, die jetzt nicht geprüft wurden; geprüfte neu bestimmen
        const keep = (row?.guildIds ?? []).filter((g) => !checked.includes(g));
        const next = [...new Set([...keep, ...wantedGuilds(r)])].sort();
        const before = row ? [...row.guildIds].sort() : null;
        if (!next.length) {
          if (row) { await tx.userRole.delete({ where: { userId_roleId: { userId, roleId: r.id } } }); changes.push({ name: r.name, before: before!, after: [] }); }
          continue;
        }
        if (!row) { await tx.userRole.create({ data: { userId, roleId: r.id, guildIds: next } }); changes.push({ name: r.name, before: [], after: next }); continue; }
        if (JSON.stringify(before) !== JSON.stringify(next)) { await tx.userRole.update({ where: { userId_roleId: { userId, roleId: r.id } }, data: { guildIds: next } }); changes.push({ name: r.name, before: before!, after: next }); }
      }
      if (changes.length) await this.audit.record({ userId: null }, { action: 'auth.discord.roles_synced', module: 'permissions', entityType: 'User', entityId: userId, serverId: null, after: { added: changes.filter((c) => !c.before.length).map((c) => c.name), removed: changes.filter((c) => !c.after.length).map((c) => c.name), servers: changes } }, tx);
    });
    if (changes.length) this.rt.publishToUser(userId, 'permissions.changed', {});
  }

  /**
   * Vom Administrator ausdrücklich eingestellte Haupt-Server (DISCORD_GUILD_ID bzw. Einstellung „Discord-Server-ID“) sind
   * automatisch registriert und aktiv – andere vom Bot entdeckte Server müssen ein globaler Systemadministrator freischalten.
   */
  async ensureConfiguredServers() {
    const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
    const ids = [...new Set([cfg?.guildId, process.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g)))];
    if (!ids.length) return;
    const have = new Set((await this.prisma.discordServer.findMany({ where: { guildId: { in: ids } }, select: { guildId: true } })).map((s) => s.guildId));
    for (const guildId of ids.filter((g) => !have.has(g))) {
      const known = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value;
      const name = (Array.isArray(known) ? (known as { id?: string; name?: string }[]).find((g) => g.id === guildId)?.name : undefined) ?? guildId;
      await this.prisma.discordServer.create({ data: { guildId, name, status: 'ACTIVE' } }).then(
        (c) => this.audit.record({ userId: null }, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: c.id, serverId: guildId, after: { guildId, name, via: 'configured' } }),
        () => undefined,
      );
    }
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
    await this.recordMemberships(userId, member!.byGuild, member!.checked);
    await this.syncRoles(userId, member!.byGuild, s, member!.checked);
    return true;
  }

  /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
  async sweep() {
    const sessions = await this.prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true }, distinct: ['userId'], take: 500 });
    for (const s of sessions) await this.verify(s.userId, true);
  }
}
