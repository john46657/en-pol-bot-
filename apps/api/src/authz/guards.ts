import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { resolvePermission } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from './permission.service';
import { PERMISSION_KEY, PUBLIC_KEY } from './decorators';
import { AppError } from '../common/errors';
import type { AppRequest } from '../common/request-context';

export const SESSION_COOKIE = 'enrp_session';
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest & { cookies?: Record<string, string> }>();
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Authentication required.');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
      await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
      throw new AppError('UNAUTHENTICATED', 'Authentication required.');
    }
    req.user = { id: session.user.id, username: session.user.username, displayName: session.user.displayName, robloxUserId: session.user.robloxUserId, sessionId: session.id };
    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly perms: PermissionService, private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new AppError('UNAUTHENTICATED', 'Authentication required.');
    const pctx = await this.perms.contextFor(req.user.id);
    
    for (const p of required) {
      if (!resolvePermission(pctx, p).allowed) {
        await this.prisma.securityEvent.create({ data: { type: 'PERMISSION_DENIED', userId: req.user.id, detail: p, requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
        throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
      }
    }
    return true;
  }
}
