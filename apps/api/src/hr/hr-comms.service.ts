import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { HrCoreService } from './hr-core.service';

const sf = z.string().regex(/^\d{15,25}$/);
export const announcementSchema = z.object({
  title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(8000), priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  audienceRoleIds: z.array(z.string().uuid()).max(30).default([]), publishAt: z.string().datetime({ offset: true }).optional(), expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  requireAck: z.boolean().default(false), discordChannelId: sf.nullable().default(null), attachments: z.array(z.string().uuid()).max(10).default([]),
});
export const pollSchema = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().max(4000).nullable().default(null), options: z.array(z.string().trim().min(1).max(200)).min(2).max(20),
  audienceRoleIds: z.array(z.string().uuid()).max(30).default([]), startsAt: z.string().datetime({ offset: true }).optional(), endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  anonymous: z.boolean().default(false), multiple: z.boolean().default(false), showResults: z.enum(['ALWAYS', 'AFTER_VOTE', 'AFTER_END', 'NEVER']).default('AFTER_VOTE'),
});
const PRIO = { LOW: { e: '🔵', c: 0x3b82f6 }, NORMAL: { e: '📢', c: 0x64748b }, HIGH: { e: '🟠', c: 0xf97316 }, CRITICAL: { e: '🔴', c: 0xef4444 } } as const;

/** Interne Meldungen (Zielgruppe, Priorität, Zeitraum, Lesebestätigung, Discord) und Abstimmungen. */
@Injectable()
export class HrCommsService {
  constructor(private readonly core: HrCoreService, private readonly perms: PermissionService) {}
  private get prisma() { return this.core.prisma; }

