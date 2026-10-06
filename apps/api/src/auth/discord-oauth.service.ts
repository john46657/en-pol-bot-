import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
import { loadEnv } from '../config/env';
import { webUrl } from '../common/web-url';

const API = 'https://discord.com/api/v10';
const STATE_TTL_MS = 10 * 60_000;
/** Kein gültiger Passwort-Hash → mit Passwort nicht anmeldbar (nur Discord). */
export const DISCORD_ONLY_PASSWORD = '!discord-login-only';

export interface DiscordLoginSettings { signup: boolean; requireGuild: boolean; roleMap: { discordRoleId: string; role: string }[] }
export const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings = { signup: true, requireGuild: true, roleMap: [] };

/** Fehlercodes für die Login-Seite (`/login?discord=<code>`). */
export type DiscordLoginError = 'disabled' | 'state' | 'failed' | 'no_account' | 'not_member' | 'cannot_verify' | 'inactive' | 'taken';
export class DiscordLoginFailure extends Error { constructor(readonly code: DiscordLoginError) { super(code); } }

interface Pending { mode: 'login' | 'link'; userId?: string; browser: string; expires: number }
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
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly auth: AuthService) {}

  clientId(): string | null {
    if (this.env.DISCORD_CLIENT_ID) return this.env.DISCORD_CLIENT_ID;
    const first = this.env.DISCORD_TOKEN?.split('.')[0];
    if (!first) return null;
    const id = Buffer.from(first, 'base64').toString('utf8');
    return /^\d{15,25}$/.test(id) ? id : null;
  }
  enabled() { return !!(this.clientId() && this.env.DISCORD_CLIENT_SECRET); }
  redirectUri() { return webUrl('/api/v1/auth/discord/callback'); }

  /** Schritt 1: Adresse bei Discord + Browser-Bindung. */
  start(mode: 'login' | 'link', userId?: string) {
    if (!this.enabled()) throw new DiscordLoginFailure('disabled');
    const now = Date.now();
    for (const [k, v] of this.pending) if (v.expires < now) this.pending.delete(k);
    const state = randomBytes(24).toString('base64url'), browser = randomBytes(24).toString('base64url');
    this.pending.set(state, { mode, userId, browser, expires: now + STATE_TTL_MS });
    const q = new URLSearchParams({ response_type: 'code', client_id: this.clientId()!, scope: 'identify', redirect_uri: this.redirectUri(), state, prompt: 'none' });
    return { url: `https://discord.com/oauth2/authorize?${q}`, browser };
  }

  /** Schritt 2: Rücksprung von Discord. Liefert eine neue Session (Login) oder verknüpft das Konto (Link). */
  async callback(code: string | undefined, state: string | undefined, browser: string | undefined, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const p = state ? this.pending.get(state) : undefined;
    if (state) this.pending.delete(state); // nur einmal verwendbar
    if (!p || p.expires < Date.now() || !browser || p.browser !== browser) throw new DiscordLoginFailure('state');
    if (!code) throw new DiscordLoginFailure('failed');
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

    const member = await this.membership(du.id);
    const link = await this.prisma.discordLink.findUnique({ where: { discordId: du.id } });
    let user = link ? await this.prisma.user.findUnique({ where: { id: link.userId } }) : null;
    if (settings.requireGuild && member === 'unknown' && !user) throw new DiscordLoginFailure('cannot_verify');
    if (settings.requireGuild && member === null) throw new DiscordLoginFailure('not_member');
    if (user && !user.active) throw new DiscordLoginFailure('inactive');
    if (!user) {
      if (!settings.signup) throw new DiscordLoginFailure('no_account');
      user = await this.createUser(du, meta);
    }
    if (member && member !== 'unknown') await this.syncRoles(user.id, member.roles, settings);
    await this.prisma.loginHistory.create({ data: { userId: user.id, username: user.username, success: true, ip: meta.ip, reason: 'DISCORD' } });
    return { kind: 'login' as const, ...(await this.auth.startSession(user, meta, 'auth.login.discord')) };
  }

  async settings(): Promise<DiscordLoginSettings> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: 'auth.discord' } }))?.value as Partial<DiscordLoginSettings> | undefined;
    return { ...DEFAULT_DISCORD_LOGIN, ...(v ?? {}) };
  }

  private async discordUser(code: string): Promise<DiscordUser> {
    try {
      const tok = await fetch(`${API}/oauth2/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({ client_id: this.clientId()!, client_secret: this.env.DISCORD_CLIENT_SECRET!, grant_type: 'authorization_code', code, redirect_uri: this.redirectUri() }),
      });
      if (!tok.ok) { this.log.warn(`token exchange failed: HTTP ${tok.status} (Client-Secret und Redirect-URL im Developer Portal prüfen)`); throw new DiscordLoginFailure('failed'); }
      const { access_token } = (await tok.json()) as { access_token: string };
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

  /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
  private async membership(userId: string): Promise<{ roles: string[] } | null | 'unknown'> {
    const token = this.env.DISCORD_TOKEN;
    if (!token) return 'unknown';
    const bot = (path: string) => fetch(`${API}${path}`, { headers: { authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10_000) });
    try {
      const cfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
      let guilds = [cfg?.guildId, this.env.DISCORD_GUILD_ID].join(',').split(/[\s,;]+/).filter((g) => /^\d{15,25}$/.test(g));
      if (!guilds.length) {
        const r = await bot('/users/@me/guilds?limit=200');
        if (!r.ok) return 'unknown';
        guilds = ((await r.json()) as { id: string }[]).map((g) => g.id);
      }
      let isMember = false;
      const roles: string[] = [];
      for (const g of [...new Set(guilds)].slice(0, 20)) {
        const r = await bot(`/guilds/${g}/members/${userId}`);
        if (r.status === 404) continue;
        if (!r.ok) return 'unknown';
        isMember = true;
        roles.push(...(((await r.json()) as { roles?: string[] }).roles ?? []));
      }
      return isMember ? { roles } : null;
    } catch { return 'unknown'; }
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

  /** Discord-Rolle → Systemrolle: zugeordnete Rollen vergeben bzw. entziehen (nur Rollen aus der Zuordnung). */
  private async syncRoles(userId: string, discordRoles: string[], settings: DiscordLoginSettings) {
    if (!settings.roleMap.length) return;
    const names = [...new Set(settings.roleMap.map((m) => m.role))];
    const roles = await this.prisma.role.findMany({ where: { name: { in: names } } });
    const want = new Set(settings.roleMap.filter((m) => discordRoles.includes(m.discordRoleId)).map((m) => m.role));
    const current = await this.prisma.userRole.findMany({ where: { userId, roleId: { in: roles.map((r) => r.id) } } });
    const add = roles.filter((r) => want.has(r.name) && !current.some((c) => c.roleId === r.id));
    const remove = roles.filter((r) => !want.has(r.name) && current.some((c) => c.roleId === r.id));
    if (!add.length && !remove.length) return;
    await this.prisma.$transaction(async (tx) => {
      if (add.length) await tx.userRole.createMany({ data: add.map((r) => ({ userId, roleId: r.id })), skipDuplicates: true });
      if (remove.length) await tx.userRole.deleteMany({ where: { userId, roleId: { in: remove.map((r) => r.id) } } });
      await this.audit.record({ userId }, { action: 'auth.discord.roles_synced', module: 'auth', entityType: 'User', entityId: userId, after: { added: add.map((r) => r.name), removed: remove.map((r) => r.name) } }, tx);
    });
  }
}
