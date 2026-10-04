import { ReportStatus, ReportType } from '@enrp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PermissionService } from '../authz/permission.service';
import { PageQuery } from '../common/pagination';
export declare const hashContent: (c: unknown) => string;
export declare class ReportsService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly perms;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, perms: PermissionService);
    /** Autoren sehen eigene Berichte; reports.review/approve-Inhaber sehen alle. Verhindert, dass fremde Entwürfe auftauchen. */
    private canSeeAll;
    list(actor: Actor, p: PageQuery, status?: string): Promise<{
        items: {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            status: string;
            title: string;
            incidentId: string | null;
            authorId: string;
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
                reportId: string;
                authorId: string;
                changeSummary: string;
                content: Prisma.JsonValue;
                contentHash: string;
            }[];
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            type: string;
            status: string;
            title: string;
            incidentId: string | null;
            authorId: string;
            currentVersion: number;
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
    private visible;
    create(actor: Actor, d: {
        type: ReportType;
        title: string;
        content: Prisma.InputJsonValue;
        incidentId?: string;
        personIds?: string[];
    }): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
    transition(actor: Actor, id: string, to: ReportStatus, reason?: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        status: string;
        title: string;
        incidentId: string | null;
        authorId: string;
        currentVersion: number;
    }>;
}
