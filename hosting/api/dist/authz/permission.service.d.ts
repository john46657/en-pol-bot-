import { PermissionContext } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
/** Kein Rang (keine aktive Rolle) – darf keine Rollen verwalten. */
export declare const NO_RANK: number;
/** Lädt Rechte-Kontext aus DB; die Entscheidungslogik liegt zentral in @enrp/shared. */
export declare class PermissionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    /**
     * IDs aller aktiven Rollen des Benutzers (direkt und über Gruppen), die im Server der Anfrage gelten:
     * serverübergreifende Rollen immer, Server-Rollen nur in ihrem Server. Deaktivierte Rollen verleihen nichts.
     */
    roleIdsFor(userId: string, guildId?: string | null): Promise<string[]>;
    contextFor(userId: string): Promise<PermissionContext>;
    check(userId: string, permission: string): Promise<import("@enrp/shared").Resolution>;
    has(userId: string, permission: string): Promise<boolean>;
    assert(userId: string, permission: string): Promise<void>;
    effective(userId: string): Promise<import("@enrp/shared").PermissionKey[]>;
    /** Höchster Rang des Benutzers = kleinste Priorität seiner aktiven Rollen. */
    rankOf(userId: string): Promise<number>;
    /** Serverbesitzer = aktive Rolle „System Administrator“ (bei Discord-Login über ADMIN_DISCORD_IDS vergeben). */
    isOwner(userId: string): Promise<boolean>;
    /** Nur Rollen strikt unterhalb des eigenen Rangs dürfen verwaltet, vergeben oder entzogen werden (Besitzer: alle). */
    assertOutranksRole(actorId: string, rolePriority: number, roleName?: string): Promise<void>;
    /** Andere Benutzer nur verwalten, wenn man sie im Rang übertrifft (Benutzer ohne Rolle: jeder mit Rang). */
    assertOutranksUser(actorId: string, targetId: string): Promise<void>;
    /** Erlauben darf man nur, was man selbst besitzt (keine Rechteausweitung über den Editor). */
    assertCanDelegate(actorId: string, permissions: string[]): Promise<void>;
}
