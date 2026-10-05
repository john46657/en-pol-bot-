import { PrismaService } from '../prisma/prisma.service';
export declare class HealthController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    health(): {
        status: string;
    };
    readiness(): Promise<{
        status: string;
        checks: {
            database: string;
        };
    }>;
}
