import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RequestUser } from '../decorators/current-user.decorator.js';

/**
 * Dev-Auth: emuliert den OAuth-Layer, damit geschützte Endpunkte (Guard §114)
 * lokal ohne Discord-OAuth getestet werden können.
 *
 * Nur aktiv außerhalb von production:
 *   x-dev-user-id:    Discord-User-ID des "Angemeldeten"
 *   x-dev-role-ids:   Komma-getrennte Discord-Rollen-IDs
 *
 * In production erzeugt diese Middleware keinen User – dann ist ausschließlich
 * der echte Auth-Layer verantwortlich.
 */
@Injectable()
export class DevUserMiddleware implements NestMiddleware {
  use(req: Request & { user?: RequestUser }, _res: Response, next: NextFunction): void {
    if (process.env['NODE_ENV'] === 'production') {
      next();
      return;
    }

    if (req.user) {
      next();
      return;
    }

    const devUserId = req.headers['x-dev-user-id'];
    if (typeof devUserId === 'string' && devUserId.trim().length > 0) {
      const devRoleIds = req.headers['x-dev-role-ids'];
      req.user = {
        id: devUserId,
        ...(typeof devRoleIds === 'string' && devRoleIds.length > 0
          ? {
              roleIds: devRoleIds
                .split(',')
                .map((r) => r.trim())
                .filter(Boolean),
            }
          : {}),
      };
    }

    next();
  }
}
