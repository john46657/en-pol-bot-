import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { loadEnv } from '../config/env';
import { webUrl } from '../common/web-url';
import { DiscordAccessService, type DiscordLoginSettings } from '../authz/discord-access.service';
import { PermissionService } from '../authz/permission.service';
import { initServerRoles } from '../multi-server/server-roles';

const API = 'https://discord.com/api/v10';
const STATE_TTL_MS = 10 * 60_000;
/** Kein gültiger Passwort-Hash → mit Passwort nicht anmeldbar (nur Discord). */
export const DISCORD_ONLY_PASSWORD = '!discord-login-only';

export { DEFAULT_DISCORD_LOGIN, type DiscordLoginSettings } from '../authz/discord-access.service';

/** Fehlercodes für die Login-Seite (`/login?discord=<code>`). */
export type DiscordLoginError = 'disabled' | 'state' | 'failed' | 'no_account' | 'not_member' | 'cannot_verify' | 'inactive' | 'taken' | 'no_team_role' | 'install_failed';
export class DiscordLoginFailure extends Error { constructor(readonly code: DiscordLoginError) { super(code); } }

interface Pending { mode: 'login' | 'link' | 'install'; userId?: string; browser: string; expires: number }
interface DiscordUser { id: string; username: string; global_name?: string | null }
/** Discord-Server des Benutzers, die er verwalten darf (Besitzer, Administrator oder „Server verwalten“). */
export interface ManagedGuild { id: string; name: string; icon: string | null }
const MANAGE = 0x8n | 0x20n; // ADMINISTRATOR | MANAGE_GUILD

/**
 * „Mit Discord anmelden“ (OAuth2, Scope `identify`) – wie bei Dyno & Co.
 * Zustand liegt serverseitig (das Session-Cookie ist SameSite=strict und kommt beim Rücksprung von Discord nicht mit);
 * zusätzlich bindet ein SameSite=lax-Cookie den Vorgang an den Browser (Schutz vor Login-CSRF).
 * Server-Mitgliedschaft und Rollen werden mit dem Bot-Token geprüft.
 */
