import { PrismaClient } from '@prisma/client';

/**
 * Prisma-Client-Singleton.
 *
 * Im Dev-Modus wird eine globale Instanz wiederverwendet, damit Hot Reloads
 * nicht unendlich viele Verbindungen öffnen.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma;
}
