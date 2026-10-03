import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { hashToken } from '../authz/guards';
import { DUMMY_HASH, verifyPassword } from './password';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly env = loadEnv();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService) {}

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

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) } });
      await tx.user.update({ where: { id: user.id }, data: { lastLogin: new Date(), failedLogins: 0, lockedUntil: null } });
      await this.audit.record({ userId: user.id, robloxUserId: user.robloxUserId, requestId: meta.requestId }, { action: 'auth.login', module: 'auth', entityType: 'User', entityId: user.id }, tx);
    });
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
    return {
      id: u.id, username: u.username, displayName: u.displayName, robloxUserId: u.robloxUserId, robloxUsername: u.robloxUsername,
      roles: u.roles.map((r) => r.role.name), permissions: await this.perms.effective(userId), lastLogin: u.lastLogin,
    };
  }
}
