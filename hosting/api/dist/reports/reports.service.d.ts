import { ReportStatus, ReportType } from '@enrp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
import { PageQuery } from '../common/pagination';
import { LocksService } from '../locks/locks.service';
import { QualityService } from '../quality/quality.service';
export declare const hashContent: (c: unknown) => string;
export declare class ReportsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly perms;
    private readonly locks;
    private readonly quality;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, perms: PermissionService, locks: LocksService, quality: QualityService);
    /** Autoren sehen eigene Berichte; reports.review/approve-Inhaber sehen alle. Verhindert, dass fremde Entwürfe auftauchen. */
    private canSeeAll;
    list(actor: Actor, p: PageQuery, status?: string): Promise<{
        items: {
            number: string;
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            title: string;
            authorId: string;
            incidentId: string | null;
            currentVersion: number;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    get(actor: Actor, id: string): Promise<{
        report: {
            versions: {
                id: string;
                createdAt: Date;
                version: number;
                authorId: string;
                reportId: string;
                changeSummary: string;
                content: Prisma.JsonValue;
                contentHash: string;
            }[];
        } & {
            number: string;
            serverId: string | null;
            id: string;
            status: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            title: string;
            authorId: string;
            incidentId: string | null;
            currentVersion: number;
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
    private visible;
    create(actor: Actor, d: {
        type: ReportType;
        title: string;
        content: Prisma.InputJsonValue;
        incidentId?: string;
        personIds?: string[];
    }): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        authorId: string;
        incidentId: string | null;
        currentVersion: number;
    }>;
    /** Jede Änderung erzeugt eine neue unveränderliche Version; ältere werden nie überschrieben. */
    edit(actor: Actor, id: string, d: {
        version: number;
        title?: string;
        content: Prisma.InputJsonValue;
        changeSummary: string;
    }): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        authorId: string;
        incidentId: string | null;
        currentVersion: number;
    }>;
    transition(actor: Actor, id: string, to: ReportStatus, reason?: string): Promise<{
        number: string;
        serverId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        authorId: string;
        incidentId: string | null;
        currentVersion: number;
    }>;
}
