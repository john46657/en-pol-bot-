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
            createdById: string;
            createdAt: Date;
            description: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            status: string;
            personId: string | null;
            vehicleId: string | null;
            priority: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        wanted: {
            id: string;
            reason: string;
            createdById: string;
            createdAt: Date;
            description: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            version: number;
            status: string;
            personId: string | null;
            vehicleId: string | null;
            priority: string;
        };
        timeline: {
            id: string;
            createdAt: Date;
            action: string;
            entityType: string;
            entityId: string;
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
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
    setStatus(actor: Actor, id: string, to: WantedStatus, reason: string): Promise<{
        id: string;
        reason: string;
        createdById: string;
        createdAt: Date;
        description: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        version: number;
        status: string;
        personId: string | null;
        vehicleId: string | null;
        priority: string;
    }>;
}
