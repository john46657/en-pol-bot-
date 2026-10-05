import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import type { AppRequest } from './request-context';
export declare class RequestIdMiddleware implements NestMiddleware {
    private readonly log;
    use(req: AppRequest, res: Response, next: NextFunction): void;
}
