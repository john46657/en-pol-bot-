import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { WantedError } from '@nexus/wanted';
import type { Response } from 'express';

/** Fachliche Fahndungs-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(WantedError)
export class WantedErrorFilter implements ExceptionFilter {
  catch(error: WantedError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
