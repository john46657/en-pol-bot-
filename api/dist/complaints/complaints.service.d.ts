import { ComplaintStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
import { PageQuery } from '../common/pagination';
export declare class ComplaintsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly perms;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, perms: PermissionService);
    /** Interne Notizen/Findings nur für Ermittler. */
    private shape;
    list(actor: Actor, p: PageQuery, status?: string): Promise<{
        items: ({
            number: string;
            id: string;
            createdAt: Date;
            category: string;
            updatedAt: Date;
            version: number;
            description: string;
            status: string;
            officerId: string | null;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            findings: string | null;
            resolution: string | null;
            internalNotes: string | null;
        } | {
            internalNotes: undefined;
            findings: undefined;
            number: string;
            id: string;
            createdAt: Date;
            category: string;
            updatedAt: Date;
            version: number;
            description: string;
            status: string;
            officerId: string | null;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            resolution: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(actor: Actor, id: string): Promise<{
        complaint: {
            number: string;
            id: string;
            createdAt: Date;
            category: string;
            updatedAt: Date;
            version: number;
            description: string;
            status: string;
            officerId: string | null;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            findings: string | null;
            resolution: string | null;
            internalNotes: string | null;
        } | {
            internalNotes: undefined;
            findings: undefined;
            number: string;
            id: string;
            createdAt: Date;
            category: string;
            updatedAt: Date;
            version: number;
            description: string;
            status: string;
            officerId: string | null;
            complainantId: string | null;
            subjectId: string | null;
            investigatorId: string | null;
            resolution: string | null;
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
        complainantId?: string;
        subjectId?: string;
        officerId?: string;
        category: string;
        description: string;
    }): Promise<{
        id: string;
        number: string;
        status: string;
    }>;
    transition(actor: Actor, id: string, to: ComplaintStatus, d?: {
        investigatorId?: string;
        findings?: string;
        resolution?: string;
        internalNotes?: string;
    }): Promise<{
        id: string;
        status: string;
    }>;
}
