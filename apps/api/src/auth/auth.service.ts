import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordAccessService } from '../authz/discord-access.service';
import { AuthorizationService } from '../authz/authorization.service';
import { currentGuild } from '../common/guild-context';
import { hashToken } from '../authz/guards';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { TwoFactorService } from './two-factor.service';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly env = loadEnv();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly access: DiscordAccessService, private readonly twoFactor: TwoFactorService, private readonly authz: AuthorizationService) {}

  async login(username: string, password: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    const success = !!user && user.active && !locked && ok;

    await this.prisma.loginHistory.create({
      data: { userId: user?.id, username: username.toLowerCase(), success, ip: meta.ip, reason: success ? null : !user ? 'UNKNOWN_USER' : !user.active ? 'DISABLED' : locked ? 'LOCKED' : 'BAD_PASSWORD' },
    });

    if (!success) {
      if (user && user.active && !locked) {
        const fails = user.failedLogins + 1;
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
      }
      await this.prisma.securityEvent.create({ data: { type: 'LOGIN_FAILURE', userId: user?.id, ip: meta.ip, detail: `username=${username.slice(0, 64)}`, requestId: meta.requestId } });
      throw new AppError('UNAUTHENTICATED', 'Benutzername oder Passwort falsch.');
    }

    // Zwei-Faktor aktiv → erst nach dem Code eine Sitzung
    if (user.totpEnabledAt) return { twoFactorRequired: true as const, ticket: this.twoFactor.ticket(user.id) };
    return this.startSession(user, meta, 'auth.login');
  }

  /** Zweiter Schritt: Code aus der Authenticator-App oder Wiederherstellungscode. Fehlversuche zählen zur Kontosperre. */
  async loginTwoFactor(ticket: string, code: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
    const userId = this.twoFactor.readTicket(ticket);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const locked = !!user?.lockedUntil && user.lockedUntil > new Date();
    if (!user || !user.active || locked) throw new AppError('UNAUTHENTICATED', 'Anmeldung abgelaufen – bitte erneut anmelden.');
    const used = await this.twoFactor.consume(user.id, code);
    if (!used) {
      const fails = user.failedLogins + 1;
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= MAX_FAILS ? new Date(Date.now() + LOCK_MS) : null } });
      await this.prisma.loginHistory.create({ data: { userId: user.id, username: user.username, success: false, ip: meta.ip, reason: 'BAD_2FA' } });
      await this.prisma.securityEvent.create({ data: { type: 'LOGIN_FAILURE', userId: user.id, ip: meta.ip, detail: '2fa', requestId: meta.requestId } });
      throw new AppError('UNAUTHENTICATED', 'Der Code stimmt nicht.');
    }
    return this.startSession(user, meta, used === 'recovery' ? 'auth.login.recovery_code' : 'auth.login');
  }

  /** Neue Session nach erfolgreicher Anmeldung (Passwort oder Discord). */
  async startSession(user: { id: string; robloxUserId: string | null }, meta: { ip?: string; userAgent?: string; requestId?: string }, action = 'auth.login') {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 255) } });
      await tx.user.update({ where: { id: user.id }, data: { lastLogin: new Date(), failedLogins: 0, lockedUntil: null } });
      await this.audit.record({ userId: user.id, robloxUserId: user.robloxUserId, requestId: meta.requestId }, { action, module: 'auth', entityType: 'User', entityId: user.id }, tx);
    });
    this.access.forget(user.id); // neue Anmeldung → Discord-Rollen beim nächsten Aufruf frisch prüfen
    return { token, expiresAt, user: await this.profile(user.id) };
  }

  async logout(actor: Actor, sessionId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
      if (actor.userId) await tx.editLock.deleteMany({ where: { userId: actor.userId } }); // eigene Bearbeitungs-Sperren freigeben
      await this.audit.record(actor, { action: 'auth.logout', module: 'auth', entityType: 'User', entityId: actor.userId ?? undefined }, tx);
    });
  }

  /** Beendet alle Sessions eines Benutzers (Session Invalidation). */
  /** Eigenes Passwort ändern: altes Passwort nötig; alle anderen Sitzungen werden beendet. */
  async changePassword(actor: Actor, sessionId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId! } });
    if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) throw new AppError('VALIDATION_FAILED', 'Das aktuelle Passwort stimmt nicht.');
    if (current === next) throw new AppError('VALIDATION_FAILED', 'Das neue Passwort muss sich vom alten unterscheiden.');
    const passwordHash = await hashPassword(next);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null, NOT: { id: sessionId } }, data: { revokedAt: new Date() } });
      await this.audit.record(actor, { action: 'auth.password.change', module: 'auth', entityType: 'User', entityId: user.id }, tx);
    });
  }

  /** Eigene aktive Sitzungen (Gerät/IP, angemeldet seit) – die aktuelle ist markiert. */
  async sessions(userId: string, currentId: string) {
    const rows = await this.prisma.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => ({ id: r.id, createdAt: r.createdAt, expiresAt: r.expiresAt, ip: r.ip, userAgent: r.userAgent, current: r.id === currentId }));
  }

  /** Eigene Sitzung(en) beenden: eine bestimmte oder alle außer der aktuellen. */
  async revokeOwnSessions(actor: Actor, currentId: string, sessionId?: string) {
    if (sessionId === currentId) throw new AppError('VALIDATION_FAILED', 'Die aktuelle Sitzung beendest du mit „Abmelden“.');
    const r = await this.prisma.session.updateMany({ where: { userId: actor.userId!, revokedAt: null, ...(sessionId ? { id: sessionId } : { NOT: { id: currentId } }) }, data: { revokedAt: new Date() } });
    if (sessionId && !r.count) throw new AppError('NOT_FOUND', 'Sitzung nicht gefunden.');
    await this.audit.record(actor, { action: 'auth.sessions.revoke', module: 'auth', entityType: 'User', entityId: actor.userId ?? undefined, after: { count: r.count, single: !!sessionId } });
    return { revoked: r.count };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async profile(userId: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { roles: { include: { role: true } } } });
    const active = new Set(await this.perms.roleIdsFor(userId));
    // Server, die man wählen darf: registriert, nicht archiviert, bestätigte Mitgliedschaft (globale Systemadministratoren: alle)
    const owner = await this.perms.isOwner(userId);
    const servers = await this.prisma.discordServer.findMany({ where: { archivedAt: null, ...(owner ? {} : { memberships: { some: { userId, status: 'MEMBER' } } }) }, select: { guildId: true }, orderBy: { name: 'asc' } });
    // Auf dem gewählten Server ausgeschaltete Module: damit die Oberfläche „Modul aus“ statt „Kein Zugriff“ zeigen kann
    const guild = currentGuild();
    const current = guild ? await this.authz.server(guild) : null;
    const modulesOff = current ? [...(await this.authz.disabledModules(current.id))] : [];
    return {
      id: u.id, username: u.username, displayName: u.displayName, robloxUserId: u.robloxUserId, robloxUsername: u.robloxUsername,
      // Rollen, die im gewählten Server gelten; `servers` = Server, auf denen man eigene Server-Rollen hat
      roles: u.roles.filter((r) => active.has(r.roleId)).map((r) => r.role.name), permissions: await this.authz.effective(userId), lastLogin: u.lastLogin,
      twoFactor: !!u.totpEnabledAt, guildId: currentGuild(), servers: servers.map((s) => s.guildId), globalAdmin: owner, modulesOff,
      // nicht freigeschalteter (z. B. vom Bot nur entdeckter) Server: alle Module außer dem Grundsystem gesperrt
      serverDisabled: !!current && (current.status === 'DISABLED' || !!current.archivedAt),
    };
  }

  /**
   * Server-Übersicht nach dem Login (Kacheln): Server, die man öffnen darf (registriert, Mitglied bzw. globaler
   * Systemadministrator), freizuschaltende Server und eigene Discord-Server ohne Bot (zum Einladen). Jeder Server hat
   * eigene Akten – die Übersicht verrät nur Name und Bild.
   */
  async serverOverview(userId: string) {
    const owner = await this.perms.isOwner(userId);
    const [registered, link, known, u] = await Promise.all([
      this.prisma.discordServer.findMany({ where: { archivedAt: null, ...(owner ? {} : { memberships: { some: { userId, status: 'MEMBER' } } }) }, select: { guildId: true, name: true, status: true }, orderBy: { name: 'asc' } }),
      this.prisma.discordLink.findUnique({ where: { userId } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } }),
    ]);
    const bot = new Map((Array.isArray(known?.value) ? (known.value as { id?: string; name?: string; icon?: string | null }[]) : []).filter((g) => g.id).map((g) => [g.id!, g]));
    const managed = (Array.isArray(link?.managedGuilds) ? (link.managedGuilds as unknown as { id: string; name: string; icon: string | null }[]) : []);
    const icon = new Map(managed.map((g) => [g.id, g.icon]));
    const seen = new Set<string>();
    const servers: { guildId: string; name: string; icon: string | null; state: 'open' | 'disabled' | 'invite' | 'pending' }[] = [];
    for (const s of registered) {
      seen.add(s.guildId);
      servers.push({ guildId: s.guildId, name: s.name, icon: bot.get(s.guildId)?.icon ?? icon.get(s.guildId) ?? null, state: s.status === 'DISABLED' ? 'disabled' : 'open' });
    }
    // eigene Discord-Server: Bot schon da (wartet auf Freischaltung) bzw. noch nicht da (einladen)
    const pending = owner ? [] : await this.prisma.discordServer.findMany({ where: { guildId: { in: managed.map((g) => g.id) }, archivedAt: null }, select: { guildId: true } });
    const pendingIds = new Set(pending.map((p) => p.guildId));
    for (const g of managed) {
      if (seen.has(g.id)) continue;
      servers.push({ guildId: g.id, name: g.name, icon: g.icon, state: bot.has(g.id) || pendingIds.has(g.id) ? 'pending' : 'invite' });
    }
    return { name: u.displayName, globalAdmin: owner, servers, guildsSyncedAt: link?.guildsSyncedAt ?? null, discordLinked: !!link };
  }
}