@Injectable()
export class DiscordOAuthService {
  private readonly env = loadEnv();
  private readonly pending = new Map<string, Pending>();
  private readonly log = new Logger('DiscordLogin');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly auth: AuthService, private readonly access: DiscordAccessService, private readonly perms: PermissionService) {}

  clientId(): string | null {
    if (this.env.DISCORD_CLIENT_ID) return this.env.DISCORD_CLIENT_ID;
    const first = this.env.DISCORD_TOKEN?.split('.')[0];
    if (!first) return null;
    const id = Buffer.from(first, 'base64').toString('utf8');
    return /^\d{15,25}$/.test(id) ? id : null;
  }
  enabled() { return !!(this.clientId() && this.env.DISCORD_CLIENT_SECRET); }
  /** Link zum Einladen des Bots auf einen Server – mit Administrator-Rechten (so gewünscht; deckt Tickets, Rollen, Threads ab). */
  inviteUrl(): string | null {
    const id = this.clientId();
    if (!id) return null;
    const perms = 8; // Administrator
    return `https://discord.com/oauth2/authorize?client_id=${id}&scope=bot%20applications.commands&permissions=${perms}`;
  }
  /** Passwort-Login nur, solange Discord-Login nicht eingerichtet ist – oder im Notfall mit PASSWORD_LOGIN=true. */
  passwordLoginAllowed() { return !this.enabled() || process.env.PASSWORD_LOGIN === 'true'; }
  private isAdminId(id: string) { return this.access.isOwnerId(id); }
  redirectUri() { return webUrl('/api/v1/auth/discord/callback'); }

  /** Schritt 1: Adresse bei Discord + Browser-Bindung. */
  start(mode: 'login' | 'link' | 'install', userId?: string, guildId?: string) {
    if (!this.enabled()) throw new DiscordLoginFailure('disabled');
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k);
    const state = randomBytes(24).toString('base64url'), browser = randomBytes(24).toString('base64url');
    this.pending.set(state, { mode, userId, browser, expires: now + STATE_TTL_MS });
    // „install“: Bot auf einen Server holen – über den Code-Ablauf, funktioniert auch mit „OAuth2-Code-Erlaubnis benötigt“
    const q = mode === 'install'
      ? new URLSearchParams({ response_type: 'code', client_id: this.clientId()!, scope: 'bot applications.commands', permissions: '8', redirect_uri: this.redirectUri(), state, ...(guildId ? { guild_id: guildId, disable_guild_select: 'true' } : {}) })
      // „guilds“: eigene Discord-Server für die Server-Übersicht (Kacheln „Bot einladen“)
      : new URLSearchParams({ response_type: 'code', client_id: this.clientId()!, scope: mode === 'login' ? 'identify guilds' : 'identify', redirect_uri: this.redirectUri(), state, prompt: 'none' });
    return { url: `https://discord.com/oauth2/authorize?${q}`, browser };
  }

  /** Schritt 2: Rücksprung von Discord. Liefert eine neue Session (Login) oder verknüpft das Konto (Link). */
  async callback(code: string | undefined, state: string | undefined, browser: string | undefined, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const p = state ? this.pending.get(state) : undefined;
    if (state) this.pending.delete(state); // nur einmal verwendbar
    if (!p || p.expires < Date.now() || !browser || p.browser !== browser) throw new DiscordLoginFailure('state');
    if (!code) throw new DiscordLoginFailure('failed');
    if (p.mode === 'install') {
      // Code einlösen = Bot tritt dem Server bei (Discord fügt ihn erst danach hinzu)
      const tok = await this.exchange(code).catch(() => { throw new DiscordLoginFailure('install_failed'); });
      const guildId = typeof tok.guild?.id === 'string' ? tok.guild.id : null;
      await this.audit.record({ userId: p.userId ?? null, requestId: meta.requestId }, { action: 'discord.bot_installed', module: 'discord', entityType: 'Guild', entityId: guildId ?? 'unknown', after: { guildId, name: tok.guild?.name ?? null } });
      return { kind: 'installed' as const, guildId, guildName: tok.guild?.name ?? null, userId: p.userId ?? null };
    }
    const { user: du, guilds } = await this.discordUser(code, p.mode === 'login');
    const settings = await this.settings();

    if (p.mode === 'link') {
      const other = await this.prisma.discordLink.findUnique({ where: { discordId: du.id } });
      if (other && other.userId !== p.userId) throw new DiscordLoginFailure('taken');
      if (!other) {
        await this.prisma.discordLink.deleteMany({ where: { userId: p.userId! } });
        await this.prisma.discordLink.create({ data: { userId: p.userId!, discordId: du.id } });
        await this.audit.record({ userId: p.userId!, requestId: meta.requestId }, { action: 'discord.link', module: 'discord', entityType: 'User', entityId: p.userId!, after: { discordId: du.id, via: 'oauth' } });
      }
      return { kind: 'linked' as const };
    }

    const member = await this.access.membership(du.id);
    const link = await this.prisma.discordLink.findUnique({ where: { discordId: du.id } });
    let user = link ? await this.prisma.user.findUnique({ where: { id: link.userId } }) : null;
    const owner = this.isAdminId(du.id); // Besitzer/Admins aus ADMIN_DISCORD_IDS kommen immer rein
    if (!owner && settings.requireGuild && member === 'unknown' && !user) throw new DiscordLoginFailure('cannot_verify');
    if (!owner && settings.requireGuild && member === null) throw new DiscordLoginFailure('not_member');
    // Team-Rolle Pflicht: ohne eine der eingestellten Discord-Rollen kein Zugang (Besitzer aus ADMIN_DISCORD_IDS ausgenommen)
    const guildAdmin = settings.guildAdmins && member && member !== 'unknown' && !!member.admin?.length; // Discord-Administrator eines Servers
    if (!owner && !guildAdmin && settings.teamRoleIds.length) {
      if (member === 'unknown') throw new DiscordLoginFailure('cannot_verify');
      if (member === null) throw new DiscordLoginFailure('not_member');
      if (!member.roles.some((r) => settings.teamRoleIds.includes(r))) throw new DiscordLoginFailure('no_team_role');
    }
    if (user && !user.active) throw new DiscordLoginFailure('inactive');
    if (!user) {
      if (!settings.signup && !owner && !guildAdmin) throw new DiscordLoginFailure('no_account'); // Discord-Admins kommen immer rein
      user = await this.createUser(du, meta);
    }
    if (owner) await this.ensureAdmin(user.id);
    if (guilds) await this.prisma.discordLink.updateMany({ where: { userId: user.id, discordId: du.id }, data: { managedGuilds: guilds as unknown as Prisma.InputJsonValue, guildsSyncedAt: new Date() } });
    if (member && member !== 'unknown') {
      await this.access.recordMemberships(user.id, member.byGuild, member.checked);
      await this.access.syncRoles(user.id, member.byGuild, settings, member.checked, member.admin);
    }
    this.access.remember(user.id, true);
    await this.prisma.loginHistory.create({ data: { userId: user.id, username: user.username, success: true, ip: meta.ip, reason: 'DISCORD' } });
    return { kind: 'login' as const, ...(await this.auth.startSession(user, meta, 'auth.login.discord')) };
  }

  settings(): Promise<DiscordLoginSettings> { return this.access.settings(); }

  /** Code bei Discord einlösen (Login und Bot-Einladung). */
  private async exchange(code: string): Promise<{ access_token: string; guild?: { id?: string; name?: string } }> {
    try {
      const tok = await fetch(`${API}/oauth2/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({ client_id: this.clientId()!, client_secret: this.env.DISCORD_CLIENT_SECRET!, grant_type: 'authorization_code', code, redirect_uri: this.redirectUri() }),
      });
      if (!tok.ok) { this.log.warn(`token exchange failed: HTTP ${tok.status} (Client-Secret und Redirect-URL im Developer Portal prüfen)`); throw new DiscordLoginFailure('failed'); }
      return (await tok.json()) as { access_token: string; guild?: { id?: string; name?: string } };
    } catch (e) {
      if (e instanceof DiscordLoginFailure) throw e;
      this.log.warn(`Discord not reachable: ${e instanceof Error ? e.message : e}`);
      throw new DiscordLoginFailure('failed');
    }
  }

  private async discordUser(code: string, withGuilds = false): Promise<{ user: DiscordUser; guilds: ManagedGuild[] | null }> {
    const { access_token } = await this.exchange(code);
    try {
      const me = await fetch(`${API}/users/@me`, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
      if (!me.ok) throw new DiscordLoginFailure('failed');
      const u = (await me.json()) as DiscordUser;
      if (!/^\d{15,25}$/.test(u.id)) throw new DiscordLoginFailure('failed');
      return { user: u, guilds: withGuilds ? await this.managedGuilds(access_token) : null };
    } catch (e) {
      if (e instanceof DiscordLoginFailure) throw e;
      this.log.warn(`Discord not reachable: ${e instanceof Error ? e.message : e}`);
      throw new DiscordLoginFailure('failed');
    }
  }

  /** Eigene Discord-Server mit Verwaltungsrecht (nur Anzeige; fehlt der Scope oder klappt es nicht: `null`, Login geht trotzdem). */
  private async managedGuilds(token: string): Promise<ManagedGuild[] | null> {
    try {
      const r = await fetch(`${API}/users/@me/guilds`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return null;
      const list = (await r.json()) as { id?: unknown; name?: unknown; icon?: unknown; owner?: unknown; permissions?: unknown }[];
      return list.filter((g) => typeof g.id === 'string' && /^\d{15,25}$/.test(g.id) && (g.owner === true || (/^\d+$/.test(String(g.permissions ?? '')) && (BigInt(String(g.permissions)) & MANAGE) !== 0n)))
        .slice(0, 200).map((g) => ({ id: g.id as string, name: String(g.name ?? g.id).slice(0, 100), icon: typeof g.icon === 'string' && /^(a_)?[0-9a-f]{32}$/.test(g.icon) ? `https://cdn.discordapp.com/icons/${g.id as string}/${g.icon}.png?size=128` : null }));
    } catch { return null; }
  }

  private async createUser(du: DiscordUser, meta: { requestId?: string }) {
    const base = (du.username.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24) || 'discord').replace(/^\.+/, '');
    let username = base;
    for (let i = 2; await this.prisma.user.findUnique({ where: { username } }); i++) username = `${base}${i}`;
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { username, displayName: (du.global_name || du.username).slice(0, 64), passwordHash: DISCORD_ONLY_PASSWORD, settings: { create: {} } } });
      await tx.discordLink.create({ data: { userId: u.id, discordId: du.id } });
      await this.audit.record({ userId: u.id, requestId: meta.requestId }, { action: 'user.created.discord', module: 'auth', entityType: 'User', entityId: u.id, after: { username, discordId: du.id } }, tx);
      return u;
    });
    return user;
  }

  /**
   * Bot wurde über das Dashboard eingeladen: hat das ein globaler Systemadministrator getan, ist der Server sofort registriert
   * und aktiv (eigene Startrollen ohne Zuweisungen, eigene Akten). Sonst bleibt er deaktiviert, bis ein globaler
   * Systemadministrator ihn freischaltet – so kann niemand ungefragt einen Server ins System holen.
   */
  async activateInstalled(userId: string, guildId: string, name: string | null): Promise<boolean> {
    if (!/^\d{15,25}$/.test(guildId) || !(await this.perms.isOwner(userId))) return false;
    const s = await this.prisma.discordServer.upsert({ where: { guildId }, create: { guildId, name: name?.slice(0, 100) || guildId, status: 'ACTIVE' }, update: { status: 'ACTIVE', archivedAt: null } });
    await initServerRoles(this.prisma, s.id, false);
    await this.audit.record({ userId }, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: s.id, serverId: guildId, after: { guildId, name: s.name, via: 'invite' } });
    return true;
  }

  private async ensureAdmin(userId: string) {
    const role = await this.prisma.role.findFirst({ where: { guildId: null, name: 'System Administrator' } });
    if (!role || (await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId: role.id } } }))) return;
    await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
    await this.audit.record({ userId }, { action: 'auth.discord.admin_granted', module: 'auth', entityType: 'User', entityId: userId, after: { role: role.name, via: 'ADMIN_DISCORD_IDS' } });
  }
}
