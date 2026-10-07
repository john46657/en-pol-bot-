import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordAccessService } from '../authz/discord-access.service';
import { currentGuild } from '../common/guild-context';
import { hashToken } from '../authz/guards';
import { DUMMY_HASH, verifyPassword } from './password';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { TwoFactorService } from './two-factor.service';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly env = loadEnv();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly access: DiscordAccessService, private readonly twoFactor: TwoFactorService) {}

  async login(username: string, password: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    const success = !!user && user.active && !locked && ok;

    await this.prisma.loginHistory.create({
      data: { userId: user?.id, username: username.toLowerCase(), success, ip: meta.ip, reason: success ? null : !user ? 'UNKNOWN_USER' : !user.active ? 'DISABLED' : locked ? 'LOCKED' : 'BAD_PASSWORD' },
    });

    if (!success) {
      if (user && user.active && !locked) {
        const fails = user.failedLogins + 1;
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
      }
      await this.prisma.securityEvent.create({ data: { type: 'LOGIN_FAILURE', userId: user?.id, ip: meta.ip, detail: `username=${username.slice(0, 64)}`, requestId: meta.requestId } });
      throw new AppError('UNAUTHENTICATED', 'Invalid credentials.');
    }

    // Zwei-Faktor aktiv: noch keine Session, nur ein kurzlebiges Ticket für den Code-Schritt
    if (user.totpEnabledAt) return { twoFactorRequired: true as const, ticket: this.twoFactor.issueTicket(user.id) };
    return this.startSession(user, meta, 'auth.login');
  }

  /** Zweiter Schritt des Passwort-Logins: Code aus der Authenticator-App oder Wiederherstellungscode. */
  async loginTwoFactor(ticket: string, code: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const userId = this.twoFactor.readTicket(ticket);
    if (!userId) throw new AppError('UNAUTHENTICATED', 'The sign-in has expired. Please enter your password again.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    if (!user || !user.active || locked) throw new AppError('UNAUTHENTICATED', 'Invalid credentials.');
    const used = await this.twoFactor.consume(user.id, code);
    await this.prisma.loginHistory.create({ data: { userId: user.id, username: user.username, success: !!used, ip: meta.ip, reason: used ? null : 'BAD_2FA_CODE' } });
    if (!used) {
      // Falsche Codes zählen wie falsche Passwörter (Sperre nach 5 Versuchen)
      const fails = user.failedLogins + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
      await this.prisma.securityEvent.create({ data: { type: 'LOGIN_2FA_FAILURE', userId: user.id, ip: meta.ip, requestId: meta.requestId } });
      throw new AppError('UNAUTHENTICATED', 'The code is not correct.');
    }
    if (used === 'recovery') await this.prisma.securityEvent.create({ data: { type: 'LOGIN_2FA_RECOVERY_CODE', userId: user.id, ip: meta.ip, requestId: meta.requestId } });
    return this.startSession(user, meta, used === 'recovery' ? 'auth.login.recovery_code' : 'auth.login');
  }

  /** Neue Session nach erfolgreicher Anmeldung (Passwort oder Discord). */
  async startSession(user: { id: string; robloxUserId: string | null }, meta: { ip?: string; userAgent?: string; requestId?: string }, action = 'auth.login') {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) } });
      await tx.user.update({ where: { id: user.id }, data: { lastLogin: new Date(), failedLogins: 0, lockedUntil: null } });
      await this.audit.record({ userId: user.id, robloxUserId: user.robloxUserId, requestId: meta.requestId }, { action, module: 'auth', entityType: 'User', entityId: user.id }, tx);
    });
    this.access.forget(user.id); // neue Anmeldung → Discord-Rollen beim nächsten Aufruf frisch prüfen
    return { token, expiresAt, user: await this.profile(user.id) };
  }

  async logout(actor: Actor, sessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      await this.audit.record(actor, { action: 'auth.logout', module: 'auth', entityType: 'User', entityId: actor.userId ?? undefined }, tx);
    });
  }

  /** Beendet alle Sessions eines Benutzers (Session Invalidation). */
  async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async profile(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    const active = new Set(await this.perms.roleIdsFor(userId));
    return {
      id: u.id, username: u.username, displayName: u.displayName, robloxUserId: u.robloxUserId, robloxUsername: u.robloxUsername,
      // Rollen, die im gewählten Server gelten; `servers` = Server, auf denen man eigene Server-Rollen hat
      roles: u.roles.filter((r) => active.has(r.roleId)).map((r) => r.role.name), permissions: await this.perms.effective(userId), lastLogin: u.lastLogin,
      twoFactor: !!u.totpEnabledAt,
      guildId: currentGuild(), servers: [...new Set(u.roles.map((r) => r.role.guildId).filter((g): g is string => !!g))],
    };
  }
}
