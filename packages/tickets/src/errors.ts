/** Fachlicher Ticket-Fehler: `code` bestimmt den HTTP-Status bzw. die Meldung. */
export class TicketError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'TicketError';
  }
}
