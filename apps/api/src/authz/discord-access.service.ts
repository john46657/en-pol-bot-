import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { loadEnv } from '../config/env';
import { ALL_PERMISSIONS } from '@enrp/shared';

const API = 'https://discord.com/api/v10';
/** Wie lange ein Abgleich gilt, bevor die Discord-Rollen erneut geprüft werden. */
const CHECK_TTL_MS = 2 * 60_000;
/** Regelmäßiger Abgleich aller angemeldeten Discord-Benutzer (auch ohne Aktivität). */
const SWEEP_MS = 5 * 60_000;
/** Server-Daten (Besitzer, Rollen-Rechte) und Server-Liste des Bots so lange zwischenspeichern. */
const GUILD_TTL_MS = 5 * 60_000;
/** Discord-Recht „Administrator“. */
const ADMINISTRATOR = 8n;
/** Automatische Dashboard-Rolle je Server für Discord-Administratoren (Name: „Discord-Admin · <Server>“). */
export const DISCORD_ADMIN_ROLE_PREFIX = 'Discord-Admin';
/** Discord-Admins bekommen auf ihrem Server alle Rechte – außer Benutzerkonten zu verwalten (die gelten serverübergreifend). */
export const DISCORD_ADMIN_GRANTS = ALL_PERMISSIONS.filter((p) => p !== 'users.manage');

