import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { auditRepository, guildRepository, permissionRepository } from '@nexus/database';
import {
  PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_TEMPLATES,
  resolveTemplate,
} from '@nexus/types';
import { DiscordService } from './discord.service.js';

const isKey = (k: string) => (PERMISSIONS as readonly string[]).includes(k);

/** Verwaltung der Zuordnung Discord-Rolle → Rechte (direkt, über Profile, mit Sperren). Serverseitig validiert, auditiert. */
@Injectable()
export class PermissionsAdminService {
  constructor(private readonly discord: DiscordService) {}

  async overview(guildId: string) {
    const [grants, roles, profiles, profilesByRole] = await Promise.all([
      permissionRepository.getGrants(guildId),
      this.discord.listRoles(guildId),
      permissionRepository.listProfiles(guildId),
      permissionRepository.getProfilesByRole(guildId),
    ]);
    const known = new Set(roles.map((r) => r.id));
    return {
      catalog: PERMISSION_CATALOG.map((m) => ({
        module: m.module,
        label: m.label,
        permissions: (m.permissions as readonly (readonly [string, string, string?])[]).map(
          ([key, label, alias]) => ({ key, label, alias: alias ?? null }),
        ),
      })),
      templates: PERMISSION_TEMPLATES.map((t) => {
        const r = resolveTemplate(t.key)!;
        return {
          key: t.key,
          name: t.name,
          description: t.description,
          allowCount: r.allow.length,
          denyCount: r.deny.length,
        };
      }),
      profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
      roles: roles
        .filter((r) => r.blockedReason !== 'everyone')
        .map((r) => {
          const g = grants.get(r.id);
          return {
            id: r.id,
            name: r.name,
            color: r.color,
            position: r.position,
            permissions: g?.keys ?? [],
            allow: g?.keys ?? [],
            deny: g?.deny ?? [],
            profileIds: profilesByRole.get(r.id) ?? [],
          };
        }),
      /** Zuordnungen zu Rollen, die auf Discord nicht mehr existieren. */
      orphaned: [...grants.entries()]
        .filter(([id]) => !known.has(id))
        .map(([roleId, g]) => ({ roleId, name: g.name, permissions: g.keys, deny: g.deny })),
    };
  }

  async setForRole(
    guildId: string,
    actorId: string,
    roleId: string,
    body: { permissions?: string[]; allow?: string[]; deny?: string[]; profileIds?: string[] },
  ) {
    const allow = body.allow ?? body.permissions;
    const deny = body.deny;
    for (const k of [...(allow ?? []), ...(deny ?? [])]) {
      if (!isKey(k)) throw new BadRequestException(`Unbekannte Permission: ${k}`);
    }
    if (allow && deny && allow.some((k) => deny.includes(k))) {
      throw new BadRequestException('Ein Recht kann nicht gleichzeitig erlaubt und gesperrt sein.');
    }
    if (!(await guildRepository.get(guildId))) {
      throw new NotFoundException('Der Bot ist mit diesem Server nicht verbunden.');
    }
    // Verwaiste Zuordnungen dürfen nur entfernt, neue nur für existierende Rollen angelegt werden.
    const adds = (allow?.length ?? 0) + (deny?.length ?? 0) + (body.profileIds?.length ?? 0) > 0;
    let snapshot: { name: string; position: number; color: number } | undefined;
    if (adds) {
      const role = (await this.discord.listRoles(guildId)).find(
        (r) => r.id === roleId && r.blockedReason !== 'everyone',
      );
      if (!role) throw new BadRequestException('Diese Rolle existiert auf dem Server nicht.');
      snapshot = { name: role.name, position: role.position, color: role.color };
    }

    const result: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (allow !== undefined || deny !== undefined) {
      const current = (await permissionRepository.getGrants(guildId)).get(roleId);
      const entries = [
        ...(allow ?? current?.keys ?? []).map((key) => ({
          key,
          effect: 'ALLOW' as const,
          scope: 'SERVER' as const,
          scopeRef: '',
        })),
        ...(deny ?? current?.deny ?? []).map((key) => ({
          key,
          effect: 'DENY' as const,
          scope: 'SERVER' as const,
          scopeRef: '',
        })),
      ];
      if (
        entries.some(
          (e) =>
            e.effect === 'ALLOW' && entries.some((o) => o.effect === 'DENY' && o.key === e.key),
        )
      ) {
        throw new BadRequestException(
          'Ein Recht kann nicht gleichzeitig erlaubt und gesperrt sein.',
        );
      }
      const r = await permissionRepository.setPermissionsForRole(
        guildId,
        roleId,
        entries,
        snapshot,
      );
      before['permissions'] = r.before;
      after['permissions'] = r.after;
      result['permissions'] = entries.filter((e) => e.effect === 'ALLOW').map((e) => e.key);
      result['deny'] = entries.filter((e) => e.effect === 'DENY').map((e) => e.key);
    }
    if (body.profileIds !== undefined) {
      try {
        const r = await permissionRepository.setProfilesForRole(
          guildId,
          roleId,
          body.profileIds,
          snapshot,
        );
        before['profiles'] = r.before;
        after['profiles'] = r.after;
        result['profileIds'] = r.after;
      } catch (e) {
        if (e instanceof Error && /Profil/.test(e.message))
          throw new BadRequestException('Unbekanntes Profil.');
        throw e;
      }
    }
    await auditRepository.create({
      guildId,
      actorType: 'USER',
      actorId,
      action: 'permissions.role.set',
      resourceType: 'DiscordRole',
      resourceId: roleId,
      before: before as never,
      after: after as never,
      permission: 'permissions.edit',
      result: 'success',
    });
    return { roleId, ...result };
  }
}
