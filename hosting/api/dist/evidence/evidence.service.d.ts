import { EvidenceCustodyState } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
export declare class EvidenceService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService);
    list(p: PageQuery): Promise<{
        items: {
            number: string;
            serverId: string | null;
            id: string;
            type: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            description: string;
            caseRef: string | null;
            source: string | null;
            ownerId: string | null;
            storageLocation: string | null;
            custodyState: string;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(id: string): Promise<{
        transfers: {
            id: string;
            createdAt: Date;
            reason: string;
            evidenceId: string;
            fromUserId: string | null;
            toUserId: string | null;
            fromState: string;
            toState: string;
            confirmed: boolean;
        }[];
    } & {
        number: string;
        serverId: string | null;
        id: string;
        type: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string;
        caseRef: string | null;
        source: string | null;
        ownerId: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    create(actor: Actor, d: {
        type: string;
        description: string;
        source?: string;
        caseRef?: string;
        storageLocation?: string;
        personIds?: string[];
    }): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        type: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string;
        caseRef: string | null;
        source: string | null;
        ownerId: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    /** Chain of Custody: jede Zustandsänderung/Übergabe wird als unveränderlicher Transfer festgehalten. */
    transfer(actor: Actor, id: string, d: {
        to: EvidenceCustodyState;
        toUserId?: string;
        reason: string;
        storageLocation?: string;
    }): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        type: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        description: string;
        caseRef: string | null;
        source: string | null;
        ownerId: string | null;
        storageLocation: string | null;
        custodyState: string;
    }>;
    /** Empfänger bestätigt die Übergabe. */
    confirm(actor: Actor, id: string): Promise<{
        confirmed: boolean;
    }>;
}
