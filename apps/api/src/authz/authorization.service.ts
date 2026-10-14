import { Injectable } from '@nestjs/common';
import { moduleOfPermission, resolvePermission, type PermissionKey } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from './permission.service';
import { ModulesService } from '../server/modules.service';
import { AppError } from '../common/errors';

export type DenyReason = 'MODULE_DISABLED' | 'PERMISSION';
export type Decision = { allowed: true } | { allowed: false; reason: DenyReason; message: string };

const MESSAGES: Record<DenyReason, string> = {
  MODULE_DISABLED: 'Dieses Modul ist deaktiviert.',
  PERMISSION: 'Dafür fehlt dir die Berechtigung.',
};
const deny = (reason: DenyReason): Decision => ({ allowed: false, reason, message: MESSAGES[reason] });

/**
 * Zentrale Zugriffsentscheidung für ALLE geschützten Aktionen (PermissionGuard, Bot-Aufrufe):
 * authentifizierter Benutzer (AuthGuard, inkl. laufender Discord-Mitgliedschaftsprüfung) → Modul an → Berechtigung
 * (DENY vor ALLOW). Standard ist „verweigert“. Abgeschaltete Module gelten auch für Systemadministratoren.
 */
@Injectable()
export class AuthorizationService {
  private deniedLog = new Map<string, number>();
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly audit: AuditService, private readonly modules: ModulesService) {}

  async authorize(userId: string, permission: string): Promise<Decision> {
    const module = moduleOfPermission(permission);
    if (module !== 'core' && (await this.modules.disabled()).has(module)) return deny('MODULE_DISABLED');
    if (!resolvePermission(await this.perms.contextFor(userId), permission).allowed) return deny('PERMISSION');
    return { allowed: true };
  }

  /** Wie `authorize`, wirft aber `PERMISSION_DENIED` und protokolliert die Verweigerung (gedrosselt). */
  async assert(userId: string, permission: string, meta: { requestId?: string; ip?: string } = {}) {
    const d = await this.authorize(userId, permission);
    if (d.allowed) return;
    await this.recordDenied(userId, permission, d.reason, meta);
    throw new AppError('PERMISSION_DENIED', d.message, { reason: d.reason });
  }

  /** Verweigerte Zugriffe: SecurityEvent + Audit (DENIED), je Benutzer/Recht höchstens einmal pro Minute. */
  async recordDenied(userId: string, permission: string, reason: string, meta: { requestId?: string; ip?: string } = {}) {
    const key = `${userId}|${permission}|${reason}`;
    const now = Date.now();
    if (now - (this.deniedLog.get(key) ?? 0) < 60_000) return;
    this.deniedLog.set(key, now);
    if (this.deniedLog.size > 10_000) this.deniedLog.clear();
    await this.prisma.securityEvent.create({ data: { type: 'PERMISSION_DENIED', userId, detail: `${permission} (${reason})`.slice(0, 200), requestId: meta.requestId, ip: meta.ip } }).catch(() => undefined);
    await this.audit.record({ userId, requestId: meta.requestId }, { action: 'access.denied', module: 'permissions', entityType: 'Permission', entityId: permission, after: { reason }, result: 'DENIED' }).catch(() => undefined);
  }

  /** Effektive Rechte – serverseitig berechnet (Rollen, persönliche Ausnahmen, abgeschaltete Module). */
  async effective(userId: string): Promise<PermissionKey[]> {
    const [all, disabled] = await Promise.all([this.perms.effective(userId), this.modules.disabled()]);
    return disabled.size ? all.filter((p) => !disabled.has(moduleOfPermission(p))) : all;
  }
}
