import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { StudioService } from '../studio/studio.service';
import { Prisma } from '@prisma/client';
import { PageQuery } from '../common/pagination';
import { RobloxService } from './roblox.service';
export declare class PersonsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly studio;
    private readonly roblox;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, studio: StudioService, roblox: RobloxService);
    list(p: PageQuery, includeArchived?: boolean): Promise<{
        items: {
            id: string;
            createdAt: Date;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            createdById: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            serverId: string | null;
            aliases: string[];
            notes: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        vehicles: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            status: string;
            custom: Prisma.JsonValue | null;
            serverId: string | null;
            notes: string | null;
            ownerId: string | null;
            plate: string;
            model: string | null;
            color: string | null;
            erlcReference: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        status: string;
        custom: Prisma.JsonValue | null;
        serverId: string | null;
        aliases: string[];
        notes: string | null;
    }>;
    overview(id: string): Promise<{
        person: {
            vehicles: {
                id: string;
                createdAt: Date;
                updatedAt: Date;
                version: number;
                status: string;
                custom: Prisma.JsonValue | null;
                serverId: string | null;
                notes: string | null;
                ownerId: string | null;
                plate: string;
                model: string | null;
                color: string | null;
                erlcReference: string | null;
            }[];
        } & {
            id: string;
            createdAt: Date;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            createdById: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            serverId: string | null;
            aliases: string[];
            notes: string | null;
        };
        tickets: {
            number: string;
            id: string;
            reason: string;
            updatedAt: Date;
            version: number;
            status: string;
            notes: string | null;
            personId: string;
            officerId: string;
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
            entityType: string;
            entityId: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
        }[];
        timeline: {
            id: string;
            action: string;
            entityType: string;
            entityId: string;
            createdAt: Date;
            summary: string;
            actorId: string | null;
        }[];
    }>;
    /** Mögliche Duplikate: gleiche Roblox-ID (hart, Unique) oder gleicher Username (weich → Hinweis, kein Auto-Merge). */
    findDuplicates(robloxUsername: string, robloxUserId?: string | null): Promise<{
        id: string;
        robloxUserId: string | null;
        robloxUsername: string;
        status: string;
    }[]>;
    create(actor: Actor, d: {
        robloxUsername: string;
        robloxUserId?: string | null;
        aliases?: string[];
        notes?: string;
        custom?: Record<string, unknown>;
    }): Promise<{
        person: {
            id: string;
            createdAt: Date;
            robloxUserId: string | null;
            robloxUsername: string;
            updatedAt: Date;
            version: number;
            createdById: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            serverId: string | null;
            aliases: string[];
            notes: string | null;
        };
        possibleDuplicates: {
            id: string;
            robloxUserId: string | null;
            robloxUsername: string;
            status: string;
        }[];
    }>;
    update(actor: Actor, id: string, version: number, d: {
        robloxUsername?: string;
        aliases?: string[];
        notes?: string | null;
        custom?: Record<string, unknown>;
    }): Promise<{
        id: string;
        createdAt: Date;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        status: string;
        custom: Prisma.JsonValue | null;
        serverId: string | null;
        aliases: string[];
        notes: string | null;
    }>;
    archive(actor: Actor, id: string, reason: string): Promise<{
        id: string;
        createdAt: Date;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        status: string;
        custom: Prisma.JsonValue | null;
        serverId: string | null;
        aliases: string[];
        notes: string | null;
    }>;
    /** Merge nur auf ausdrückliche Bestätigung (nie automatisch). Quelle wird archiviert, nichts wird gelöscht. */
    merge(actor: Actor, sourceId: string, targetId: string, reason: string): Promise<{
        id: string;
        createdAt: Date;
        robloxUserId: string | null;
        robloxUsername: string;
        updatedAt: Date;
        version: number;
        createdById: string | null;
        status: string;
        custom: Prisma.JsonValue | null;
        serverId: string | null;
        aliases: string[];
        notes: string | null;
    }>;
}
