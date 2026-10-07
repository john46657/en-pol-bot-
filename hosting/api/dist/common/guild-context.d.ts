import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
export declare const currentGuild: () => string | null;
export declare const runInGuild: <T>(guildId: string | null, fn: () => T) => T;
export declare class GuildContextMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void;
}
/** Zentrale Einstellungen, die je Server überschrieben werden können (`<key>@<guildId>`, sonst gilt der gemeinsame Wert). */
export declare const SERVER_SCOPED_SETTINGS: readonly ["team.structure", "team.rankOrder", "dashboard.defaultLayout", "theme.accent", "theme.customAccents", "org.name", "teamchance"];
export declare const scopedKey: (key: string, guildId: string | null) => string;
export declare function setServerLinkResolvers(settings: (guildId: string) => string, space: (guildId: string) => string | null): void;
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
