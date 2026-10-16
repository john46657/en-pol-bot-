import { Injectable } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';

@Injectable()
export class TimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async add(tx: Tx, e: { entityType: string; entityId: string; action: string; summary: string; actorId: string | null }) {
    await tx.timelineEvent.create({ data: e });
  }

  /** Verlauf mit Anzeigenamen der handelnden Person (`actorName`, null bei System/Bot). */
  async list(entityType: string, entityId: string, take = 100) {
    const rows = await this.prisma.timelineEvent.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' }, take });
    const ids = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ ...r, actorName: r.actorId ? name.get(r.actorId) ?? null : null }));
  }
}
