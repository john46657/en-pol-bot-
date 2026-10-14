import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MODULES, moduleDef, moduleDependencyError, type ModuleDef } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';

export const MODULES_KEY = 'modules.config';
interface ModulesConfig { disabled: string[]; version: number }
const TTL = 5_000;

/**
 * Module zentral an- und ausschalten (Administration → Module). Ohne Eintrag ist ein Modul an. Abgeschaltete Module sperrt der
 * AuthorizationService im Dashboard, in der API und bei Discord-Befehlen; der Bot registriert ihre Befehle nicht.
 */
@Injectable()
export class ModulesService {
  private cache: { at: number; disabled: Set<string> } | null = null;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async read(db: Prisma.TransactionClient | PrismaService = this.prisma): Promise<ModulesConfig> {
    const v = (await db.systemSetting.findUnique({ where: { key: MODULES_KEY } }))?.value as Partial<ModulesConfig> | undefined;
    const known = new Set((MODULES as readonly ModuleDef[]).filter((m) => !m.system).map((m) => m.key));
    return { disabled: (Array.isArray(v?.disabled) ? v.disabled : []).filter((k): k is string => typeof k === 'string' && known.has(k)), version: typeof v?.version === 'number' ? v.version : 0 };
  }

  /** Abgeschaltete Module (5 s zwischengespeichert; diese Instanz nach Änderungen sofort). */
  async disabled(): Promise<Set<string>> {
    if (this.cache && Date.now() - this.cache.at < TTL) return this.cache.disabled;
    const disabled = new Set((await this.read()).disabled);
    this.cache = { at: Date.now(), disabled };
    return disabled;
  }

  async list() {
    const c = await this.read();
    return {
      version: c.version,
      modules: (MODULES as readonly ModuleDef[]).map((m) => ({ key: m.key, name: m.name, description: m.description, system: !!m.system, dependsOn: m.dependsOn ?? [], enabled: m.system ? true : !c.disabled.includes(m.key) })),
    };
  }

  /** Modul an/aus. `version` = gelesener Stand; ein veralteter Stand wird mit 409 abgelehnt. Abhängigkeiten werden geprüft. */
  async set(actor: Actor, key: string, enabled: boolean, version: number) {
    const def = moduleDef(key);
    if (!def) throw new AppError('NOT_FOUND', 'Unbekanntes Modul.');
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${MODULES_KEY}))`;
      const c = await this.read(tx);
      if (c.version !== version) throw new AppError('CONFLICT', 'Die Module wurden inzwischen von jemand anderem geändert. Bitte neu laden – deine Änderung wurde NICHT gespeichert.', { reason: 'VERSION_CONFLICT' });
      const state = Object.fromEntries((MODULES as readonly ModuleDef[]).map((m) => [m.key, m.system ? true : !c.disabled.includes(m.key)]));
      if (state[key] === enabled) return;
      const err = moduleDependencyError(key, enabled, state);
      if (err) throw new AppError('VALIDATION_FAILED', err);
      const value = { disabled: enabled ? c.disabled.filter((k) => k !== key) : [...c.disabled, key], version: c.version + 1 };
      await tx.systemSetting.upsert({ where: { key: MODULES_KEY }, create: { key: MODULES_KEY, value }, update: { value } });
      await this.audit.record(actor, { action: enabled ? 'module.enable' : 'module.disable', module: 'modules', entityType: 'Module', entityId: key, before: { enabled: !enabled }, after: { enabled } }, tx);
    });
    this.cache = null;
    return this.list();
  }
}
