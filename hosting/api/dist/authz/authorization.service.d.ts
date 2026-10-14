import { type PermissionKey } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from './permission.service';
import { ModulesService } from '../server/modules.service';
export type DenyReason = 'MODULE_DISABLED' | 'PERMISSION';
export type Decision = {
    allowed: true;
} | {
    allowed: false;
    reason: DenyReason;
    message: string;
};
/**
 * Zentrale Zugriffsentscheidung für ALLE geschützten Aktionen (PermissionGuard, Bot-Aufrufe):
 * authentifizierter Benutzer (AuthGuard, inkl. laufender Discord-Mitgliedschaftsprüfung) → Modul an → Berechtigung
 * (DENY vor ALLOW). Standard ist „verweigert“. Abgeschaltete Module gelten auch für Systemadministratoren.
 */
export declare class AuthorizationService {
    private readonly prisma;
    private readonly perms;
    private readonly audit;
    private readonly modules;
    private deniedLog;
    constructor(prisma: PrismaService, perms: PermissionService, audit: AuditService, modules: ModulesService);
    authorize(userId: string, permission: string): Promise<Decision>;
    /** Wie `authorize`, wirft aber `PERMISSION_DENIED` und protokolliert die Verweigerung (gedrosselt). */
    assert(userId: string, permission: string, meta?: {
        requestId?: string;
        ip?: string;
    }): Promise<void>;
    /** Verweigerte Zugriffe: SecurityEvent + Audit (DENIED), je Benutzer/Recht höchstens einmal pro Minute. */
    recordDenied(userId: string, permission: string, reason: string, meta?: {
        requestId?: string;
        ip?: string;
    }): Promise<void>;
    /** Effektive Rechte – serverseitig berechnet (Rollen, persönliche Ausnahmen, abgeschaltete Module). */
    effective(userId: string): Promise<PermissionKey[]>;
}
