import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { DiscordOAuthService } from './discord-oauth.service';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
declare const loginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export declare class AuthController {
    private readonly auth;
    private readonly discord;
    private readonly env;
    constructor(auth: AuthService, discord: DiscordOAuthService);
    private secure;
    /** Welche Anmeldewege es gibt (Login-Seite). */
    /** Einladungs-Link für den Bot (Einstellungen → „Bot zu einem Server hinzufügen“). */
    invite(): {
        url: string | null;
    };
    providers(): {
        discord: boolean;
        password: boolean;
    };
    /** „Mit Discord anmelden“ → weiter zu Discord. */
    discordStart(res: Response): void;
    /** Angemeldeter Benutzer verknüpft sein Discord-Konto per Discord-Login (statt Einmal-Code). */
    discordLink(user: AuthUser, res: Response): void;
    /** Bot auf einen Server einladen – über das Dashboard (löst den Code ein; klappt auch mit „OAuth2-Code-Erlaubnis benötigt“). */
    discordInstall(user: AuthUser, res: Response): void;
    /** Rücksprung von Discord (diese Adresse muss im Developer Portal unter OAuth2 → Redirects stehen). */
    discordCallback(code: string | undefined, state: string | undefined, error: string | undefined, req: AppRequest & {
        cookies?: Record<string, string>;
    }, res: Response): Promise<void>;
    login(body: z.infer<typeof loginSchema>, req: AppRequest, res: Response): Promise<{
        id: string;
        username: string;
        displayName: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        roles: string[];
        permissions: import("@enrp/shared").PermissionKey[];
        lastLogin: Date | null;
        guildId: string | null;
        servers: string[];
    }>;
    logout(user: AuthUser, actor: Actor, res: Response): Promise<void>;
    me(user: AuthUser): Promise<{
        id: string;
        username: string;
        displayName: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        roles: string[];
        permissions: import("@enrp/shared").PermissionKey[];
        lastLogin: Date | null;
        guildId: string | null;
        servers: string[];
    }>;
}
export {};
