import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { RobloxService } from '../persons/roblox.service';
/** „*“ = alle Bewerbungen, „police“ = Polizei-Bewerbung, sonst Schlüssel einer Qualifikation (z. B. „sek“). */
export declare const BAN_ALL = "*";
export declare const BAN_POLICE = "police";
export interface BanInput {
    discordId?: string | null;
    roblox?: string | null;
    name?: string | null;
    scopes: string[];
    reason: string;
    expiresAt?: string | null;
}
/**
 * Bewerbungssperren: Wer gesperrt ist, kann die betroffenen Bewerbungen gar nicht erst starten (Discord-Panel,
 * /bewerbung) und wird beim Absenden (Discord und Web /apply) abgewiesen. Erkannt wird per Discord-ID oder Roblox-ID.
 * Es gibt eine Sperrliste; auch ältere Sperren, die früher nur für einen bestimmten Discord-Server angelegt wurden, gelten.
 */
export declare class ApplicationBansService {
    private readonly prisma;
    private readonly audit;
    private readonly roblox;
    constructor(prisma: PrismaService, audit: AuditService, roblox: RobloxService);
    private activeWhere;
    /** Aktive Sperre für diese Person und diese Bewerbung (oder null). */
    find(who: {
        discordId?: string | null;
        robloxUserId?: string | null;
    }, scope: string): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    } | null>;
    /** Text für die gesperrte Person (Discord-DM/Antwort, Web-Fehlermeldung). */
    message(ban: {
        reason: string;
        expiresAt: Date | null;
    }, what: string): string;
    assertAllowed(who: {
        discordId?: string | null;
        robloxUserId?: string | null;
    }, scope: string, what: string): Promise<void>;
    /** Für den Bot vor dem Start einer Bewerbung. */
    check(discordId: string, scope: string, what: string): Promise<{
        banned: boolean;
        message: string;
    } | {
        banned: boolean;
        message: null;
    }>;
    /** Sperrliste. */
    list(includeInactive: boolean): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    }[]>;
    create(actor: Actor, d: BanInput): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    }>;
    lift(actor: Actor, id: string): Promise<{
        robloxUserId: string | null;
        discordId: string | null;
        name: string;
        id: string;
        createdById: string | null;
        createdAt: Date;
        reason: string;
        expiresAt: Date | null;
        guildId: string | null;
        scopes: string[];
        createdByName: string | null;
        liftedAt: Date | null;
        liftedById: string | null;
    }>;
}
