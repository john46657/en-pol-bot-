import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { verifySession } from '@nexus/auth';
import type { RequestUser } from '../decorators/current-user.decorator.js';

/**
 * Setzt request.user aus dem Session-JWT (§114: AuthN).
 *
 * Token-Quellen (in dieser Reihenfolge):
 *   1. Authorization: Bearer <token>
 *   2. Cookie nexus_session (httpOnly)
 *
 * Fehlt/fehlt ein Token → anonymous; über fehlende Auth entscheidet der
 * JwtAuthGuard (401 auf geschützten Routen). Ungültige Token werden
 * ignoriert (kein Datenleck durch Fehlermeldungen).
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  async use(
    req: Request & { user?: RequestUser },
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (req.user) {
      next();
      return;
    }

    const token = this.extractToken(req);
    if (token) {
      try {
        const payload = await verifySession(token, {
          secret: this.config.get<string>('AUTH_SECRET') ?? '',
          issuer: this.config.get<string>('JWT_ISSUER') ?? '',
        });
        req.user = {
          id: payload.sub,
          username: payload.username,
          ...(payload.globalName ? { globalName: payload.globalName } : {}),
          avatar: payload.avatar ?? null,
          ...(payload.at ? { at: payload.at } : {}),
        };
      } catch {
        // Ungültig/abgelaufen → anonym lassen; Guard erteilt 401.
      }
    }

    next();
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers['authorization'];
    if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
      return header.slice('bearer '.length).trim();
    }
    const cookie = req.cookies?.['nexus_session'];
    return typeof cookie === 'string' && cookie.length > 0 ? cookie : undefined;
  }
}
