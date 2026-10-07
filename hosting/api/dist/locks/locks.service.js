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
exports.LocksService = exports.LOCK_TYPE_KEYS = exports.LOCK_TYPES = exports.LOCK_TTL_MS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const realtime_service_1 = require("../realtime/realtime.service");
const errors_1 = require("../common/errors");
/** Ohne Lebenszeichen (alle 30 s aus dem geöffneten Formular) läuft die Sperre nach 90 s ab. */
exports.LOCK_TTL_MS = 90_000;
/** Sperrbare Datensätze: wer die Sperre sehen darf (eins davon) und wer bearbeiten/sperren darf (eins davon). */
exports.LOCK_TYPES = {
    person: { view: ['persons.view'], edit: ['persons.edit'] },
    incident: { view: ['incidents.view', 'cad.view'], edit: ['incidents.edit', 'cad.edit_incident'] },
    report: { view: ['reports.view'], edit: ['reports.create'] },
    personnel: { view: ['personnel.view'], edit: ['personnel.edit'] },
};
exports.LOCK_TYPE_KEYS = Object.keys(exports.LOCK_TYPES);
/**
 * Datensatz-Sperre beim Bearbeiten: Wer ein Formular öffnet, sperrt den Datensatz; andere sehen „wird gerade von X bearbeitet“
 * und können erst speichern, wenn die Sperre frei ist (oder sie sie bewusst übernehmen – wird protokolliert).
 * Ergänzt die Versionsprüfung (optimistic locking) der einzelnen Module.
 */
let LocksService = class LocksService {
    prisma;
    audit;
    perms;
    realtime;
    constructor(prisma, audit, perms, realtime) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.realtime = realtime;
    }
    async assertAny(userId, keys) {
        for (const k of keys)
            if (await this.perms.has(userId, k))
                return;
        throw new errors_1.AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
    }
    async holder(type, id) {
        const l = await this.prisma.editLock.findUnique({ where: { entityType_entityId: { entityType: type, entityId: id } }, include: { user: { select: { id: true, displayName: true } } } });
        return l && l.expiresAt > new Date() ? l : null;
    }
    view(l, userId) {
        return l ? { locked: true, mine: l.userId === userId, holder: { id: l.user.id, displayName: l.user.displayName }, since: l.createdAt, expiresAt: l.expiresAt } : { locked: false, mine: false };
    }
    async status(actor, type, id) {
        await this.assertAny(actor.userId, exports.LOCK_TYPES[type].view);
        return this.view(await this.holder(type, id), actor.userId);
    }
    /** Sperren oder verlängern. Gehört die Sperre jemand anderem: `ok: false` mit Name – außer bei `force` (Übernahme, protokolliert). */
    async acquire(actor, type, id, force = false) {
        const me = actor.userId;
        await this.assertAny(me, exports.LOCK_TYPES[type].edit);
        const now = new Date(), expiresAt = new Date(now.getTime() + exports.LOCK_TTL_MS);
        const key = { entityType: type, entityId: id };
        // eigene Sperre verlängern oder abgelaufene übernehmen
        const mine = await this.prisma.editLock.updateMany({ where: { ...key, userId: me }, data: { expiresAt } });
        if (!mine.count) {
            const stale = await this.prisma.editLock.updateMany({ where: { ...key, expiresAt: { lt: now } }, data: { userId: me, createdAt: now, expiresAt } });
            if (!stale.count) {
                try {
                    await this.prisma.editLock.create({ data: { ...key, userId: me, expiresAt } });
                }
                catch (e) {
                    if (!(e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
                        throw e;
                    const other = await this.holder(type, id);
                    if (other && other.userId !== me && !force)
                        return { ok: false, ...this.view(other, me) };
                    await this.prisma.$transaction(async (tx) => {
                        await tx.editLock.update({ where: { entityType_entityId: key }, data: { userId: me, createdAt: now, expiresAt } });
                        if (other && other.userId !== me)
                            await this.audit.record(actor, { action: 'lock.takeover', module: 'locks', entityType: type, entityId: id, before: { holder: other.userId } }, tx);
                    });
                    if (other && other.userId !== me)
                        this.realtime.publishToUser(other.userId, 'lock.taken', { entityType: type, entityId: id });
                }
            }
        }
        return { ok: true, ...this.view(await this.holder(type, id), me) };
    }
    async release(actor, type, id) {
        await this.prisma.editLock.deleteMany({ where: { entityType: type, entityId: id, userId: actor.userId } });
    }
    /** Beim Speichern: Hält jemand anderes die Sperre, wird abgelehnt. */
    async assertFree(type, id, userId) {
        const l = await this.holder(type, id);
        if (l && l.userId !== userId)
            throw new errors_1.AppError('CONFLICT', `Wird gerade von ${l.user.displayName} bearbeitet. Bitte warten oder die Bearbeitung übernehmen.`, { lockedBy: l.user.displayName });
    }
};
exports.LocksService = LocksService;
exports.LocksService = LocksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, realtime_service_1.RealtimeService])
], LocksService);
//# sourceMappingURL=locks.service.js.map