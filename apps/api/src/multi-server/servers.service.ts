import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ALL_PERMISSIONS, MODULES, moduleDef, moduleDependencyError, moduleOfPermission, type ModuleDef } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AuthorizationService, type ServerRow } from '../authz/authorization.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordAccessService } from '../authz/discord-access.service';
import { RolesService, type RoleInput } from '../users/roles.service';
import { AppError } from '../common/errors';
import { PER_SERVER_SETTING_KEYS, runInGuild, settingsGuild } from '../common/guild-context';
import { parseModuleSettings } from './module-settings';
import { initServerRoles } from './server-roles';

const conflict = () => new AppError('CONFLICT', 'Diese Einstellung wurde inzwischen von jemand anderem geändert. Bitte neu laden – deine Änderung wurde NICHT gespeichert.', { reason: 'VERSION_CONFLICT' });

/**
 * Server- und Mandantenverwaltung. Jede Methode autorisiert gegen den Server aus dem PFAD (nie gegen den Header):
 * Rechte eines Servers gelten nur dort. Registrieren, (De-)Aktivieren und Archivieren dürfen nur globale Systemadministratoren.
 */
@Injectable()
export class ServersService implements OnModuleInit {
  private readonly log = new Logger('Servers');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly authz: AuthorizationService, private readonly perms: PermissionService, private readonly roles: RolesService, private readonly access2: DiscordAccessService) {}

  /** Modul-Katalog aus dem Code in die Datenbank übernehmen (Fremdschlüssel der Server-Einstellungen). */
  async onModuleInit() {
    for (const m of MODULES as readonly ModuleDef[]) {
      await this.prisma.appModule.upsert({ where: { key: m.key }, create: { key: m.key, name: m.name, description: m.description, isSystem: !!m.system, dependsOn: m.dependsOn ?? [] }, update: { name: m.name, description: m.description, isSystem: !!m.system, dependsOn: m.dependsOn ?? [] } }).catch((e) => this.log.warn(`Modul ${m.key}: ${e instanceof Error ? e.message : e}`));
    }
    if (process.env.NODE_ENV !== 'test') await this.splitSettings().catch((e) => this.log.warn(`Einstellungen je Server: ${e instanceof Error ? e.message : e}`));
    // Server von vor der Trennung: einmalig bisherige Rollen samt Zuweisungen als eigene Server-Rollen übernehmen
    for (const s of await this.prisma.discordServer.findMany({ where: { rolesInitializedAt: null }, select: { id: true, name: true } })) {
      await initServerRoles(this.prisma, s.id, true).then((n) => n && this.log.log(`${n} Rollen für ${s.name} übernommen`), (e) => this.log.warn(`Rollen für ${s.name}: ${e instanceof Error ? e.message : e}`));
    }
  }

  /**
   * Einmalig beim Übergang auf „Server von Grund auf getrennt“: bisher gemeinsame Einstellungen bekommt jeder bestehende
   * Server als EIGENE Kopie (danach unabhängig). Server, die später dazukommen, starten mit Standardwerten.
   */
  async splitSettings() {
    const FLAG = 'migration.serverSplit';
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${FLAG}))`;
      if (await tx.systemSetting.findUnique({ where: { key: FLAG } })) return;
      const servers = await tx.discordServer.findMany({ where: { archivedAt: null }, select: { guildId: true } });
      const base = await tx.systemSetting.findMany({ where: { key: { in: [...PER_SERVER_SETTING_KEYS] } } });
      let copied = 0;
      for (const sv of servers) {
        const g = settingsGuild(sv.guildId) ?? sv.guildId;
        for (const row of base) {
          const r = await tx.systemSetting.createMany({ data: [{ key: `${row.key}@${g}`, value: row.value as Prisma.InputJsonValue }], skipDuplicates: true });
          copied += r.count;
        }
      }
      await tx.systemSetting.create({ data: { key: FLAG, value: { at: new Date().toISOString(), servers: servers.length, copied } } });
      if (copied) this.log.log(`${copied} Einstellungen auf ${servers.length} Server übertragen (je Server eigene Kopie)`);
    }, { timeout: 60_000 });
  }

  // ───────── Zugriff ─────────
  async load(serverId: string) {
    const s = await this.prisma.discordServer.findUnique({ where: { id: serverId } });
    if (!s) throw new AppError('NOT_FOUND', 'Server nicht gefunden.');
    return s;
  }
  /** Server laden und Recht auf GENAU diesem Server prüfen (fremde Server: 404 statt Hinweis auf Existenz). */
  async access(actor: Actor, serverId: string, permission: string) {
    const s = await this.load(serverId);
    try { await this.authz.assert(actor.userId!, s.guildId, permission, {}, { requestId: actor.requestId }); }
    catch (e) {
      if (e instanceof AppError && (e.details as { reason?: string } | undefined)?.reason === 'NOT_MEMBER') throw new AppError('NOT_FOUND', 'Server nicht gefunden.');
      throw e;
    }
    return s;
  }
  /** Nur Mitgliedschaft (bzw. globaler Systemadministrator) – für Auskünfte über sich selbst. */
  async accessAsMember(actor: Actor, serverId: string) {
    const s = await this.load(serverId);
    if (!(await this.perms.isOwner(actor.userId!)) && !(await this.authz.isMember(actor.userId!, s.id))) throw new AppError('NOT_FOUND', 'Server nicht gefunden.');
    return s;
  }
  async requireGlobalAdmin(actor: Actor, what: string) {
    if (!(await this.perms.isOwner(actor.userId!))) {
      await this.authz.recordDenied(actor.userId!, null, `servers.${what}`, 'GLOBAL_ADMIN_REQUIRED', { requestId: actor.requestId });
      throw new AppError('PERMISSION_DENIED', 'Das dürfen nur globale Systemadministratoren.');
    }
  }

  // ───────── Server ─────────
  /** Sichtbar: globale Systemadministratoren alle; sonst Server mit bestätigter Mitgliedschaft und `servers.view` dort. */
  async list(actor: Actor) {
    const owner = await this.perms.isOwner(actor.userId!);
    const rows = await this.prisma.discordServer.findMany({ where: owner ? {} : { memberships: { some: { userId: actor.userId!, status: 'MEMBER' } } }, orderBy: { name: 'asc' } });
    if (owner) return rows;
    const out = [];
    for (const r of rows) if ((await this.authz.authorize(actor.userId!, r.guildId, 'servers.view')).allowed) out.push(r);
    return out;
  }

  async create(actor: Actor, d: { guildId: string; name: string }) {
    await this.requireGlobalAdmin(actor, 'register');
    if (await this.prisma.discordServer.findUnique({ where: { guildId: d.guildId } })) throw new AppError('CONFLICT', 'Dieser Discord-Server ist bereits registriert.');
    const s = await this.prisma.$transaction(async (tx) => {
      const s = await tx.discordServer.create({ data: { guildId: d.guildId, name: d.name, status: 'ACTIVE' } });
      await initServerRoles(tx, s.id, false); // neuer Server: eigene Startrollen, keine übernommenen Zuweisungen
      await this.audit.record(actor, { action: 'server.register', module: 'servers', entityType: 'DiscordServer', entityId: s.id, serverId: s.guildId, after: { guildId: s.guildId, name: s.name } }, tx);
      return s;
    }).catch((e) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Dieser Discord-Server ist bereits registriert.'); throw e; });
    this.authz.invalidate();
    return s;
  }

  /** Name (servers.manage auf dem Server) bzw. Status (nur globale Systemadministratoren). Optimistisches Sperren über `version`. */
  async update(actor: Actor, serverId: string, d: { name?: string; status?: 'ACTIVE' | 'DISABLED'; version: number }) {
    const before = d.status !== undefined ? await this.load(serverId) : await this.access(actor, serverId, 'servers.manage');
    if (d.status !== undefined) await this.requireGlobalAdmin(actor, 'status');
    if (before.archivedAt) throw new AppError('CONFLICT', 'Archivierte Server können nicht geändert werden.');
    const r = await this.prisma.$transaction(async (tx) => {
      const u = await tx.discordServer.updateMany({ where: { id: serverId, version: d.version }, data: { ...(d.name !== undefined ? { name: d.name } : {}), ...(d.status !== undefined ? { status: d.status } : {}), version: { increment: 1 } } });
      if (!u.count) throw conflict();
      const after = await tx.discordServer.findUniqueOrThrow({ where: { id: serverId } });
      await this.audit.record(actor, { action: d.status !== undefined && d.status !== before.status ? (d.status === 'DISABLED' ? 'server.disable' : 'server.enable') : 'server.update', module: 'servers', entityType: 'DiscordServer', entityId: serverId, serverId: before.guildId, before: { name: before.name, status: before.status }, after: { name: after.name, status: after.status } }, tx);
      return after;
    });
    this.authz.invalidate();
    return r;
  }

  /** „Löschen“ = archivieren: nicht mehr wählbar, aber ALLE Fachdaten und Archive bleiben erhalten. */
  async archive(actor: Actor, serverId: string) {
    await this.requireGlobalAdmin(actor, 'archive');
    const s = await this.load(serverId);
    if (s.archivedAt) return s;
    const r = await this.prisma.$transaction(async (tx) => {
      const after = await tx.discordServer.update({ where: { id: serverId }, data: { archivedAt: new Date(), status: 'DISABLED', version: { increment: 1 } } });
      await this.audit.record(actor, { action: 'server.archive', module: 'servers', entityType: 'DiscordServer', entityId: serverId, serverId: s.guildId, before: { status: s.status }, after: { archived: true } }, tx);
      return after;
    });
    this.authz.invalidate();
    return r;
  }

  /** Vom Bot gemeldete Server: bekannte aktualisieren (Name, Verbindungsfehler aufheben); neue werden DEAKTIVIERT angelegt und müssen freigeschaltet werden. */
  async syncFromBot(guilds: { id: string; name: string }[]) {
    for (const g of guilds) {
      if (!/^\d{15,25}$/.test(g.id)) continue;
      const s = await this.prisma.discordServer.findUnique({ where: { guildId: g.id } });
      if (!s) {
        await this.prisma.discordServer.create({ data: { guildId: g.id, name: g.name || g.id, status: 'DISABLED' } }).then(
          async (c) => (await initServerRoles(this.prisma, c.id, false), this.audit.record({ userId: null }, { action: 'server.discovered', module: 'servers', entityType: 'DiscordServer', entityId: c.id, serverId: g.id, after: { name: c.name, status: 'DISABLED' } })),
          () => undefined,
        );
      } else if (s.name !== g.name || s.status === 'ERROR') {
        await this.prisma.discordServer.update({ where: { id: s.id }, data: { name: g.name || s.name, ...(s.status === 'ERROR' ? { status: 'ACTIVE' } : {}) } });
      }
    }
    this.authz.invalidate();
  }

  /** Für die Befehlsregistrierung des Bots. Nicht registriert/deaktiviert: nur Grundsystem-Befehle. */
  async botModules(guildId: string) {
    await this.access2.ensureConfiguredServers().catch(() => undefined);
    const s = await this.prisma.discordServer.findUnique({ where: { guildId } });
    const nonCore = (MODULES as readonly ModuleDef[]).filter((m) => !m.system).map((m) => m.key);
    if (!s || s.archivedAt || s.status === 'DISABLED') return { registered: !!s, status: s ? (s.archivedAt ? 'ARCHIVED' : s.status) : 'UNKNOWN', disabled: nonCore };
    return { registered: true, status: s.status, disabled: [...(await this.authz.disabledModules(s.id))] };
  }

  // ───────── Mitgliedschaften ─────────
  async members(actor: Actor, serverId: string) {
    await this.access(actor, serverId, 'servers.view');
    return this.prisma.serverMembership.findMany({ where: { serverId }, include: { user: { select: { id: true, displayName: true, username: true } } }, orderBy: { updatedAt: 'desc' }, take: 1000 });
  }
  /** Manuelle Mitgliedschaft für Konten ohne Discord (z. B. Passwort-Konten). Discord-geprüfte Mitgliedschaften überschreibt der Abgleich. */
  async setManualMember(actor: Actor, serverId: string, userId: string, member: boolean) {
    const s = await this.access(actor, serverId, 'servers.manage');
    if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
    const link = await this.prisma.discordLink.findUnique({ where: { userId } });
    if (link && member) throw new AppError('CONFLICT', 'Dieses Konto ist mit Discord verknüpft – die Mitgliedschaft wird automatisch über Discord geprüft.');
    const status = member ? 'MEMBER' : 'LEFT';
    const r = await this.prisma.$transaction(async (tx) => {
      const m = await tx.serverMembership.upsert({ where: { serverId_userId: { serverId, userId } }, create: { serverId, userId, status, source: 'MANUAL', lastVerifiedAt: new Date() }, update: { status, source: link ? 'DISCORD' : 'MANUAL', lastVerifiedAt: new Date() } });
      await this.audit.record(actor, { action: member ? 'server.member.add' : 'server.member.remove', module: 'servers', entityType: 'ServerMembership', entityId: m.id, serverId: s.guildId, after: { userId, status } }, tx);
      return m;
    });
    return r;
  }

  // ───────── Module ─────────
  async modules(actor: Actor, serverId: string) {
    await this.access(actor, serverId, 'modules.view');
    const rows = await this.prisma.serverModuleSetting.findMany({ where: { serverId } });
    return (MODULES as readonly ModuleDef[]).map((m) => {
      const r = rows.find((x) => x.moduleKey === m.key);
      return { key: m.key, name: m.name, description: m.description, system: !!m.system, dependsOn: m.dependsOn ?? [], enabled: m.system ? true : r?.enabled ?? true, settings: r ? parseSafe(m.key, r.settings) : parseSafe(m.key, {}), version: r?.version ?? 0, updatedAt: r?.updatedAt ?? null, updatedById: r?.updatedById ?? null };
    });
  }
  async module(actor: Actor, serverId: string, key: string) {
    const m = (await this.modules(actor, serverId)).find((x) => x.key === key);
    if (!m) throw new AppError('NOT_FOUND', 'Unbekanntes Modul.');
    return m;
  }

  /**
   * Modul an/aus bzw. Einstellungen ändern. `version` = gelesener Stand (0 = noch nie gespeichert); ein veralteter Stand wird mit 409
   * abgelehnt – eine alte Dashboard-Ansicht überschreibt nie unbemerkt neuere Einstellungen. Abhängigkeiten werden geprüft.
   */
  async patchModule(actor: Actor, serverId: string, key: string, d: { enabled?: boolean; settings?: unknown; version: number }) {
    const s = await this.access(actor, serverId, 'modules.manage');
    const def = moduleDef(key);
    if (!def) throw new AppError('NOT_FOUND', 'Unbekanntes Modul.');
    const settings = d.settings !== undefined ? parseModuleSettings(key, d.settings) : undefined;
    const r = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`modules:${serverId}`}))`;
      const rows = await tx.serverModuleSetting.findMany({ where: { serverId } });
      const row = rows.find((x) => x.moduleKey === key);
      if ((row?.version ?? 0) !== d.version) throw conflict();
      const state = Object.fromEntries((MODULES as readonly ModuleDef[]).map((m) => [m.key, m.system ? true : rows.find((x) => x.moduleKey === m.key)?.enabled ?? true]));
      const enabled = d.enabled ?? row?.enabled ?? true;
      if (d.enabled !== undefined && d.enabled !== state[key]) {
        const err = moduleDependencyError(key, enabled, state);
        if (err) throw new AppError('VALIDATION_FAILED', err);
      }
      const nextSettings = (settings ?? (row ? parseSafe(key, row.settings) : parseSafe(key, {}))) as Prisma.InputJsonValue;
      const saved = row
        ? await tx.serverModuleSetting.update({ where: { id: row.id }, data: { enabled, settings: nextSettings, version: { increment: 1 }, updatedById: actor.userId } })
        : await tx.serverModuleSetting.create({ data: { serverId, moduleKey: key, enabled, settings: nextSettings, version: 1, updatedById: actor.userId } });
      const before = { enabled: row?.enabled ?? true, settings: row ? row.settings : null };
      const action = d.enabled !== undefined && d.enabled !== before.enabled ? (enabled ? 'module.enable' : 'module.disable') : 'module.settings';
      await this.audit.record(actor, { action, module: 'modules', entityType: 'ServerModuleSetting', entityId: `${s.guildId}:${key}`, serverId: s.guildId, before, after: { enabled: saved.enabled, settings: saved.settings, version: saved.version } }, tx);
      return saved;
    });
    this.authz.invalidate();
    return { key, enabled: r.enabled, settings: r.settings, version: r.version, updatedAt: r.updatedAt };
  }

  /** Einstellungen eines Moduls lesen (ohne Rechteprüfung – für interne Dienste wie den Wochen-Reset). */
  async moduleState(serverId: string, key: string) {
    const r = await this.prisma.serverModuleSetting.findUnique({ where: { serverId_moduleKey: { serverId, moduleKey: key } } });
    return { enabled: moduleDef(key)?.system ? true : r?.enabled ?? true, settings: parseSafe(key, r?.settings ?? {}) };
  }

  // ───────── Rollen & Rechte je Server ─────────
  private async serverRole(s: ServerRow, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    // Rollen anderer Server (auch mit gleichem Namen) sind hier nicht vorhanden
    if (!role || role.guildId !== s.guildId) throw new AppError('NOT_FOUND', 'Rolle nicht gefunden.');
    return role;
  }
  async listRoles(actor: Actor, serverId: string) {
    const s = await this.access(actor, serverId, 'roles.view');
    return this.prisma.role.findMany({ where: { guildId: s.guildId }, orderBy: [{ priority: 'asc' }, { name: 'asc' }], include: { permissions: { select: { permissionKey: true, effect: true } }, _count: { select: { users: true } } } });
  }
  async createRole(actor: Actor, serverId: string, d: RoleInput & { name: string }) {
    const s = await this.access(actor, serverId, 'roles.manage');
    return runInGuild(s.guildId, () => this.roles.create(actor, { ...d, guildId: s.guildId }));
  }
  async updateRole(actor: Actor, serverId: string, roleId: string, d: RoleInput) {
    const s = await this.access(actor, serverId, 'roles.manage');
    await this.serverRole(s, roleId);
    return runInGuild(s.guildId, () => this.roles.update(actor, roleId, d));
  }
  async deleteRole(actor: Actor, serverId: string, roleId: string) {
    const s = await this.access(actor, serverId, 'roles.manage');
    const role = await this.serverRole(s, roleId);
    if (role.system) throw new AppError('PERMISSION_DENIED', 'Systemrollen können nicht gelöscht werden.');
    await runInGuild(s.guildId, () => this.roles.remove(actor, roleId));
  }

  async permissionCatalog(actor: Actor, serverId: string) {
    await this.access(actor, serverId, 'roles.view');
    const mods = await this.modules(actor, serverId);
    return ALL_PERMISSIONS.map((p) => { const m = moduleOfPermission(p); return { key: p, module: m, moduleEnabled: mods.find((x) => x.key === m)?.enabled ?? true }; });
  }
  async rolePermissions(actor: Actor, serverId: string, roleId: string) {
    const s = await this.access(actor, serverId, 'roles.view');
    const role = await this.serverRole(s, roleId);
    return (await this.prisma.rolePermission.findMany({ where: { roleId: role.id }, orderBy: { permissionKey: 'asc' } })).map((p) => ({ permission: p.permissionKey, effect: p.effect }));
  }
  /** Rechte einer Server-Rolle ersetzen. Delegationsregel (nur was man selbst auf DIESEM Server hat) und Rangfolge gelten. */
  async setRolePermissions(actor: Actor, serverId: string, roleId: string, grants: { permission: string; effect: 'ALLOW' | 'DENY' }[]) {
    const s = await this.access(actor, serverId, 'roles.manage');
    await this.serverRole(s, roleId);
    await runInGuild(s.guildId, () => this.roles.setPermissions(actor, roleId, grants));
    return this.rolePermissions(actor, serverId, roleId);
  }

  /** Effektive Rechte eines Benutzers auf diesem Server – serverseitig berechnet. */
  async effective(actor: Actor, serverId: string, userId: string) {
    // eigene Rechte: bestätigte Mitgliedschaft genügt; fremde: roles.view auf diesem Server
    const s = userId === actor.userId ? await this.accessAsMember(actor, serverId) : await this.access(actor, serverId, 'roles.view');
    if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
    const [list, member, globalAdmin] = await Promise.all([this.authz.explain(userId, s.guildId), this.prisma.serverMembership.findUnique({ where: { serverId_userId: { serverId, userId } } }), this.perms.isOwner(userId)]);
    return { serverId, guildId: s.guildId, userId, globalAdmin, membership: member ? { status: member.status, source: member.source, lastVerifiedAt: member.lastVerifiedAt } : null, allowed: list.filter((x) => x.allowed).map((x) => x.permission), details: list };
  }

  // ───────── Discord-Rollen → interne Rollen ─────────
  async roleMappings(actor: Actor, serverId: string) {
    await this.access(actor, serverId, 'roles.view');
    return this.prisma.discordRoleMapping.findMany({ where: { serverId }, include: { role: { select: { id: true, name: true, guildId: true } } }, orderBy: { createdAt: 'asc' } });
  }
  /**
   * Zuordnungen dieses Servers ersetzen. Zulässig: Rollen dieses Servers oder serverübergreifende Rollen – die Zuweisung gilt
   * trotzdem nur auf diesem Server. Nur Rollen unterhalb des eigenen Rangs.
   */
  async setRoleMappings(actor: Actor, serverId: string, items: { discordRoleId: string; roleId: string }[]) {
    const s = await this.access(actor, serverId, 'roles.manage');
    const roles = await this.prisma.role.findMany({ where: { id: { in: [...new Set(items.map((i) => i.roleId))] } } });
    for (const i of items) {
      const r = roles.find((x) => x.id === i.roleId);
      if (!r || (r.guildId && r.guildId !== s.guildId)) throw new AppError('NOT_FOUND', 'Rolle nicht gefunden.');
      if (r.name === 'System Administrator') throw new AppError('PERMISSION_DENIED', 'Die Rolle „System Administrator“ kann nicht über Discord vergeben werden.');
      await runInGuild(s.guildId, () => this.perms.assertOutranksRole(actor.userId!, r.priority, r.name));
    }
    const before = await this.prisma.discordRoleMapping.findMany({ where: { serverId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.discordRoleMapping.deleteMany({ where: { serverId } });
      if (items.length) await tx.discordRoleMapping.createMany({ data: items.map((i) => ({ serverId, discordRoleId: i.discordRoleId, roleId: i.roleId })), skipDuplicates: true });
      await this.audit.record(actor, { action: 'server.role_mappings', module: 'permissions', entityType: 'DiscordServer', entityId: serverId, serverId: s.guildId, before: before.map((m) => ({ discordRoleId: m.discordRoleId, roleId: m.roleId })), after: items }, tx);
    });
    return this.roleMappings(actor, serverId);
  }

  // ───────── Audit ─────────
  async auditLogs(actor: Actor, serverId: string, q: { page: number; pageSize: number; action?: string }) {
    const s = await this.access(actor, serverId, 'audit.view');
    const where: Prisma.AuditLogWhereInput = { serverId: s.guildId, ...(q.action ? { action: { startsWith: q.action } } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
}

function parseSafe(key: string, v: unknown) {
  try { return parseModuleSettings(key, v); } catch { return parseModuleSettings(key, {}); }
}
