import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { StudioService } from '../studio/studio.service';
import { Prisma } from '@prisma/client';
import { PageQuery } from '../common/pagination';
export declare class VehiclesService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly studio;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, studio: StudioService);
    list(p: PageQuery): Promise<{
        items: ({
            owner: {
                id: string;
                robloxUsername: string;
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            serverId: string | null;
            notes: string | null;
            ownerId: string | null;
            plate: string;
            model: string | null;
            erlcReference: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        vehicle: {
            owner: {
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
                notes: string | null;
                aliases: string[];
            } | null;
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            color: string | null;
            status: string;
            custom: Prisma.JsonValue | null;
            serverId: string | null;
            notes: string | null;
            ownerId: string | null;
            plate: string;
            model: string | null;
            erlcReference: string | null;
        };
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
    create(actor: Actor, d: {
        plate: string;
        model?: string;
        color?: string;
        ownerId?: string;
        notes?: string;
        erlcReference?: string;
        custom?: Record<string, unknown>;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        status: string;
        custom: Prisma.JsonValue | null;
        serverId: string | null;
        notes: string | null;
        ownerId: string | null;
        plate: string;
        model: string | null;
        erlcReference: string | null;
    }>;
    archive(actor: Actor, id: string, reason: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        color: string | null;
        status: string;
        custom: Prisma.JsonValue | null;
        serverId: string | null;
        notes: string | null;
        ownerId: string | null;
        plate: string;
        model: string | null;
        erlcReference: string | null;
    }>;
}
