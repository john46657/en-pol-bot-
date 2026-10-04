import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { FleetError } from '@nexus/fleet';
import type { Response } from 'express';

/** Fachliche Fuhrpark-/Strafen-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(FleetError)
export class FleetErrorFilter implements ExceptionFilter {
  catch(error: FleetError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
