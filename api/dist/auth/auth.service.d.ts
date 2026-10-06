import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
export declare class AuthService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly env;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService);
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
        };
    }>;
    logout(actor: Actor, sessionId: string): Promise<void>;
    /** Beendet alle Sessions eines Benutzers (Session Invalidation). */
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
    }>;
}
