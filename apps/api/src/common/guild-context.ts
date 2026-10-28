import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';

/**
 * Gewählter Discord-Server der Anfrage (Header `X-Guild-Id`, gesetzt von der Server-Auswahl im Dashboard bzw. vom Bot).
 * Server laufen getrennt: serverbezogene Rollen gelten nur dort, Teamliste/Voice/Einstellungen zeigen nur diesen Server.
 * Ohne Header = „Alle Server“ (nur serverübergreifende Rollen).
 */
const store = new AsyncLocalStorage<{ guildId: string | null; request?: boolean; bot?: boolean; spaces?: Promise<ReadonlySet<string> | null>; requestId?: string }>();
export const currentGuild = (): string | null => store.getStore()?.guildId ?? null;
/**
 * Server, den eine Anfrage per `?guildId=` (oder im Body) ansprechen darf. Server sind getrennt: im Kontext eines
 * gewählten Servers nur dieser – ein anderer wird abgelehnt (sonst könnte ein Server-Admin per Parameter Daten und
 * Einstellungen fremder Server lesen/ändern). Ohne Kontext („Alle Server“, Bot-Dienstweg) gilt der angegebene.
 */
export const targetGuild = (requested?: string | null): string | null => {
  const g = currentGuild();
  if (g && requested && requested !== g) throw new AppError('PERMISSION_DENIED', 'Server sind getrennt – wechsle oben zum Server, um seine Daten zu bearbeiten.', { reason: 'FOREIGN_SERVER' });
  return g ?? requested ?? null;
};
/** Request-ID der laufenden Anfrage (Korrelations-ID für Audit/Fehlersuche), außerhalb von Anfragen undefiniert. */
export const currentRequestId = (): string | undefined => store.getStore()?.requestId;
export const runInGuild = <T>(guildId: string | null, fn: () => T): T => store.run({ guildId }, fn);
/** Läuft gerade eine Anfrage aus Dashboard/Bot (nicht: Hintergrund-Aufgabe, `runInGuild`/`unscoped`)? */
export const inRequest = (): boolean => store.getStore()?.request === true;
/** Anfrage aus dem Dashboard (Sitzung), nicht vom Bot und keine Hintergrund-Aufgabe? */
export const inDashboardRequest = (): boolean => { const s = store.getStore(); return s?.request === true && !s.bot; };

@Injectable()
export class GuildContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const h = req.headers['x-guild-id'];
    const guildId = typeof h === 'string' && /^\d{15,25}$/.test(h) ? h : null;
    const bot = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bot ');
    store.run({ guildId, request: true, bot, requestId: (req as Request & { requestId?: string }).requestId }, next);
  }
}

/** Zentrale Einstellungen, die je Server überschrieben werden können (`<key>@<guildId>`, sonst gilt der gemeinsame Wert). */
export const SERVER_SCOPED_SETTINGS = ['team.structure', 'team.rankOrder', 'dashboard.defaultLayout', 'theme.accent', 'theme.customAccents', 'org.name', 'teamchance'] as const;
/**
 * Konfiguration, die von Grund auf JE SERVER gilt: im Kontext eines Servers liest und schreibt jede Abfrage automatisch
 * `<Schlüssel>@<Server>` (server-scope.ts) – ohne Rückgriff auf die Werte anderer Server. Unter „Alle Server“ bzw. in
 * Hintergrund-Aufgaben ohne Server gilt der Grundwert. Anmeldung, Backups, Server-Verbund und Bot-Zustand bleiben global.
 */
export const PER_SERVER_SETTING_KEYS: readonly string[] = [
  ...SERVER_SCOPED_SETTINGS, 'org.serverName', 'studio.customFields', 'application.form', 'qualifications.config', 'discord.channels',
  'cad.config', 'mdt.config', 'fleet.config', 'welcome.config', 'voice-support.rooms', 'verify.config', 'verify.panel', 'tickets.settings', 'shifts.config',
  'logging.config', 'leave.config', 'hr.config', 'embeds.messages', 'danger.current', 'danger.config', 'dienstnummer.settings', 'academy.config', 'radio.discord',
  'messagebuilder.channels', 'auth.discord', 'org.timezone', 'org.dateFormat',
];
/** Erst später je Server getrennt: bestehende Server bekommen einmalig den bisherigen gemeinsamen Wert als eigene Kopie. */
export const LATER_PER_SERVER_KEYS: readonly string[] = ['auth.discord', 'org.timezone', 'org.dateFormat'];
export const scopedKey = (key: string, guildId: string | null) => { const g = settingsGuild(guildId); return g && (SERVER_SCOPED_SETTINGS as readonly string[]).includes(key) ? `${key}@${g}` : key; };

// ---- Server-Verbund (Administration → Server-Verbund; gesetzt vom ServerLinksService) ----
let settingsOf: (guildId: string) => string = (g) => g;
let spaceOf: (guildId: string) => string | null = () => null;
let knownSpaces: () => Promise<ReadonlySet<string> | null> = async () => null;
export function setServerLinkResolvers(settings: (guildId: string) => string, space: (guildId: string) => string | null, known?: () => Promise<ReadonlySet<string> | null>) { settingsOf = settings; spaceOf = space; if (known) knownSpaces = known; }
/**
 * Akten-Bereiche, die zu einem registrierten Discord-Server (bzw. einer Server-Gruppe) gehören. Alles andere sind Reste früherer
 * Umstellungen (z. B. „separat belassene“ Doppel aus der Rück-Umstellung, Bereiche aufgelöster Gruppen) – sie bleiben gespeichert
 * (Backups, Zugriff per ID), erscheinen aber unter „Alle Server“ nicht mehr in Listen. Einmal je Anfrage geladen; außerhalb von Anfragen `null`.
 */
export const registeredSpaces = (): Promise<ReadonlySet<string> | null> => {
  const st = store.getStore();
  if (!st?.request) return Promise.resolve(null);
  st.spaces ??= knownSpaces().catch(() => null);
  return st.spaces;
};
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
 * Personalakte des aktuellen Servers in verschachtelten Abfragen (Benutzer → Akte; es gibt je Server eine eigene Akte):
 * `personnel: { ...onePersonnel(), select: {…} }` und danach `user.personnel[0]`. Ohne Server: irgendeine Akte.
 */
export const onePersonnel = (space: string | null | undefined = recordSpace()) => ({ where: space === undefined ? {} : { serverId: space }, take: 1 });
/** Ausnahmsweise ohne Server-Filter (z. B. global eindeutige, fortlaufende Nummern). Nur für Zähler – nie für Inhalte. */
export const unscoped = <T>(fn: () => PromiseLike<T> | T): Promise<T> => runInGuild(null, async () => await fn()); // Prisma-Abfragen laufen erst beim await → im Kontext abwarten
