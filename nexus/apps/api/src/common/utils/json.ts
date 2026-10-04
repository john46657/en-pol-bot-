import { Prisma } from '@nexus/database';

/**
 * Bridge für Prisma Json-Spalten.
 *
 * Prisma erwartet `JsonNull | InputJsonValue`; aus API-Sicht liegt aber oft
 * nur ein ungetyptes Objekt (z. B. Application-Config / Panel-Embed) vor.
 * Der Cast ist sicher: jede JSON-kompatible Struktur ist ein gültiges
 * InputJsonValue – `null` würde in den aufrufenden Services ohnehin nie
 * übergeben (Felder sind im Schema NOT NULL).
 */
export function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}
