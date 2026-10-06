import { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
export declare const currentGuild: () => string | null;
export declare const runInGuild: <T>(guildId: string | null, fn: () => T) => T;
export declare class GuildContextMiddleware implements NestMiddleware {
    use(req: Request, _res: Response, next: NextFunction): void;
}
/** Zentrale Einstellungen, die je Server überschrieben werden können (`<key>@<guildId>`, sonst gilt der gemeinsame Wert). */
export declare const SERVER_SCOPED_SETTINGS: readonly ["team.structure", "team.rankOrder", "dashboard.defaultLayout", "theme.accent", "org.name"];
export declare const scopedKey: (key: string, guildId: string | null) => string;
