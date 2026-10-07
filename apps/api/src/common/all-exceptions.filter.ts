import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InvalidTransitionError } from '@enrp/shared';
import { Prisma } from '@prisma/client';

/** Deutsche Standardmeldungen für Framework-Fehler ohne eigenen Code. */
const GENERIC: Record<number, string> = {
  400: 'Ungültige Anfrage.',
  401: 'Bitte melde dich an.',
  403: 'Dafür fehlt dir die Berechtigung.',
  404: 'Diese Seite bzw. Schnittstelle gibt es nicht.',
  405: 'Diese Aktion ist hier nicht erlaubt.',
  413: 'Die Anfrage ist zu groß.',
  415: 'Dieses Format wird nicht unterstützt.',
  429: 'Zu viele Anfragen – bitte kurz warten.',
};

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
    let message = 'Ein unerwarteter Fehler ist aufgetreten.';
    let details: unknown;

    if (exception instanceof InvalidTransitionError) {
      status = 409; code = 'INVALID_TRANSITION'; message = `Der Statuswechsel von ${exception.from} nach ${exception.to} ist nicht möglich.`;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        const b = body as { code: string; message: string; details?: unknown };
        code = b.code; message = b.message; details = b.details;
      } else {
        code = status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'PERMISSION_DENIED' : status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'ERROR';
        // Meldungen von Nest/Express (z. B. „Cannot GET /x“, Throttler, Body-Parser) sind englisch → deutscher Standardtext je Status
        message = GENERIC[status] ?? (status >= 500 ? 'Ein unerwarteter Fehler ist aufgetreten.' : 'Die Anfrage konnte nicht verarbeitet werden.');
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') { status = 409; code = 'CONFLICT'; message = 'Ein Datensatz mit diesen Werten existiert bereits.'; }
      else if (exception.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Datensatz nicht gefunden.'; }
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
