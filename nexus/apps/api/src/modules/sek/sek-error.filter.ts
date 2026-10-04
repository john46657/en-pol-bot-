import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { SekError } from '@nexus/sek';
import type { Response } from 'express';

/** Fachliche SEK-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(SekError)
export class SekErrorFilter implements ExceptionFilter {
  catch(error: SekError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
