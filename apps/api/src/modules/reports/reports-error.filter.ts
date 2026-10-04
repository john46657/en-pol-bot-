import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ReportError } from '@nexus/reports';
import type { Response } from 'express';

/** Fachliche Berichts-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(ReportError)
export class ReportErrorFilter implements ExceptionFilter {
  catch(error: ReportError, host: ArgumentsHost): void {
    const status = error.code === 'not-found' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
