import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auditRepository, nexusRoleRepository, type NexusRoleEntry } from '@nexus/database';
import { getGuildMember } from '@nexus/discord';
import { z } from 'zod';
import { assertNoContradiction, entrySchema, parse } from './access.service.js';

const MAX_DAYS = 365;
const roleSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt.').max(80),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Die Farbe muss als #RRGGBB angegeben werden.').nullable().optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  enabled: z.boolean().optional(),
  discordRoleId: z.string().regex(/^\d{5,25}$/, 'Ungültige Discord-Rollen-ID.').nullable().optional(),
  entries: z.array(entrySchema).max(400).default([]),
});
const memberSchema = z.object({
  userIds: z.array(z.string().regex(/^\d{5,25}$/, 'Ungültige Benutzer-ID.')).min(1).max(50),
  durationDays: z.number().int().min(1).max(MAX_DAYS).optional(),
});

/** Eigene Rollen des Dashboards (anlegen, bearbeiten, duplizieren, löschen, Mitglieder). Rechte-/Rangprüfung macht `RightsService`. */
@Injectable()
export class NexusRolesService {
  constructor(private readonly config: ConfigService) {}

  private audit(guildId: string, actorId: string, action: string, id: string, before?: unknown, after?: unknown) {
    return auditRepository.create({
      guildId,
      actorType: 'USER',
      actorId,
      action,
      resourceType: 'NexusRole',
      resourceId: id,
      permission: 'permissions.edit',
      result: 'success',
      ...(before !== undefined ? { before: before as never } : {}),
      ...(after !== undefined ? { after: after as never } : {}),
    });
  }

  private summary(r: { name: string; priority: number; enabled: boolean; discordRoleId: string | null; entries: NexusRoleEntry[] }) {
    return { name: r.name, priority: r.priority, enabled: r.enabled, discordRoleId: r.discordRoleId, rights: r.entries.map((e) => (e.effect === 'DENY' ? `!${e.key}` : e.key)).sort() };
  }

  async list(guildId: string) {
    const token = this.config.get<string>('DISCORD_TOKEN') ?? '';
    const roles = await nexusRoleRepository.list(guildId);
    return Promise.all(
      roles.map(async (r) => ({
        ...r,
        members: await Promise.all(
          r.members.map(async (m) => {
            const dm = await getGuildMember(token, guildId, m.userId).catch(() => null);
            return { id: m.id, userId: m.userId, expiresAt: m.expiresAt, name: dm?.globalName ?? dm?.username ?? null };
          }),
        ),
      })),
    );
  }

  /** Eingabe prüfen (für die Rechteprüfung vor dem Schreiben). */
  validate(input: unknown) {
    const data = parse(roleSchema, input);
    assertNoContradiction(data.entries as NexusRoleEntry[]);
    return data as typeof data & { entries: NexusRoleEntry[] };
  }

  private async guard<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (e) {
      if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new ConflictException('Eine Rolle mit diesem Namen gibt es schon.');
      throw e;
    }
  }

  async create(guildId: string, actorId: string, input: unknown) {
    const d = this.validate(input);
    const row = await this.guard(() => nexusRoleRepository.create(guildId, { ...d, createdBy: actorId }));
    await this.audit(guildId, actorId, 'permissions.nexusrole.create', row.id, undefined, this.summary({ ...row, entries: d.entries }));
    return row;
  }

  async update(guildId: string, actorId: string, id: string, input: unknown) {
    const before = await nexusRoleRepository.get(guildId, id);
    if (!before) throw new NotFoundException('Rolle nicht gefunden.');
    const d = this.validate(input);
    await this.guard(() => nexusRoleRepository.update(guildId, id, d));
    await this.audit(guildId, actorId, 'permissions.nexusrole.update', id, this.summary(before), this.summary({ ...before, ...d, discordRoleId: d.discordRoleId ?? null, enabled: d.enabled ?? before.enabled, priority: d.priority ?? before.priority }));
    return nexusRoleRepository.get(guildId, id);
  }

  async duplicate(guildId: string, actorId: string, id: string) {
    const src = await nexusRoleRepository.get(guildId, id);
    if (!src) throw new NotFoundException('Rolle nicht gefunden.');
    const taken = new Set((await nexusRoleRepository.list(guildId)).map((r) => r.name));
    const base = `${src.name} (Kopie)`.slice(0, 80);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base.slice(0, 74)} ${n}`;
    // Kopie ohne Mitglieder und ohne Discord-Kopplung, damit sie nicht sofort Rechte verteilt
    const row = await nexusRoleRepository.create(guildId, { name, description: src.description, color: src.color, priority: src.priority, enabled: false, entries: src.entries, createdBy: actorId });
    await this.audit(guildId, actorId, 'permissions.nexusrole.create', row.id, undefined, { ...this.summary({ ...row, entries: src.entries }), copyOf: src.name });
    return row;
  }

  async remove(guildId: string, actorId: string, id: string) {
    const before = await nexusRoleRepository.get(guildId, id);
    if (!before) throw new NotFoundException('Rolle nicht gefunden.');
    await nexusRoleRepository.remove(guildId, id);
    await this.audit(guildId, actorId, 'permissions.nexusrole.delete', id, { ...this.summary(before), members: before.members.map((m) => m.userId) });
    return { ok: true };
  }

  parseMembers(input: unknown) {
    return parse(memberSchema, input);
  }

  async addMembers(guildId: string, actorId: string, id: string, input: unknown) {
    const d = this.parseMembers(input);
    const role = await nexusRoleRepository.get(guildId, id);
    if (!role) throw new NotFoundException('Rolle nicht gefunden.');
    const expiresAt = d.durationDays ? new Date(Date.now() + d.durationDays * 86_400_000) : null;
    for (const userId of d.userIds) await nexusRoleRepository.addMember(guildId, id, userId, actorId, expiresAt);
    await this.audit(guildId, actorId, 'permissions.nexusrole.member.add', id, undefined, { role: role.name, userIds: d.userIds, expiresAt: expiresAt?.toISOString() ?? null });
    return { ok: true, added: d.userIds.length };
  }

  async removeMember(guildId: string, actorId: string, id: string, userId: string) {
    if (!/^\d{5,25}$/.test(userId)) throw new BadRequestException('Ungültige Benutzer-ID.');
    const role = await nexusRoleRepository.get(guildId, id);
    if (!role) throw new NotFoundException('Rolle nicht gefunden.');
    if (!(await nexusRoleRepository.removeMember(guildId, id, userId))) throw new NotFoundException('Benutzer hat diese Rolle nicht.');
    await this.audit(guildId, actorId, 'permissions.nexusrole.member.remove', id, { role: role.name, userId });
    return { ok: true };
  }
}
