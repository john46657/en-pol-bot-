import { Prisma, type PrismaClient } from '@prisma/client';
/**
 * Daten, die je Discord-Server getrennt sind (Spalte `serverId` = Akten-Bereich wie bei Personen/Fahrzeugen).
 * Die Leitstelle (CAD) bleibt bewusst gemeinsam und steht deshalb nicht hier.
 */
export declare const SERVER_SCOPED_MODELS: Set<string>;
/** Einträge ohne eigene Spalte, die zum Bereich ihrer Personalakte gehören (Modell → Relation zur Akte). */
export declare const SERVER_SCOPED_CHILDREN: Record<string, string>;
/**
 * Prisma-Erweiterung: Für die Modelle oben sieht und ändert jede Anfrage nur Daten des gewählten Discord-Servers
 * (Header `x-guild-id` bzw. Discord-Server der Bot-Interaktion). Ohne Server (Hintergrund-Aufgaben, „Alle Server“) gibt es keinen Filter.
 * Neue Einträge bekommen automatisch den Bereich des Servers.
 */
export declare function withServerScope(base: PrismaClient): import("@prisma/client/runtime/library").DynamicClientExtensionThis<Prisma.TypeMap<import("@prisma/client/runtime/library").InternalArgs & {
    result: {};
    model: {};
    query: {};
    client: {};
}, {}>, Prisma.TypeMapCb<Prisma.PrismaClientOptions>, {
    result: {};
    model: {};
    query: {};
    client: {};
}>;
