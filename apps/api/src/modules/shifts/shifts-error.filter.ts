import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { ShiftError } from '@nexus/shifts';
import type { Response } from 'express';

/** Fachliche Fehler des Shift-Systems → passender HTTP-Status mit verständlicher Meldung. */
@Catch(ShiftError)
export class ShiftErrorFilter implements ExceptionFilter {
  catch(error: ShiftError, host: ArgumentsHost): void {
    const status = {
      invalid: HttpStatus.BAD_REQUEST,
      'not-found': HttpStatus.NOT_FOUND,
      conflict: HttpStatus.CONFLICT,
      forbidden: HttpStatus.FORBIDDEN,
    }[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message: error.message, error: error.code });
  }
}
