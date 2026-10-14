import type { PrismaClient } from '@prisma/client';
/**
 * Tabellen mit früherem Datenbereich je Discord-Server (`serverId`) und ihren Eindeutigkeiten. Seit der Umstellung auf einen
 * Server gehört der Bestand zu `serverId` = NULL; was dabei eine Eindeutigkeit verletzt hätte (z. B. eine zweite Personalakte
 * desselben Benutzers aus einem anderen früheren Server), bleibt mit seinem alten Bereich als Archiv in der Datenbank.
 */
export declare const DATA_TABLES: [string, string[]][];
export declare const setArchiveFilter: (on: boolean) => void;
/** Archiv-Einträge mitlesen (Backups müssen den vollständigen Bestand sichern). */
export declare const withArchived: <T>(fn: () => PromiseLike<T>) => Promise<T>;
/**
 * Prisma-Erweiterung: Listen und Zählungen zeigen nur den aktuellen Bestand (`serverId` = NULL), nicht die bei der Umstellung
 * separat belassenen Doppel (sonst stünde z. B. jede Person mit zwei früheren Personalakten doppelt in der Teamliste).
 * Direkter Zugriff per ID und Änderungen bleiben unverändert; gelöscht wird nichts.
 */
export declare function withoutArchived(base: PrismaClient): import("@prisma/client/runtime/library").DynamicClientExtensionThis<import("@prisma/client").Prisma.TypeMap<import("@prisma/client/runtime/library").InternalArgs & {
    result: {};
    model: {};
    query: {};
    client: {};
}, {}>, import("@prisma/client").Prisma.TypeMapCb<import("@prisma/client").Prisma.PrismaClientOptions>, {
    result: {};
    model: {};
    query: {};
    client: {};
}>;
