import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { MemoryStore, RedisStore, decide, type RateStore } from './rate-limit.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Erlaubte Dashboard-Herkünfte (Komma-getrennte `DASHBOARD_URL`). */
export const allowedOrigins = (config: ConfigService): string[] => (config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').split(',').map((s) => s.trim().replace(/\/$/, ''));

/**
 * Sicherheits-Header für alle Antworten. Die API liefert nur JSON – deshalb strenge Standardwerte; die Swagger-Doku
 * (`/docs`) bekommt keine CSP, damit sie funktioniert.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}
  use(req: Request, res: Response, next: NextFunction): void {
    const prod = (this.config.get<string>('NODE_ENV') ?? process.env['NODE_ENV']) === 'production';
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (!req.path.startsWith('/docs')) {
      res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      res.setHeader('Cache-Control', 'no-store'); // Antworten enthalten personenbezogene Daten – nicht zwischenspeichern
    }
    if (prod) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  }
}

/**
 * CSRF-Schutz für Cookie-Sitzungen (in Produktion `SameSite=None`!). Zustandsändernde Anfragen **mit Cookie, ohne
 * Bearer-Token** müssen (1) von einer erlaubten Dashboard-Herkunft kommen (`Origin`, ersatzweise `Referer`) und
 * (2) den Header `X-Requested-With: nexus` tragen – den kann eine fremde Webseite nicht ohne CORS-Freigabe setzen.
 * Anfragen mit Bearer-Token (kein Cookie → kein CSRF) und der OAuth-Callback (GET) sind ausgenommen.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}
  use(req: Request, res: Response, next: NextFunction): void {
    if (!UNSAFE.has(req.method) || typeof req.headers['authorization'] === 'string' || !req.headers['cookie']) return next();
    const origin = typeof req.headers['origin'] === 'string' ? req.headers['origin'] : (() => { try { return new URL(String(req.headers['referer'] ?? '')).origin; } catch { return ''; } })();
    const okOrigin = !!origin && allowedOrigins(this.config).includes(origin.replace(/\/$/, ''));
    const okHeader = req.headers['x-requested-with'] === 'nexus';
    if (okOrigin && okHeader) return next();
    res.status(403).json({ statusCode: 403, message: 'Anfrage abgelehnt (CSRF-Schutz): unzulässige Herkunft.', error: 'Forbidden' });
  }
}

/** Rate Limiting nach `RULES`; liefert `429` mit `Retry-After` und `RateLimit-*`-Headern. */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly store: RateStore;
  constructor(config: ConfigService) {
    const redis = config.get<string>('REDIS_URL') ?? process.env['REDIS_URL'];
    this.store = process.env['VITEST'] || !redis ? new MemoryStore() : new RedisStore(redis);
  }
  async use(req: Request & { user?: { id?: string } }, res: Response, next: NextFunction): Promise<void> {
    if (req.method === 'OPTIONS') return next();
    const d = await decide(this.store, { method: req.method, path: (req.originalUrl ?? req.url ?? req.path).split('?')[0] ?? req.path, ip: req.ip ?? 'unknown', userId: req.user?.id });
    if (Number.isFinite(d.limit)) {
      res.setHeader('RateLimit-Limit', String(d.limit));
      res.setHeader('RateLimit-Remaining', String(d.remaining));
    }
    if (d.allowed) return next();
    res.setHeader('Retry-After', String(d.retryAfterSec));
    res.status(429).json({ statusCode: 429, message: `Zu viele Anfragen – bitte in ${d.retryAfterSec} Sekunden erneut versuchen.`, error: 'Too Many Requests' });
  }
}
