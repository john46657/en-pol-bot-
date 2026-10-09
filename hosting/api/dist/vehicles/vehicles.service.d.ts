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
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        vehicle: {
            owner: {
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
            } | null;
        } & {
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
        };
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
    create(actor: Actor, d: {
        plate: string;
        model?: string;
        color?: string;
        ownerId?: string;
        notes?: string;
        erlcReference?: string;
        custom?: Record<string, unknown>;
    }): Promise<{
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
    }>;
    archive(actor: Actor, id: string, reason: string): Promise<{
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
    }>;
}
