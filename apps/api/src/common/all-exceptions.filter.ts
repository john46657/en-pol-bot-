import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InvalidTransitionError } from '@enrp/shared';
import { Prisma } from '@prisma/client';

/** Einheitliches Fehlerformat {code, message, requestId}; niemals Stacktraces nach außen. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? 'unknown';
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: unknown;

    if (exception instanceof InvalidTransitionError) {
      status = 409; code = 'INVALID_TRANSITION'; message = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        const b = body as { code: string; message: string; details?: unknown };
        code = b.code; message = b.message; details = b.details;
      } else {
        code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'PERMISSION_DENIED' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'ERROR';
        message = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'A record with these unique values already exists.'; }
      else if (exception.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found.'; }
      else this.log.error({ requestId, prisma: exception.code }, 'prisma error');
    } else {
      this.log.error({ requestId, err: exception instanceof Error ? exception.message : String(exception) }, 'unhandled');
    }
    if (status === 403 || status === 401) {
      // wird vom SecurityEvent-Interceptor/Guard bereits protokolliert
    }
    res.status(status).json({ code, message, requestId, ...(details !== undefined && status < 500 ? { details } : {}) });
  }
}
