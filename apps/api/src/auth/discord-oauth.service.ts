import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { loadEnv } from '../config/env';
import { webUrl } from '../common/web-url';
import { DiscordAccessService, type DiscordLoginSettings } from '../authz/discord-access.service';

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
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly auth: AuthService, private readonly access: DiscordAccessService) {}

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
  start(mode: 'login' | 'link' | 'install', userId?: string) {
    if (!this.enabled()) throw new DiscordLoginFailure('disabled');
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k);
    const state = randomBytes(24).toString('base64url'), browser = randomBytes(24).toString('base64url');
    this.pending.set(state, { mode, userId, browser, expires: now + STATE_TTL_MS });
    // „install“: Bot auf einen Server holen – über den Code-Ablauf, funktioniert auch mit „OAuth2-Code-Erlaubnis benötigt“
    const q = mode === 'install'
      ? new URLSearchParams({ response_type: 'code', client_id: this.clientId()!, scope: 'bot applications.commands', permissions: '8', redirect_uri: this.redirectUri(), state })
      : new URLSearchParams({ response_type: 'code', client_id: this.clientId()!, scope: 'identify', redirect_uri: this.redirectUri(), state, prompt: 'none' });
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
      return { kind: 'installed' as const, guildName: tok.guild?.name ?? null };
    }
    const du = await this.discordUser(code);
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
    if (!owner && settings.teamRoleIds.length) {
      if (member === 'unknown') throw new DiscordLoginFailure('cannot_verify');
      if (member === null) throw new DiscordLoginFailure('not_member');
      if (!member.roles.some((r) => settings.teamRoleIds.includes(r))) throw new DiscordLoginFailure('no_team_role');
    }
    if (user && !user.active) throw new DiscordLoginFailure('inactive');
    if (!user) {
      if (!settings.signup && !owner) throw new DiscordLoginFailure('no_account');
      user = await this.createUser(du, meta);
    }
    if (owner) await this.ensureAdmin(user.id);
    if (member && member !== 'unknown') await this.access.syncRoles(user.id, member.roles, settings);
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

  private async discordUser(code: string): Promise<DiscordUser> {
    const { access_token } = await this.exchange(code);
    try {
      const me = await fetch(`${API}/users/@me`, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(10_000) });
      if (!me.ok) throw new DiscordLoginFailure('failed');
      const u = (await me.json()) as DiscordUser;
      if (!/^\d{15,25}$/.test(u.id)) throw new DiscordLoginFailure('failed');
      return u;
    } catch (e) {
      if (e instanceof DiscordLoginFailure) throw e;
      this.log.warn(`Discord not reachable: ${e instanceof Error ? e.message : e}`);
      throw new DiscordLoginFailure('failed');
    }
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

  private async ensureAdmin(userId: string) {
    const role = await this.prisma.role.findUnique({ where: { name: 'System Administrator' } });
    if (!role || (await this.prisma.userRole.findUnique({ where: { userId_roleId: { userId, roleId: role.id } } }))) return;
    await this.prisma.userRole.create({ data: { userId, roleId: role.id } });
    await this.audit.record({ userId }, { action: 'auth.discord.admin_granted', module: 'auth', entityType: 'User', entityId: userId, after: { role: role.name, via: 'ADMIN_DISCORD_IDS' } });
  }
}
