import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { DiscordOAuthService } from './discord-oauth.service';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PermissionService } from '../authz/permission.service';
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
declare const login2faSchema: z.ZodObject<{
    ticket: z.ZodString;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    ticket: string;
    code: string;
}, {
    ticket: string;
    code: string;
}>;
declare const codeSchema: z.ZodObject<{
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export declare class AuthController {
    private readonly auth;
    private readonly discord;
    private readonly twoFactor;
    private readonly guilds;
    private readonly perms;
    private readonly env;
    constructor(auth: AuthService, discord: DiscordOAuthService, twoFactor: TwoFactorService, guilds: DiscordService, perms: PermissionService);
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
        twoFactor: boolean;
        guildId: string | null;
        servers: string[];
    } | {
        twoFactorRequired: true;
        ticket: string;
    }>;
    /** Zweiter Schritt: Code aus der Authenticator-App (oder Wiederherstellungscode) zum Ticket aus `login`. */
    login2fa(body: z.infer<typeof login2faSchema>, req: AppRequest, res: Response): Promise<{
        id: string;
        username: string;
        displayName: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        roles: string[];
        permissions: import("@enrp/shared").PermissionKey[];
        lastLogin: Date | null;
        twoFactor: boolean;
        guildId: string | null;
        servers: string[];
    }>;
    twoFactorStatus(user: AuthUser): Promise<{
        enabled: boolean;
        enabledAt: Date | null;
        recoveryCodesLeft: number;
    }>;
    twoFactorSetup(a: Actor, user: AuthUser): Promise<{
        secret: string;
        otpauthUrl: string;
    }>;
    twoFactorEnable(a: Actor, user: AuthUser, b: z.infer<typeof codeSchema>): Promise<{
        recoveryCodes: string[];
    }>;
    twoFactorDisable(a: Actor, user: AuthUser, b: z.infer<typeof codeSchema>): Promise<void>;
    twoFactorRecovery(a: Actor, user: AuthUser, b: z.infer<typeof codeSchema>): Promise<{
        recoveryCodes: string[];
    }>;
    logout(user: AuthUser, actor: Actor, res: Response): Promise<void>;
    /** Server-Auswahl: alle Server des Bots, auf denen man das Dashboard öffnen darf (+ ob „Alle Server“ erlaubt ist). */
    servers(user: AuthUser): Promise<{
        allServers: boolean;
        servers: {
            id: string;
            name: string;
            icon: string | null;
            banner: string | null;
            memberCount: number | null;
        }[];
        invite: {
            inviteUrl: string | null;
            id: string;
            name: string;
            icon: string | null;
            banner: string | null;
        }[];
    }>;
    me(user: AuthUser): Promise<{
        id: string;
        username: string;
        displayName: string;
        robloxUserId: string | null;
        robloxUsername: string | null;
        roles: string[];
        permissions: import("@enrp/shared").PermissionKey[];
        lastLogin: Date | null;
        twoFactor: boolean;
        guildId: string | null;
        servers: string[];
    }>;
}
export {};
