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
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            personId: string | null;
            vehicleId: string | null;
            reason: string;
            priority: string;
            createdById: string;
            expiresAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        wanted: {
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            personId: string | null;
            vehicleId: string | null;
            reason: string;
            priority: string;
            createdById: string;
            expiresAt: Date | null;
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
        personId?: string;
        vehicleId?: string;
        reason: string;
        description?: string;
        priority?: string;
        expiresAt?: Date;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
    setStatus(actor: Actor, id: string, to: WantedStatus, reason: string): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        personId: string | null;
        vehicleId: string | null;
        reason: string;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
    }>;
}
