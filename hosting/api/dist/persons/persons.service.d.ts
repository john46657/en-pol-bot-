import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { StudioService } from '../studio/studio.service';
import { Prisma } from '@prisma/client';
import { PageQuery } from '../common/pagination';
import { RobloxService } from './roblox.service';
import { LocksService } from '../locks/locks.service';
export declare class PersonsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly studio;
    private readonly roblox;
    private readonly locks;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, studio: StudioService, roblox: RobloxService, locks: LocksService);
    list(p: PageQuery, includeArchived?: boolean): Promise<{
        items: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            createdById: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            aliases: string[];
            notes: string | null;
            custom: Prisma.JsonValue | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        vehicles: {
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            ownerId: string | null;
            color: string | null;
            notes: string | null;
            custom: Prisma.JsonValue | null;
            plate: string;
            erlcReference: string | null;
        }[];
    } & {
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        aliases: string[];
        notes: string | null;
        custom: Prisma.JsonValue | null;
    }>;
    overview(id: string): Promise<{
        person: {
            vehicles: {
                serverId: string | null;
                model: string | null;
                id: string;
                status: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                ownerId: string | null;
                color: string | null;
                notes: string | null;
                custom: Prisma.JsonValue | null;
                plate: string;
                erlcReference: string | null;
            }[];
        } & {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            createdById: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            aliases: string[];
            notes: string | null;
            custom: Prisma.JsonValue | null;
        };
        tickets: {
            number: string;
            id: string;
            status: string;
            updatedAt: Date;
            version: number;
            officerId: string;
            personId: string;
            reason: string;
            notes: string | null;
            legalCodeId: string | null;
            amount: Prisma.Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
        }[];
        links: {
            role: string;
            id: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
            entityType: string;
            entityId: string;
        }[];
        timeline: {
            id: string;
            createdAt: Date;
            entityType: string;
            entityId: string;
            summary: string;
            action: string;
            actorId: string | null;
        }[];
    }>;
    /** Mögliche Duplikate: gleiche Roblox-ID (hart, Unique) oder gleicher Username (weich → Hinweis, kein Auto-Merge). */
    findDuplicates(robloxUsername: string, robloxUserId?: string | null): Promise<{
        id: string;
        status: string;
        robloxUserId: string | null;
        robloxUsername: string;
    }[]>;
    create(actor: Actor, d: {
        robloxUsername: string;
        robloxUserId?: string | null;
        aliases?: string[];
        notes?: string;
        custom?: Record<string, unknown>;
    }): Promise<{
        person: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            createdById: string | null;
            robloxUserId: string | null;
            robloxUsername: string;
            aliases: string[];
            notes: string | null;
            custom: Prisma.JsonValue | null;
        };
        possibleDuplicates: {
            id: string;
            status: string;
            robloxUserId: string | null;
            robloxUsername: string;
        }[];
    }>;
    update(actor: Actor, id: string, version: number, d: {
        robloxUsername?: string;
        aliases?: string[];
        notes?: string | null;
        custom?: Record<string, unknown>;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        aliases: string[];
        notes: string | null;
        custom: Prisma.JsonValue | null;
    }>;
    archive(actor: Actor, id: string, reason: string): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        aliases: string[];
        notes: string | null;
        custom: Prisma.JsonValue | null;
    }>;
    /** Merge nur auf ausdrückliche Bestätigung (nie automatisch). Quelle wird archiviert, nichts wird gelöscht. */
    merge(actor: Actor, sourceId: string, targetId: string, reason: string): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        robloxUserId: string | null;
        robloxUsername: string;
        aliases: string[];
        notes: string | null;
        custom: Prisma.JsonValue | null;
    }>;
}
