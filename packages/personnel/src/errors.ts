/** Fachliche Fehler der Personalverwaltung (verständliche Meldung, Code für HTTP-Zuordnung). */
export class PersonnelError extends Error {
  constructor(
    public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'PersonnelError';
  }
}
