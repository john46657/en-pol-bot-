import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Verständliche Fehlermeldungen (§126): statt "500 Internal Server Error"
 * eine klare Aussage, was schiefgelaufen ist.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'InternalServerError',
    });
  }
}
