import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'UNAUTHENTICATED' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'VALIDATION_FAILED'
  | 'CONFLICT' | 'INVALID_TRANSITION' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'CAPABILITY_UNAVAILABLE'
  | 'ORIGIN_REJECTED';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401, PERMISSION_DENIED: 403, NOT_FOUND: 404, VALIDATION_FAILED: 400,
  CONFLICT: 409, INVALID_TRANSITION: 409, RATE_LIMITED: 429, INTERNAL_ERROR: 500,
  CAPABILITY_UNAVAILABLE: 503, ORIGIN_REJECTED: 403,
};

export class AppError extends HttpException {
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super({ code, message, details }, STATUS[code] ?? HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
