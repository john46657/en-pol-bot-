import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { TrainingError } from '@nexus/training';
import type { Response } from 'express';

/** Fachliche Ausbildungs-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(TrainingError)
export class TrainingErrorFilter implements ExceptionFilter {
  catch(error: TrainingError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
