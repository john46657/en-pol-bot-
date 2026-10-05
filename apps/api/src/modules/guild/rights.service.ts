import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auditRepository, nexusRoleRepository, permissionRepository } from '@nexus/database';
import { getGuild, getGuildMember } from '@nexus/discord';
import { permissions } from '@nexus/permissions';
import type { RequestAccess } from '../../common/decorators/scope.decorator.js';
import { DiscordService } from './discord.service.js';

/**
 * Sicherheitsregeln für Änderungen an Rollen und Rechten. Wer Rechte verwalten darf (`permissions.edit`), ist damit nicht
 * unbegrenzt mächtig:
 *  1. Nur Rollen bearbeiten, die in der Rangfolge **unter** der eigenen höchsten Rolle stehen (der Serverbesitzer ist ausgenommen).
 *  2. Nur Rechte vergeben, die man **selbst besitzt** – niemand erhöht die eigenen Rechte oder die anderer über das eigene Maß.
 *  3. Eigene Rechte-Ausnahmen nicht ändern; Benutzer mit gleichem oder höherem Rang nicht ändern.
 *  4. Der Serverbesitzer kann über das Dashboard nie eingeschränkt werden.
 * Server-Verwalter (Discord) besitzen ohnehin alle Rechte; für sie entfällt Regel 2, Regel 1, 3 und 4 gelten weiter.
 * Abgelehnte Versuche werden im Audit-Log festgehalten.
 */
interface Actor {
  userId: string;
  isOwner: boolean;
  bypass: boolean;
  /** Höchste Rangposition der eigenen Rollen (Besitzer: unendlich). */
  top: number;
  /** Serverweit besitzte Rechte (`null` = alle, Server-Verwalter). */
  held: ReadonlySet<string> | null;
  positions: ReadonlyMap<string, number>;
  ownerId: string;
}

@Injectable()
export class RightsService {
  constructor(
    private readonly discord: DiscordService,
    private readonly config: ConfigService,
  ) {}

  private get botToken(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  private async actor(guildId: string, access: RequestAccess): Promise<Actor> {
    const [roles, guild] = await Promise.all([
      this.discord.listRoles(guildId),
      getGuild(this.botToken, guildId),
    ]);
    const positions = new Map(roles.map((r) => [r.id, r.position]));
    const isOwner = guild.ownerId !== '' && guild.ownerId === access.userId;
    const top = isOwner
      ? Number.POSITIVE_INFINITY
      : Math.max(0, ...access.roleIds.map((id) => positions.get(id) ?? 0));
    const held = access.bypass
      ? null
      : new Set<string>(await permissions.forRoles(guildId, access.roleIds, access.userId));
    return { userId: access.userId, isOwner, bypass: access.bypass, top, held, positions, ownerId: guild.ownerId };
  }

  private async deny(guildId: string, actorId: string, resource: [string, string], reason: string): Promise<never> {
    await auditRepository
      .create({
        guildId,
        actorType: 'USER',
        actorId,
        action: 'permissions.change.denied',
        resourceType: resource[0],
        resourceId: resource[1],
        after: { reason } as never,
        permission: 'permissions.edit',
        result: 'denied',
      })
      .catch(() => undefined);
    throw new ForbiddenException(reason);
  }

  private async assertRole(a: Actor, guildId: string, roleId: string): Promise<void> {
    if (a.isOwner) return;
    const pos = a.positions.get(roleId);
    // Rollen, die es auf Discord nicht mehr gibt (verwaiste Zuordnungen), darf jeder Berechtigte aufräumen
    if (pos === undefined) return;
    if (pos >= a.top)
      await this.deny(guildId, a.userId, ['DiscordRole', roleId], 'Du kannst nur Rollen bearbeiten, die in der Rangfolge unter deiner höchsten Rolle stehen.');
  }

  private async assertGrant(a: Actor, guildId: string, resource: [string, string], keys: Iterable<string>): Promise<void> {
    if (a.held === null) return;
    const missing = [...new Set(keys)].filter((k) => !a.held!.has(k));
    if (missing.length > 0)
      await this.deny(guildId, a.userId, resource, `Du kannst keine Rechte vergeben, die du selbst nicht besitzt: ${missing.join(', ')}.`);
  }

  /** Änderung der direkten Rechte und Profile einer Rolle. */
  async forSetRole(
    guildId: string,
    access: RequestAccess,
    roleId: string,
    body: { permissions?: string[] | undefined; allow?: string[] | undefined; profileIds?: string[] | undefined },
  ): Promise<void> {
    const a = await this.actor(guildId, access);
    await this.assertRole(a, guildId, roleId);
    const current = (await permissionRepository.getGrants(guildId)).get(roleId);
    const wanted = body.allow ?? body.permissions;
    const added = wanted ? wanted.filter((k) => !(current?.keys ?? []).includes(k)) : [];
    await this.assertGrant(a, guildId, ['DiscordRole', roleId], added);
    if (body.profileIds && body.profileIds.length > 0) {
      const before = new Set((await permissionRepository.getProfilesByRole(guildId)).get(roleId) ?? []);
      const newOnes = body.profileIds.filter((p) => !before.has(p));
      if (newOnes.length > 0) {
        const profiles = (await permissionRepository.listProfiles(guildId)).filter((p) => newOnes.includes(p.id));
        await this.assertGrant(a, guildId, ['DiscordRole', roleId], profiles.flatMap((p) => p.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key)));
      }
    }
  }

