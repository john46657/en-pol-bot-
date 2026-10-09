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
        entityType: string;
        entityId: string;
        summary: string;
        action: string;
        actorId: string | null;
    }[]>;
}
