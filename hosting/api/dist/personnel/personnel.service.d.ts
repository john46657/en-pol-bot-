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
            qualifications: string[];
            userId: string;
            team: string | null;
            rank: string | null;
            callsign: string | null;
            office: string | null;
            serviceNumber: string | null;
            employmentStatus: string;
            joinDate: Date;
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
            id: string;
            createdAt: Date;
            details: string | null;
            type: string;
            createdById: string;
            summary: string;
            personnelId: string;
        }[];
    } & {
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
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
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    update(actor: Actor, id: string, d: {
        team?: string;
        office?: string | null;
        serviceNumber?: string | null;
        callsign?: string;
        employmentStatus?: string;
        qualifications?: string[];
    }): Promise<{
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    promote(actor: Actor, id: string, rank: string, reason: string): Promise<{
        id: string;
        qualifications: string[];
        userId: string;
        team: string | null;
        rank: string | null;
        callsign: string | null;
        office: string | null;
        serviceNumber: string | null;
        employmentStatus: string;
        joinDate: Date;
    }>;
    addRecord(actor: Actor, id: string, d: {
        type: 'AWARD' | 'DISCIPLINE' | 'NOTE';
        summary: string;
        details?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        details: string | null;
        type: string;
        createdById: string;
        summary: string;
        personnelId: string;
    }>;
}
