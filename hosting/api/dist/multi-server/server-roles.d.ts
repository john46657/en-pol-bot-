import type { Prisma, PrismaClient } from '@prisma/client';
export declare const ADMIN_ROLE_NAME = "System Administrator";
/**
 * Rollen eines Servers anlegen: Kopien der serverübergreifenden Vorlagen (Startrollen bzw. bisherige Rollen) mit Rechten und
 * Discord-Verknüpfung – danach unabhängig von allen anderen Servern. „System Administrator“ bleibt global und wird nie kopiert.
 *
 * `withAssignments`: nur für Server, die es VOR der Trennung schon gab (Migration) bzw. den eingestellten Haupt-Server –
 * bisherige Zuweisungen werden übernommen, damit niemand den Zugang verliert. Neue Server starten ohne Zuweisungen.
 * Idempotent: läuft genau einmal je Server (`rolesInitializedAt`), auch bei mehreren Instanzen (Sperre je Server).
 */
export declare function initServerRoles(prisma: PrismaClient | Prisma.TransactionClient, serverId: string, withAssignments: boolean): Promise<number>;
