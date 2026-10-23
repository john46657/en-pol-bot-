import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { loadEnv } from '../config/env';
import { initServerRoles } from '../multi-server/server-roles';
import { runInGuild, settingsGuild } from '../common/guild-context';

const API = 'https://discord.com/api/v10';
/** Wie lange ein Abgleich gilt, bevor die Discord-Rollen erneut geprüft werden. */
const CHECK_TTL_MS = 2 * 60_000;
/** Regelmäßiger Abgleich aller angemeldeten Discord-Benutzer (auch ohne Aktivität). */
const SWEEP_MS = 5 * 60_000;

/**
 * `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum Dashboard (leer = jedes Server-Mitglied).
 * `guildAdmins`: wer auf einem Server das Discord-Recht „Administrator“ hat (oder Besitzer ist), kommt immer rein und ist
 * Server-Administrator genau dieses Servers.
 */
export interface DiscordLoginSettings { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[]; teamRoleIds: string[]; guildAdmins: boolean }
export const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings = { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [], guildAdmins: true };
/**
 * Anmelde-Einstellungen JE SERVER (`auth.discord@<Server>`): Teamrollen, Rollen-Zuordnung, Discord-Admins und Registrierung
 * gelten nur für den eigenen Server. `base` = gemeinsamer Grundwert (Server ohne eigene Einstellung, „Nur Mitglieder“).
 */
export interface LoginPolicy { base: DiscordLoginSettings; byGuild: Record<string, DiscordLoginSettings> }
const KEY = 'auth.discord';
/**
 * `roles` = alle Discord-Rollen (Zugangsprüfung), `byGuild` = Rollen je geprüftem Server (Mitglied), `checked` = geprüfte Server,
 * `admin` = Server, auf denen die Person das Discord-Recht „Administrator“ hat oder Besitzer ist.
 */
