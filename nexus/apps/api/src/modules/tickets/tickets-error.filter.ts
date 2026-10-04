import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { TicketError } from '@nexus/tickets';
import type { Response } from 'express';

/** Fachliche Ticket-Fehler → passender HTTP-Status mit verständlicher Meldung. */
@Catch(TicketError)
export class TicketErrorFilter implements ExceptionFilter {
  catch(error: TicketError, host: ArgumentsHost): void {
    const status = { invalid: HttpStatus.BAD_REQUEST, 'not-found': HttpStatus.NOT_FOUND, conflict: HttpStatus.CONFLICT, forbidden: HttpStatus.FORBIDDEN }[error.code];
    host.switchToHttp().getResponse<Response>().status(status).json({ statusCode: status, message: error.message, error: error.code });
  }
}
