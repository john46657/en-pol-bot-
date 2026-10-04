import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Verständliche Fehlermeldungen (§126): statt "500 Internal Server Error"
 * eine klare Aussage, was schiefgelaufen ist.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly log = new Logger('Fehler');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const cause = exception.getResponse();
      response.status(status).json({
        statusCode: status,
        message:
          typeof cause === 'string'
            ? cause
            : ((cause as { message?: unknown }).message ?? 'Fehler'),
        error: exception.name,
      });
      return;
    }

    const message = exception instanceof Error ? exception.message : 'Unbekannter Fehler.';
    // Unerwartete Fehler (5xx) mit Ort und Stacktrace protokollieren – ohne Anfrage-Inhalt, Header oder Cookies
    const req = ctx.getRequest<{ method?: string; originalUrl?: string }>();
    this.log.error(`${req.method ?? '?'} ${(req.originalUrl ?? '').split('?')[0]} → ${message}`, exception instanceof Error ? exception.stack : undefined);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'InternalServerError',
    });
  }
}
