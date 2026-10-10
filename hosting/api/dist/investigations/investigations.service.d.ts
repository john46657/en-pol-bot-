import { InvestigationStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
export declare const INVESTIGATION_ROLES: readonly ["SUSPECT", "WITNESS", "VICTIM", "PERSON_OF_INTEREST"];
export declare class InvestigationsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService);
    list(p: PageQuery, status?: string): Promise<{
        items: {
            serverId: string | null;
            id: string;
            title: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            caseNumber: string;
            leadId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        investigation: {
            serverId: string | null;
            id: string;
            title: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string | null;
            caseNumber: string;
            leadId: string | null;
        };
        links: ({
            person: {
                id: string;
                robloxUsername: string;
            } | null;
        } & {
            role: string;
            id: string;
            createdAt: Date;
            personId: string | null;
            vehicleId: string | null;
            entityType: string;
            entityId: string;
        })[];
        evidence: {
            number: string;
            id: string;
            type: string;
            custodyState: string;
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
    create(actor: Actor, d: {
        title: string;
        description?: string;
        leadId?: string;
        persons?: {
            personId: string;
            role: (typeof INVESTIGATION_ROLES)[number];
        }[];
    }): Promise<{
        serverId: string | null;
        id: string;
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        caseNumber: string;
        leadId: string | null;
    }>;
    addPerson(actor: Actor, id: string, personId: string, role: (typeof INVESTIGATION_ROLES)[number]): Promise<void>;
    setStatus(actor: Actor, id: string, to: InvestigationStatus, reason?: string): Promise<{
        serverId: string | null;
        id: string;
        title: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string | null;
        caseNumber: string;
        leadId: string | null;
    }>;
}
