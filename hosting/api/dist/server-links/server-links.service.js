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
const LEGACY_KEY = 'servers.legacyAssigned';
/** Einmalige Zuordnung bestehender Einträge zum Heimat-Server, je Schritt der Trennung (Prisma-Modelle). */
const LEGACY_STEPS = [
    { step: 'records', models: ['report', 'complaint', 'investigation', 'wantedRecord', 'evidence', 'dutySession'] },
    { step: 'personnel', models: ['personnel', 'hrRank', 'hrTraining', 'hrExam', 'hrTrainingSession', 'hrAnnouncement', 'hrPoll', 'serviceNumberRange', 'serviceNumber', 'serviceNumberEvent', 'hireQueue'] },
];
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Server-ID (15–25 Ziffern)');
exports.linksSchema = zod_1.z.object({
    /** Verbundene Server: teilen Akten und/oder Einstellungen. Der erste Server ist der Haupt-Server (dessen Einstellungen gelten). */
    groups: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().uuid().optional(), name: zod_1.z.string().trim().min(1).max(60),
        guildIds: zod_1.z.array(sf).min(2, 'Eine Gruppe braucht mindestens zwei Server.').max(20),
        shareRecords: zod_1.z.boolean().default(true), shareSettings: zod_1.z.boolean().default(false),
    })).max(20).default([]),
    /** Server ohne Gruppe, die den gemeinsamen Bestand nutzen (Opt-in). Alle anderen Server ohne Gruppe sind getrennt (eigene Akten). */
    sharedRecords: zod_1.z.array(sf).max(50).default([]),
}).superRefine((c, ctx) => {
    const seen = new Set();
    c.groups.forEach((g, i) => g.guildIds.forEach((id) => { if (seen.has(id))
        ctx.addIssue({ code: 'custom', path: ['groups', i, 'guildIds'], message: 'Ein Server kann nur in einer Gruppe sein.' }); seen.add(id); }));
    if (c.sharedRecords.some((id) => seen.has(id)))
        ctx.addIssue({ code: 'custom', path: ['sharedRecords'], message: 'Server in einer Gruppe richten sich nach der Gruppe.' });
});
/** Eigener Akten-Bereich eines einzelnen Servers als feste UUID (aus der Server-ID abgeleitet). */
function ownSpace(guildId) {
    const h = (0, node_crypto_1.createHash)('sha256').update(`records:${guildId}`).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
/**
 * Server-Verbund: Discord-Server sind standardmäßig getrennt (eigene Akten). Zusammen gehören sie nur, wenn das eingestellt
 * ist: als Gruppe (teilt Akten und/oder Einstellungen) oder per Opt-in in den gemeinsamen Bestand. Die Zuordnung liegt im Speicher, damit jede Anfrage sie ohne Datenbank-Zugriff kennt.
 */
let ServerLinksService = class ServerLinksService {
    prisma;
    audit;
    log = new common_1.Logger('ServerLinks');
    links = { groups: [], sharedRecords: [] };
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async onModuleInit() {
        (0, guild_context_1.setServerLinkResolvers)((g) => this.settingsGuild(g), (g) => this.space(g));
        await this.reload();
        if (process.env.NODE_ENV !== 'test')
            await this.assignLegacyRecords().catch((e) => this.log.warn(`Zuordnung alter Einträge fehlgeschlagen: ${e instanceof Error ? e.message : e}`));
    }
    /** Heimat-Server der Leitstelle, sonst der einzige bekannte Discord-Server (für Aufgaben ohne eigenen Server, z. B. Teamliste). */
    async homeGuild() {
        const [cad, known] = await Promise.all([
            this.prisma.systemSetting.findUnique({ where: { key: 'cad.config' } }),
            this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
        ]);
        const guilds = (Array.isArray(known?.value) ? known.value : []).map((g) => String(g.id ?? '')).filter((id) => /^\d{15,25}$/.test(id));
        return (cad?.value?.homeGuildId ?? null) || (guilds.length === 1 ? guilds[0] : null);
    }
    /**
     * Einmalig nach der Trennung je Server: Einträge ohne Server (Berichte, Fahndungen, …, Personal) gehören dem Heimat-Server
     * der Leitstelle (bzw. dem einzigen bekannten Discord-Server). Jeder Schritt läuft nur einmal (`servers.legacyAssigned`) –
     * später ohne Server angelegte Einträge (gemeinsamer Bestand) bleiben, wo sie sind. Gibt es noch keinen solchen Server, wird es beim nächsten Start erneut versucht.
     */
    async assignLegacyRecords() {
        const doneRow = await this.prisma.systemSetting.findUnique({ where: { key: LEGACY_KEY } });
        const done = Array.isArray(doneRow?.value) ? doneRow.value : [];
        const steps = LEGACY_STEPS.filter((x) => !done.includes(x.step));
        if (!steps.length)
            return 0;
        const home = await this.homeGuild();
        if (!home)
            return null;
        const space = this.space(home);
        const where = { serverId: null }, data = { serverId: space };
        let moved = 0;
        // Heimat-Server im gemeinsamen Bestand: dort sind die Einträge schon – nur als erledigt merken
        if (space !== null) {
            const r = await this.prisma.$transaction(steps.flatMap((x) => x.models.map((m) => this.prisma[m].updateMany({ where, data }))));
            moved = r.reduce((n, x) => n + x.count, 0);
        }
        const value = [...done, ...steps.map((x) => x.step)];
        await this.prisma.systemSetting.upsert({ where: { key: LEGACY_KEY }, create: { key: LEGACY_KEY, value }, update: { value } });
        if (moved)
            this.log.log(`${moved} bestehende Einträge dem Server ${home} zugeordnet`);
        return moved;
    }
    async reload() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const p = exports.linksSchema.safeParse(v ?? {});
        this.links = p.success ? p.data : { groups: [], sharedRecords: [] };
    }
    groupOf(guildId) { return this.links.groups.find((x) => x.guildIds.includes(guildId)); }
    settingsGuild(guildId) { const g = this.groupOf(guildId); return g?.shareSettings ? g.guildIds[0] : guildId; }
    space(guildId) {
        const g = this.groupOf(guildId);
        if (g)
            return g.shareRecords ? g.id : ownSpace(guildId);
        return this.links.sharedRecords.includes(guildId) ? null : ownSpace(guildId);
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
        const [persons, vehicles, known] = await Promise.all([
            this.prisma.person.groupBy({ by: ['serverId'], _count: { _all: true } }),
            this.prisma.vehicle.groupBy({ by: ['serverId'], _count: { _all: true } }),
            this.prisma.systemSetting.findUnique({ where: { key: 'discord.guilds' } }),
        ]);
        // Getrennte Server ohne Gruppe: alle vom Bot gemeldeten, die weder in einer Gruppe noch im gemeinsamen Bestand sind
        const grouped = new Set([...this.links.groups.flatMap((g) => g.guildIds), ...this.links.sharedRecords]);
        const own = (Array.isArray(known?.value) ? known.value : []).map((g) => String(g.id ?? '')).filter((id) => /^\d{15,25}$/.test(id) && !grouped.has(id));
        const count = (rows, s) => rows.find((r) => r.serverId === s)?._count._all ?? 0;
        const spaces = new Map();
        for (const s of [null, ...this.links.groups.map((g) => g.id), ...own.map(ownSpace)])
            spaces.set(s, { persons: count(persons, s), vehicles: count(vehicles, s) });
        return { ...this.links, counts: { shared: spaces.get(null), groups: Object.fromEntries(this.links.groups.map((g) => [g.id, spaces.get(g.id)])), own: Object.fromEntries(own.map((id) => [id, spaces.get(ownSpace(id))])) } };
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