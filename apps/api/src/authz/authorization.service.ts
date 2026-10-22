import { Injectable } from '@nestjs/common';
import { ALL_PERMISSIONS, moduleOfPermission, OFF_MODULES, resolvePermission, type PermissionKey } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionService } from './permission.service';
import { AppError } from '../common/errors';
import { currentGuild, recordSpace } from '../common/guild-context';

export type DenyReason = 'UNKNOWN_SERVER' | 'SERVER_DISABLED' | 'NOT_MEMBER' | 'MODULE_DISABLED' | 'PERMISSION' | 'FOREIGN_RECORD';
export type Decision = { allowed: true } | { allowed: false; reason: DenyReason; message: string };

/** Zugriffskontext auf einen konkreten Datensatz bzw. eine serverübergreifende Aktion. */
export interface ResourceContext {
  /** Akten-Bereich des Datensatzes (Spalte `serverId`; `null` = gemeinsamer Bestand). `undefined` = kein Datensatzbezug. */
  space?: string | null;
}

export interface ServerRow { id: string; guildId: string; name: string; status: string; archivedAt: Date | null }
const MESSAGES: Record<DenyReason, string> = {
  UNKNOWN_SERVER: 'Dieser Discord-Server ist nicht registriert.',
  SERVER_DISABLED: 'Dieser Server ist deaktiviert.',
  NOT_MEMBER: 'Du bist auf diesem Discord-Server kein (bestätigtes) Mitglied.',
  MODULE_DISABLED: 'Dieses Modul ist auf diesem Server deaktiviert.',
  PERMISSION: 'Dafür fehlt dir die Berechtigung.',
  FOREIGN_RECORD: 'Dieser Datensatz gehört zu einem anderen Server.',
};
const deny = (reason: DenyReason, message = MESSAGES[reason]): Decision => ({ allowed: false, reason, message });
const TTL = 5_000;

/**
 * Zentrale Zugriffsentscheidung für ALLE geschützten Aktionen (PermissionGuard, Server-/Verbindungs-APIs, Bot-Aufrufe):
 * authentifizierter Benutzer → Server registriert und aktiv → bestätigte Mitgliedschaft → Modul an → Berechtigung (höchste Rolle entscheidet, in einer Rolle DENY vor ALLOW)
 * → Datensatz im erlaubten Bereich → ggf. aktive Datenfreigabe. Standard ist „verweigert“.
 * Globale Systemadministratoren überspringen NUR die Mitgliedschaftsprüfung (Notfall-/Verwaltungszugang); Module und
 * Mandantengrenzen gelten auch für sie. Server-Administratoren haben Rechte nur auf ihrem Server (Rollen mit `guildId`).
 */
