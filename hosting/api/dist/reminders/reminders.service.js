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
exports.RemindersService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const errors_1 = require("../common/errors");
/** Ab dieser Verspätung (Bot/API waren aus) wird in der Erinnerung vermerkt, dass sie verspätet kommt. */
const LATE_MS = 2 * 60_000;
const view = (r) => ({ id: r.id, text: r.text, dm: r.dm, dueAt: r.dueAt.toISOString(), status: r.status, fireCount: r.fireCount, channelId: r.channelId, createdAt: r.createdAt.toISOString() });
/**
 * Persönliche Erinnerungen (`/remind-me`). Gespeichert in der Datenbank → überstehen Neustarts von Bot und API.
 * `tick` legt fällige Erinnerungen genau einmal in die Bot-Warteschlange: Statuswechsel PENDING → SENT und Eintrag in die
 * Outbox passieren in einer Transaktion, nur wenn die Zeile noch unverändert ist (auch bei mehreren API-Instanzen).
 * Nach einem Ausfall werden verpasste Erinnerungen einmal (mit Hinweis „verspätet“) zugestellt, nie mehrfach.
 */
let RemindersService = class RemindersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(d, now = new Date()) {
        const text = d.text.trim();
        if (!text)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte angeben, woran ich dich erinnern soll.');
        if (text.length > shared_1.REMINDER_TEXT_MAX)
            throw new errors_1.AppError('VALIDATION_FAILED', `Der Erinnerungstext darf höchstens ${shared_1.REMINDER_TEXT_MAX} Zeichen lang sein.`);
        if (!Number.isFinite(d.delayMs) || d.delayMs < shared_1.REMINDER_MIN_MS || d.delayMs > shared_1.REMINDER_MAX_MS)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Zeit muss zwischen 1 Minute und 365 Tagen liegen.');
        // ohne Kanal (Befehl in einer Direktnachricht) bleibt nur die DM
        const dm = d.dm || !d.channelId;
        const dueAt = new Date(now.getTime() + d.delayMs);
        // gleiche Erinnerung kurz hintereinander (doppelt abgeschickt) → die vorhandene zurückgeben
        const dup = await this.prisma.reminder.findFirst({ where: { discordId: d.discordId, status: 'PENDING', text, createdAt: { gte: new Date(now.getTime() - 10_000) }, dueAt: { gte: new Date(dueAt.getTime() - 10_000), lte: new Date(dueAt.getTime() + 10_000) } } });
        if (dup)
            return { ...view(dup), duplicate: true };
        if ((await this.prisma.reminder.count({ where: { discordId: d.discordId, status: 'PENDING' } })) >= shared_1.REMINDER_MAX_PENDING) {
            throw new errors_1.AppError('CONFLICT', `Du hast schon ${shared_1.REMINDER_MAX_PENDING} offene Erinnerungen. Lösche zuerst eine mit /erinnerungen.`);
        }
        const r = await this.prisma.reminder.create({ data: { discordId: d.discordId, guildId: d.guildId ?? null, channelId: d.channelId ?? null, text, dm, dueAt } });
        return { ...view(r), duplicate: false };
    }
    async list(discordId) {
        return (await this.prisma.reminder.findMany({ where: { discordId, status: 'PENDING' }, orderBy: { dueAt: 'asc' }, take: shared_1.REMINDER_MAX_PENDING })).map(view);
    }
    async own(id, discordId) {
        const r = await this.prisma.reminder.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Diese Erinnerung gibt es nicht mehr.');
        if (r.discordId !== discordId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Das ist nicht deine Erinnerung.');
        return r;
    }
    async cancel(id, discordId) {
        await this.own(id, discordId);
        const n = await this.prisma.reminder.updateMany({ where: { id, discordId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
        if (!n.count)
            throw new errors_1.AppError('CONFLICT', 'Diese Erinnerung ist nicht mehr offen.');
        return { ok: true };
    }
    /**
     * Verschieben (Buttons 10 Min/30 Min/1 Std/1 Tag) bzw. erledigt. `fire` = Auslösung, zu der der Button gehört: nur der
     * erste Klick zählt, weitere (auch auf alten Nachrichten) werden mit Hinweis abgewiesen – keine doppelten Erinnerungen.
     */
    async snooze(id, discordId, fire, minutes, now = new Date()) {
        if (!shared_1.REMINDER_SNOOZE_MINUTES.includes(minutes))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Zeit zum Verschieben.');
        const r = await this.own(id, discordId);
        const dueAt = new Date(now.getTime() + minutes * 60_000);
        const n = await this.prisma.reminder.updateMany({ where: { id, discordId, status: 'SENT', fireCount: fire }, data: { status: 'PENDING', dueAt } });
        if (!n.count)
            throw await this.conflict(id, 'Diese Erinnerung wurde bereits erledigt oder gelöscht.');
        return view({ ...r, status: 'PENDING', dueAt });
    }
    async done(id, discordId, fire) {
        await this.own(id, discordId);
        const n = await this.prisma.reminder.updateMany({ where: { id, discordId, status: 'SENT', fireCount: fire }, data: { status: 'DONE' } });
        if (!n.count)
            throw await this.conflict(id, 'Diese Erinnerung ist schon erledigt.');
        return { ok: true };
    }
    /** Klick ging ins Leere: mit dem aktuellen Stand erklären (z. B. zweiter, gleichzeitiger Klick). */
    async conflict(id, otherwise) {
        const now = await this.prisma.reminder.findUnique({ where: { id }, select: { status: true } });
        return new errors_1.AppError('CONFLICT', now?.status === 'PENDING' ? 'Diese Erinnerung wurde bereits verschoben.' : otherwise);
    }
    /** Fällige Erinnerungen genau einmal an den Bot übergeben. */
    async tick(now = new Date()) {
        const due = await this.prisma.reminder.findMany({ where: { status: 'PENDING', dueAt: { lte: now } }, orderBy: { dueAt: 'asc' }, take: 200 });
        let sent = 0;
        for (const r of due) {
            const claimed = await this.prisma.$transaction(async (tx) => {
                const c = await tx.reminder.updateMany({ where: { id: r.id, status: 'PENDING', fireCount: r.fireCount, dueAt: r.dueAt }, data: { status: 'SENT', sentAt: now, fireCount: { increment: 1 } } });
                if (!c.count)
                    return false;
                const late = now.getTime() - r.dueAt.getTime();
                await tx.discordOutbox.create({ data: { type: 'reminder.due', channelKey: 'reminders', payload: {
                            id: r.id, discordId: r.discordId, channelId: r.channelId, dm: r.dm, text: r.text, fire: r.fireCount + 1,
                            createdAt: r.createdAt.toISOString(), dueAt: r.dueAt.toISOString(), ...(late >= LATE_MS ? { lateMinutes: Math.round(late / 60_000) } : {}),
                        } } });
                return true;
            });
            if (claimed)
                sent++;
        }
        return { sent };
    }
};
exports.RemindersService = RemindersService;
exports.RemindersService = RemindersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RemindersService);
//# sourceMappingURL=reminders.service.js.map