  /** Neues Profil: nur Rechte, die man selbst besitzt. */
  async forProfileCreate(guildId: string, access: RequestAccess, allowKeys: string[]): Promise<void> {
    const a = await this.actor(guildId, access);
    await this.assertGrant(a, guildId, ['PermissionProfile', 'new'], allowKeys);
  }

  /** Profil ändern/löschen: betrifft alle zugeordneten Rollen – keine davon darf auf oder über dem eigenen Rang stehen. */
  async forProfileChange(guildId: string, access: RequestAccess, profileId: string, newAllowKeys?: string[]): Promise<void> {
    const a = await this.actor(guildId, access);
    const profile = (await permissionRepository.listProfiles(guildId)).find((p) => p.id === profileId);
    if (!profile) return; // fehlendes Profil meldet der Dienst selbst
    for (const r of profile.roles) await this.assertRole(a, guildId, r.id);
    if (newAllowKeys) {
      const before = new Set(profile.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key));
      await this.assertGrant(a, guildId, ['PermissionProfile', profileId], newAllowKeys.filter((k) => !before.has(k)));
    }
  }

  /** Rechte-Ausnahme für einen Benutzer setzen (`key` nur bei Erlaubnis geprüft) oder entfernen. */
  async forOverride(guildId: string, access: RequestAccess, targetUserId: string, grant?: { key: string; effect: 'ALLOW' | 'DENY' }): Promise<void> {
    const a = await this.actor(guildId, access);
    const res: [string, string] = ['User', targetUserId];
    if (targetUserId === a.ownerId) await this.deny(guildId, a.userId, res, 'Der Serverbesitzer kann über das Dashboard nicht eingeschränkt werden.');
    if (targetUserId === a.userId) await this.deny(guildId, a.userId, res, 'Du kannst deine eigenen Rechte nicht ändern.');
    if (!a.isOwner) {
      const member = await getGuildMember(this.botToken, guildId, targetUserId);
      const targetTop = Math.max(0, ...(member?.roles ?? []).map((id) => a.positions.get(id) ?? 0));
      if (targetTop >= a.top) await this.deny(guildId, a.userId, res, 'Du kannst nur Benutzer bearbeiten, deren höchste Rolle unter deiner eigenen steht.');
    }
    if (grant?.effect === 'ALLOW') await this.assertGrant(a, guildId, res, [grant.key]);
  }

  /** Höchste Priorität unter den eigenen Dashboard-Rollen (Verwalter/Besitzer: unbegrenzt). */
  private async nexusTop(a: Actor, guildId: string, access: RequestAccess): Promise<number> {
    if (a.isOwner || a.bypass) return Number.POSITIVE_INFINITY;
    const mine = await nexusRoleRepository.rolesOfUser(guildId, access.userId, access.roleIds);
    return Math.max(-1, ...mine.map((r) => r.priority));
  }

  /** Dashboard-Rolle anlegen/ändern/löschen: nur unterhalb der eigenen Priorität, nur Rechte, die man selbst besitzt. */
  async forNexusRole(guildId: string, access: RequestAccess, change: { roleId?: string; priority?: number; allowKeys?: string[] }): Promise<void> {
    const a = await this.actor(guildId, access);
    const top = await this.nexusTop(a, guildId, access);
    const res: [string, string] = ['NexusRole', change.roleId ?? 'new'];
    let before: string[] = [];
    if (change.roleId) {
      const role = await nexusRoleRepository.get(guildId, change.roleId);
      if (!role) return; // fehlende Rolle meldet der Dienst selbst
      if (role.priority >= top) await this.deny(guildId, a.userId, res, 'Du kannst nur Rollen bearbeiten, deren Priorität unter deiner höchsten Rolle liegt.');
      before = role.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key);
    }
    if (change.priority !== undefined && change.priority >= top)
      await this.deny(guildId, a.userId, res, 'Du kannst keine Priorität auf oder über deiner eigenen vergeben.');
    await this.assertGrant(a, guildId, res, (change.allowKeys ?? []).filter((k) => !before.includes(k)));
  }

  /** Mitglieder einer Dashboard-Rolle ändern: nicht sich selbst, nicht über der eigenen Priorität, nur Rechte, die man besitzt. */
  async forNexusMember(guildId: string, access: RequestAccess, roleId: string, targetUserIds: string[], adding: boolean): Promise<void> {
    const a = await this.actor(guildId, access);
    const res: [string, string] = ['NexusRole', roleId];
    if (targetUserIds.includes(a.userId) && !a.isOwner) await this.deny(guildId, a.userId, res, 'Du kannst dir selbst keine Rollen geben oder nehmen.');
    const role = await nexusRoleRepository.get(guildId, roleId);
    if (!role) return;
    if (role.priority >= (await this.nexusTop(a, guildId, access))) await this.deny(guildId, a.userId, res, 'Du kannst nur Rollen vergeben, deren Priorität unter deiner höchsten Rolle liegt.');
    if (adding) await this.assertGrant(a, guildId, res, role.entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key));
  }
}
