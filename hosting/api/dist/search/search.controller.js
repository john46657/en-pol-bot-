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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const permission_service_1 = require("../authz/permission.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const tickets_service_1 = require("../support-tickets/tickets.service");
const discord_live_service_1 = require("../discord/discord-live.service");
const guild_context_1 = require("../common/guild-context");
const q = zod_1.z.object({ q: zod_1.z.string().trim().min(2).max(64) });
const ci = (v) => ({ contains: v, mode: 'insensitive' });
/**
 * Globale Suche. Jede Entitätsart wird nur durchsucht, wenn der Benutzer die View-Permission besitzt –
 * ohne Berechtigung wird nicht einmal die Anfrage an die Tabelle gestellt (keine Existenz-Leaks).
 */
let SearchController = class SearchController {
    prisma;
    perms;
    tickets;
    live;
    constructor(prisma, perms, tickets, live) {
        this.prisma = prisma;
        this.perms = perms;
        this.tickets = tickets;
        this.live = live;
    }
    async search(u, { q: term }) {
        const pctx = await this.perms.contextFor(u.id);
        const allowed = (p) => (0, shared_1.can)(pctx, p);
        const upper = term.toUpperCase();
        const take = 8;
        const jobs = [];
        if (allowed('persons.view'))
            jobs.push(this.prisma.person.findMany({ where: { status: 'ACTIVE', OR: [{ robloxUsername: ci(term) }, { robloxUserId: term }, { aliases: { has: term } }] }, take }).then((r) => r.map((x) => ({ type: 'person', id: x.id, label: x.robloxUsername, sub: x.robloxUserId ?? undefined }))));
        if (allowed('vehicles.view'))
            jobs.push(this.prisma.vehicle.findMany({ where: { plate: { contains: upper.replace(/\s+/g, '') } }, take }).then((r) => r.map((x) => ({ type: 'vehicle', id: x.id, label: x.plate, sub: x.model ?? undefined }))));
        if (allowed('incidents.view'))
            jobs.push(this.prisma.incident.findMany({ where: { OR: [{ number: { contains: upper } }, { title: ci(term) }] }, take }).then((r) => r.map((x) => ({ type: 'incident', id: x.id, label: x.number, sub: x.title }))));
        if (allowed('reports.view')) {
            const all = allowed('reports.review') || allowed('reports.approve');
            jobs.push(this.prisma.report.findMany({ where: { AND: [{ OR: [{ number: { contains: upper } }, { title: ci(term) }] }, all ? {} : { OR: [{ authorId: u.id }, { status: { in: ['APPROVED', 'ARCHIVED'] } }] }] }, take }).then((r) => r.map((x) => ({ type: 'report', id: x.id, label: x.number, sub: x.title }))));
        }
        if (allowed('tickets.view'))
            jobs.push(this.prisma.ticket.findMany({ where: { number: { contains: upper } }, take }).then((r) => r.map((x) => ({ type: 'ticket', id: x.id, label: x.number, sub: x.reason }))));
        if (allowed('complaints.view'))
            jobs.push(this.prisma.complaint.findMany({ where: { number: { contains: upper } }, take }).then((r) => r.map((x) => ({ type: 'complaint', id: x.id, label: x.number, sub: x.category }))));
        if (allowed('investigations.view'))
            jobs.push(this.prisma.investigation.findMany({ where: { OR: [{ caseNumber: { contains: upper } }, { title: ci(term) }] }, take }).then((r) => r.map((x) => ({ type: 'investigation', id: x.id, label: x.caseNumber, sub: x.title }))));
        if (allowed('wanted.view'))
            jobs.push(this.prisma.wantedRecord.findMany({ where: { status: 'ACTIVE', reason: ci(term) }, take }).then((r) => r.map((x) => ({ type: 'wanted', id: x.id, label: x.reason }))));
        if (allowed('evidence.view'))
            jobs.push(this.prisma.evidence.findMany({ where: { OR: [{ number: { contains: upper } }, { description: ci(term) }] }, take }).then((r) => r.map((x) => ({ type: 'evidence', id: x.id, label: x.number, sub: x.description }))));
        if (allowed('personnel.view'))
            jobs.push(this.prisma.personnel.findMany({ where: { OR: [{ callsign: ci(term) }, { user: { displayName: ci(term) } }] }, include: { user: true }, take }).then((r) => r.map((x) => ({ type: 'personnel', id: x.id, label: x.user.displayName, sub: x.callsign ?? undefined }))));
        // Teamliste: Name, Dienstnummer, Team, Dienstgrad, Büro (+ Discord-Teammitglieder ohne Personalakte)
        if (allowed('team.view')) {
            jobs.push(this.prisma.personnel.findMany({ where: { employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] }, OR: [{ callsign: ci(term) }, { serviceNumber: ci(term) }, { team: ci(term) }, { rank: ci(term) }, { office: ci(term) }, { user: { displayName: ci(term) } }, { user: { username: ci(term) } }] }, include: { user: true }, take })
                .then((r) => r.map((x) => ({ type: 'member', id: x.userId, label: x.user.displayName, sub: [x.rank, x.team, x.office, x.serviceNumber && `Nr. ${x.serviceNumber}`].filter(Boolean).join(' · ') || undefined }))));
            const t = term.toLowerCase();
            jobs.push(Promise.resolve(this.live.getMembers().members.filter((m) => m.displayName.toLowerCase().includes(t) || m.username.toLowerCase().includes(t) || m.id === term).slice(0, take).map((m) => ({ type: 'member', id: m.id, label: m.displayName, sub: `@${m.username}` }))));
        }
        if (allowed('ticket.view'))
            jobs.push(this.tickets.list(u.id, { q: term, page: 1, pageSize: take }).then((r) => r.items.map((x) => ({ type: 'support-ticket', id: x.id, label: `${x.number} ${x.name}`, sub: x.creatorName }))));
        if (allowed('applications.view'))
            jobs.push(this.prisma.application.findMany({ where: { OR: [{ number: { contains: upper } }, { robloxUsername: ci(term) }, { discordName: ci(term) }] }, take, orderBy: { createdAt: 'desc' } }).then((r) => r.map((x) => ({ type: 'application', id: x.id, label: x.number, sub: x.robloxUsername }))));
        if (allowed('radio.view')) {
            const g = (0, guild_context_1.currentGuild)();
            jobs.push(this.prisma.radioCode.findMany({ where: { AND: [{ OR: [{ guildId: null }, ...(g ? [{ guildId: g }] : [])] }, { OR: [{ code: ci(term) }, { meaning: ci(term) }] }] }, take }).then((r) => r.map((x) => ({ type: 'radio-code', id: x.code, label: x.code, sub: x.meaning }))));
        }
        const all = (await Promise.all(jobs)).flat();
        // dieselbe Person nicht doppelt (Personalakte + Discord)
        const seen = new Set();
        return { results: all.filter((h) => { const k = h.type === 'member' ? `m:${h.label.toLowerCase()}` : `${h.type}:${h.id}`; if (seen.has(k))
                return false; seen.add(k); return true; }) };
    }
};
exports.SearchController = SearchController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(q))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], SearchController.prototype, "search", null);
exports.SearchController = SearchController = __decorate([
    (0, swagger_1.ApiTags)('search'),
    (0, common_1.Controller)('search'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, permission_service_1.PermissionService, tickets_service_1.SupportTicketsService, discord_live_service_1.DiscordLiveService])
], SearchController);
//# sourceMappingURL=search.controller.js.map