import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { DiscordOAuthService } from './discord-oauth.service';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
declare const codeSchema: z.ZodObject<{
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
declare const login2faSchema: z.ZodObject<{
    ticket: z.ZodString;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    ticket: string;
}, {
    code: string;
    ticket: string;
}>;
declare const passwordSchema: z.ZodObject<{
    current: z.ZodString;
    next: z.ZodString;
}, "strip", z.ZodTypeAny, {
    current: string;
    next: string;
}, {
    current: string;
    next: string;
}>;
declare const revokeSchema: z.ZodObject<{
    sessionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    sessionId?: string | undefined;
}, {
    sessionId?: string | undefined;
}>;
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
    private readonly twoFactor;
    private readonly env;
    constructor(auth: AuthService, discord: DiscordOAuthService, twoFactor: TwoFactorService);
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
    /** Server-Übersicht nach dem Login (Kacheln wie bei Dyno/GalaxyBot). */
    servers(user: AuthUser): Promise<{
        name: string;
        globalAdmin: boolean;
        servers: {
            guildId: string;
            name: string;
            icon: string | null;
            state: "open" | "disabled" | "invite" | "pending";
        }[];
        guildsSyncedAt: Date | null;
        discordLinked: boolean;
    }>;
    /** Bot auf einen eigenen Discord-Server einladen (Kachel „+“) – nur Server, die man laut Discord verwalten darf. */
    discordAddServer(user: AuthUser, guild: string | undefined, res: Response): Promise<void>;
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
        globalAdmin: boolean;
    } | {
        twoFactorRequired: true;
        ticket: string;
    }>;
    /** Zweiter Anmeldeschritt (Code aus der Authenticator-App oder Wiederherstellungscode). */
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
        globalAdmin: boolean;
    }>;
    twoFactorStatus(user: AuthUser): Promise<{
        enabled: boolean;
        enabledAt: Date | null;
        recoveryLeft: number;
    }>;
    twoFactorSetup(actor: Actor): Promise<{
        secret: string;
        otpauthUrl: string;
    }>;
    twoFactorEnable(actor: Actor, body: z.infer<typeof codeSchema>): Promise<{
        recoveryCodes: string[];
    }>;
    twoFactorDisable(actor: Actor, body: z.infer<typeof codeSchema>): Promise<void>;
    twoFactorRecovery(actor: Actor, body: z.infer<typeof codeSchema>): Promise<{
        recoveryCodes: string[];
    }>;
    changePassword(user: AuthUser, actor: Actor, body: z.infer<typeof passwordSchema>): Promise<void>;
    sessions(user: AuthUser): Promise<{
        id: string;
        createdAt: Date;
        expiresAt: Date;
        ip: string | null;
        userAgent: string | null;
        current: boolean;
    }[]>;
    revokeSessions(user: AuthUser, actor: Actor, body: z.infer<typeof revokeSchema>): Promise<{
        revoked: number;
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
        twoFactor: boolean;
        guildId: string | null;
        servers: string[];
        globalAdmin: boolean;
    }>;
}
export {};
