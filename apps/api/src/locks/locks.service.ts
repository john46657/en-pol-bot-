import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AppError } from '../common/errors';

/** Ohne Lebenszeichen (alle 30 s aus dem geöffneten Formular) läuft die Sperre nach 90 s ab. */
export const LOCK_TTL_MS = 90_000;

/** Sperrbare Datensätze: wer die Sperre sehen darf (eins davon) und wer bearbeiten/sperren darf (eins davon). */
export const LOCK_TYPES = {
  person: { view: ['persons.view'], edit: ['persons.edit'] },
  incident: { view: ['incidents.view', 'cad.view'], edit: ['incidents.edit', 'cad.edit_incident'] },
  report: { view: ['reports.view'], edit: ['reports.create'] },
  personnel: { view: ['personnel.view'], edit: ['personnel.edit'] },
} as const;
export type LockType = keyof typeof LOCK_TYPES;
export const LOCK_TYPE_KEYS = Object.keys(LOCK_TYPES) as [LockType, ...LockType[]];

/**
 * Datensatz-Sperre beim Bearbeiten: Wer ein Formular öffnet, sperrt den Datensatz; andere sehen „wird gerade von X bearbeitet“
 * und können erst speichern, wenn die Sperre frei ist (oder sie sie bewusst übernehmen – wird protokolliert).
 * Ergänzt die Versionsprüfung (optimistic locking) der einzelnen Module.
 */
@Injectable()
export class LocksService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly realtime: RealtimeService) {}

  private async assertAny(userId: string, keys: readonly string[]) {
    for (const k of keys) if (await this.perms.has(userId, k)) return;
    throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
  }

  private async holder(type: LockType, id: string) {
    const l = await this.prisma.editLock.findUnique({ where: { entityType_entityId: { entityType: type, entityId: id } }, include: { user: { select: { id: true, displayName: true } } } });
    return l && l.expiresAt > new Date() ? l : null;
  }
  private view(l: Awaited<ReturnType<LocksService['holder']>>, userId: string) {
    return l ? { locked: true, mine: l.userId === userId, holder: { id: l.user.id, displayName: l.user.displayName }, since: l.createdAt, expiresAt: l.expiresAt } : { locked: false, mine: false };
  }

  async status(actor: Actor, type: LockType, id: string) {
    await this.assertAny(actor.userId!, LOCK_TYPES[type].view);
    return this.view(await this.holder(type, id), actor.userId!);
  }

  /** Sperren oder verlängern. Gehört die Sperre jemand anderem: `ok: false` mit Name – außer bei `force` (Übernahme, protokolliert). */
  async acquire(actor: Actor, type: LockType, id: string, force = false) {
    const me = actor.userId!;
    await this.assertAny(me, LOCK_TYPES[type].edit);
    const now = new Date(), expiresAt = new Date(now.getTime() + LOCK_TTL_MS);
    const key = { entityType: type, entityId: id };
    // eigene Sperre verlängern oder abgelaufene übernehmen
    const mine = await this.prisma.editLock.updateMany({ where: { ...key, userId: me }, data: { expiresAt } });
    if (!mine.count) {
      const stale = await this.prisma.editLock.updateMany({ where: { ...key, expiresAt: { lt: now } }, data: { userId: me, createdAt: now, expiresAt } });
      if (!stale.count) {
        try { await this.prisma.editLock.create({ data: { ...key, userId: me, expiresAt } }); }
        catch (e) {
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
          const other = await this.holder(type, id);
          if (other && other.userId !== me && !force) return { ok: false, ...this.view(other, me) };
          await this.prisma.$transaction(async (tx) => {
            await tx.editLock.update({ where: { entityType_entityId: key }, data: { userId: me, createdAt: now, expiresAt } });
            if (other && other.userId !== me) await this.audit.record(actor, { action: 'lock.takeover', module: 'locks', entityType: type, entityId: id, before: { holder: other.userId } }, tx);
          });
          if (other && other.userId !== me) this.realtime.publishToUser(other.userId, 'lock.taken', { entityType: type, entityId: id });
        }
      }
    }
    return { ok: true, ...this.view(await this.holder(type, id), me) };
  }

  async release(actor: Actor, type: LockType, id: string) {
    await this.prisma.editLock.deleteMany({ where: { entityType: type, entityId: id, userId: actor.userId! } });
  }

  /** Beim Speichern: Hält jemand anderes die Sperre, wird abgelehnt. */
  async assertFree(type: LockType, id: string, userId: string | null | undefined) {
    const l = await this.holder(type, id);
    if (l && l.userId !== userId) throw new AppError('CONFLICT', `Wird gerade von ${l.user.displayName} bearbeitet. Bitte warten oder die Bearbeitung übernehmen.`, { lockedBy: l.user.displayName });
  }
}
