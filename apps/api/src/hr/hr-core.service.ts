import { Injectable } from '@nestjs/common';
import { Prisma, type HrRank } from '@prisma/client';
import { hrConfigSchema, withHrDefaults, type HrConfig, type HrEvent, type MessageSpec, type PromotionCheck, type RankInput, type Requirement, type RequirementResult } from '@enrp/shared';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { AppError } from '../common/errors';

const CONFIG_KEY = 'hr.config';
const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Personal-Kern: Einstellungen, Ränge, Prüfung der Beförderungsvoraussetzungen,
 * Discord-/Dashboard-Rollen abgleichen und Benachrichtigungen nach Einstellung verschicken.
 */
@Injectable()
export class HrCoreService {
  constructor(readonly prisma: PrismaService, readonly audit: AuditService, readonly discord: DiscordService, private readonly live: DiscordLiveService) {}

  // ---------------- Einstellungen ----------------
  async config(): Promise<HrConfig> {
    return withHrDefaults((await this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } }))?.value);
  }
  async saveConfig(actor: Actor, input: HrConfig) {
    const before = await this.config();
    const c = hrConfigSchema.parse(input);
    const keys = c.statuses.map((s) => s.key);
    if (new Set(keys).size !== keys.length) throw new AppError('VALIDATION_FAILED', 'Jeder Status braucht einen eigenen Schlüssel.');
    const names = c.departments.map((d) => norm(d.name));
    if (new Set(names).size !== names.length) throw new AppError('VALIDATION_FAILED', 'Abteilungsnamen müssen eindeutig sein.');
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: c as unknown as Prisma.InputJsonValue }, update: { value: c as unknown as Prisma.InputJsonValue } });
      // umbenannte Abteilungen in den Personalakten nachziehen (gleiche ID, anderer Name)
      for (const d of c.departments) {
        const old = before.departments.find((x) => x.id === d.id);
        if (old && old.name !== d.name) await tx.personnel.updateMany({ where: { team: old.name }, data: { team: d.name } });
      }
      // Teamliste/Teamstruktur kennt dieselben Abteilungen
      const st = await tx.systemSetting.findUnique({ where: { key: 'team.structure' } });
      const s = (st?.value ?? {}) as { teams?: string[]; offices?: string[] };
      const teams = [...new Set([...c.departments.map((d) => d.name), ...(s.teams ?? []).filter((t) => !before.departments.some((d) => d.name === t) || c.departments.some((d) => d.name === t))])];
      const value = { ...s, teams, offices: s.offices ?? [] } as Prisma.InputJsonValue;
      await tx.systemSetting.upsert({ where: { key: 'team.structure' }, create: { key: 'team.structure', value }, update: { value } });
      await this.audit.record(actor, { action: 'hr.config.update', module: 'personnel', entityType: 'SystemSetting', entityId: CONFIG_KEY, before, after: c }, tx);
    });
    return this.config();
  }

  // ---------------- Ränge ----------------
  ranks(includeInactive = true) { return this.prisma.hrRank.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }] }); }
  async rankByName(name: string | null | undefined, tx: Tx | PrismaService = this.prisma) {
    if (!name) return null;
    return tx.hrRank.findFirst({ where: { name: { equals: name.trim(), mode: 'insensitive' } } });
  }
  /** Rangreihenfolge auch für Teamliste/Embeds (team.rankOrder). */
  private async syncRankOrder(tx: Tx) {
    const names = (await tx.hrRank.findMany({ where: { active: true }, orderBy: { position: 'asc' }, select: { name: true } })).map((r) => r.name);
    const value = names as unknown as Prisma.InputJsonValue;
    await tx.systemSetting.upsert({ where: { key: 'team.rankOrder' }, create: { key: 'team.rankOrder', value }, update: { value } });
  }
  async saveRank(actor: Actor, d: RankInput, id?: string) {
    return this.prisma.$transaction(async (tx) => {
      const dup = await tx.hrRank.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, ...(id ? { id: { not: id } } : {}) } });
      if (dup) throw new AppError('CONFLICT', 'Diesen Rang gibt es schon.');
      const data = { name: d.name, description: d.description, icon: d.icon, color: d.color, discordRoleIds: d.discordRoleIds, dashboardRoleIds: d.dashboardRoleIds, nextRankIds: d.nextRankIds.filter((x) => x !== id), approverRankIds: d.approverRankIds, requirements: d.requirements as unknown as Prisma.InputJsonValue, active: d.active };
      let r: HrRank;
      if (id) {
        const before = await tx.hrRank.findUnique({ where: { id } });
        if (!before) throw new AppError('NOT_FOUND', 'Rang nicht gefunden.');
        r = await tx.hrRank.update({ where: { id }, data });
        if (before.name !== r.name) await tx.personnel.updateMany({ where: { rank: before.name }, data: { rank: r.name } });
        const reqChanged = JSON.stringify(before.requirements) !== JSON.stringify(r.requirements);
        await this.audit.record(actor, { action: reqChanged ? 'promotion.requirements.update' : 'promotion.rank.update', module: 'promotion', entityType: 'HrRank', entityId: id, before, after: r }, tx);
        if (JSON.stringify(before.discordRoleIds) !== JSON.stringify(r.discordRoleIds)) await this.audit.record(actor, { action: 'promotion.rank.discord_roles', module: 'promotion', entityType: 'HrRank', entityId: id, before: { discordRoleIds: before.discordRoleIds }, after: { discordRoleIds: r.discordRoleIds } }, tx);
      } else {
        const position = ((await tx.hrRank.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1;
        r = await tx.hrRank.create({ data: { ...data, position } });
        await this.audit.record(actor, { action: 'promotion.rank.create', module: 'promotion', entityType: 'HrRank', entityId: r.id, after: r }, tx);
      }
      await this.syncRankOrder(tx);
      return r;
    });
  }
  async reorderRanks(actor: Actor, ids: string[]) {
    await this.prisma.$transaction(async (tx) => {
      for (const [i, id] of ids.entries()) await tx.hrRank.update({ where: { id }, data: { position: i + 1 } });
      await this.syncRankOrder(tx);
      await this.audit.record(actor, { action: 'promotion.rank.reorder', module: 'promotion', after: { ids } }, tx);
    });
    return this.ranks();
  }
  async deleteRank(actor: Actor, id: string) {
    const r = await this.prisma.hrRank.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Rang nicht gefunden.');
    const used = await this.prisma.personnel.count({ where: { rank: r.name, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } } });
    if (used) throw new AppError('CONFLICT', `${used} Person(en) haben diesen Rang – stattdessen deaktivieren oder vorher befördern.`);
    await this.prisma.$transaction(async (tx) => {
      await tx.hrRank.delete({ where: { id } });
      for (const o of await tx.hrRank.findMany({ where: { OR: [{ nextRankIds: { has: id } }, { approverRankIds: { has: id } }] } })) {
        await tx.hrRank.update({ where: { id: o.id }, data: { nextRankIds: o.nextRankIds.filter((x) => x !== id), approverRankIds: o.approverRankIds.filter((x) => x !== id) } });
      }
      await this.syncRankOrder(tx);
      await this.audit.record(actor, { action: 'promotion.rank.delete', module: 'promotion', entityType: 'HrRank', entityId: id, before: r }, tx);
    });
  }
  /** Mögliche nächste Ränge: eingestellte Ziele, sonst der nächsthöhere aktive Rang. */
  async nextRanks(current: HrRank | null) {
    const all = await this.ranks(false);
    if (!current) return all.slice(-1);
    if (current.nextRankIds.length) return all.filter((r) => current.nextRankIds.includes(r.id));
    const higher = all.filter((r) => r.position < current.position);
    return higher.length ? [higher[higher.length - 1]!] : [];
  }

  // ---------------- Voraussetzungen ----------------
  async evaluate(personnelId: string, rank: HrRank): Promise<PromotionCheck> {
    const p = await this.prisma.personnel.findUniqueOrThrow({ where: { id: personnelId } });
    const reqs = (rank.requirements as unknown as Requirement[]) ?? [];
    const checks = (p.customChecks ?? {}) as Record<string, boolean>;
    const results: RequirementResult[] = [];
    const discordId = await this.discordIdOf(p.userId);
    for (const r of reqs) {
      const base = { id: r.id, type: r.type, manual: r.type === 'CUSTOM' };
      if (r.type === 'MIN_DAYS_IN_RANK') {
        const days = Math.floor((Date.now() - p.rankSince.getTime()) / 86_400_000);
        results.push({ ...base, label: r.label || `${r.value} Tage im aktuellen Rang`, met: days >= r.value, current: `${days} Tage`, needed: `${r.value} Tage` });
      } else if (r.type === 'MIN_DUTY_HOURS') {
        const sessions = await this.prisma.dutySession.findMany({ where: { userId: p.userId }, select: { startedAt: true, endedAt: true } });
        const h = sessions.reduce((n, s) => n + ((s.endedAt ?? new Date()).getTime() - s.startedAt.getTime()), 0) / 3_600_000;
        results.push({ ...base, label: r.label || `${r.value} Dienststunden`, met: h >= r.value, current: `${h.toFixed(1)} h`, needed: `${r.value} h` });
      } else if (r.type === 'MIN_INCIDENTS') {
        const n = await this.prisma.auditLog.count({ where: { actorUserId: p.userId, action: { in: ['incident.create', 'incident.created', 'cad.incident.create'] } } });
        results.push({ ...base, label: r.label || `${r.value} Einsätze`, met: n >= r.value, current: String(n), needed: String(r.value) });
      } else if (r.type === 'TRAINING') {
        const t = r.ref ? await this.prisma.hrTrainingProgress.findFirst({ where: { personnelId, trainingId: r.ref }, include: { training: { select: { name: true } } } }) : null;
        const ok = t?.status === 'PASSED' && (!t.expiresAt || t.expiresAt > new Date());
        const name = t?.training.name ?? (r.ref ? (await this.prisma.hrTraining.findUnique({ where: { id: r.ref }, select: { name: true } }))?.name : null) ?? 'Ausbildung';
        results.push({ ...base, label: r.label || `Ausbildung „${name}“ abgeschlossen`, met: !!ok, current: t ? t.status : 'nicht begonnen', needed: 'bestanden' });
      } else if (r.type === 'EXAM') {
        const ok = r.ref ? await this.prisma.hrExamAttempt.count({ where: { personnelId, examId: r.ref, passed: true } }) : 0;
        const name = r.ref ? (await this.prisma.hrExam.findUnique({ where: { id: r.ref }, select: { title: true } }))?.title : null;
        results.push({ ...base, label: r.label || `Prüfung „${name ?? 'Prüfung'}“ bestanden`, met: ok > 0, current: ok ? 'bestanden' : 'offen', needed: 'bestanden' });
      } else if (r.type === 'DISCORD_ROLE') {
        const has = !!discordId && this.live.getMembers().members.some((m) => m.id === discordId && !!r.ref && m.roleIds.includes(r.ref));
        results.push({ ...base, label: r.label || 'Discord-Rolle vorhanden', met: has, current: has ? 'vorhanden' : 'fehlt', needed: 'vorhanden' });
      } else if (r.type === 'RECOMMENDATION') {
        const n = await this.prisma.personnelRecord.count({ where: { personnelId, type: 'RECOMMENDATION', deletedAt: null, createdAt: { gte: p.rankSince } } });
        const need = Math.max(1, r.value);
        results.push({ ...base, label: r.label || 'Empfehlung eines Vorgesetzten', met: n >= need, current: String(n), needed: String(need) });
      } else {
        results.push({ ...base, label: r.label || 'Voraussetzung', met: !!checks[r.id], current: checks[r.id] ? 'erfüllt' : 'offen', needed: 'erfüllt' });
      }
    }
    const met = results.filter((x) => x.met).length;
    return { rankId: rank.id, rankName: rank.name, results, met, total: results.length, eligible: met === results.length };
  }

  // ---------------- Discord / Dashboard / Benachrichtigungen ----------------
  async discordIdOf(userId: string) { return (await this.prisma.discordLink.findUnique({ where: { userId } }))?.discordId ?? null; }

  async syncDiscordRoles(userId: string, add: string[], remove: string[], reason: string, tx?: Tx) {
    const discordId = await this.discordIdOf(userId);
    const a = [...new Set(add)], r = [...new Set(remove)].filter((x) => !a.includes(x));
    if (!discordId || (!a.length && !r.length)) return false;
    await (tx ?? this.prisma).discordOutbox.create({ data: { type: 'member.roles', channelKey: 'duty', payload: { discordId, add: a, remove: r, reason } } });
    return true;
  }
  async syncDashboardRoles(userId: string, add: string[], remove: string[], tx: Tx) {
    for (const roleId of remove.filter((x) => !add.includes(x))) await tx.userRole.deleteMany({ where: { userId, roleId } });
    for (const roleId of add) if (await tx.role.findUnique({ where: { id: roleId } })) await tx.userRole.upsert({ where: { userId_roleId: { userId, roleId } }, create: { userId, roleId }, update: {} });
  }
  /** Nickname auf allen Servern setzen (Bot). */
  async setNickname(userId: string, nickname: string, tx?: Tx) {
    const discordId = await this.discordIdOf(userId);
    if (!discordId) return false;
    await (tx ?? this.prisma).discordOutbox.create({ data: { type: 'bot.nickname', channelKey: 'duty', payload: { discordId, nickname: nickname.slice(0, 32) } } });
    return true;
  }
  async dm(userId: string, message: MessageSpec, tx?: Tx) {
    const discordId = await this.discordIdOf(userId);
    if (!discordId) return false;
    await (tx ?? this.prisma).discordOutbox.create({ data: { type: 'bot.dm', channelKey: 'duty', payload: { discordId, message } as unknown as Prisma.InputJsonValue } });
    return true;
  }

  /**
   * Benachrichtigung nach Einstellung (Personal → Benachrichtigungen): Dashboard (betroffene Person + eingestellte Rollen),
   * Discord-Kanal und optional DM. Sensible Inhalte gehören nicht in `public` – der Kanal bekommt nur den neutralen Text.
   */
  async notify(event: HrEvent, n: { memberUserId?: string | null; title: string; body?: string; entityType: string; entityId: string; publicText?: string; dmText?: string; color?: number }) {
    const rule = (await this.config()).notifications[event];
    if (!rule) return;
    if (rule.dashboard) {
      const staff = rule.roleIds.length ? (await this.prisma.userRole.findMany({ where: { roleId: { in: rule.roleIds } }, select: { userId: true } })).map((u) => u.userId) : [];
      const users = [...new Set([...staff, ...(n.memberUserId ? [n.memberUserId] : [])])];
      if (users.length) await this.prisma.notification.createMany({ data: users.map((userId) => ({ userId, type: 'PERSONNEL', title: n.title.slice(0, 200), body: n.body?.slice(0, 1000), entityType: n.entityType, entityId: n.entityId })) });
    }
    if (rule.channelId && n.publicText) await this.discord.postMessage(`hr-${event.replace('.', '-')}-${n.entityId.slice(0, 8)}-${Date.now().toString(36)}`, rule.channelId, { embeds: [{ title: n.title.slice(0, 256), description: n.publicText.slice(0, 4000), color: n.color ?? 0x3b82f6, timestamp: new Date().toISOString() }] }, { forceNew: true });
    if (rule.dm && n.memberUserId) await this.dm(n.memberUserId, { embeds: [{ title: n.title.slice(0, 256), description: (n.dmText ?? n.publicText ?? n.body ?? '').slice(0, 4000) || '​', color: n.color ?? 0x3b82f6, timestamp: new Date().toISOString() }] });
  }

  /** Personalakte zu einem Benutzer (anlegen, falls gewünscht). */
  async ensurePersonnel(userId: string, d: { rank?: string | null; team?: string | null }, tx: Tx) {
    const p = await tx.personnel.findUnique({ where: { userId } });
    if (p) return { personnel: p, created: false };
    return { personnel: await tx.personnel.create({ data: { userId, rank: d.rank ?? null, team: d.team ?? null } }), created: true };
  }
}
