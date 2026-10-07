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
exports.PersonsService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const studio_service_1 = require("../studio/studio.service");
const errors_1 = require("../common/errors");
const pagination_1 = require("../common/pagination");
const roblox_service_1 = require("./roblox.service");
const locks_service_1 = require("../locks/locks.service");
let PersonsService = class PersonsService {
    prisma;
    audit;
    timeline;
    studio;
    roblox;
    locks;
    constructor(prisma, audit, timeline, studio, roblox, locks) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.studio = studio;
        this.roblox = roblox;
        this.locks = locks;
    }
    async list(p, includeArchived = false) {
        const where = {
            ...(includeArchived ? {} : { status: 'ACTIVE' }),
            ...(p.q ? { OR: [{ robloxUsername: { contains: p.q, mode: 'insensitive' } }, { robloxUserId: p.q }, { aliases: { has: p.q } }] } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.person.findMany({ where, orderBy: { robloxUsername: 'asc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.person.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const person = await this.prisma.person.findUnique({ where: { id }, include: { vehicles: true } });
        if (!person)
            throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
        return person;
    }
    async overview(id) {
        const person = await this.get(id);
        const [tickets, links, timeline] = await Promise.all([
            this.prisma.ticket.findMany({ where: { personId: id }, orderBy: { issuedAt: 'desc' }, take: 50 }),
            this.prisma.recordLink.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 200 }),
            this.timeline.list('Person', id),
        ]);
        return { person, tickets, links, timeline };
    }
    /** Mögliche Duplikate: gleiche Roblox-ID (hart, Unique) oder gleicher Username (weich → Hinweis, kein Auto-Merge). */
    async findDuplicates(robloxUsername, robloxUserId) {
        return this.prisma.person.findMany({
            where: { OR: [...(robloxUserId ? [{ robloxUserId }] : []), { robloxUsername: { equals: robloxUsername, mode: 'insensitive' } }] },
            select: { id: true, robloxUsername: true, robloxUserId: true, status: true },
        });
    }
    async create(actor, d) {
        const custom = await this.studio.check('persons', d.custom);
        if (d.robloxUserId && !(0, shared_1.isValidRobloxUserId)(d.robloxUserId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
        // Nur Name oder nur ID angegeben → das Fehlende bei Roblox nachschlagen (Name in der richtigen Schreibweise)
        if (!d.robloxUserId) {
            const r = await this.roblox.lookup(d.robloxUsername).catch(() => null);
            if (r)
                d = { ...d, robloxUsername: r.name, robloxUserId: r.id };
        }
        const dups = await this.findDuplicates(d.robloxUsername, d.robloxUserId);
        const hard = dups.find((x) => d.robloxUserId && x.robloxUserId === d.robloxUserId);
        if (hard)
            throw new errors_1.AppError('CONFLICT', 'A person with this Roblox user id already exists.', { existingId: hard.id });
        const person = await this.prisma.$transaction(async (tx) => {
            const created = await tx.person.create({ data: { robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId ?? null, aliases: d.aliases ?? [], notes: d.notes, custom: custom, createdById: actor.userId } });
            await this.timeline.add(tx, { entityType: 'Person', entityId: created.id, action: 'person.created', summary: 'Person record created', actorId: actor.userId });
            await this.audit.record(actor, { action: 'person.create', module: 'persons', entityType: 'Person', entityId: created.id, after: created }, tx);
            return created;
        });
        return { person, possibleDuplicates: dups };
    }
    async update(actor, id, version, d) {
        await this.locks.assertFree('person', id, actor.userId);
        const before = await this.get(id);
        const { custom: rawCustom, ...rest } = d;
        const custom = rawCustom ? await this.studio.check('persons', rawCustom, before.custom) : undefined;
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.person.updateMany({ where: { id, version }, data: { ...rest, ...(custom ? { custom: custom } : {}), version: { increment: 1 } } });
            if (r.count === 0)
                throw new errors_1.AppError('CONFLICT', 'The record was modified by someone else. Reload and retry.');
            const after = await tx.person.findUniqueOrThrow({ where: { id } });
            await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.updated', summary: 'Person record updated', actorId: actor.userId });
            await this.audit.record(actor, { action: 'person.update', module: 'persons', entityType: 'Person', entityId: id, before, after }, tx);
            return after;
        });
    }
    async archive(actor, id, reason) {
        const before = await this.get(id);
        return this.prisma.$transaction(async (tx) => {
            const after = await tx.person.update({ where: { id }, data: { status: 'ARCHIVED', version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.archived', summary: 'Person record archived', actorId: actor.userId });
            await this.audit.record(actor, { action: 'person.archive', module: 'persons', entityType: 'Person', entityId: id, before: { status: before.status }, after: { status: after.status }, reason }, tx);
            return after;
        });
    }
    /** Merge nur auf ausdrückliche Bestätigung (nie automatisch). Quelle wird archiviert, nichts wird gelöscht. */
    async merge(actor, sourceId, targetId, reason) {
        if (sourceId === targetId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Source and target must differ.');
        return this.prisma.$transaction(async (tx) => {
            const [src, dst] = await Promise.all([tx.person.findUnique({ where: { id: sourceId } }), tx.person.findUnique({ where: { id: targetId } })]);
            if (!src || !dst)
                throw new errors_1.AppError('NOT_FOUND', 'Person not found.');
            if (src.status !== 'ACTIVE' || dst.status !== 'ACTIVE')
                throw new errors_1.AppError('CONFLICT', 'Both persons must be active.');
            if (src.robloxUserId && dst.robloxUserId && src.robloxUserId !== dst.robloxUserId)
                throw new errors_1.AppError('CONFLICT', 'Persons have different Roblox user ids.');
            // Links umhängen, dabei Duplikate (gleiche Entität+Rolle) verwerfen
            const links = await tx.recordLink.findMany({ where: { personId: sourceId } });
            for (const l of links) {
                const exists = await tx.recordLink.findFirst({ where: { personId: targetId, entityType: l.entityType, entityId: l.entityId, role: l.role } });
                if (exists)
                    await tx.recordLink.delete({ where: { id: l.id } });
                else
                    await tx.recordLink.update({ where: { id: l.id }, data: { personId: targetId } });
            }
            await tx.ticket.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
            await tx.vehicle.updateMany({ where: { ownerId: sourceId }, data: { ownerId: targetId } });
            await tx.wantedRecord.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
            await tx.timelineEvent.updateMany({ where: { entityType: 'Person', entityId: sourceId }, data: { entityId: targetId } });
            const robloxUserId = dst.robloxUserId ?? src.robloxUserId;
            await tx.person.update({ where: { id: sourceId }, data: { status: 'ARCHIVED', robloxUserId: null, notes: `${src.notes ?? ''}\n[merged into ${targetId}]`.trim(), version: { increment: 1 } } });
            const merged = await tx.person.update({ where: { id: targetId }, data: { robloxUserId, aliases: [...new Set([...dst.aliases, ...src.aliases, src.robloxUsername])].filter((a) => a !== dst.robloxUsername), version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Person', entityId: targetId, action: 'person.merged', summary: `Merged record ${src.robloxUsername}`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'person.merge', module: 'persons', entityType: 'Person', entityId: targetId, before: { source: src, target: dst }, after: merged, reason }, tx);
            return merged;
        });
    }
};
exports.PersonsService = PersonsService;
exports.PersonsService = PersonsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, studio_service_1.StudioService, roblox_service_1.RobloxService, locks_service_1.LocksService])
], PersonsService);
//# sourceMappingURL=persons.service.js.map