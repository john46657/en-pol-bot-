import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { RestrictionError } from '@nexus/restrictions';
import type { Response } from 'express';

/** Fachliche Sperren-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(RestrictionError)
export class RestrictionErrorFilter implements ExceptionFilter {
  catch(error: RestrictionError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, blocked: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
