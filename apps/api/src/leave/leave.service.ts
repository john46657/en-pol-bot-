import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';
import { webUrl } from '../common/web-url';

const KEY = 'leave.config';
const sf = z.string().regex(/^\d{15,25}$/);
/** Abmeldungen (wie bei Melonly/ERM): Freigabe-Channel, Log-Channel, Rolle „abgemeldet“. */
export const leaveConfigSchema = z.object({
  enabled: z.boolean().default(false),
  approvalChannelId: sf.nullish(),
  logChannelId: sf.nullish(),
  roleIds: z.array(sf).max(25).default([]),
  /** Längste erlaubte Abmeldung in Tagen. */
  maxDays: z.number().int().min(1).max(365).default(90),
});
export type LeaveConfig = z.infer<typeof leaveConfigSchema>;
export const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'DENIED', 'CANCELLED', 'ENDED'] as const;
const DAY = 86_400_000;

type Base = Prisma.LeaveRequestGetPayload<{ include: { user: { select: { displayName: true } } } }>;
type Row = Base & { discordId: string | null };
const include = { user: { select: { displayName: true } } } as const;

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly perms: PermissionService) {}

  async config(): Promise<LeaveConfig> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const r = leaveConfigSchema.safeParse(v ?? {});
    return r.success ? r.data : leaveConfigSchema.parse({});
  }

  async saveConfig(actor: Actor, input: LeaveConfig) {
    const value = input as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
      await this.audit.record(actor, { action: 'leave.config', module: 'leave', entityType: 'SystemSetting', entityId: KEY, after: value as Record<string, unknown> }, tx);
    });
    return this.config();
  }

  /** Discord-ID der Antragsteller dazuladen (Verknüpfung liegt in DiscordLink). */
  private async withDiscord(rows: Base[]): Promise<Row[]> {
    const links = await this.prisma.discordLink.findMany({ where: { userId: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { userId: true, discordId: true } });
    const by = new Map(links.map((l) => [l.userId, l.discordId]));
    return rows.map((r) => ({ ...r, discordId: by.get(r.userId) ?? null }));
  }
  private async one(r: Base): Promise<Row> { return (await this.withDiscord([r]))[0]!; }

  private view(r: Row & { decidedByName?: string | null }) {
    const now = Date.now();
    const active = r.status === 'APPROVED' && r.startsAt.getTime() <= now && r.endsAt.getTime() > now;
    return {
      id: r.id, number: r.number, userId: r.userId, name: r.user.displayName, discordId: r.discordId,
      startsAt: r.startsAt, endsAt: r.endsAt, reason: r.reason, type: r.type, comment: r.comment, status: r.status, active, guildId: r.guildId,
      decidedAt: r.decidedAt, decisionReason: r.decisionReason, decidedByName: r.decidedByName ?? null, endedAt: r.endedAt, createdAt: r.createdAt,
      days: Math.max(1, Math.round((r.endsAt.getTime() - r.startsAt.getTime()) / DAY)),
    };
  }

  /** Server, auf dem beantragt wurde (Kopfzeile der DMs wie bei Trident); sonst der Organisationsname. */
  private async server(guildId: string | null) {
    const g = guildId ? (await this.discord.guilds()).find((x) => x.id === guildId) : undefined;
    if (g) return { guildName: g.name, guildIcon: g.icon };
    const org = (await this.prisma.systemSetting.findUnique({ where: { key: 'org.name' } }))?.value;
    return { guildName: typeof org === 'string' ? org : 'EN Polizei', guildIcon: null };
  }

  private payload(r: Row, extra: Record<string, unknown> = {}) {
    return {
      id: r.id, number: r.number, name: r.user.displayName, discordId: r.discordId,
      startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), reason: r.reason, dashboardUrl: webUrl(`/leave?id=${r.id}`), ...extra,
    };
  }

  /** Eintrag im Log-Channel (angenommen, abgelehnt, begonnen, beendet, zurückgezogen). */
  private async log(cfg: LeaveConfig, r: Row, event: string, extra: Record<string, unknown> = {}) {
    if (!cfg.logChannelId) return;
    await this.discord.enqueue('duty', 'leave.log', this.payload(r, { event, channelId: cfg.logChannelId, ...extra }), { always: true });
  }
  private async roles(r: Row, add: string[], remove: string[], reason: string) {
    const discordId = r.discordId;
    if (!discordId || (!add.length && !remove.length)) return;
    await this.discord.enqueue('duty', 'member.roles', { discordId, add, remove, reason }, { always: true });
  }

  async request(actor: Actor, d: { startsAt: Date; endsAt: Date; reason: string; guildId?: string; type?: string; comment?: string }) {
    const cfg = await this.config();
    if (!cfg.enabled) throw new AppError('CONFLICT', 'Abmeldungen sind gerade deaktiviert.');
    const now = Date.now();
    if (d.endsAt.getTime() <= d.startsAt.getTime()) throw new AppError('VALIDATION_FAILED', 'Das Ende muss nach dem Beginn liegen.');
    if (d.endsAt.getTime() <= now) throw new AppError('VALIDATION_FAILED', 'Das Ende liegt in der Vergangenheit.');
    if (d.startsAt.getTime() < now - DAY) throw new AppError('VALIDATION_FAILED', 'Der Beginn darf höchstens einen Tag zurückliegen.');
    if (d.endsAt.getTime() - d.startsAt.getTime() > cfg.maxDays * DAY) throw new AppError('VALIDATION_FAILED', `Eine Abmeldung darf höchstens ${cfg.maxDays} Tage lang sein.`);
    const overlap = await this.prisma.leaveRequest.findFirst({ where: { userId: actor.userId!, status: { in: ['PENDING', 'APPROVED'] }, startsAt: { lt: d.endsAt }, endsAt: { gt: d.startsAt } } });
    if (overlap) throw new AppError('CONFLICT', `Für diesen Zeitraum gibt es schon eine Abmeldung (${overlap.number}).`, { existingId: overlap.id });
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.create({ data: { number: makeNumber('LOA'), userId: actor.userId!, startsAt: d.startsAt, endsAt: d.endsAt, reason: d.reason, guildId: d.guildId ?? null, type: d.type ?? null, comment: d.comment || null }, include });
      await this.audit.record(actor, { action: 'leave.request', module: 'leave', entityType: 'LeaveRequest', entityId: row.id, after: { startsAt: row.startsAt, endsAt: row.endsAt } }, tx);
      return row;
    }).then((x) => this.one(x));
    if (cfg.approvalChannelId) await this.discord.enqueue('duty', 'leave.requested', this.payload(r, { channelId: cfg.approvalChannelId }), { always: true });
    // DM „Abmeldung ausstehend“ an die Person (wie Trident)
    if (r.discordId) await this.discord.enqueue('duty', 'leave.pending', this.payload(r, await this.server(r.guildId)), { always: true });
    return this.view(r);
  }

  async list(actor: Actor, f: { status?: string; mine?: boolean }) {
    const all = !f.mine && (await this.perms.has(actor.userId!, 'leave.view'));
    const now = new Date();
    const where: Prisma.LeaveRequestWhereInput = {
      ...(all ? {} : { userId: actor.userId! }),
      ...(f.status === 'ACTIVE' ? { status: 'APPROVED', startsAt: { lte: now }, endsAt: { gt: now } }
        : f.status === 'UPCOMING' ? { status: 'APPROVED', startsAt: { gt: now } }
        : f.status && f.status !== 'ALL' ? { status: f.status } : {}),
    };
    const rows = await this.withDiscord(await this.prisma.leaveRequest.findMany({ where, include, orderBy: [{ startsAt: 'desc' }], take: 200 }));
    const deciders = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.decidedById).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } });
    const name = new Map(deciders.map((u) => [u.id, u.displayName]));
    return { all, items: rows.map((r) => this.view({ ...r, decidedByName: r.decidedById ? name.get(r.decidedById) ?? null : null })) };
  }

  private async load(id: string) {
    const r = await this.prisma.leaveRequest.findUnique({ where: { id }, include });
    if (!r) throw new AppError('NOT_FOUND', 'Abmeldung nicht gefunden.');
    return this.one(r);
  }

  async decide(actor: Actor, id: string, status: 'APPROVED' | 'DENIED', reason?: string) {
    const r = await this.load(id);
    if (r.status !== 'PENDING') throw new AppError('CONFLICT', `Über diese Abmeldung wurde schon entschieden (${r.status}).`);
    if (status === 'APPROVED' && r.endsAt.getTime() <= Date.now()) throw new AppError('CONFLICT', 'Diese Abmeldung ist schon abgelaufen.');
    const by = await this.prisma.user.findUnique({ where: { id: actor.userId! }, select: { displayName: true } });
    const updated = await this.prisma.$transaction(async (tx) => {
      const n = await tx.leaveRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status, decidedById: actor.userId, decidedAt: new Date(), decisionReason: reason || null } });
      if (!n.count) throw new AppError('CONFLICT', 'Über diese Abmeldung wurde gerade schon entschieden.');
      await this.audit.record(actor, { action: `leave.${status === 'APPROVED' ? 'approve' : 'deny'}`, module: 'leave', entityType: 'LeaveRequest', entityId: id, after: { status, reason: reason ?? null } }, tx);
      return tx.leaveRequest.findUniqueOrThrow({ where: { id }, include });
    }).then((x) => this.one(x));
    const cfg = await this.config();
    const extra = { status, decisionReason: reason || null, decidedByName: by?.displayName ?? null };
    if (updated.discordId) await this.discord.enqueue('duty', 'leave.decided', this.payload(updated, { ...extra, ...(await this.server(updated.guildId)) }), { always: true });
    await this.log(cfg, updated, status === 'APPROVED' ? 'approved' : 'denied', extra);
    await this.discord.markDecided('leave', id, actor, status === 'APPROVED' ? 'ACCEPTED' : 'REJECTED', reason);
    if (status === 'APPROVED') await this.tick();
    return { ...this.view({ ...updated, decidedByName: by?.displayName ?? null }) };
  }

  /** Zurückziehen (eigene) bzw. vorzeitig beenden (Leitung). Eine laufende Abmeldung endet sofort und die Rolle wird entfernt. */
  async cancel(actor: Actor, id: string) {
    const r = await this.load(id);
    if (r.userId !== actor.userId && !(await this.perms.has(actor.userId!, 'leave.manage'))) throw new AppError('PERMISSION_DENIED', 'Das ist nicht deine Abmeldung.');
    if (!['PENDING', 'APPROVED'].includes(r.status)) throw new AppError('CONFLICT', 'Diese Abmeldung ist schon abgeschlossen.');
    const running = r.status === 'APPROVED' && r.startsAt.getTime() <= Date.now();
    const status = running ? 'ENDED' : 'CANCELLED';
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.leaveRequest.update({ where: { id }, data: { status, endedAt: new Date() } });
      await this.audit.record(actor, { action: running ? 'leave.end_early' : 'leave.cancel', module: 'leave', entityType: 'LeaveRequest', entityId: id }, tx);
      return tx.leaveRequest.findUniqueOrThrow({ where: { id }, include });
    }).then((x) => this.one(x));
    const cfg = await this.config();
    if (r.roleApplied) await this.roles(updated, [], cfg.roleIds, `Abmeldung ${r.number} beendet`);
    await this.log(cfg, updated, running ? 'ended_early' : 'cancelled');
    if (r.status === 'PENDING') await this.discord.markDecided('leave', id, actor, 'WITHDRAWN'); // offener Antrag zurückgezogen → Buttons weg
    return this.view(updated);
  }

  /** Jede Minute: Rolle zu Beginn vergeben, am Ende entfernen und die Abmeldung abschließen. */
  async tick() {
    const cfg = await this.config();
    const now = new Date();
    let started = 0, ended = 0;
    const starting = await this.withDiscord(await this.prisma.leaveRequest.findMany({ where: { status: 'APPROVED', roleApplied: false, startsAt: { lte: now }, endsAt: { gt: now } }, include, take: 100 }));
    for (const r of starting) {
      const n = await this.prisma.leaveRequest.updateMany({ where: { id: r.id, roleApplied: false }, data: { roleApplied: true } });
      if (!n.count) continue;
      await this.roles(r, cfg.roleIds, [], `Abmeldung ${r.number}`);
      await this.log(cfg, r, 'started');
      started++;
    }
    const ending = await this.withDiscord(await this.prisma.leaveRequest.findMany({ where: { status: 'APPROVED', endsAt: { lte: now } }, include, take: 100 }));
    for (const r of ending) {
      const n = await this.prisma.leaveRequest.updateMany({ where: { id: r.id, status: 'APPROVED' }, data: { status: 'ENDED', endedAt: now } });
      if (!n.count) continue;
      if (r.roleApplied) await this.roles(r, [], cfg.roleIds, `Abmeldung ${r.number} beendet`);
      await this.log(cfg, r, 'ended');
      ended++;
    }
    return { started, ended };
  }
}
