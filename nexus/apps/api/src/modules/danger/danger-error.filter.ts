import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { DangerError } from '@nexus/danger';
import type { Response } from 'express';

/** Fachliche Fehler des Gefahrenstatus → passender HTTP-Status mit verständlicher Meldung. */
@Catch(DangerError)
export class DangerErrorFilter implements ExceptionFilter {
  catch(error: DangerError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
