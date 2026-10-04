import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { OperationError } from '@nexus/operations';
import type { Response } from 'express';

/** Fachliche Einsatz-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(OperationError)
export class OperationErrorFilter implements ExceptionFilter {
  catch(error: OperationError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
