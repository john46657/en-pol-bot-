import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { QualificationError } from '@nexus/qualifications';
import type { Response } from 'express';

/** Fachliche Qualifikations-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(QualificationError)
export class QualificationErrorFilter implements ExceptionFilter {
  catch(error: QualificationError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
