import { Prisma, type PrismaClient } from '@prisma/client';
/**
 * Daten, die je Discord-Server getrennt sind (Spalte `serverId` = Bereich des Servers bzw. einer ausdrücklich eingerichteten
 * Gruppe im Server-Verbund). Server sind von Grund auf getrennt: auch Leitstelle (CAD), Personalakte/HR, Dienstnummern,
 * Bußgelder, Tatbestände, SEK, Funk-Freigaben, Academy, Workflows und Kommunikation.
 * Ausnahmen gibt es nur ausdrücklich: CAD-Querverbindung (CadServerLink) und Datenfreigaben (Serververbindungen).
 */
export declare const SERVER_SCOPED_MODELS: Set<string>;
/** CAD/ER:LC-Daten, die über die Discord-Server-ID (`guildId`) einem Server gehören. */
export declare const GUILD_SCOPED_MODELS: Set<string>;
/** Daten, die über eine Beziehung (ER:LC-Server) einem Discord-Server gehören. */
export declare const RELATION_SCOPED_MODELS: Record<string, string>;
/**
 * Daten mit Discord-Server (`guildId`), deren Listen die Dienste selbst nach Server filtern. Zusätzlich hier: Einzelabrufe
 * (per ID/Nummer) aus dem Dashboard liefern nur Einträge des gewählten Servers – fremde gelten als „nicht gefunden“.
 * Einträge ohne Server (alt, Web-Bewerbung) bleiben sichtbar. Bot-Anfragen bleiben unberührt (z. B. Bewerbungs-Kanal
 * auf einem anderen Server, Entscheidungen per DM).
 */
export declare const DASHBOARD_GUILD_OWNED_MODELS: Set<string>;
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
