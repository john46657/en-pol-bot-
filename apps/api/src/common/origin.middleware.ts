import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { AppError } from './errors';
import type { AppRequest } from './request-context';
import { loadEnv } from '../config/env';

/** CSRF-Schutz zusätzlich zu SameSite=Strict: mutierende Requests mit Origin-Header müssen von WEB_ORIGIN stammen. */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly allowed = loadEnv().WEB_ORIGIN.split(',').map((s) => s.trim());
  private sameHost(origin: string, host: string | undefined) {
    try { return !!host && new URL(origin).host === host; } catch { return false; }
  }
  use(req: AppRequest, _res: Response, next: NextFunction) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    // Erlaubt: konfigurierte Origins ODER dieselbe Origin wie der aufgerufene Host (same-origin, z. B. Ein-Prozess-Betrieb).
    // Cross-Site-Anfragen tragen die fremde Origin, aber den Ziel-Host → werden abgelehnt.
    if (origin && !this.allowed.includes(origin) && !this.sameHost(origin, req.headers.host)) throw new AppError('ORIGIN_REJECTED', 'Request origin is not allowed.');
    next();
  }
}
