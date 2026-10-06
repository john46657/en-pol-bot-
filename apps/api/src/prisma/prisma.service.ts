import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Längere Zeitlimits für Transaktionen: bei gehosteten Datenbanken (z. B. bot-hosting.net) dauert jede Abfrage spürbar;
   * mit dem Standard (5 s) brachen große Speichervorgänge (z. B. alle Rechte einer Rolle) mit „unexpected error“ ab.
   */
  constructor() { super({ transactionOptions: { timeout: 30_000, maxWait: 15_000 } }); }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
