import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
import { LocksService } from '../locks/locks.service';
export declare class PersonnelService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    private readonly locks;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService, locks: LocksService);
    list(p: PageQuery): Promise<{
        items: ({
            user: {
                id: string;
                robloxUserId: string | null;
                displayName: string;
            };
        } & {
            serviceNumber: string | null;
            id: string;
            qualifications: string[];
            userId: string;
            updatedAt: Date;
            team: string | null;
            rank: string | null;
            callsign: string | null;
            office: string | null;
            employmentStatus: string;
            joinDate: Date;
            rankSince: Date;
            customChecks: import("@prisma/client/runtime/library").JsonValue;
        })[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    /** Vollständige Personalakte inkl. Disziplinarvorgängen; Zugriff wird im Audit festgehalten. */
    get(actor: Actor, id: string): Promise<{
        user: {
            id: string;
            robloxUserId: string | null;
            displayName: string;
            robloxUsername: string | null;
            lastLogin: Date | null;
        };
        academyEnrollments: ({
            course: {
                id: string;
                description: string | null;
                title: string;
                passScore: number;
                instructorId: string | null;
            };
            results: {
                id: string;
                createdAt: Date;
                score: number;
                passed: boolean;
                gradedById: string | null;
                enrollmentId: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            personnelId: string;
            courseId: string;
        })[];
        records: {
            data: import("@prisma/client/runtime/library").JsonValue | null;
            id: string;
            createdAt: Date;
            details: string | null;
            expiresAt: Date | null;
            updatedAt: Date;
            type: string;
            createdById: string;
            status: string | null;
            summary: string;
            attachments: string[];
            deletedAt: Date | null;
            personnelId: string;
        }[];
    } & {
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    create(actor: Actor, d: {
        userId: string;
        rank?: string;
        team?: string;
        office?: string;
        serviceNumber?: string;
        callsign?: string;
        qualifications?: string[];
    }): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    update(actor: Actor, id: string, d: {
        team?: string;
        office?: string | null;
        serviceNumber?: string | null;
        callsign?: string;
        employmentStatus?: string;
        qualifications?: string[];
    }): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    promote(actor: Actor, id: string, rank: string, reason: string): Promise<{
        serviceNumber: string | null;
        id: string;
        qualifications: string[];
        userId: string;
        updatedAt: Date;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    addRecord(actor: Actor, id: string, d: {
        type: 'AWARD' | 'DISCIPLINE' | 'NOTE';
        summary: string;
        details?: string;
    }): Promise<{
        data: import("@prisma/client/runtime/library").JsonValue | null;
        id: string;
        createdAt: Date;
        details: string | null;
        expiresAt: Date | null;
        updatedAt: Date;
        type: string;
        createdById: string;
        status: string | null;
        summary: string;
        attachments: string[];
        deletedAt: Date | null;
        personnelId: string;
    }>;
}
