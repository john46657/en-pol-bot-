import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
export declare const currentGuild: () => string | null;
export declare const runInGuild: <T>(guildId: string | null, fn: () => T) => T;
/** Läuft gerade eine Anfrage aus Dashboard/Bot (nicht: Hintergrund-Aufgabe, `runInGuild`/`unscoped`)? */
export declare const inRequest: () => boolean;
export declare class GuildContextMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void;
}
/** Zentrale Einstellungen, die je Server überschrieben werden können (`<key>@<guildId>`, sonst gilt der gemeinsame Wert). */
export declare const SERVER_SCOPED_SETTINGS: readonly ["team.structure", "team.rankOrder", "dashboard.defaultLayout", "theme.accent", "theme.customAccents", "org.name", "teamchance"];
/**
 * Konfiguration, die von Grund auf JE SERVER gilt: im Kontext eines Servers liest und schreibt jede Abfrage automatisch
 * `<Schlüssel>@<Server>` (server-scope.ts) – ohne Rückgriff auf die Werte anderer Server. Unter „Alle Server“ bzw. in
 * Hintergrund-Aufgaben ohne Server gilt der Grundwert. Anmeldung, Backups, Server-Verbund und Bot-Zustand bleiben global.
 */
export declare const PER_SERVER_SETTING_KEYS: readonly string[];
export declare const scopedKey: (key: string, guildId: string | null) => string;
export declare function setServerLinkResolvers(settings: (guildId: string) => string, space: (guildId: string) => string | null, known?: () => Promise<ReadonlySet<string> | null>): void;
/**
 * Akten-Bereiche, die zu einem registrierten Discord-Server (bzw. einer Server-Gruppe) gehören. Alles andere sind Reste früherer
 * Umstellungen (z. B. „separat belassene“ Doppel aus der Rück-Umstellung, Bereiche aufgelöster Gruppen) – sie bleiben gespeichert
 * (Backups, Zugriff per ID), erscheinen aber unter „Alle Server“ nicht mehr in Listen. Einmal je Anfrage geladen; außerhalb von Anfragen `null`.
 */
export declare const registeredSpaces: () => Promise<ReadonlySet<string> | null>;
/** Server, dessen Einstellungen gelten: in einer Gruppe mit „Einstellungen teilen“ der Haupt-Server der Gruppe, sonst der Server selbst. */
export declare const settingsGuild: (guildId: string | null | undefined) => string | null;
/**
 * Akten-Bereich (Personen/Fahrzeuge, Spalte `serverId`): `null` = gemeinsamer Bestand (Standard), sonst eigener Bereich
 * des Servers bzw. der Gruppe. `undefined` = kein Server gewählt („Alle Server“) → kein Filter.
 */
export declare const recordSpace: (guildId?: string | null | undefined) => string | null | undefined;
/** Prisma-Filter für Akten des gewählten Servers (ohne Server: alle). */
export declare const recordWhere: (guildId?: string | null | undefined) => {
    serverId?: undefined;
} | {
    serverId: string | null;
};
/**
 * Personalakte des aktuellen Servers in verschachtelten Abfragen (Benutzer → Akte; es gibt je Server eine eigene Akte):
 * `personnel: { ...onePersonnel(), select: {…} }` und danach `user.personnel[0]`. Ohne Server: irgendeine Akte.
 */
export declare const onePersonnel: (space?: string | null | undefined) => {
    where: {
        serverId?: undefined;
    } | {
        serverId: string | null;
    };
    take: number;
};
/** Ausnahmsweise ohne Server-Filter (z. B. global eindeutige, fortlaufende Nummern). Nur für Zähler – nie für Inhalte. */
export declare const unscoped: <T>(fn: () => PromiseLike<T> | T) => Promise<T>;