export type Membership = { roles: string[]; byGuild: Record<string, string[]>; checked: string[]; admin?: string[] } | null | 'unknown';
/** Rolle, die Discord-Administratoren eines Servers bekommen (Rechte nur auf diesem Server). */
export const SERVER_ADMIN_ROLE = 'Server-Administrator';
const ADMINISTRATOR = 0x8n;
/** Wie lange Besitzer und Rollenrechte eines Servers zwischengespeichert werden. */
const GUILD_TTL_MS = 5 * 60_000;
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
  private readonly guildInfo = new Map<string, { at: number; ownerId: string; adminRoles: Set<string> }>();
  private timer?: NodeJS.Timeout;
  private resyncTimer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService) {}

  onModuleInit() {
    if (this.env.NODE_ENV === 'test' || !this.env.DISCORD_TOKEN) return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.log.warn(`sweep failed: ${e instanceof Error ? e.message : e}`)), SWEEP_MS);
    this.timer.unref?.();
  }
  onModuleDestroy() { clearInterval(this.timer); clearTimeout(this.resyncTimer); }

  isOwnerId(discordId: string) { return (this.env.ADMIN_DISCORD_IDS ?? '').split(/[\s,;]+/).includes(discordId); }

  /** Gemeinsamer Grundwert – unabhängig vom gewählten Server der Anfrage. */
  async settings(): Promise<DiscordLoginSettings> {
    const v = (await runInGuild(null, async () => await this.prisma.systemSetting.findUnique({ where: { key: KEY } })))?.value as Partial<DiscordLoginSettings> | undefined;
    return { ...DEFAULT_DISCORD_LOGIN, ...(v ?? {}) };
  }

  /** Einstellungen der angegebenen Server: eigener Wert des Servers (bzw. seiner Gruppe), sonst der Grundwert. */
  async policy(guildIds: string[]): Promise<LoginPolicy> {
    const base = await this.settings();
    const keys = new Map(guildIds.map((g) => [g, `${KEY}@${settingsGuild(g) ?? g}`]));
    const rows = keys.size ? await runInGuild(null, async () => await this.prisma.systemSetting.findMany({ where: { key: { in: [...new Set(keys.values())] } } })) : [];
    const byGuild: Record<string, DiscordLoginSettings> = {};
    for (const [g, k] of keys) {
      const own = rows.find((r) => r.key === k)?.value as Partial<DiscordLoginSettings> | undefined;
      // „Nur Mitglieder“ betrifft die Anmeldung vor jeder Server-Zuordnung → immer der Grundwert
      byGuild[g] = own ? { ...DEFAULT_DISCORD_LOGIN, ...own, requireGuild: base.requireGuild } : base;
    }
    return { base, byGuild };
  }

  /** Server, auf denen die Mitgliedschaft Zugang gibt (Teamrolle des Servers, Discord-Admin des Servers oder keine Teamrollen dort). */
  grantingGuilds(member: { byGuild: Record<string, string[]>; admin?: string[] }, p: LoginPolicy): string[] {
    return Object.entries(member.byGuild).filter(([g, roles]) => {
      const s = p.byGuild[g] ?? p.base;
      return (s.guildAdmins && !!member.admin?.includes(g)) || !s.teamRoleIds.length || roles.some((r) => s.teamRoleIds.includes(r));
    }).map(([g]) => g);
  }
  /** Sind irgendwo Teamrollen Pflicht? Dann kommt ohne Server-Mitgliedschaft niemand rein. */
  teamRolesRequired(p: LoginPolicy) { return !!p.base.teamRoleIds.length || Object.values(p.byGuild).some((s) => s.teamRoleIds.length > 0); }

  /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
  async membership(discordId: string): Promise<Membership> {
    const token = this.env.DISCORD_TOKEN;
    if (!token) return 'unknown';
    const bot = this.bot(token);
    try {
      const guilds = await this.guildIds(bot);
      if (!guilds) return 'unknown';
      const byGuild: Record<string, string[]> = {};
      const admin: string[] = [];
      for (const g of guilds) {
        const r = await bot(`/guilds/${g}/members/${discordId}`);
        if (r.status === 404) continue;
        if (!r.ok) return 'unknown';
        byGuild[g] = ((await r.json()) as { roles?: string[] }).roles ?? [];
        const info = await this.guildAdmins(bot, g);
        if (info && (info.ownerId === discordId || info.adminRoles.has(g) || byGuild[g]!.some((x) => info.adminRoles.has(x)))) admin.push(g);
      }
      return Object.keys(byGuild).length ? { roles: Object.values(byGuild).flat(), byGuild, checked: guilds, admin } : null;
    } catch { return 'unknown'; }
  }

  /** Besitzer und Rollen mit dem Discord-Recht „Administrator“ (die @everyone-Rolle hat die ID des Servers); `null` = nicht lesbar. */
  private async guildAdmins(bot: (path: string) => Promise<Response>, guildId: string) {
    const c = this.guildInfo.get(guildId);
    if (c && Date.now() - c.at < GUILD_TTL_MS) return c;
    const r = await bot(`/guilds/${guildId}`);
    if (!r.ok) return c ?? null;
    const g = (await r.json()) as { owner_id?: string; roles?: { id: string; permissions?: string }[] };
    const adminRoles = new Set((g.roles ?? []).filter((x) => /^\d+$/.test(x.permissions ?? '') && (BigInt(x.permissions!) & ADMINISTRATOR) !== 0n).map((x) => x.id));
    const info = { at: Date.now(), ownerId: g.owner_id ?? '', adminRoles };
    this.guildInfo.set(guildId, info);
    return info;
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
  verdict(member: { byGuild: Record<string, string[]>; admin?: string[] } | null, p: LoginPolicy): AccessVerdict {
    if (member === null) return p.base.requireGuild || this.teamRolesRequired(p) ? 'not_member' : 'ok';
    return this.grantingGuilds(member, p).length ? 'ok' : 'no_team_role';
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
  async syncRoles(userId: string, byGuild: Record<string, string[]>, p?: LoginPolicy, checked: string[] = Object.keys(byGuild), adminGuilds: string[] = []) {
    const policy = p ?? (await this.policy(checked));
    const conf = (g: string) => policy.byGuild[g] ?? policy.base; // Zuordnungen gelten nur auf ihrem Server
    const admins = adminGuilds.filter((g) => checked.includes(g) && conf(g).guildAdmins);
    if (admins.length) await this.ensureServerAdminRoles(admins);
    const names = [...new Set([...checked.flatMap((g) => conf(g).roleMap.map((m) => m.role)), SERVER_ADMIN_ROLE])];
    // nur Rollen der geprüften Server – serverübergreifende Vorlagen werden nicht über Discord vergeben
    const roles = await this.prisma.role.findMany({
      // auch Rollen, die der Benutzer noch über Discord hat, deren Verknüpfung aber entfernt wurde – sonst bliebe die Zuweisung für immer
      where: { guildId: { in: checked }, name: { not: 'System Administrator' }, OR: [{ name: { in: names } }, { discordRoleIds: { isEmpty: false } }, { discordMappings: { some: {} } }, { users: { some: { userId, guildIds: { isEmpty: false } } } }] },
      include: { discordMappings: { include: { server: { select: { guildId: true } } } } },
    });
    if (!roles.length) return;
    const wantedGuilds = (r: (typeof roles)[number]) => checked.filter((g) => {
      if (r.guildId !== g) return false; // Server-Rolle gilt nur auf ihrem Server
      const have = byGuild[g];
      if (!have) return false;
      if (r.name === SERVER_ADMIN_ROLE && admins.includes(g)) return true;
      return r.discordRoleIds.some((d) => have.includes(d))
        || r.discordMappings.some((m) => m.server.guildId === g && have.includes(m.discordRoleId))
        || conf(g).roleMap.some((m) => m.role === r.name && have.includes(m.discordRoleId));
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
        if (!row.guildIds.length) continue; // manuell vergeben: bleibt
        if (JSON.stringify(before) !== JSON.stringify(next)) { await tx.userRole.update({ where: { userId_roleId: { userId, roleId: r.id } }, data: { guildIds: next } }); changes.push({ name: r.name, before: before!, after: next }); }
      }
      if (changes.length) await this.audit.record({ userId: null }, { action: 'auth.discord.roles_synced', module: 'permissions', entityType: 'User', entityId: userId, serverId: null, after: { added: changes.filter((c) => !c.before.length).map((c) => c.name), removed: changes.filter((c) => !c.after.length).map((c) => c.name), servers: changes } }, tx);
    });
    if (changes.length) this.rt.publishToUser(userId, 'permissions.changed', {});
  }

  /** Rolle „Server-Administrator“ (alle Rechte, nur auf diesem Server) für registrierte Server anlegen, falls es sie noch nicht gibt. */
  private async ensureServerAdminRoles(guildIds: string[]) {
    const servers = await this.prisma.discordServer.findMany({ where: { guildId: { in: guildIds }, archivedAt: null }, select: { guildId: true } });
    const have = new Set((await this.prisma.role.findMany({ where: { guildId: { in: servers.map((x) => x.guildId) }, name: SERVER_ADMIN_ROLE }, select: { guildId: true } })).map((r) => r.guildId));
    for (const { guildId } of servers.filter((x) => !have.has(x.guildId))) {
      await this.prisma.role.create({ data: { guildId, name: SERVER_ADMIN_ROLE, description: 'Discord-Administratoren dieses Servers (Rechte nur auf diesem Server)', priority: 2, permissions: { create: [{ permissionKey: '*', effect: 'ALLOW' }] } } }).catch(() => undefined);
    }
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
        async (c) => {
          // eingestellter Haupt-Server: bisherige Rollen samt Zuweisungen als eigene Server-Rollen übernehmen
          await initServerRoles(this.prisma, c.id, true);
          await this.audit.record({ userId: null }, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: c.id, serverId: guildId, after: { guildId, name, via: 'configured' } });
        },
        () => undefined,
      );
    }
  }

  /**
   * Discord-Verknüpfung einer Rolle geändert (Rollen-Editor): nicht bis zum nächsten Abgleich warten – jede nächste Anfrage
   * gleicht neu ab, und alle angemeldeten Benutzer werden kurz danach im Hintergrund geprüft.
   */
  resyncSoon() {
    this.forget();
    if (this.env.NODE_ENV === 'test' || !this.env.DISCORD_TOKEN) return;
    clearTimeout(this.resyncTimer);
    this.resyncTimer = setTimeout(() => void this.sweep().catch((e) => this.log.warn(`resync failed: ${e instanceof Error ? e.message : e}`)), 3_000);
    this.resyncTimer.unref?.();
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
    const p = await this.policy(member ? member.checked : []);
    const verdict = this.verdict(member, p);
    if (verdict !== 'ok') {
      const r = await this.prisma.session.updateMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, data: { revokedAt: new Date() } });
      if (r.count) {
        await this.audit.record({ userId: null }, { action: 'auth.discord.access_revoked', module: 'permissions', entityType: 'User', entityId: userId, after: { reason: verdict, sessionsEnded: r.count } });
        this.rt.publishToUser(userId, 'session.revoked', { reason: verdict });
      }
      return false;
    }
    await this.recordMemberships(userId, member!.byGuild, member!.checked);
    await this.syncRoles(userId, member!.byGuild, p, member!.checked, member!.admin);
    return true;
  }

  /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
  async sweep() {
    const sessions = await this.prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true }, distinct: ['userId'], take: 500 });
    for (const s of sessions) await this.verify(s.userId, true);
  }
}
