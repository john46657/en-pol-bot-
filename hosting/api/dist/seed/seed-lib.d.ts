import type { PrismaClient } from '@prisma/client';
/** Startrollen – Administratoren können eigene Rollen anlegen und diese ändern. */
export declare const STARTER_ROLES: Record<string, {
    description: string;
    grants: readonly string[];
}>;
export declare function seedBase(prisma: PrismaClient): Promise<void>;
