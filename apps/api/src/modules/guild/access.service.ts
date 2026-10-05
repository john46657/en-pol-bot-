import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auditRepository, permissionRepository, type ProfileEntry } from '@nexus/database';
import { effective, explain, stateOf, type Grant } from '@nexus/permissions';
import {
  PERMISSIONS,
  PERMISSION_CATALOG,
  PERMISSION_TEMPLATES,
  resolveTemplate,
} from '@nexus/types';
import { getGuild, getGuildMember, getGuildRoles, listGuildMembers } from '@nexus/discord';
import { z } from 'zod';
import { computeMemberAccess } from '../auth/member-access.js';
import { DiscordService } from './discord.service.js';

const keySchema = z
  .string()
  .refine((k) => (PERMISSIONS as readonly string[]).includes(k), 'Unbekannte Permission.');
export const entrySchema = z
  .object({
    key: keySchema,
    effect: z.enum(['ALLOW', 'DENY']),
    scope: z.enum(['SERVER', 'TEAM', 'RECORD']).default('SERVER'),
    scopeRef: z.string().max(64).default(''),
  })
  .superRefine((e, ctx) => {
    if (e.scope === 'RECORD' && !e.scopeRef)
      ctx.addIssue({
        code: 'custom',
        path: ['scopeRef'],
        message: 'Für einen Datensatz ist eine ID nötig.',
      });
    if (e.scope === 'SERVER' && e.scopeRef)
      ctx.addIssue({
        code: 'custom',
        path: ['scopeRef'],
        message: 'Serverweite Rechte haben keine Referenz.',
      });
  });
const profileSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt.').max(80),
  description: z.string().trim().max(500).optional(),
  entries: z.array(entrySchema).max(400),
  /** Anzeige-Farbe (#RRGGBB), Priorität (höher = wichtiger) und Aktiv-Schalter – alles optional. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Die Farbe muss als #RRGGBB angegeben werden.')
    .nullable()
    .optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  enabled: z.boolean().optional(),
});
/** Temporäres Recht: Ablaufzeitpunkt oder Dauer in Tagen (höchstens ein Jahr, nur in der Zukunft). */
export const MAX_TEMP_DAYS = 365;

const label = new Map<
  string,
  { label: string; alias: string | null; module: string; moduleLabel: string }
>();
for (const m of PERMISSION_CATALOG) {
  for (const [key, l, alias] of m.permissions as readonly (readonly [string, string, string?])[]) {
    label.set(key, { label: l, alias: alias ?? null, module: m.module, moduleLabel: m.label });
  }
}

