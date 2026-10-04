import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { PersonnelError } from '@nexus/personnel';
import type { Response } from 'express';

/** Fachliche Fehler der Personalverwaltung → passender HTTP-Status mit verständlicher Meldung. */
@Catch(PersonnelError)
export class PersonnelErrorFilter implements ExceptionFilter {
  catch(error: PersonnelError, host: ArgumentsHost): void {
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
