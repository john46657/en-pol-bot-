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
            notes: string | null;
            custom: Prisma.JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            plate: string;
            color: string | null;
            ownerId: string | null;
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
                robloxUserId: string | null;
                robloxUsername: string;
                aliases: string[];
                status: string;
                notes: string | null;
                custom: Prisma.JsonValue | null;
                fullName: string | null;
                dateOfBirth: Date | null;
                gender: string | null;
                phone: string | null;
                job: string | null;
                nationality: string | null;
                address: string | null;
                appearance: Prisma.JsonValue | null;
                licenses: string[];
                flags: string[];
                photoId: string | null;
                createdById: string | null;
                createdAt: Date;
                updatedAt: Date;
                version: number;
            } | null;
        } & {
            serverId: string | null;
            model: string | null;
            id: string;
            status: string;
            notes: string | null;
            custom: Prisma.JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            plate: string;
            color: string | null;
            ownerId: string | null;
            erlcReference: string | null;
        };
        timeline: {
            actorName: string | null;
            id: string;
            createdAt: Date;
            entityId: string;
            summary: string;
            entityType: string;
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
        notes: string | null;
        custom: Prisma.JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        plate: string;
        color: string | null;
        ownerId: string | null;
        erlcReference: string | null;
    }>;
    /** Kennzeichen, Modell, Farbe, Halter, Notizen ändern (Versionsprüfung; Kennzeichen bleibt je Server eindeutig). */
    update(actor: Actor, id: string, d: {
        plate?: string;
        model?: string | null;
        color?: string | null;
        ownerId?: string | null;
        notes?: string | null;
        version?: number;
    }): Promise<{
        serverId: string | null;
        model: string | null;
        id: string;
        status: string;
        notes: string | null;
        custom: Prisma.JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        plate: string;
        color: string | null;
        ownerId: string | null;
        erlcReference: string | null;
    }>;
    archive(actor: Actor, id: string, reason: string): Promise<{
        serverId: string | null;
        model: string | null;
        id: string;
        status: string;
        notes: string | null;
        custom: Prisma.JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        plate: string;
        color: string | null;
        ownerId: string | null;
        erlcReference: string | null;
    }>;
}
