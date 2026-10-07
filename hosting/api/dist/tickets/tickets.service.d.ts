import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
export declare class TicketsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService);
    list(p: PageQuery, personId?: string): Promise<{
        items: ({
            person: {
                id: string;
                robloxUsername: string;
            };
        } & {
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
            amount: import("@prisma/client/runtime/library").Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        ticket: {
            person: {
                id: string;
                createdAt: Date;
                robloxUserId: string | null;
                robloxUsername: string;
                updatedAt: Date;
                version: number;
                createdById: string | null;
                status: string;
                custom: import("@prisma/client/runtime/library").JsonValue | null;
                serverId: string | null;
                notes: string | null;
                aliases: string[];
            };
            legalCode: {
                id: string;
                code: string;
                category: string;
                expiresAt: Date | null;
                active: boolean;
                description: string | null;
                title: string;
                penalty: import("@prisma/client/runtime/library").JsonValue;
                effectiveDate: Date;
            } | null;
        } & {
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
            amount: import("@prisma/client/runtime/library").Decimal;
            reportId: string | null;
            voidReason: string | null;
            voidedById: string | null;
            issuedAt: Date;
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
    /** Ticket + Personenverknüpfung + Timeline + Audit + Notification in EINER Transaktion. */
    create(actor: Actor, d: {
        personId: string;
        legalCodeId?: string;
        reason: string;
        amount?: number;
        notes?: string;
        reportId?: string;
    }): Promise<{
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
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
    void(actor: Actor, id: string, reason: string): Promise<{
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
        amount: import("@prisma/client/runtime/library").Decimal;
        reportId: string | null;
        voidReason: string | null;
        voidedById: string | null;
        issuedAt: Date;
    }>;
}
