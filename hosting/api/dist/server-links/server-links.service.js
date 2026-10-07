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
exports.ServerLinksService = exports.linksSchema = void 0;
exports.ownSpace = ownSpace;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
const KEY = 'servers.links';
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Server-ID (15–25 Ziffern)');
exports.linksSchema = zod_1.z.object({
    /** Verbundene Server: teilen Akten und/oder Einstellungen. Der erste Server ist der Haupt-Server (dessen Einstellungen gelten). */
    groups: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid().optional(), name: zod_1.z.string().trim().min(1).max(60),
        guildIds: zod_1.z.array(sf).min(2, 'Eine Gruppe braucht mindestens zwei Server.').max(20),
        shareRecords: zod_1.z.boolean().default(true), shareSettings: zod_1.z.boolean().default(false),
    })).max(20).default([]),
    /** Server ohne Gruppe mit eigenen Akten (sonst: gemeinsamer Bestand aller Server). */
    ownRecords: zod_1.z.array(sf).max(50).default([]),
}).superRefine((c, ctx) => {
    const seen = new Set();
    c.groups.forEach((g, i) => g.guildIds.forEach((id) => { if (seen.has(id))
        ctx.addIssue({ code: 'custom', path: ['groups', i, 'guildIds'], message: 'Ein Server kann nur in einer Gruppe sein.' }); seen.add(id); }));
    if (c.ownRecords.some((id) => seen.has(id)))
        ctx.addIssue({ code: 'custom', path: ['ownRecords'], message: 'Server in einer Gruppe richten sich nach der Gruppe.' });
});
/** Eigener Akten-Bereich eines einzelnen Servers als feste UUID (aus der Server-ID abgeleitet). */
function ownSpace(guildId) {
    const h = (0, node_crypto_1.createHash)('sha256').update(`records:${guildId}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/**
 * Server-Verbund: Discord-Server können zusammen sein (Gruppe teilt Akten und/oder Einstellungen), müssen aber nicht
 * (eigene Akten bzw. gemeinsamer Bestand). Die Zuordnung liegt im Speicher, damit jede Anfrage sie ohne Datenbank-Zugriff kennt.
 */
let ServerLinksService = class ServerLinksService {
    prisma;
    audit;
    links = { groups: [], ownRecords: [] };
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async onModuleInit() {
        (0, guild_context_1.setServerLinkResolvers)((g) => this.settingsGuild(g), (g) => this.space(g));
        await this.reload();
    }
    async reload() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const p = exports.linksSchema.safeParse(v ?? {});
        this.links = p.success ? p.data : { groups: [], ownRecords: [] };
    }
    groupOf(guildId) { return this.links.groups.find((x) => x.guildIds.includes(guildId)); }
    settingsGuild(guildId) { const g = this.groupOf(guildId); return g?.shareSettings ? g.guildIds[0] : guildId; }
    space(guildId) {
        const g = this.groupOf(guildId);
        if (g)
            return g.shareRecords ? g.id : ownSpace(guildId);
        return this.links.ownRecords.includes(guildId) ? ownSpace(guildId) : null;
    }
    get() { return this.links; }
    async save(actor, input) {
        // Gruppen behalten ihre ID (= Akten-Bereich), neue bekommen eine
        const value = exports.linksSchema.parse({ ...input, groups: input.groups.map((g) => ({ ...g, id: g.id ?? (0, node_crypto_1.randomUUID)() })) });
        const json = value;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
            await this.audit.record(actor, { action: 'servers.links', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: json }, tx);
        });
        this.links = value;
        return this.overview();
    }
    /** Für die Seite: Einstellungen + Zahl der Akten je Bereich (damit man sieht, was wohin gehört). */
    async overview() {
        const [persons, vehicles] = await Promise.all([
            this.prisma.person.groupBy({ by: ['serverId'], _count: { _all: true } }),
            this.prisma.vehicle.groupBy({ by: ['serverId'], _count: { _all: true } }),
        ]);
        const count = (rows, s) => rows.find((r) => r.serverId === s)?._count._all ?? 0;
        const spaces = new Map();
        for (const s of [null, ...this.links.groups.map((g) => g.id), ...this.links.ownRecords.map(ownSpace)])
            spaces.set(s, { persons: count(persons, s), vehicles: count(vehicles, s) });
        return { ...this.links, counts: { shared: spaces.get(null), groups: Object.fromEntries(this.links.groups.map((g) => [g.id, spaces.get(g.id)])), own: Object.fromEntries(this.links.ownRecords.map((id) => [id, spaces.get(ownSpace(id))])) } };
    }
    /** Bestehende gemeinsame Akten in einen Bereich verschieben (z. B. nach dem Trennen eines Servers). */
    async moveShared(actor, guildId) {
        const target = this.space(guildId);
        if (target === null)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Dieser Server nutzt den gemeinsamen Bestand – nichts zu verschieben.');
        const [p, v] = await this.prisma.$transaction([
            this.prisma.person.updateMany({ where: { serverId: null }, data: { serverId: target } }),
            this.prisma.vehicle.updateMany({ where: { serverId: null }, data: { serverId: target } }),
        ]).catch((e) => { if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new errors_1.AppError('CONFLICT', 'Im Ziel gibt es schon Akten mit derselben Roblox-ID bzw. demselben Kennzeichen.'); throw e; });
        await this.audit.record(actor, { action: 'servers.links.move', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: { guildId, persons: p.count, vehicles: v.count } });
        return { persons: p.count, vehicles: v.count };
    }
};
exports.ServerLinksService = ServerLinksService;
exports.ServerLinksService = ServerLinksService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], ServerLinksService);
//# sourceMappingURL=server-links.service.js.map