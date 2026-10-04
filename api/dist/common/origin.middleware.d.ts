import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request-context';
/** CSRF-Schutz zusätzlich zu SameSite=Strict: mutierende Requests mit Origin-Header müssen von WEB_ORIGIN stammen. */
export declare class OriginMiddleware implements NestMiddleware {
    private readonly allowed;
    private sameHost;
    use(req: AppRequest, _res: Response, next: NextFunction): void;
}
