import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';
/** Kein gültiger Passwort-Hash → mit Passwort nicht anmeldbar (nur Discord). */
export declare const DISCORD_ONLY_PASSWORD = "!discord-login-only";
/** `teamRoleIds`: ohne eine dieser Discord-Rollen kein Zugang zum MDT/Dashboard (leer = jedes Server-Mitglied). */
export interface DiscordLoginSettings {
    signup: boolean;
    requireGuild: boolean;
    roleMap: {
        discordRoleId: string;
        role: string;
    }[];
    teamRoleIds: string[];
}
export declare const DEFAULT_DISCORD_LOGIN: DiscordLoginSettings;
/** Fehlercodes für die Login-Seite (`/login?discord=<code>`). */
export type DiscordLoginError = 'disabled' | 'state' | 'failed' | 'no_account' | 'not_member' | 'cannot_verify' | 'inactive' | 'taken' | 'no_team_role';
export declare class DiscordLoginFailure extends Error {
    readonly code: DiscordLoginError;
    constructor(code: DiscordLoginError);
}
/**
 * „Mit Discord anmelden“ (OAuth2, Scope `identify`) – wie bei Dyno & Co.
 * Zustand liegt serverseitig (das Session-Cookie ist SameSite=strict und kommt beim Rücksprung von Discord nicht mit);
 * zusätzlich bindet ein SameSite=lax-Cookie den Vorgang an den Browser (Schutz vor Login-CSRF).
 * Server-Mitgliedschaft und Rollen werden mit dem Bot-Token geprüft.
 */
export declare class DiscordOAuthService {
    private readonly prisma;
    private readonly audit;
    private readonly auth;
    private readonly env;
    private readonly pending;
    private readonly log;
    constructor(prisma: PrismaService, audit: AuditService, auth: AuthService);
    clientId(): string | null;
    enabled(): boolean;
    /** Passwort-Login nur, solange Discord-Login nicht eingerichtet ist – oder im Notfall mit PASSWORD_LOGIN=true. */
    passwordLoginAllowed(): boolean;
    private isAdminId;
    redirectUri(): string;
    /** Schritt 1: Adresse bei Discord + Browser-Bindung. */
    start(mode: 'login' | 'link', userId?: string): {
        url: string;
        browser: string;
    };
    /** Schritt 2: Rücksprung von Discord. Liefert eine neue Session (Login) oder verknüpft das Konto (Link). */
    callback(code: string | undefined, state: string | undefined, browser: string | undefined, meta: {
        ip?: string;
        userAgent?: string;
        requestId?: string;
    }): Promise<{
        kind: "linked";
    } | {
        token: string;
        expiresAt: Date;
        user: {
            id: string;
            username: string;
            displayName: string;
            robloxUserId: string | null;
            robloxUsername: string | null;
            roles: string[];
            permissions: import("@enrp/shared").PermissionKey[];
            lastLogin: Date | null;
        };
        kind: "login";
    }>;
    settings(): Promise<DiscordLoginSettings>;
    private discordUser;
    /** Mitglied auf einem der Server des Bots (bzw. der eingestellten Server)? `null` = nein, `unknown` = nicht prüfbar. */
    private membership;
    private createUser;
    private ensureAdmin;
    /** Discord-Rolle → Systemrolle: zugeordnete Rollen vergeben bzw. entziehen (nur Rollen aus der Zuordnung). */
    private syncRoles;
}
