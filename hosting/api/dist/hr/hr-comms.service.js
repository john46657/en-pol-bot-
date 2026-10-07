"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrCommsService = exports.pollSchema = exports.announcementSchema = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const hr_core_service_1 = require("./hr-core.service");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
exports.announcementSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(200), body: zod_1.z.string().trim().min(1).max(8000), priority: zod_1.z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
    audienceRoleIds: zod_1.z.array(zod_1.z.string().uuid()).max(30).default([]), publishAt: zod_1.z.string().datetime({ offset: true }).optional(), expiresAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
    requireAck: zod_1.z.boolean().default(false), discordChannelId: sf.nullable().default(null), attachments: zod_1.z.array(zod_1.z.string().uuid()).max(10).default([]),
});
exports.pollSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(200), description: zod_1.z.string().max(4000).nullable().default(null), options: zod_1.z.array(zod_1.z.string().trim().min(1).max(200)).min(2).max(20),
    audienceRoleIds: zod_1.z.array(zod_1.z.string().uuid()).max(30).default([]), startsAt: zod_1.z.string().datetime({ offset: true }).optional(), endsAt: zod_1.z.string().datetime({ offset: true }).nullable().optional(),
    anonymous: zod_1.z.boolean().default(false), multiple: zod_1.z.boolean().default(false), showResults: zod_1.z.enum(['ALWAYS', 'AFTER_VOTE', 'AFTER_END', 'NEVER']).default('AFTER_VOTE'),
});
const PRIO = { LOW: { e: '🔵', c: 0x3b82f6 }, NORMAL: { e: '📢', c: 0x64748b }, HIGH: { e: '🟠', c: 0xf97316 }, CRITICAL: { e: '🔴', c: 0xef4444 } };
/** Interne Meldungen (Zielgruppe, Priorität, Zeitraum, Lesebestätigung, Discord) und Abstimmungen. */
let HrCommsService = class HrCommsService {
    core;
    perms;
    constructor(core, perms) {
        this.core = core;
        this.perms = perms;
    }
    get prisma() { return this.core.prisma; }
    /** Gehört der Benutzer zur Zielgruppe (Dashboard-Rollen; leer = alle)? */
    async inAudience(userId, roleIds) {
        if (!roleIds.length)
            return true;
        const mine = await this.perms.roleIdsFor(userId);
        return roleIds.some((r) => mine.includes(r));
    }
    /** Alle aktiven Benutzer der Zielgruppe (für „47 von 52 gelesen“). */
    async audience(roleIds) {
        if (!roleIds.length)
            return (await this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED', 'INACTIVE'] }, user: { active: true } }, select: { userId: true } })).map((p) => p.userId);
        return [...new Set((await this.prisma.userRole.findMany({ where: { roleId: { in: roleIds }, user: { active: true } }, select: { userId: true } })).map((u) => u.userId))];
    }
    // ---------------- Meldungen ----------------
    async announcements(actor, all = false) {
        const manage = await this.perms.has(actor.userId, 'announcements.manage');
        const now = new Date();
        const list = await this.prisma.hrAnnouncement.findMany({ where: all && manage ? {} : { publishAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: [{ publishAt: 'desc' }], take: 200, include: { reads: { where: { userId: actor.userId }, select: { readAt: true } }, _count: { select: { reads: true } } } });
        const visible = [];
        for (const a of list)
            if (manage || (await this.inAudience(actor.userId, a.audienceRoleIds)))
                visible.push(a);
        const authors = new Map((await this.prisma.user.findMany({ where: { id: { in: visible.map((a) => a.createdById) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return Promise.all(visible.map(async ({ reads, _count, ...a }) => ({ ...a, author: authors.get(a.createdById) ?? '—', readAt: reads[0]?.readAt ?? null, readCount: _count.reads, audienceCount: manage && a.requireAck ? (await this.audience(a.audienceRoleIds)).length : null })));
    }
    async saveAnnouncement(actor, d, id) {
        const data = { ...d, publishAt: d.publishAt ? new Date(d.publishAt) : new Date(), expiresAt: d.expiresAt ? new Date(d.expiresAt) : null };
        const before = id ? await this.prisma.hrAnnouncement.findUnique({ where: { id } }) : null;
        if (id && !before)
            throw new errors_1.AppError('NOT_FOUND', 'Meldung nicht gefunden.');
        if (before && before.createdById !== actor.userId)
            await this.perms.assert(actor.userId, 'announcements.manage');
        const a = id ? await this.prisma.hrAnnouncement.update({ where: { id }, data }) : await this.prisma.hrAnnouncement.create({ data: { ...data, createdById: actor.userId } });
        await this.core.audit.record(actor, { action: id ? 'announcement.update' : 'announcement.publish', module: 'announcements', entityType: 'HrAnnouncement', entityId: a.id, after: { title: a.title, priority: a.priority } });
        if (!id) {
            // Dashboard-Benachrichtigung an die Zielgruppe; Discord nur, wenn ein Kanal gewählt ist
            const users = await this.audience(a.audienceRoleIds);
            if (users.length)
                await this.prisma.notification.createMany({ data: users.slice(0, 2000).map((userId) => ({ userId, type: 'ANNOUNCEMENT', title: `${PRIO[a.priority]?.e ?? '📢'} ${a.title}`.slice(0, 200), body: a.requireAck ? 'Bitte lesen und bestätigen.' : null, entityType: 'HrAnnouncement', entityId: a.id })) });
            if (a.discordChannelId)
                await this.core.discord.postMessage(`hr-ann-${a.id}`, a.discordChannelId, { embeds: [{ title: `${PRIO[a.priority]?.e ?? '📢'} ${a.title}`.slice(0, 256), description: a.body.slice(0, 4000), color: PRIO[a.priority]?.c ?? 0x64748b, footer: a.requireAck ? 'Bitte im Dashboard als gelesen bestätigen.' : undefined, timestamp: a.publishAt.toISOString() }] });
        }
        return a;
    }
    async deleteAnnouncement(actor, id) {
        const a = await this.prisma.hrAnnouncement.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Meldung nicht gefunden.');
        if (a.createdById !== actor.userId)
            await this.perms.assert(actor.userId, 'announcements.manage');
        await this.prisma.hrAnnouncement.delete({ where: { id } });
        await this.core.audit.record(actor, { action: 'announcement.delete', module: 'announcements', entityType: 'HrAnnouncement', entityId: id, before: { title: a.title } });
    }
    async ack(actor, id) {
        const a = await this.prisma.hrAnnouncement.findUnique({ where: { id } });
        if (!a || !(await this.inAudience(actor.userId, a.audienceRoleIds)))
            throw new errors_1.AppError('NOT_FOUND', 'Meldung nicht gefunden.');
        await this.prisma.hrAnnouncementRead.upsert({ where: { announcementId_userId: { announcementId: id, userId: actor.userId } }, create: { announcementId: id, userId: actor.userId }, update: {} });
        await this.prisma.notification.updateMany({ where: { userId: actor.userId, entityType: 'HrAnnouncement', entityId: id, readAt: null }, data: { readAt: new Date() } });
        return { readAt: new Date() };
    }
    /** Wer hat gelesen / wer noch nicht (announcements.manage oder Verfasser). */
    async readers(actor, id) {
        const a = await this.prisma.hrAnnouncement.findUnique({ where: { id }, include: { reads: true } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Meldung nicht gefunden.');
        if (a.createdById !== actor.userId)
            await this.perms.assert(actor.userId, 'announcements.manage');
        const audience = await this.audience(a.audienceRoleIds);
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set([...audience, ...a.reads.map((r) => r.userId)])] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        const read = new Map(a.reads.map((r) => [r.userId, r.readAt]));
        return { total: audience.length, read: a.reads.filter((r) => audience.includes(r.userId)).length, people: audience.map((u) => ({ userId: u, name: users.get(u) ?? '—', readAt: read.get(u) ?? null })).sort((x, y) => Number(!!x.readAt) - Number(!!y.readAt) || x.name.localeCompare(y.name, 'de')) };
    }
    // ---------------- Abstimmungen ----------------
    async polls(actor) {
        const manage = await this.perms.has(actor.userId, 'polls.manage');
        const now = new Date();
        const list = await this.prisma.hrPoll.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { votes: true } });
        const out = [];
        for (const p of list) {
            if (!manage && p.createdById !== actor.userId && (!(await this.inAudience(actor.userId, p.audienceRoleIds)) || p.startsAt > now))
                continue;
            const mine = p.votes.find((v) => v.userId === actor.userId);
            const ended = !!p.endsAt && p.endsAt < now;
            const owner = manage || p.createdById === actor.userId;
            const show = owner || p.showResults === 'ALWAYS' || (p.showResults === 'AFTER_VOTE' && !!mine) || (p.showResults === 'AFTER_END' && ended);
            const options = p.options;
            const voters = !p.anonymous && show ? new Map((await this.prisma.user.findMany({ where: { id: { in: p.votes.map((v) => v.userId) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName])) : null;
            const { votes, ...rest } = p;
            out.push({
                ...rest, ended, open: p.startsAt <= now && !ended, myVote: mine?.optionIds ?? null, totalVotes: votes.length, canManage: owner,
                results: show ? options.map((o) => ({ id: o.id, label: o.label, count: votes.filter((v) => v.optionIds.includes(o.id)).length, voters: voters ? votes.filter((v) => v.optionIds.includes(o.id)).map((v) => voters.get(v.userId) ?? '—') : null })) : null,
            });
        }
        return out;
    }
    async savePoll(actor, d, id) {
        const before = id ? await this.prisma.hrPoll.findUnique({ where: { id }, include: { _count: { select: { votes: true } } } }) : null;
        if (id && !before)
            throw new errors_1.AppError('NOT_FOUND', 'Abstimmung nicht gefunden.');
        if (before && before.createdById !== actor.userId)
            await this.perms.assert(actor.userId, 'polls.manage');
        const prevOpts = (before?.options ?? []);
        if (before && before._count.votes && d.options.length !== prevOpts.length)
            throw new errors_1.AppError('CONFLICT', 'Nach den ersten Stimmen können Antworten nur noch umbenannt werden.');
        const options = d.options.map((label, i) => ({ id: prevOpts[i]?.id ?? (0, node_crypto_1.randomUUID)(), label }));
        const data = { title: d.title, description: d.description, options, audienceRoleIds: d.audienceRoleIds, startsAt: d.startsAt ? new Date(d.startsAt) : before?.startsAt ?? new Date(), endsAt: d.endsAt ? new Date(d.endsAt) : null, anonymous: before?._count.votes ? before.anonymous : d.anonymous, multiple: d.multiple, showResults: d.showResults };
        const p = id ? await this.prisma.hrPoll.update({ where: { id }, data }) : await this.prisma.hrPoll.create({ data: { ...data, createdById: actor.userId } });
        await this.core.audit.record(actor, { action: id ? 'poll.update' : 'poll.create', module: 'polls', entityType: 'HrPoll', entityId: p.id, after: { title: p.title } });
        return p;
    }
    async deletePoll(actor, id) {
        const p = await this.prisma.hrPoll.findUnique({ where: { id } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Abstimmung nicht gefunden.');
        if (p.createdById !== actor.userId)
            await this.perms.assert(actor.userId, 'polls.manage');
        await this.prisma.hrPoll.delete({ where: { id } });
        await this.core.audit.record(actor, { action: 'poll.delete', module: 'polls', entityType: 'HrPoll', entityId: id, before: { title: p.title } });
    }
    async vote(actor, id, optionIds) {
        const p = await this.prisma.hrPoll.findUnique({ where: { id } });
        const now = new Date();
        if (!p || !(await this.inAudience(actor.userId, p.audienceRoleIds)))
            throw new errors_1.AppError('NOT_FOUND', 'Abstimmung nicht gefunden.');
        if (p.startsAt > now || (p.endsAt && p.endsAt < now))
            throw new errors_1.AppError('CONFLICT', 'Die Abstimmung ist nicht offen.');
        const valid = new Set(p.options.map((o) => o.id));
        const ids = [...new Set(optionIds)].filter((o) => valid.has(o));
        if (!ids.length || (!p.multiple && ids.length > 1))
            throw new errors_1.AppError('VALIDATION_FAILED', p.multiple ? 'Bitte mindestens eine Antwort wählen.' : 'Bitte genau eine Antwort wählen.');
        await this.prisma.hrPollVote.upsert({ where: { pollId_userId: { pollId: id, userId: actor.userId } }, create: { pollId: id, userId: actor.userId, optionIds: ids }, update: { optionIds: ids, votedAt: now } });
        return { voted: true };
    }
};
exports.HrCommsService = HrCommsService;
exports.HrCommsService = HrCommsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, permission_service_1.PermissionService])
], HrCommsService);
//# sourceMappingURL=hr-comms.service.js.map