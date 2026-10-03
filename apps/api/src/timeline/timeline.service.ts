import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async add(tx: Tx, e: { entityType: string; entityId: string; action: string; summary: string; actorId: string | null }) {
    await tx.timelineEvent.create({ data: e });
  }

  list(entityType: string, entityId: string, take = 100) {
    return this.prisma.timelineEvent.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' }, take });
  }
}
