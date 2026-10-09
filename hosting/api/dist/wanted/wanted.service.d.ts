import { WantedStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { DiscordService } from '../discord/discord.service';
import { PageQuery } from '../common/pagination';
export declare class WantedService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, discord: DiscordService);
    /** Abgelaufene aktive Fahndungen werden beim Lesen/Schreiben konsistent auf EXPIRED gesetzt. */
    expireDue(): Promise<import("@prisma/client").Prisma.BatchPayload>;
    list(p: PageQuery, status?: string): Promise<{
        items: {
            id: string;
            reason: string;
            createdAt: Date;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            createdById: string;
            status: string;
            vehicleId: string | null;
            personId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        wanted: {
            id: string;
            reason: string;
            createdAt: Date;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            description: string | null;
            priority: string;
            createdById: string;
            status: string;
            vehicleId: string | null;
            personId: string | null;
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
        personId?: string;
        vehicleId?: string;
        reason: string;
        description?: string;
        priority?: string;
        expiresAt?: Date;
    }): Promise<{
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        vehicleId: string | null;
        personId: string | null;
    }>;
    setStatus(actor: Actor, id: string, to: WantedStatus, reason: string): Promise<{
        id: string;
        reason: string;
        createdAt: Date;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        description: string | null;
        priority: string;
        createdById: string;
        status: string;
        vehicleId: string | null;
        personId: string | null;
    }>;
}
