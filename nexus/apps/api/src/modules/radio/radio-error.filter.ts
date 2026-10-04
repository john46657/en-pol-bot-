import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { RadioError } from '@nexus/radio';
import type { Response } from 'express';

/** Fachliche Funk-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(RadioError)
export class RadioErrorFilter implements ExceptionFilter {
  catch(error: RadioError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
