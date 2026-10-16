import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordAccessService } from '../authz/discord-access.service';
import { AuthorizationService } from '../authz/authorization.service';
import { TwoFactorService } from './two-factor.service';
export declare class AuthService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly access;
    private readonly twoFactor;
    private readonly authz;
    private readonly env;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, access: DiscordAccessService, twoFactor: TwoFactorService, authz: AuthorizationService);
    login(username: string, password: string, meta: {
        ip?: string;
        userAgent?: string;
        requestId?: string;
    }): Promise<{
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
            twoFactor: boolean;
            guildId: string | null;
            servers: string[];
            globalAdmin: boolean;
        };
    } | {
        twoFactorRequired: true;
        ticket: string;
    }>;
    /** Zweiter Schritt: Code aus der Authenticator-App oder Wiederherstellungscode. Fehlversuche zählen zur Kontosperre. */
    loginTwoFactor(ticket: string, code: string, meta: {
        ip?: string;
        userAgent?: string;
        requestId?: string;
    }): Promise<{
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
            twoFactor: boolean;
            guildId: string | null;
            servers: string[];
            globalAdmin: boolean;
        };
    }>;
    /** Neue Session nach erfolgreicher Anmeldung (Passwort oder Discord). */
    startSession(user: {
        id: string;
        robloxUserId: string | null;
    }, meta: {
        ip?: string;
        userAgent?: string;
        requestId?: string;
    }, action?: string): Promise<{
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
            twoFactor: boolean;
            guildId: string | null;
            servers: string[];
            globalAdmin: boolean;
        };
    }>;
    logout(actor: Actor, sessionId: string): Promise<void>;
    /** Beendet alle Sessions eines Benutzers (Session Invalidation). */
    /** Eigenes Passwort ändern: altes Passwort nötig; alle anderen Sitzungen werden beendet. */
    changePassword(actor: Actor, sessionId: string, current: string, next: string): Promise<void>;
    /** Eigene aktive Sitzungen (Gerät/IP, angemeldet seit) – die aktuelle ist markiert. */
    sessions(userId: string, currentId: string): Promise<{
        id: string;
        createdAt: Date;
        expiresAt: Date;
        ip: string | null;
        userAgent: string | null;
        current: boolean;
    }[]>;
    /** Eigene Sitzung(en) beenden: eine bestimmte oder alle außer der aktuellen. */
    revokeOwnSessions(actor: Actor, currentId: string, sessionId?: string): Promise<{
        revoked: number;
    }>;
    revokeAllSessions(userId: string): Promise<void>;
    profile(userId: string): Promise<{
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
    /**
     * Server-Übersicht nach dem Login (Kacheln): Server, die man öffnen darf (registriert, Mitglied bzw. globaler
     * Systemadministrator), freizuschaltende Server und eigene Discord-Server ohne Bot (zum Einladen). Jeder Server hat
     * eigene Akten – die Übersicht verrät nur Name und Bild.
     */
    serverOverview(userId: string): Promise<{
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
}
