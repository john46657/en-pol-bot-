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
export const SERVER_SCOPED_SETTINGS = ['team.structure', 'team.rankOrder', 'dashboard.defaultLayout', 'theme.accent', 'theme.customAccents', 'org.name', 'teamchance'] as const;
export const scopedKey = (key: string, guildId: string | null) => (guildId && (SERVER_SCOPED_SETTINGS as readonly string[]).includes(key) ? `${key}@${guildId}` : key);
