import { PrismaService } from '../prisma/prisma.service';
export declare class HealthController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    health(): {
        status: string;
    };
    /** Adresse des Web-Dashboards für den Discord-Befehl /dashboard. */
    dashboardUrl(): {
        url: string;
    };
    readiness(): Promise<{
        status: string;
        checks: {
            database: string;
        };
    }>;
}
