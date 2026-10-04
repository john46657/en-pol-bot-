export class FleetError extends Error {
  constructor(
    public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden',
    message: string,
  ) {
    super(message);
    this.name = 'FleetError';
  }
}
export const text = (v: string | undefined | null, max: number, label: string): string | null => {
  const t = v?.trim();
  if (t && t.length > max) throw new FleetError('invalid', `${label} ist zu lang (max. ${max} Zeichen).`);
  return t || null;
};
export const normalizePlate = (p: string) => p.toUpperCase().replace(/[\s\-.]/g, '');
export const normalizeName = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