export const parse = <T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T => {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || 'eingabe'}: ${i.message}`),
    );
  return r.data;
};

/** Konflikt: dasselbe Recht im selben Geltungsbereich erlaubt und gesperrt. */
export function assertNoContradiction(entries: ProfileEntry[]): void {
  const sig = (e: ProfileEntry) => `${e.key}|${e.scope}|${e.scopeRef}`;
  const allows = new Set(entries.filter((e) => e.effect === 'ALLOW').map(sig));
  if (entries.some((e) => e.effect === 'DENY' && allows.has(sig(e)))) {
    throw new BadRequestException(
      'Ein Recht kann im selben Bereich nicht gleichzeitig erlaubt und gesperrt sein.',
    );
  }
}

/** Profile, Vorlagen, Benutzer-Übersicht und „Warum darf er das?“-Erklärung. */
@Injectable()
export class AccessService {
  constructor(
    private readonly discord: DiscordService,
    private readonly config: ConfigService,
  ) {}

  private get botToken(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  // --- Profile ----------------------------------------------------------------

  listProfiles(guildId: string) {
    return permissionRepository.listProfiles(guildId);
  }

  async createProfile(guildId: string, actorId: string, input: unknown) {
    const data = parse(profileSchema, input);
    assertNoContradiction(data.entries as ProfileEntry[]);
    return this.save(
      guildId,
      actorId,
      () =>
        permissionRepository.createProfile(guildId, {
          name: data.name,
          description: data.description,
          entries: data.entries as ProfileEntry[],
          color: data.color ?? null,
          priority: data.priority ?? 0,
          enabled: data.enabled ?? true,
          createdBy: actorId,
        }),
      'permissions.profile.create',
    );
  }

  /** Profil duplizieren: gleiche Rechte, Name „… (Kopie)“ (bei Bedarf nummeriert), Priorität und Farbe übernommen. */
  async duplicateProfile(guildId: string, actorId: string, profileId: string) {
    const source = (await permissionRepository.listProfiles(guildId)).find((p) => p.id === profileId);
    if (!source) throw new NotFoundException('Profil nicht gefunden.');
    const taken = new Set((await permissionRepository.listProfiles(guildId)).map((p) => p.name));
    const base = `${source.name} (Kopie)`.slice(0, 80);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 74)} ${n}`;
    return this.save(
      guildId,
      actorId,
      () =>
        permissionRepository.createProfile(guildId, {
          name,
          description: source.description ?? undefined,
          entries: source.entries,
          color: source.color,
          priority: source.priority,
          enabled: source.enabled,
          createdBy: actorId,
        }),
      'permissions.profile.create',
    );
  }

  async createFromTemplate(
    guildId: string,
    actorId: string,
    input: { templateKey?: unknown; name?: unknown },
  ) {
    const key = typeof input?.templateKey === 'string' ? input.templateKey : '';
    const resolved = resolveTemplate(key);
    if (!resolved) throw new NotFoundException('Vorlage nicht gefunden.');
    const t = PERMISSION_TEMPLATES.find((x) => x.key === key)!;
    const name =
      typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 80) : t.name;
    const entries: ProfileEntry[] = [
      ...resolved.allow.map((a) => ({
        key: a.key,
        effect: 'ALLOW' as const,
        scope: a.scope ?? ('SERVER' as const),
        scopeRef: '',
      })),
      ...resolved.deny.map((d) => ({
        key: d,
        effect: 'DENY' as const,
        scope: 'SERVER' as const,
        scopeRef: '',
      })),
    ];
    return this.save(
      guildId,
      actorId,
      () =>
        permissionRepository.createProfile(guildId, {
          name,
          description: t.description,
          entries,
          templateKey: key,
          createdBy: actorId,
        }),
      'permissions.profile.create',
    );
  }

  async updateProfile(guildId: string, actorId: string, profileId: string, input: unknown) {
    const before = await permissionRepository.getProfile(guildId, profileId);
    if (!before) throw new NotFoundException('Profil nicht gefunden.');
    const data = parse(profileSchema, input);
    assertNoContradiction(data.entries as ProfileEntry[]);
    const updated = await this.save(
      guildId,
      actorId,
      () =>
        permissionRepository.updateProfile(guildId, profileId, {
          name: data.name,
          description: data.description ?? null,
          entries: data.entries as ProfileEntry[],
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.priority !== undefined ? { priority: data.priority } : {}),
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        }),
      'permissions.profile.update',
      before,
    );
    if (!updated) throw new NotFoundException('Profil nicht gefunden.');
    return updated;
  }

  async deleteProfile(guildId: string, actorId: string, profileId: string) {
    const before = await permissionRepository.getProfile(guildId, profileId);
    if (!before) throw new NotFoundException('Profil nicht gefunden.');
    await permissionRepository.deleteProfile(guildId, profileId);
    await this.audit(
      guildId,
      actorId,
      'permissions.profile.delete',
      profileId,
      { name: before.name, entries: before.entries },
      undefined,
    );
    return { ok: true };
  }

  private async save<T extends { id: string; name: string; entries: unknown } | null>(
    guildId: string,
    actorId: string,
    op: () => Promise<T>,
    action: string,
    before?: { name: string; entries: unknown },
  ): Promise<T> {
    let result: T;
    try {
      result = await op();
    } catch (e) {
      if (e instanceof Error && /Unique constraint/i.test(e.message)) {
        throw new ConflictException('Ein Profil mit diesem Namen gibt es schon.');
      }
      throw e;
    }
    if (result) {
      await this.audit(
        guildId,
        actorId,
        action,
        result.id,
        before ? { name: before.name, entries: before.entries } : undefined,
        { name: result.name, entries: result.entries },
      );
    }
    return result;
  }

  // --- Benutzer ---------------------------------------------------------------

  /** Mitglieder (Suche oder erste Seite) mit Rollen und Anzahl effektiver Berechtigungen. */
  async listMembers(guildId: string, query: string | undefined, limit: number) {
    const [members, roles, index] = await Promise.all([
      listGuildMembers(this.botToken, guildId, { ...(query ? { query } : {}), limit }),
      this.discord.listRoles(guildId),
      permissionRepository.loadGrantIndex(guildId),
    ]);
    const names = new Map(roles.map((r) => [r.id, r.name]));
    const total = PERMISSIONS.length;
    return members.map((m) => {
      const grants: Grant[] = [
        ...m.roles.flatMap((r) => index.byRole.get(r) ?? []),
        ...(index.byUser.get(m.userId) ?? []),
      ];
      const count = effective(grants).filter(
        (e) => e.state === 'allowed' || e.state === 'limited',
      ).length;
      return {
        id: m.userId,
        username: m.username,
        displayName: m.globalName ?? m.username,
        roles: m.roles.map((id) => ({ id, name: names.get(id) ?? 'Unbekannt' })),
        permissionCount: count,
        permissionTotal: total,
      };
    });
  }

  /** Detailansicht: Rollen, effektive Rechte inkl. Herkunft, Ausnahmen, letzte Aktionen. */
  async memberAccess(guildId: string, userId: string) {
    if (!/^\d{5,25}$/.test(userId)) throw new BadRequestException('Ungültige Benutzer-ID.');
    const member = await getGuildMember(this.botToken, guildId, userId);
    if (!member) throw new NotFoundException('Benutzer ist nicht auf dem Server.');
    const [roles, grants, overrides, recent] = await Promise.all([
      this.discord.listRoles(guildId),
      permissionRepository.loadGrants(guildId, member.roles, userId),
      permissionRepository.listUserOverrides(guildId, userId),
      auditRepository.list(guildId, { actorId: userId, limit: 10 }),
    ]);
    const [rawRoles, guild] = await Promise.all([
      getGuildRoles(this.botToken, guildId),
      getGuild(this.botToken, guildId),
    ]);
    const admin = computeMemberAccess({
      guildId,
      ownerId: guild.ownerId,
      userId,
      memberRoleIds: member.roles,
      roles: rawRoles,
    });

    const names = new Map(roles.map((r) => [r.id, r.name]));
    const permissionsOut = PERMISSIONS.map((key) => {
      const meta = label.get(key)!;
      const ex = explain(grants, key);
      const state = admin.canManageGuild && ex.state !== 'denied' ? ('allowed' as const) : ex.state;
      return {
        key,
        label: meta.label,
        alias: meta.alias,
        module: meta.module,
        moduleLabel: meta.moduleLabel,
        state,
        /** Server-Besitzer/Administratoren dürfen unabhängig von Zuordnungen alles. */
        viaDiscordAdmin: admin.canManageGuild && ex.state !== 'denied',
        entries: ex.entries.map((e) => ({
          effect: e.effect,
          scope: e.scope,
          scopeRef: e.scopeRef,
          viaManage: e.viaManage,
          source: e.source,
        })),
      };
    });
    return {
      user: {
        id: userId,
        username: member.username,
        displayName: member.globalName ?? member.username,
      },
      guildAdmin: admin.canManageGuild,
      roles: member.roles.map((id) => ({ id, name: names.get(id) ?? 'Unbekannt' })),
      permissions: permissionsOut,
      counts: {
        allowed: permissionsOut.filter((p) => p.state === 'allowed').length,
        limited: permissionsOut.filter((p) => p.state === 'limited').length,
        denied: permissionsOut.filter((p) => p.state === 'denied').length,
      },
      overrides: overrides.map((o) => ({
        id: o.id,
        key: o.key,
        effect: o.effect,
        scope: o.scope,
        scopeRef: o.scopeRef,
        note: o.note,
        createdAt: o.createdAt,
        expiresAt: o.expiresAt,
      })),
      recentActions: recent.map((a) => ({
        id: a.id,
        action: a.action,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        result: a.result,
        createdAt: a.createdAt,
      })),
      /** Folgen mit den jeweiligen Modulen (Teams, Personalakte) bzw. der Session-Verwaltung (Phase 32). */
      pending: ['Teams', 'Personalakte', 'Sessions'],
    };
  }

  async addOverride(guildId: string, actorId: string, userId: string, input: unknown) {
    const data = parse(
      entrySchema.and(
        z.object({
          note: z.string().max(200).optional(),
          expiresAt: z.string().datetime().optional(),
          durationDays: z.number().int().min(1).max(MAX_TEMP_DAYS).optional(),
        }),
      ),
      input,
    );
    if (!/^\d{5,25}$/.test(userId)) throw new BadRequestException('Ungültige Benutzer-ID.');
    if (data.expiresAt && data.durationDays) throw new BadRequestException('Entweder ein Ablaufdatum oder eine Dauer angeben.');
    const expiresAt = data.durationDays
      ? new Date(Date.now() + data.durationDays * 86_400_000)
      : data.expiresAt
        ? new Date(data.expiresAt)
        : null;
    if (expiresAt && (expiresAt.getTime() <= Date.now() || expiresAt.getTime() > Date.now() + MAX_TEMP_DAYS * 86_400_000))
      throw new BadRequestException(`Das Ablaufdatum muss in der Zukunft und höchstens ${MAX_TEMP_DAYS} Tage entfernt liegen.`);
    const row = await permissionRepository.addUserOverride(guildId, {
      userId,
      key: data.key,
      effect: data.effect,
      scope: data.scope,
      scopeRef: data.scopeRef,
      note: data.note,
      createdBy: actorId,
      expiresAt,
    });
    await this.audit(guildId, actorId, 'permissions.user.override.add', userId, undefined, {
      key: data.key,
      effect: data.effect,
      scope: data.scope,
      scopeRef: data.scopeRef,
      note: data.note,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
    return row;
  }

  async removeOverride(guildId: string, actorId: string, userId: string, id: string) {
    const existing = (await permissionRepository.listUserOverrides(guildId, userId)).find(
      (o) => o.id === id,
    );
    if (!existing) throw new NotFoundException('Ausnahme nicht gefunden.');
    await permissionRepository.removeUserOverride(guildId, id);
    await this.audit(
      guildId,
      actorId,
      'permissions.user.override.remove',
      userId,
      { key: existing.key, effect: existing.effect, scope: existing.scope },
      undefined,
    );
    return { ok: true };
  }

  private audit(
    guildId: string,
    actorId: string,
    action: string,
    resourceId: string,
    before?: unknown,
    after?: unknown,
  ) {
    return auditRepository.create({
      guildId,
      actorType: 'USER',
      actorId,
      action,
      resourceType: action.includes('.user.') ? 'User' : 'PermissionProfile',
      resourceId,
      permission: 'permissions.edit',
      result: 'success',
      ...(before !== undefined ? { before: before as never } : {}),
      ...(after !== undefined ? { after: after as never } : {}),
    });
  }
}

export { stateOf };
