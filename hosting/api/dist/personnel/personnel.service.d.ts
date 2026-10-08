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
                displayName: string;
                robloxUserId: string | null;
            };
        } & {
            serverId: string | null;
            serviceNumber: string | null;
            id: string;
            updatedAt: Date;
            userId: string;
            callsign: string | null;
            rank: string | null;
            team: string | null;
            office: string | null;
            employmentStatus: string;
            joinDate: Date;
            qualifications: string[];
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
            displayName: string;
            robloxUserId: string | null;
            robloxUsername: string | null;
            lastLogin: Date | null;
        };
        academyEnrollments: ({
            course: {
                id: string;
                title: string;
                description: string | null;
                instructorId: string | null;
                passScore: number;
            };
            results: {
                id: string;
                createdAt: Date;
                passed: boolean;
                score: number;
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
            id: string;
            type: string;
            status: string | null;
            createdAt: Date;
            updatedAt: Date;
            createdById: string;
            expiresAt: Date | null;
            attachments: string[];
            personnelId: string;
            summary: string;
            details: string | null;
            data: import("@prisma/client/runtime/library").JsonValue | null;
            deletedAt: Date | null;
        }[];
    } & {
        serverId: string | null;
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
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
        serverId: string | null;
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
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
        serverId: string | null;
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    promote(actor: Actor, id: string, rank: string, reason: string): Promise<{
        serverId: string | null;
        serviceNumber: string | null;
        id: string;
        updatedAt: Date;
        userId: string;
        callsign: string | null;
        rank: string | null;
        team: string | null;
        office: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
        rankSince: Date;
        customChecks: import("@prisma/client/runtime/library").JsonValue;
    }>;
    addRecord(actor: Actor, id: string, d: {
        type: 'AWARD' | 'DISCIPLINE' | 'NOTE';
        summary: string;
        details?: string;
    }): Promise<{
        id: string;
        type: string;
        status: string | null;
        createdAt: Date;
        updatedAt: Date;
        createdById: string;
        expiresAt: Date | null;
        attachments: string[];
        personnelId: string;
        summary: string;
        details: string | null;
        data: import("@prisma/client/runtime/library").JsonValue | null;
        deletedAt: Date | null;
    }>;
}
