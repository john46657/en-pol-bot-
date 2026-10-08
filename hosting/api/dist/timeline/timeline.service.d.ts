import { PrismaService, Tx } from '../prisma/prisma.service';
export declare class TimelineService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    add(tx: Tx, e: {
        entityType: string;
        entityId: string;
        action: string;
        summary: string;
        actorId: string | null;
    }): Promise<void>;
    list(entityType: string, entityId: string, take?: number): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdAt: Date;
        action: string;
        actorId: string | null;
        summary: string;
        entityType: string;
        entityId: string;
    }[]>;
}
