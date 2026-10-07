import { PrismaService } from '../prisma/prisma.service';
export interface AnalyticsFilter {
    type?: string;
    status?: string;
    reviewer?: string;
    days: number;
    guildId?: string | null;
}
/** Statistik über Polizei-Bewerbungen und Qualifikations-Bewerbungen (SEK, Flugstaffel …) – wie im Bewerbungs-Dashboard von Appy. */
export declare class ApplicationsAnalyticsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private rows;
    overview(f: AnalyticsFilter): Promise<{
        days: number;
        kpis: {
            key: "total" | "pending" | "approvalRate" | "avgReviewMin" | "completionRate";
            value: number;
            change: number;
        }[];
        overTime: {
            date: string;
            count: number;
            avg7: number;
        }[];
        breakdown: {
            APPROVED: number;
            PENDING: number;
            REJECTED: number;
        };
        byType: {
            type: string;
            submitted: number;
            approvalRate: number;
            avgReviewMin: number;
        }[];
        reviewers: {
            id: string;
            name: string;
            reviewed: number;
            approvalRate: number;
            avgReviewMin: number;
        }[];
        heat: number[][];
        filters: {
            types: string[];
            reviewers: {
                id: string;
                name: string;
            }[];
        };
    }>;
}
