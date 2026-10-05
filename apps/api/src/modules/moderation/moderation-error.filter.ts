import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ModerationError } from '@nexus/moderation';
import type { Response } from 'express';

/** Fachliche Moderations-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(ModerationError)
export class ModerationErrorFilter implements ExceptionFilter {
  catch(error: ModerationError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN, discord: HttpStatus.BAD_GATEWAY }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