@Injectable()
export class AuthorizationService {
  private servers = new Map<string, { at: number; row: ServerRow | null }>();
  private modules = new Map<string, { at: number; disabled: Set<string> }>();
  private deniedLog = new Map<string, number>();
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly audit: AuditService) {}

  /** Nach Änderungen an Servern/Modulen (diese Instanz sofort, andere spätestens nach 5 s). */
  invalidate() { this.servers.clear(); this.modules.clear(); }

  async server(guildId: string): Promise<ServerRow | null> {
    const c = this.servers.get(guildId);
    if (c && Date.now() - c.at < TTL) return c.row;
    const row = await this.prisma.discordServer.findUnique({ where: { guildId }, select: { id: true, guildId: true, name: true, status: true, archivedAt: true } });
    this.servers.set(guildId, { at: Date.now(), row });
    return row;
  }

  /** Abgeschaltete Module eines Servers (ohne Eintrag = an; global ausgeschaltete immer). */
  async disabledModules(serverId: string): Promise<Set<string>> {
    const c = this.modules.get(serverId);
    if (c && Date.now() - c.at < TTL) return c.disabled;
    const rows = await this.prisma.serverModuleSetting.findMany({ where: { serverId, enabled: false }, select: { moduleKey: true } });
    const disabled = new Set([...rows.map((r) => r.moduleKey), ...OFF_MODULES]);
    this.modules.set(serverId, { at: Date.now(), disabled });
    return disabled;
  }

  async isMember(userId: string, serverId: string): Promise<boolean> {
    return !!(await this.prisma.serverMembership.findFirst({ where: { serverId, userId, status: 'MEMBER' }, select: { id: true } }));
  }

  /** Server-/Mitgliedschafts-/Modulprüfung ohne Berechtigung (für Listen effektiver Rechte und eigene Prüfungen). */
  private async gate(userId: string, guildId: string, permission: string, owner?: boolean): Promise<Decision> {
    const server = await this.server(guildId);
    if (!server) return deny('UNKNOWN_SERVER');
    const module = moduleOfPermission(permission);
    if ((server.archivedAt || server.status === 'DISABLED') && module !== 'core') return deny('SERVER_DISABLED');
    if (!(owner ?? (await this.perms.isOwner(userId))) && !(await this.isMember(userId, server.id))) return deny('NOT_MEMBER');
    if (module !== 'core' && (await this.disabledModules(server.id)).has(module)) return deny('MODULE_DISABLED');
    return { allowed: true };
  }

  /**
   * authorize(user, server, permission, resourceContext). `guildId` = Server der Aktion (Header X-Guild-Id bzw. Pfad-Server),
   * `null` = „Alle Server“: dann gelten nur serverübergreifende, manuell vergebene Rollen und keine Modulprüfung.
   */
  async authorize(userId: string, guildId: string | null, permission: string, resource: ResourceContext = {}): Promise<Decision> {
    if (guildId) {
      const g = await this.gate(userId, guildId, permission);
      if (!g.allowed) return g;
    }
    if (!resolvePermission(await this.perms.contextFor(userId, guildId), permission).allowed) return deny('PERMISSION');
    if (resource.space !== undefined && guildId) {
      const allowed = recordSpace(guildId);
      if (allowed !== undefined && resource.space !== allowed) return deny('FOREIGN_RECORD');
    }
    return { allowed: true };
  }

  /** Wie `authorize`, wirft aber `PERMISSION_DENIED`/`NOT_FOUND` und protokolliert die Verweigerung (gedrosselt). */
  async assert(userId: string, guildId: string | null, permission: string, resource: ResourceContext = {}, meta: { requestId?: string; ip?: string } = {}) {
    const d = await this.authorize(userId, guildId, permission, resource);
    if (d.allowed) return;
    await this.recordDenied(userId, guildId, permission, d.reason, meta);
    // fremde Datensätze verraten nicht, dass es sie gibt
    if (d.reason === 'FOREIGN_RECORD') throw new AppError('NOT_FOUND', 'Nicht gefunden.');
    throw new AppError('PERMISSION_DENIED', d.message, { reason: d.reason, ...(d.reason === 'PERMISSION' ? { permission } : {}) });
  }

  /** Verweigerte sicherheitsrelevante Zugriffe: SecurityEvent + Audit (DENIED), je Benutzer/Recht/Server höchstens einmal pro Minute. */
  async recordDenied(userId: string, guildId: string | null, permission: string, reason: string, meta: { requestId?: string; ip?: string } = {}) {
    const key = `${userId}|${guildId}|${permission}|${reason}`;
    const now = Date.now();
    if (now - (this.deniedLog.get(key) ?? 0) < 60_000) return;
    this.deniedLog.set(key, now);
    if (this.deniedLog.size > 10_000) this.deniedLog.clear();
    await this.prisma.securityEvent.create({ data: { type: 'PERMISSION_DENIED', userId, detail: `${permission} (${reason}${guildId ? ` @${guildId}` : ''})`.slice(0, 200), requestId: meta.requestId, ip: meta.ip } }).catch(() => undefined);
    await this.audit.record({ userId, requestId: meta.requestId }, { action: 'access.denied', module: 'permissions', entityType: 'Permission', entityId: permission, after: { reason }, serverId: guildId, result: 'DENIED' }).catch(() => undefined);
  }

  /** Effektive Rechte auf einem Server – serverseitig berechnet (Rollen dieses Servers, Mitgliedschaft, Module). */
  async effective(userId: string, guildId: string | null = currentGuild()): Promise<PermissionKey[]> {
    const all = await this.perms.effective(userId, guildId);
    if (!guildId) return all;
    const owner = await this.perms.isOwner(userId);
    const out: PermissionKey[] = [];
    const cache = new Map<string, boolean>();
    for (const p of all) {
      const m = moduleOfPermission(p);
      if (!cache.has(m)) cache.set(m, (await this.gate(userId, guildId, p, owner)).allowed);
      if (cache.get(m)) out.push(p);
    }
    return out;
  }

  /** Effektive Rechte mit Begründung je Recht (für die Verwaltung). */
  async explain(userId: string, guildId: string) {
    const ctx = await this.perms.contextFor(userId, guildId);
    const owner = await this.perms.isOwner(userId);
    const gates = new Map<string, Decision>();
    return Promise.all(ALL_PERMISSIONS.map(async (p) => {
      const m = moduleOfPermission(p);
      if (!gates.has(m)) gates.set(m, await this.gate(userId, guildId, p, owner));
      const g = gates.get(m)!;
      const r = resolvePermission(ctx, p);
      return { permission: p, module: m, allowed: g.allowed && r.allowed, source: r.source, blockedBy: g.allowed ? null : g.reason };
    }));
  }
}
