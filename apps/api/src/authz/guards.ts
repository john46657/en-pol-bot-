import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, timingSafeEqual } from 'node:crypto';
import { resolvePermission } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from './permission.service';
import { BOT_SERVICE_KEY, PERMISSION_KEY, PUBLIC_KEY } from './decorators';
import { DiscordService } from '../discord/discord.service';
import { DiscordAccessService } from './discord-access.service';
import { loadEnv } from '../config/env';
import { AppError } from '../common/errors';
import type { AppRequest } from '../common/request-context';

export const SESSION_COOKIE = 'enrp_session';
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const UUID = '[0-9a-fA-F-]{36}';
/**
 * Routen, die der Bot im Namen eines verknüpften Benutzers aufrufen darf (Allowlist!).
 * Die normalen Permission-Prüfungen gelten trotzdem – der Bot hat nie mehr Rechte als der Benutzer.
 */
const BOT_USER_ROUTES: [string, RegExp][] = [
  ['GET', /^\/persons\/?$/], ['GET', new RegExp(`^/persons/${UUID}$`)], ['GET', /^\/vehicles\/?$/], ['GET', new RegExp(`^/vehicles/${UUID}$`)],
  ['GET', /^\/wanted\/?$/], ['GET', /^\/search\/?$/], ['GET', /^\/incidents\/?$/], ['POST', /^\/incidents\/?$/],
  ['GET', /^\/team\/(overview|me|me\/hours|hours)$/], ['PUT', /^\/team\/me\/status$/],
  ['GET', /^\/dispatch\/units\/?$/], ['PUT', new RegExp(`^/dispatch/units/${UUID}/status$`)],
  ['POST', /^\/tickets\/?$/],
  ['GET', /^\/auth\/me$/], ['DELETE', /^\/discord\/link$/], ['GET', /^\/notifications\/?$/],
  ['POST', /^\/reports\/?$/], ['POST', new RegExp(`^/reports/${UUID}/submit$`)], ['POST', /^\/complaints\/?$/], ['POST', /^\/investigations\/?$/],
  ['POST', /^\/wanted\/?$/], ['POST', /^\/evidence\/?$/],
  ['POST', new RegExp(`^/dispatch/incidents/${UUID}/assign$`)], ['PUT', new RegExp(`^/dispatch/incidents/${UUID}/status$`)], ['POST', new RegExp(`^/dispatch/incidents/${UUID}/close$`)],
  ['GET', /^\/radio-codes$/], ['GET', /^\/teamchance$/],
  ['GET', /^\/danger-level$/], ['PUT', /^\/danger-level$/],
  ['GET', /^\/radio-whitelist(\/check)?$/], ['POST', /^\/radio-whitelist(\/remove)?$/],
  ['GET', /^\/sek\/(me|members|reports)$/], ['POST', /^\/sek\/(members|members\/remove|reports)$/],
  ['POST', new RegExp(`^/qualifications/applications/${UUID}/decision$`)], ['GET', new RegExp(`^/qualifications/applications/${UUID}$`)], ['GET', /^\/qualifications\/history$/],
  ['POST', new RegExp(`^/applications/${UUID}/discord-decision$`)], ['GET', new RegExp(`^/applications/${UUID}$`)], ['GET', /^\/applications\/history$/],
  ['POST', /^\/communication\/channels\/(TEAM|DISPATCH)\/messages$/],
  ['GET', /^\/leave$/], ['POST', /^\/leave$/], ['POST', new RegExp(`^/leave/${UUID}/(decision|cancel)$`)],
  ['POST', /^\/support-tickets$/], ['POST', new RegExp(`^/support-tickets/${UUID}/actions$`)], ['GET', new RegExp(`^/support-tickets/${UUID}/options$`)],
];

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly botToken = loadEnv().BOT_API_TOKEN;
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService, private readonly discord: DiscordService, private readonly access: DiscordAccessService) {}

  private validBotToken(header: unknown): boolean {
    if (!this.botToken || typeof header !== 'string' || !header.startsWith('Bot ')) return false;
    const a = createHash('sha256').update(header.slice(4)).digest(), b = createHash('sha256').update(this.botToken).digest();
    return timingSafeEqual(a, b); // konstante Zeit
  }
  private async botFailure(req: AppRequest, detail: string): Promise<never> {
    await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', detail, requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
    throw new AppError('UNAUTHENTICATED', 'Authentication required.');
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest & { cookies?: Record<string, string> }>();
    const isBotHeader = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bot ');
    // Dienst-zu-Dienst-Routen des Bots: ausschließlich per Bot-Token, niemals per Session.
    if (this.reflector.getAllAndOverride<boolean>(BOT_SERVICE_KEY, [ctx.getHandler(), ctx.getClass()])) {
      if (!this.validBotToken(req.headers.authorization)) await this.botFailure(req, 'bot service token');
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    // Bot im Namen eines Benutzers: Token + Discord-ID → verknüpfter, aktiver Benutzer; nur Allowlist-Routen.
    if (isBotHeader) {
      if (!this.validBotToken(req.headers.authorization)) await this.botFailure(req, 'bot user token');
      const path = req.path.replace(/^\/api\/v1/, '');
      if (!BOT_USER_ROUTES.some(([m, re]) => m === req.method && re.test(path))) throw new AppError('PERMISSION_DENIED', 'This route is not available to the bot.');
      const discordId = req.headers['x-discord-user'];
      if (typeof discordId !== 'string' || !/^\d{15,25}$/.test(discordId)) throw new AppError('VALIDATION_FAILED', 'X-Discord-User header required.');
      const user = await this.discord.resolveUser(discordId);
      if (!user) throw new AppError('UNAUTHENTICATED', 'Discord account is not linked.', { reason: 'NOT_LINKED' });
      req.user = { id: user.id, username: user.username, displayName: user.displayName, robloxUserId: user.robloxUserId, sessionId: 'bot' };
      return true;
    }
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new AppError('UNAUTHENTICATED', 'Authentication required.');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) {
      await this.prisma.securityEvent.create({ data: { type: 'INVALID_TOKEN', requestId: req.requestId, ip: req.ip } }).catch(() => undefined);
      throw new AppError('UNAUTHENTICATED', 'Authentication required.');
    }
    // Discord-Rollen laufend prüfen (nicht nur beim Login): ohne freigeschaltete Rolle ist die Session sofort beendet
    if (!(await this.access.verify(session.user.id))) throw new AppError('UNAUTHENTICATED', 'Your Discord roles no longer grant access to this dashboard.', { reason: 'NO_ACCESS' });
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
