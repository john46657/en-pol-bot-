import { HttpException } from '@nestjs/common';
export type ErrorCode = 'UNAUTHENTICATED' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT' | 'INVALID_TRANSITION' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'CAPABILITY_UNAVAILABLE' | 'ORIGIN_REJECTED';
export declare class AppError extends HttpException {
    readonly code: ErrorCode;
    readonly details?: unknown | undefined;
    constructor(code: ErrorCode, message: string, details?: unknown | undefined);
}
