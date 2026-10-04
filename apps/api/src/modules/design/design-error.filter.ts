import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { DesignError } from '@nexus/design';
import type { Response } from 'express';

/** Fachliche Design-Fehler → passender HTTP-Status; `details` nennt die betroffenen Einstellungen. */
@Catch(DesignError)
export class DesignErrorFilter implements ExceptionFilter {
  catch(error: DesignError, host: ArgumentsHost): void {
    const status = {
      invalid: HttpStatus.BAD_REQUEST,
      'not-found': HttpStatus.NOT_FOUND,
      conflict: HttpStatus.CONFLICT,
    }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status,
      message: error.message,
      error: error.code,
      details: error.details,
    });
  }
}
