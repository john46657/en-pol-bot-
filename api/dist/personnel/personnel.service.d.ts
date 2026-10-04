import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { PageQuery } from '../common/pagination';
export declare class PersonnelService {
    private readonly prisma;
    private readonly audit;
    private readonly timeline;
    constructor(prisma: PrismaService, audit: AuditService, timeline: TimelineService);
    list(p: PageQuery): Promise<{
        items: ({
            user: {
                id: string;
                robloxUserId: string | null;
                displayName: string;
            };
        } & {
            id: string;
            userId: string;
            team: string | null;
            callsign: string | null;
            rank: string | null;
            employmentStatus: string;
            joinDate: Date;
            qualifications: string[];
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
            details: string | null;
            id: string;
            createdById: string;
            createdAt: Date;
            summary: string;
            type: string;
            personnelId: string;
        }[];
    } & {
        id: string;
        userId: string;
        team: string | null;
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
    }>;
    create(actor: Actor, d: {
        userId: string;
        rank?: string;
        team?: string;
        callsign?: string;
        qualifications?: string[];
    }): Promise<{
        id: string;
        userId: string;
        team: string | null;
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
    }>;
    update(actor: Actor, id: string, d: {
        team?: string;
        callsign?: string;
        employmentStatus?: string;
        qualifications?: string[];
    }): Promise<{
        id: string;
        userId: string;
        team: string | null;
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
    }>;
    promote(actor: Actor, id: string, rank: string, reason: string): Promise<{
        id: string;
        userId: string;
        team: string | null;
        callsign: string | null;
        rank: string | null;
        employmentStatus: string;
        joinDate: Date;
        qualifications: string[];
    }>;
    addRecord(actor: Actor, id: string, d: {
        type: 'AWARD' | 'DISCIPLINE' | 'NOTE';
        summary: string;
        details?: string;
    }): Promise<{
        details: string | null;
        id: string;
        createdById: string;
        createdAt: Date;
        summary: string;
        type: string;
        personnelId: string;
    }>;
}