  /** Gehört der Benutzer zur Zielgruppe (Dashboard-Rollen; leer = alle)? */
  private async inAudience(userId: string, roleIds: string[]) {
    if (!roleIds.length) return true;
    const mine = await this.perms.roleIdsFor(userId);
    return roleIds.some((r) => mine.includes(r));
  }
  /** Alle aktiven Benutzer der Zielgruppe (für „47 von 52 gelesen“). */
  private async audience(roleIds: string[]) {
    if (!roleIds.length) return (await this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] }, user: { active: true } }, select: { userId: true } })).map((p) => p.userId);
    return [...new Set((await this.prisma.userRole.findMany({ where: { roleId: { in: roleIds }, user: { active: true } }, select: { userId: true } })).map((u) => u.userId))];
  }

  // ---------------- Meldungen ----------------
  async announcements(actor: Actor, all = false) {
    const manage = await this.perms.has(actor.userId!, 'announcements.manage');
    const now = new Date();
    const list = await this.prisma.hrAnnouncement.findMany({ where: all && manage ? {} : { publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: [{ publishAt: 'desc' }], take: 200, include: { reads: { where: { userId: actor.userId! }, select: { readAt: true } }, _count: { select: { reads: true } } } });
    const visible = [];
    for (const a of list) if (manage || (await this.inAudience(actor.userId!, a.audienceRoleIds))) visible.push(a);
    const authors = new Map((await this.prisma.user.findMany({ where: { id: { in: visible.map((a) => a.createdById) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return Promise.all(visible.map(async ({ reads, _count, ...a }) => ({ ...a, author: authors.get(a.createdById) ?? '—', readAt: reads[0]?.readAt ?? null, readCount: _count.reads, audienceCount: manage && a.requireAck ? (await this.audience(a.audienceRoleIds)).length : null })));
  }
  async saveAnnouncement(actor: Actor, d: z.infer<typeof announcementSchema>, id?: string) {
    const data = { ...d, publishAt: d.publishAt ? new Date(d.publishAt) : new Date(), expiresAt: d.expiresAt ? new Date(d.expiresAt) : null };
    const before = id ? await this.prisma.hrAnnouncement.findUnique({ where: { id } }) : null;
    if (id && !before) throw new AppError('NOT_FOUND', 'Meldung nicht gefunden.');
    if (before && before.createdById !== actor.userId) await this.perms.assert(actor.userId!, 'announcements.manage');
    const a = id ? await this.prisma.hrAnnouncement.update({ where: { id }, data }) : await this.prisma.hrAnnouncement.create({ data: { ...data, createdById: actor.userId! } });
    await this.core.audit.record(actor, { action: id ? 'announcement.update' : 'announcement.publish', module: 'announcements', entityType: 'HrAnnouncement', entityId: a.id, after: { title: a.title, priority: a.priority } });
    if (!id) {
      // Dashboard-Benachrichtigung an die Zielgruppe; Discord nur, wenn ein Kanal gewählt ist
      const users = await this.audience(a.audienceRoleIds);
      if (users.length) await this.prisma.notification.createMany({ data: users.slice(0, 2000).map((userId) => ({ userId, type: 'ANNOUNCEMENT', title: `${PRIO[a.priority as keyof typeof PRIO]?.e ?? '📢'} ${a.title}`.slice(0, 200), body: a.requireAck ? 'Bitte lesen und bestätigen.' : null, entityType: 'HrAnnouncement', entityId: a.id })) });
      if (a.discordChannelId) await this.core.discord.postMessage(`hr-ann-${a.id}`, a.discordChannelId, { embeds: [{ title: `${PRIO[a.priority as keyof typeof PRIO]?.e ?? '📢'} ${a.title}`.slice(0, 256), description: a.body.slice(0, 4000), color: PRIO[a.priority as keyof typeof PRIO]?.c ?? 0x64748b, footer: a.requireAck ? 'Bitte im Dashboard als gelesen bestätigen.' : undefined, timestamp: a.publishAt.toISOString() }] });
    }
    return a;
  }
  async deleteAnnouncement(actor: Actor, id: string) {
    const a = await this.prisma.hrAnnouncement.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Meldung nicht gefunden.');
    if (a.createdById !== actor.userId) await this.perms.assert(actor.userId!, 'announcements.manage');
    await this.prisma.hrAnnouncement.delete({ where: { id } });
    await this.core.audit.record(actor, { action: 'announcement.delete', module: 'announcements', entityType: 'HrAnnouncement', entityId: id, before: { title: a.title } });
  }
  async ack(actor: Actor, id: string) {
    const a = await this.prisma.hrAnnouncement.findUnique({ where: { id } });
    if (!a || !(await this.inAudience(actor.userId!, a.audienceRoleIds))) throw new AppError('NOT_FOUND', 'Meldung nicht gefunden.');
    await this.prisma.hrAnnouncementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: actor.userId! } }, create: { announcementId: id, userId: actor.userId! }, update: {} });
    await this.prisma.notification.updateMany({ where: { userId: actor.userId!, entityType: 'HrAnnouncement', entityId: id, readAt: null }, data: { readAt: new Date() } });
    return { readAt: new Date() };
  }
  /** Wer hat gelesen / wer noch nicht (announcements.manage oder Verfasser). */
  async readers(actor: Actor, id: string) {
    const a = await this.prisma.hrAnnouncement.findUnique({ where: { id }, include: { reads: true } });
    if (!a) throw new AppError('NOT_FOUND', 'Meldung nicht gefunden.');
    if (a.createdById !== actor.userId) await this.perms.assert(actor.userId!, 'announcements.manage');
    const audience = await this.audience(a.audienceRoleIds);
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set([...audience, ...a.reads.map((r) => r.userId)])] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const read = new Map(a.reads.map((r) => [r.userId, r.readAt]));
    return { total: audience.length, read: a.reads.filter((r) => audience.includes(r.userId)).length, people: audience.map((u) => ({ userId: u, name: users.get(u) ?? '—', readAt: read.get(u) ?? null })).sort((x, y) => Number(!!x.readAt) - Number(!!y.readAt) || x.name.localeCompare(y.name, 'de')) };
  }

  // ---------------- Abstimmungen ----------------
  async polls(actor: Actor) {
    const manage = await this.perms.has(actor.userId!, 'polls.manage');
    const now = new Date();
    const list = await this.prisma.hrPoll.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { votes: true } });
    const out = [];
    for (const p of list) {
      if (!manage && p.createdById !== actor.userId && (!(await this.inAudience(actor.userId!, p.audienceRoleIds)) || p.startsAt > now)) continue;
      const mine = p.votes.find((v) => v.userId === actor.userId);
      const ended = !!p.endsAt && p.endsAt < now;
      const owner = manage || p.createdById === actor.userId;
      const show = owner || p.showResults === 'ALWAYS' || (p.showResults === 'AFTER_VOTE' && !!mine) || (p.showResults === 'AFTER_END' && ended);
      const options = p.options as { id: string; label: string }[];
      const voters = !p.anonymous && show ? new Map((await this.prisma.user.findMany({ where: { id: { in: p.votes.map((v) => v.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName])) : null;
      const { votes, ...rest } = p;
      out.push({
        ...rest, ended, open: p.startsAt <= now && !ended, myVote: mine?.optionIds ?? null, totalVotes: votes.length, canManage: owner,
        results: show ? options.map((o) => ({ id: o.id, label: o.label, count: votes.filter((v) => v.optionIds.includes(o.id)).length, voters: voters ? votes.filter((v) => v.optionIds.includes(o.id)).map((v) => voters.get(v.userId) ?? '—') : null })) : null,
      });
    }
    return out;
  }
  async savePoll(actor: Actor, d: z.infer<typeof pollSchema>, id?: string) {
    const before = id ? await this.prisma.hrPoll.findUnique({ where: { id }, include: { _count: { select: { votes: true } } } }) : null;
    if (id && !before) throw new AppError('NOT_FOUND', 'Abstimmung nicht gefunden.');
    if (before && before.createdById !== actor.userId) await this.perms.assert(actor.userId!, 'polls.manage');
    const prevOpts = (before?.options ?? []) as { id: string; label: string }[];
    if (before && before._count.votes && d.options.length !== prevOpts.length) throw new AppError('CONFLICT', 'Nach den ersten Stimmen können Antworten nur noch umbenannt werden.');
    const options = d.options.map((label, i) => ({ id: prevOpts[i]?.id ?? randomUUID(), label }));
    const data = { title: d.title, description: d.description, options, audienceRoleIds: d.audienceRoleIds, startsAt: d.startsAt ? new Date(d.startsAt) : before?.startsAt ?? new Date(), endsAt: d.endsAt ? new Date(d.endsAt) : null, anonymous: before?._count.votes ? before.anonymous : d.anonymous, multiple: d.multiple, showResults: d.showResults };
    const p = id ? await this.prisma.hrPoll.update({ where: { id }, data }) : await this.prisma.hrPoll.create({ data: { ...data, createdById: actor.userId! } });
    await this.core.audit.record(actor, { action: id ? 'poll.update' : 'poll.create', module: 'polls', entityType: 'HrPoll', entityId: p.id, after: { title: p.title } });
    return p;
  }
  async deletePoll(actor: Actor, id: string) {
    const p = await this.prisma.hrPoll.findUnique({ where: { id } });
    if (!p) throw new AppError('NOT_FOUND', 'Abstimmung nicht gefunden.');
    if (p.createdById !== actor.userId) await this.perms.assert(actor.userId!, 'polls.manage');
    await this.prisma.hrPoll.delete({ where: { id } });
    await this.core.audit.record(actor, { action: 'poll.delete', module: 'polls', entityType: 'HrPoll', entityId: id, before: { title: p.title } });
  }
  async vote(actor: Actor, id: string, optionIds: string[]) {
    const p = await this.prisma.hrPoll.findUnique({ where: { id } });
    const now = new Date();
    if (!p || !(await this.inAudience(actor.userId!, p.audienceRoleIds))) throw new AppError('NOT_FOUND', 'Abstimmung nicht gefunden.');
    if (p.startsAt > now || (p.endsAt && p.endsAt < now)) throw new AppError('CONFLICT', 'Die Abstimmung ist nicht offen.');
    const valid = new Set((p.options as { id: string }[]).map((o) => o.id));
    const ids = [...new Set(optionIds)].filter((o) => valid.has(o));
    if (!ids.length || (!p.multiple && ids.length > 1)) throw new AppError('VALIDATION_FAILED', p.multiple ? 'Bitte mindestens eine Antwort wählen.' : 'Bitte genau eine Antwort wählen.');
    await this.prisma.hrPollVote.upsert({ where: { pollId_userId: { pollId: id, userId: actor.userId! } }, create: { pollId: id, userId: actor.userId!, optionIds: ids }, update: { optionIds: ids, votedAt: now } });
    return { voted: true };
  }
}
