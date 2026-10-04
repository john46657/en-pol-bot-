export class OperationError extends Error {
  constructor(
    public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}
