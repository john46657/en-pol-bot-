import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { PromotionError } from '@nexus/promotions';
import type { Response } from 'express';

/** Fachliche Beförderungs-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(PromotionError)
export class PromotionErrorFilter implements ExceptionFilter {
  catch(error: PromotionError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
