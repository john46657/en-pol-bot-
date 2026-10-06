import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
export type Tx = Prisma.TransactionClient;
export declare class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    /**
     * Längere Zeitlimits für Transaktionen: bei gehosteten Datenbanken (z. B. bot-hosting.net) dauert jede Abfrage spürbar;
     * mit dem Standard (5 s) brachen große Speichervorgänge (z. B. alle Rechte einer Rolle) mit „unexpected error“ ab.
     */
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
}
