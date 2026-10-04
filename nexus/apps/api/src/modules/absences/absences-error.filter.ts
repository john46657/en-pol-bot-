import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { AbsenceError } from '@nexus/absences';
import type { Response } from 'express';

/** Fachliche Abmeldungs-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(AbsenceError)
export class AbsenceErrorFilter implements ExceptionFilter {
  catch(error: AbsenceError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
