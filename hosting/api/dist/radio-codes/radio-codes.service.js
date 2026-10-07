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
exports.RadioCodesService = exports.DEFAULT_RADIO_CODES = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
/** Gängige Funkcodes als Startpunkt („Standard-Codes einfügen“) – alles änderbar. */
exports.DEFAULT_RADIO_CODES = [
    { code: '10-1', meaning: 'Schlechter Empfang', category: 'Funk' }, { code: '10-2', meaning: 'Guter Empfang', category: 'Funk' },
    { code: '10-3', meaning: 'Funkstille', category: 'Funk' }, { code: '10-4', meaning: 'Verstanden', category: 'Funk' },
    { code: '10-6', meaning: 'Beschäftigt', category: 'Status' }, { code: '10-7', meaning: 'Außer Dienst', category: 'Status' },
    { code: '10-8', meaning: 'Im Dienst / einsatzbereit', category: 'Status' }, { code: '10-9', meaning: 'Bitte wiederholen', category: 'Funk' },
    { code: '10-20', meaning: 'Standort', category: 'Einsatz' }, { code: '10-23', meaning: 'Am Einsatzort eingetroffen', category: 'Einsatz' },
    { code: '10-32', meaning: 'Verstärkung benötigt', category: 'Einsatz' }, { code: '10-38', meaning: 'Verkehrskontrolle', category: 'Einsatz' },
    { code: '10-50', meaning: 'Verkehrsunfall', category: 'Einsatz' }, { code: '10-80', meaning: 'Verfolgungsfahrt', category: 'Einsatz' },
    { code: '10-99', meaning: 'Beamter in Not', category: 'Notfall' }, { code: 'Code 3', meaning: 'Einsatzfahrt mit Sonderrechten', category: 'Einsatz' },
];
/**
 * Funk-Codes je Server (Server getrennt) oder für alle Server. Im Server-Kontext sieht man die Codes dieses Servers
 * und die gemeinsamen; ein Server-Code überdeckt einen gemeinsamen mit gleichem Code.
 */
let RadioCodesService = class RadioCodesService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async list(q, guildId = (0, guild_context_1.currentGuild)()) {
        const t = q?.trim();
        const rows = await this.prisma.radioCode.findMany({
            where: { AND: [{ OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] }, t ? { OR: [{ code: { contains: t, mode: 'insensitive' } }, { meaning: { contains: t, mode: 'insensitive' } }, { category: { contains: t, mode: 'insensitive' } }] } : {}] },
            orderBy: [{ position: 'asc' }, { code: 'asc' }], take: 500,
        });
        const own = new Set(rows.filter((r) => r.guildId).map((r) => r.code.toLowerCase()));
        return rows.filter((r) => r.guildId || !own.has(r.code.toLowerCase()));
    }
    async load(id) {
        const r = await this.prisma.radioCode.findUnique({ where: { id } });
        const g = (0, guild_context_1.currentGuild)();
        if (!r || (g && r.guildId && r.guildId !== g))
            throw new errors_1.AppError('NOT_FOUND', 'Funk-Code nicht gefunden.');
        return r;
    }
    uniq(e) {
        if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new errors_1.AppError('CONFLICT', 'Diesen Funk-Code gibt es hier schon.');
        throw e;
    }
    /** (gemeinsame Codes haben guildId = null – dafür greift der Datenbank-Index nicht, daher selbst prüfen) */
    async assertFree(guildId, code, exceptId) {
        const dup = await this.prisma.radioCode.findFirst({ where: { guildId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
        if (dup)
            throw new errors_1.AppError('CONFLICT', 'Diesen Funk-Code gibt es hier schon.');
    }
    async create(actor, d) {
        const guildId = d.guildId === undefined ? (0, guild_context_1.currentGuild)() : d.guildId;
        await this.assertFree(guildId, d.code);
        const position = ((await this.prisma.radioCode.aggregate({ where: { guildId }, _max: { position: true } }))._max.position ?? 0) + 1;
        const r = await this.prisma.radioCode.create({ data: { code: d.code, meaning: d.meaning, category: d.category ?? null, description: d.description ?? null, guildId, position } }).catch((e) => this.uniq(e));
        await this.audit.record(actor, { action: 'radiocode.create', module: 'radio', entityType: 'RadioCode', entityId: r.id, after: r });
        return r;
    }
    async update(actor, id, d) {
        const before = await this.load(id);
        const data = { code: d.code, meaning: d.meaning, category: d.category, description: d.description }; // Server-Zugehörigkeit bleibt
        if (data.code)
            await this.assertFree(before.guildId, data.code, id);
        const r = await this.prisma.radioCode.update({ where: { id }, data }).catch((e) => this.uniq(e));
        await this.audit.record(actor, { action: 'radiocode.update', module: 'radio', entityType: 'RadioCode', entityId: id, before, after: r });
        return r;
    }
    async remove(actor, id) {
        const before = await this.load(id);
        await this.prisma.radioCode.delete({ where: { id } });
        await this.audit.record(actor, { action: 'radiocode.delete', module: 'radio', entityType: 'RadioCode', entityId: id, before });
    }
    async reorder(actor, ids) {
        for (const id of ids)
            await this.load(id);
        await this.prisma.$transaction(ids.map((id, i) => this.prisma.radioCode.update({ where: { id }, data: { position: i + 1 } })));
        await this.audit.record(actor, { action: 'radiocode.reorder', module: 'radio', after: { count: ids.length } });
        return this.list();
    }
    /** Standard-Codes für den gewählten Server (bzw. alle Server) einfügen – vorhandene Codes bleiben unverändert. */
    async insertDefaults(actor) {
        const guildId = (0, guild_context_1.currentGuild)();
        const existing = new Set((await this.prisma.radioCode.findMany({ where: { guildId }, select: { code: true } })).map((r) => r.code.toLowerCase()));
        const add = exports.DEFAULT_RADIO_CODES.filter((c) => !existing.has(c.code.toLowerCase()));
        const base = ((await this.prisma.radioCode.aggregate({ where: { guildId }, _max: { position: true } }))._max.position ?? 0) + 1;
        if (add.length)
            await this.prisma.radioCode.createMany({ data: add.map((c, i) => ({ ...c, guildId, position: base + i })) });
        await this.audit.record(actor, { action: 'radiocode.defaults', module: 'radio', after: { added: add.length, guildId } });
        return { added: add.length };
    }
};
exports.RadioCodesService = RadioCodesService;
exports.RadioCodesService = RadioCodesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], RadioCodesService);
//# sourceMappingURL=radio-codes.service.js.map