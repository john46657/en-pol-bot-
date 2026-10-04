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
exports.DangerService = exports.DANGER_LEVELS = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const realtime_service_1 = require("../realtime/realtime.service");
const discord_service_1 = require("../discord/discord.service");
exports.DANGER_LEVELS = ['GREEN', 'YELLOW', 'RED'];
const KEY = 'danger.current';
/** Aktueller Gefahrenstatus (Grün/Gelb/Rot). Änderungen sind auditiert, gehen live an die Leitstelle und als Discord-Meldung raus. */
let DangerService = class DangerService {
    prisma;
    audit;
    rt;
    discord;
    constructor(prisma, audit, rt, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.discord = discord;
    }
    async get() {
        const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
        return row?.value ?? { level: 'GREEN', reason: null, setByName: null, at: null };
    }
    async set(actor, level, reason) {
        const before = await this.get();
        const user = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
        const state = { level, reason: reason?.trim() || null, setByName: user?.displayName ?? null, at: new Date().toISOString() };
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: state }, update: { value: state } });
            await this.audit.record(actor, { action: 'danger.set', module: 'dispatch', entityType: 'DangerLevel', entityId: KEY, before: { level: before.level }, after: state, reason }, tx);
        });
        this.rt.publish('dispatch', 'danger.changed', { level });
        if (before.level !== level)
            await this.discord.enqueue('danger', 'danger.changed', { level, previous: before.level, reason: state.reason, setBy: state.setByName });
        return state;
    }
};
exports.DangerService = DangerService;
exports.DangerService = DangerService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, discord_service_1.DiscordService])
], DangerService);
//# sourceMappingURL=danger.service.js.map