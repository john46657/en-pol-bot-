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
exports.TicketsService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const links_1 = require("../common/links");
const numbering_1 = require("../common/numbering");
const pagination_1 = require("../common/pagination");
const guild_context_1 = require("../common/guild-context");
const erlc_service_1 = require("../cad/erlc.service");
const notify_service_1 = require("../notifications/notify.service");
let TicketsService = class TicketsService {
    prisma;
    audit;
    timeline;
    erlc;
    notify;
    constructor(prisma, audit, timeline, erlc, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.erlc = erlc;
        this.notify = notify;
    }
    /**
     * Spieler, die gerade auf einem verbundenen ER:LC-Server sind (ohne Polizei/Sheriff) – für „Strafzettel an Spieler im Spiel“.
     * Mit Personenakte (sofern schon vorhanden), Ort und den Kennzeichen ihrer gespawnten Fahrzeuge.
     */
    async erlcPlayers() {
        const servers = await this.prisma.erlcServer.findMany({ where: { active: true }, select: { id: true, name: true, guildId: true, snapshot: true, features: true } });
        const out = [];
        for (const s of servers) {
            const snap = s.snapshot;
            for (const p of snap?.players ?? []) {
                if (['police', 'sheriff'].includes(p.team?.toLowerCase() ?? ''))
                    continue;
                out.push({ serverId: s.id, serverName: s.name, name: p.name, robloxUserId: p.id, team: p.team, location: p.location ? [p.location.street, p.location.postal && `PLZ ${p.location.postal}`].filter(Boolean).join(' · ') || null : null,
                    plates: (snap?.vehicles ?? []).filter((v) => v.owner.toLowerCase() === p.name.toLowerCase() && v.plate).map((v) => v.plate), personId: null, canMessage: s.features.includes('commands') });
            }
        }
        const ids = out.map((p) => p.robloxUserId).filter((x) => !!x);
        const persons = ids.length ? await this.prisma.person.findMany({ where: { status: 'ACTIVE', robloxUserId: { in: ids } }, select: { id: true, robloxUserId: true } }) : [];
        for (const p of out)
            p.personId = persons.find((x) => x.robloxUserId === p.robloxUserId)?.id ?? null;
        return out.sort((a, b) => a.name.localeCompare(b.name));
    }
    /** Personenakte zu einem Spieler aus ER:LC finden oder anlegen (wie der automatische Abgleich). */
    async personForErlc(actor, p) {
        const srv = await this.prisma.erlcServer.findUnique({ where: { id: p.serverId }, select: { guildId: true, snapshot: true } });
        const player = (srv?.snapshot?.players ?? []).find((x) => x.name.toLowerCase() === p.name.toLowerCase());
        if (!srv || !player?.id)
            throw new errors_1.AppError('NOT_FOUND', `„${p.name}“ ist gerade nicht im Spiel.`);
        const space = (0, guild_context_1.recordSpace)(srv.guildId) ?? null;
        const hit = await this.prisma.person.findFirst({ where: { serverId: space, OR: [{ robloxUserId: player.id }, { robloxUsername: { equals: player.name, mode: 'insensitive' } }] } });
        if (hit)
            return { person: hit, player };
        const person = await this.prisma.$transaction(async (tx) => {
            const c = await tx.person.create({ data: { serverId: space, robloxUsername: player.name, robloxUserId: player.id, notes: 'Automatisch aus ER:LC angelegt (Strafzettel).' } });
            await this.timeline.add(tx, { entityType: 'Person', entityId: c.id, action: 'person.created', summary: 'Personenakte aus ER:LC angelegt', actorId: actor.userId ?? null });
            await this.audit.record(actor, { action: 'person.create', module: 'persons', entityType: 'Person', entityId: c.id, after: { robloxUsername: c.robloxUsername, robloxUserId: c.robloxUserId, source: 'ERLC' } }, tx);
            return c;
        });
        return { person, player };
    }
    /** Strafzettel – entweder für eine Personenakte oder direkt für einen Spieler im Spiel (ER:LC), optional mit Nachricht im Spiel. */
    async issue(actor, d) {
        let personId = d.personId;
        let target = null;
        if (d.erlcPlayer) {
            const r = await this.personForErlc(actor, d.erlcPlayer);
            personId = r.person.id;
            target = { serverId: d.erlcPlayer.serverId, name: r.player.name };
        }
        if (!personId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine Person oder einen Spieler im Spiel auswählen.');
        const ticket = await this.create(actor, { personId, legalCodeId: d.legalCodeId, reason: d.reason, amount: d.amount, notes: d.notes, reportId: d.reportId });
        // Im Spiel Bescheid geben (ER:LC-Befehl :pm) – ein Fehler hier macht den Strafzettel nicht ungültig
        let inGame = null;
        if (d.notifyInGame) {
            if (!target) {
                const person = await this.prisma.person.findUnique({ where: { id: personId }, select: { robloxUsername: true, robloxUserId: true } });
                const online = (await this.erlcPlayers()).find((p) => (person?.robloxUserId && p.robloxUserId === person.robloxUserId) || p.name.toLowerCase() === person?.robloxUsername.toLowerCase());
                if (online)
                    target = { serverId: online.serverId, name: online.name };
            }
            if (!target)
                inGame = { ok: false, message: 'Spieler ist gerade nicht im Spiel – keine Nachricht gesendet.' };
            else {
                const amount = Number(ticket.amount);
                const text = `Strafzettel ${ticket.number}: ${d.reason.replace(/[\r\n]+/g, ' ')}${amount ? ` - Betrag ${amount.toLocaleString('de-DE')}` : ''}`.slice(0, 400);
                try {
                    await this.erlc.runCommand(actor, target.serverId, `:pm ${target.name} ${text}`, false);
                    inGame = { ok: true, message: `${target.name} hat im Spiel eine Nachricht bekommen.` };
                }
                catch (e) {
                    inGame = { ok: false, message: e instanceof errors_1.AppError ? `Nachricht im Spiel fehlgeschlagen: ${e.message}` : 'Nachricht im Spiel fehlgeschlagen.' };
                }
            }
        }
        if (inGame && actor.userId)
            await this.notify.notify([actor.userId], { type: 'TICKET_ISSUED', title: `${inGame.ok ? '🎮' : '⚠️'} ${ticket.number}: ${inGame.message}`, entityType: 'Ticket', entityId: ticket.id });
        return { ...ticket, inGame };
    }
    async list(p, personId) {
        const where = { ...(personId ? { personId } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { reason: { contains: p.q, mode: 'insensitive' } }] } : {}) };
        const [items, total] = await Promise.all([
            this.prisma.ticket.findMany({ where, include: { person: { select: { id: true, robloxUsername: true } } }, orderBy: { issuedAt: 'desc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.ticket.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async get(id) {
        const t = await this.prisma.ticket.findUnique({ where: { id }, include: { person: true, legalCode: true } });
        if (!t)
            throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
        return { ticket: t, timeline: await this.timeline.list('Ticket', id) };
    }
    /** Ticket + Personenverknüpfung + Timeline + Audit + Notification in EINER Transaktion. */
    async create(actor, d) {
        if (!actor.userId)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Bitte melde dich an.');
        const officerId = actor.userId;
        return this.prisma.$transaction(async (tx) => {
            const person = await tx.person.findUnique({ where: { id: d.personId } });
            if (!person || person.status !== 'ACTIVE')
                throw new errors_1.AppError('NOT_FOUND', 'Person nicht gefunden.');
            let amount = d.amount;
            if (d.legalCodeId) {
                const code = await tx.legalCode.findUnique({ where: { id: d.legalCodeId } });
                const now = new Date();
                if (!code || !code.active || code.effectiveDate > now || (code.expiresAt && code.expiresAt < now))
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Dieser Tatbestand ist nicht aktiv.');
                if (amount === undefined)
                    amount = Number(code.penalty.fine ?? 0);
            }
            const ticket = await tx.ticket.create({ data: { number: (0, numbering_1.makeNumber)('T'), personId: d.personId, officerId, legalCodeId: d.legalCodeId, reason: d.reason, amount: amount ?? 0, notes: d.notes, reportId: d.reportId } });
            await (0, links_1.linkPerson)(tx, d.personId, 'Ticket', ticket.id, 'SUBJECT');
            await this.timeline.add(tx, { entityType: 'Ticket', entityId: ticket.id, action: 'ticket.created', summary: `Strafzettel ${ticket.number} ausgestellt`, actorId: officerId });
            await this.timeline.add(tx, { entityType: 'Person', entityId: d.personId, action: 'ticket.created', summary: `Strafzettel ${ticket.number} ausgestellt`, actorId: officerId });
            await this.audit.record(actor, { action: 'ticket.create', module: 'tickets', entityType: 'Ticket', entityId: ticket.id, after: ticket }, tx);
            await tx.notification.create({ data: { userId: officerId, type: 'TICKET_ISSUED', title: `Strafzettel ${ticket.number} ausgestellt`, entityType: 'Ticket', entityId: ticket.id } });
            return ticket;
        });
    }
    async void(actor, id, reason) {
        return this.prisma.$transaction(async (tx) => {
            const t = await tx.ticket.findUnique({ where: { id } });
            if (!t)
                throw new errors_1.AppError('NOT_FOUND', 'Ticket nicht gefunden.');
            (0, shared_1.assertTransition)(shared_1.TICKET_TRANSITIONS, t.status, 'VOID');
            const after = await tx.ticket.update({ where: { id }, data: { status: 'VOID', voidReason: reason, voidedById: actor.userId, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Ticket', entityId: id, action: 'ticket.voided', summary: `Strafzettel ${t.number} storniert`, actorId: actor.userId });
            await this.timeline.add(tx, { entityType: 'Person', entityId: t.personId, action: 'ticket.voided', summary: `Strafzettel ${t.number} storniert`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'ticket.void', module: 'tickets', entityType: 'Ticket', entityId: id, before: { status: t.status }, after: { status: after.status }, reason }, tx);
            return after;
        });
    }
};
exports.TicketsService = TicketsService;
exports.TicketsService = TicketsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, erlc_service_1.ErlcService, notify_service_1.NotifyService])
], TicketsService);
//# sourceMappingURL=tickets.service.js.map