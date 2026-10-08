import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Gewählter Discord-Server der Anfrage (Header `X-Guild-Id`, gesetzt von der Server-Auswahl im Dashboard bzw. vom Bot).
 * Server laufen getrennt: serverbezogene Rollen gelten nur dort, Teamliste/Voice/Einstellungen zeigen nur diesen Server.
 * Ohne Header = „Alle Server“ (nur serverübergreifende Rollen).
 */
const store = new AsyncLocalStorage<{ guildId: string | null }>();
export const currentGuild = (): string | null => store.getStore()?.guildId ?? null;
export const runInGuild = <T>(guildId: string | null, fn: () => T): T => store.run({ guildId }, fn);

@Injectable()
export class GuildContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const h = req.headers['x-guild-id'];
    const guildId = typeof h === 'string' && /^\d{15,25}$/.test(h) ? h : null;
    store.run({ guildId }, next);
  }
}

/** Zentrale Einstellungen, die je Server überschrieben werden können (`<key>@<guildId>`, sonst gilt der gemeinsame Wert). */
export const SERVER_SCOPED_SETTINGS = ['team.structure', 'team.rankOrder', 'dashboard.defaultLayout', 'theme.accent', 'theme.customAccents', 'org.name', 'teamchance', 'hr.config', 'dienstnummer.settings'] as const;
export const scopedKey = (key: string, guildId: string | null) => { const g = settingsGuild(guildId); return g && (SERVER_SCOPED_SETTINGS as readonly string[]).includes(key) ? `${key}@${g}` : key; };

// ---- Server-Verbund (Administration → Server-Verbund; gesetzt vom ServerLinksService) ----
let settingsOf: (guildId: string) => string = (g) => g;
let spaceOf: (guildId: string) => string | null = () => null;
export function setServerLinkResolvers(settings: (guildId: string) => string, space: (guildId: string) => string | null) { settingsOf = settings; spaceOf = space; }
/** Server, dessen Einstellungen gelten: in einer Gruppe mit „Einstellungen teilen“ der Haupt-Server der Gruppe, sonst der Server selbst. */
export const settingsGuild = (guildId: string | null | undefined): string | null => (guildId ? settingsOf(guildId) : null);
/**
 * Akten-Bereich (Personen/Fahrzeuge, Spalte `serverId`): `null` = gemeinsamer Bestand (Standard), sonst eigener Bereich
 * des Servers bzw. der Gruppe. `undefined` = kein Server gewählt („Alle Server“) → kein Filter.
 */
export const recordSpace = (guildId: string | null | undefined = currentGuild()): string | null | undefined => (guildId ? spaceOf(guildId) : undefined);
/** Prisma-Filter für Akten des gewählten Servers (ohne Server: alle). */
export const recordWhere = (guildId: string | null | undefined = currentGuild()) => { const s = recordSpace(guildId); return s === undefined ? {} : { serverId: s }; };
/**
 * Personalakte des gewählten Servers in verschachtelten Abfragen (dort greift die Server-Trennung nicht):
 * `user: { select: { personnel: personnelOfServer({ rank: true }) } }` → `user.personnel[0]`.
 */
export const personnelOfServer = <S extends object>(select: S) => ({ where: recordWhere(), take: 1, select });
