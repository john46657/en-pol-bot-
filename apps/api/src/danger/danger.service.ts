import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { DiscordService } from '../discord/discord.service';

export const DANGER_LEVELS = ['GREEN', 'YELLOW', 'RED'] as const;
export type DangerLevel = (typeof DANGER_LEVELS)[number];
export interface DangerState { level: DangerLevel; reason: string | null; setByName: string | null; at: string | null }
const KEY = 'danger.current';

/** Aktueller Gefahrenstatus (Grün/Gelb/Rot). Änderungen sind auditiert, gehen live an die Leitstelle und als Discord-Meldung raus. */
@Injectable()
export class DangerService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly rt: RealtimeService, private readonly discord: DiscordService) {}

  async get(): Promise<DangerState> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
    return (row?.value as unknown as DangerState | undefined) ?? { level: 'GREEN', reason: null, setByName: null, at: null };
  }

  async set(actor: Actor, level: DangerLevel, reason?: string): Promise<DangerState> {
    const before = await this.get();
    const user = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    const state: DangerState = { level, reason: reason?.trim() || null, setByName: user?.displayName ?? null, at: new Date().toISOString() };
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: state as never }, update: { value: state as never } });
      await this.audit.record(actor, { action: 'danger.set', module: 'dispatch', entityType: 'DangerLevel', entityId: KEY, before: { level: before.level }, after: state, reason }, tx);
    });
    this.rt.publish('dispatch', 'danger.changed', { level });
    if (before.level !== level) await this.discord.enqueue('danger', 'danger.changed', { level, previous: before.level, reason: state.reason, setBy: state.setByName });
    return state;
  }
}
