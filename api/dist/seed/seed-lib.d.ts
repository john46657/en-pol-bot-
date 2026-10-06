import type { PrismaClient } from '@prisma/client';
/** Startrollen – Administratoren können eigene Rollen anlegen und diese ändern. */
export declare const STARTER_ROLES: Record<string, {
    description: string;
    grants: readonly string[];
}>;
export declare function seedBase(prisma: PrismaClient): Promise<void>;
/** Ticket-System: Beispiel-Startwerte (nur wenn noch nichts angelegt ist) – alles im Dashboard änderbar/löschbar. */
export declare function seedTickets(prisma: PrismaClient): Promise<void>;