/** `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum Dashboard (leer = jedes Server-Mitglied). */
export interface DiscordLoginSettings { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[]; teamRoleIds: string[] }
export const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings = { signup: true, requireGuild: true, roleMap: [], teamRoleIds: [] };
/** `adminGuilds`: Server, auf denen man Discord-Administrator ist (Besitzer oder eine Rolle mit dem Recht „Administrator“). */
export type Membership = { roles: string[]; adminGuilds?: string[] } | null | 'unknown';
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
  private readonly guildMeta = new Map<string, { at: number; ownerId: string; perms: Map<string, bigint> } | { at: number; missing: true }>();
  private botGuildList?: { at: number; ids: string[] };
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

  private bot(path: string) {
    return fetch(`${API}${path}`, { headers: { authorization: `Bot ${this.env.DISCORD_TOKEN}` }, signal: AbortSignal.timeout(10_000) });
  }

  /** Alle Server des Bots (zwischengespeichert). `null` = nicht abrufbar. */
  private async botGuilds(): Promise<string[] | null> {
    if (this.botGuildList && Date.now() - this.botGuildList.at < GUILD_TTL_MS) return this.botGuildList.ids;
    const r = await this.bot('/users/@me/guilds?limit=200');
    if (!r.ok) return this.botGuildList?.ids ?? null;
    const body = (await r.json()) as unknown;
    const ids = Array.isArray(body) ? body.map((g: { id?: unknown }) => String(g.id)).filter((g) => /^\d{15,25}$/.test(g)) : [];
    this.botGuildList = { at: Date.now(), ids };
    return ids;
  }

  /** Besitzer und Rechte je Rolle eines Servers (zwischengespeichert). */
  private async guildInfo(guildId: string) {
    const c = this.guildMeta.get(guildId);
    if (c && Date.now() - c.at < GUILD_TTL_MS) return 'missing' in c ? null : c;
    const r = await this.bot(`/guilds/${guildId}`);
    if (!r.ok) { this.guildMeta.set(guildId, { at: Date.now(), missing: true }); return null; }
    const g = (await r.json()) as { owner_id?: string; roles?: { id: string; permissions?: string }[] };
    const perms = new Map<string, bigint>();
    for (const role of g.roles ?? []) { try { perms.set(role.id, BigInt(role.permissions ?? '0')); } catch { /* ungültig → keine Rechte */ } }
    const v = { at: Date.now(), ownerId: String(g.owner_id ?? ''), perms };
    this.guildMeta.set(guildId, v);
    return v;
  }

  /** Discord-Administrator auf diesem Server? (Besitzer oder @everyone/eine eigene Rolle mit „Administrator“) */
  private async isGuildAdmin(guildId: string, discordId: string, memberRoles: string[]) {
    const g = await this.guildInfo(guildId);
    if (!g) return false;
    return g.ownerId === discordId || [guildId, ...memberRoles].some((r) => ((g.perms.get(r) ?? 0n) & ADMINISTRATOR) === ADMINISTRATOR);
  }

  /**
   * Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar.
   * Zusätzlich: auf welchen Servern des Bots man Discord-Administrator ist – die kommen immer ins Dashboard ihres Servers.
   */
  async membership(discordId: string, fresh = false): Promise<Membership> {
    if (!this.env.DISCORD_TOKEN) return 'unknown';
    if (fresh) { this.botGuildList = undefined; this.guildMeta.clear(); } // beim Login: Bot gerade erst hinzugefügt / Rechte gerade geändert
    try {
      const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
      const configured = [cfg?.guildId, this.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
      const all = await this.botGuilds();
      if (!configured.length && !all) return 'unknown';
      const scope = new Set(configured.length ? configured : all!);
      let isMember = false;
      const roles: string[] = [];
      const adminGuilds: string[] = [];
      for (const g of [...new Set([...scope, ...(all ?? [])])].slice(0, 25)) {
        const r = await this.bot(`/guilds/${g}/members/${discordId}`);
        if (r.status === 404) continue;
        if (!r.ok) { if (scope.has(g)) return 'unknown'; continue; }
        const memberRoles = ((await r.json()) as { roles?: string[] }).roles ?? [];
        if (scope.has(g)) { isMember = true; roles.push(...memberRoles); }
        if (await this.isGuildAdmin(g, discordId, memberRoles)) adminGuilds.push(g);
      }
      return isMember || adminGuilds.length ? { roles, adminGuilds } : null;
    } catch { return 'unknown'; }
  }

  /** Darf diese Mitgliedschaft ins Dashboard? (Besitzer aus ADMIN_DISCORD_IDS prüft der Aufrufer vorab.) */
  verdict(member: { roles: string[]; adminGuilds?: string[] } | null, s: DiscordLoginSettings): AccessVerdict {
    if (member?.adminGuilds?.length) return 'ok'; // Discord-Administratoren kommen immer rein (auf ihren Servern)
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

  /**
   * Discord-Administratoren: je Server eine automatische Dashboard-Rolle („Discord-Admin · Server“, gilt nur dort) mit allen
   * Rechten außer `users.manage`. Wer auf einem Server nicht mehr Administrator ist, verliert die Rolle beim nächsten Abgleich.
   */
  async syncAdminRoles(userId: string, adminGuilds: string[]) {
    const all = await this.prisma.role.findMany({ where: { system: true, guildId: { not: null }, name: { startsWith: `${DISCORD_ADMIN_ROLE_PREFIX} · ` } }, select: { id: true, guildId: true } });
    const roleFor = new Map(all.map((r) => [r.guildId!, r.id]));
    const names = new Map(((await this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }))?.value as { id: string; name: string }[] | undefined ?? []).map((g) => [g.id, g.name]));
    for (const g of adminGuilds) {
      if (roleFor.has(g)) continue;
      const r = await this.prisma.role.create({
        data: {
          name: `${DISCORD_ADMIN_ROLE_PREFIX} · ${(names.get(g) ?? 'Server').slice(0, 60)} (${g.slice(-4)})`, guildId: g, system: true, priority: 2, color: '#5865F2',
          description: 'Automatisch: alle mit dem Discord-Recht „Administrator“ auf diesem Server (Besitzer eingeschlossen).',
          permissions: { create: DISCORD_ADMIN_GRANTS.map((permissionKey) => ({ permissionKey, effect: 'ALLOW' })) },
        },
      });
      roleFor.set(g, r.id);
    }
    const want = new Set(adminGuilds.map((g) => roleFor.get(g)!));
    const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: [...roleFor.values()] } } });
    const add = [...want].filter((id) => !current.some((c) => c.roleId === id));
    const remove = current.filter((c) => !want.has(c.roleId)).map((c) => c.roleId);
    if (!add.length && !remove.length) return;
    await this.prisma.$transaction(async (tx) => {
      if (add.length) await tx.userRole.createMany({ data: add.map((roleId) => ({ userId, roleId })), skipDuplicates: true });
      if (remove.length) await tx.userRole.deleteMany({ where: { userId, roleId: { in: remove } } });
      await this.audit.record({ userId: null }, { action: 'auth.discord.admin_roles_synced', module: 'permissions', entityType: 'User', entityId: userId, after: { adminGuilds, added: add.length, removed: remove.length } }, tx);
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
    await this.syncAdminRoles(userId, member!.adminGuilds ?? []);
    return true;
  }

  /** Alle angemeldeten Discord-Benutzer prüfen (Rollenwechsel auch ohne Aktivität im Dashboard erkennen). */
  async sweep() {
    const sessions = await this.prisma.session.findMany({ where: { revokedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true }, distinct: ['userId'], take: 500 });
    for (const s of sessions) await this.verify(s.userId, true);
  }
}
