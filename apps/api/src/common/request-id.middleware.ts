import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly log = new Logger('HTTP');
  use(req: AppRequest, res: Response, next: NextFunction) {
    req.requestId = randomUUID();
    res.setHeader('x-request-id', req.requestId);
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      // Nur Pfad ohne Query-String; keine Header/Bodies (Secrets!).
      this.log.log(JSON.stringify({ requestId: req.requestId, userId: req.user?.id, method: req.method, route: req.path, status: res.statusCode, ms: Math.round(ms) }));
    });
    next();
  }
}
