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
exports.IntegrationsController = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const prisma_service_1 = require("../prisma/prisma.service");
const discord_live_service_1 = require("../discord/discord-live.service");
const monitor_service_1 = require("./monitor.service");
const errors_1 = require("../common/errors");
const erlc_service_1 = require("../cad/erlc.service");
const eventsQ = zod_1.z.object({ status: zod_1.z.enum(['OPEN', 'RESOLVED']).optional(), source: zod_1.z.enum(['ERLC', 'ERLC_STEP', 'BACKUP', 'OUTBOX']).optional(), take: zod_1.z.coerce.number().int().min(1).max(500).optional() });
/**
 * Administration → Systemstatus: ER:LC-API (Status, letzte erfolgreiche Synchronisierung, Rate-Limit, Fehlerserie), Verarbeitungsschritte,
 * Discord-Bot/-Ausgang, Backups und das Störungsprotokoll. Zugangsdaten werden nie ausgeliefert.
 */
let IntegrationsController = class IntegrationsController {
    monitor;
    prisma;
    live;
    moduleRef;
    constructor(monitor, prisma, live, moduleRef) {
        this.monitor = monitor;
        this.prisma = prisma;
        this.live = live;
        this.moduleRef = moduleRef;
    }
    async overview() {
        const now = Date.now();
        const [servers, open, outboxPending, outboxFailed, lastBackup, lastBackupOk, lastVerify] = await Promise.all([
            this.prisma.erlcServer.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, active: true, status: true, pollSeconds: true, lastSyncAt: true, lastError: true, lastErrorAt: true, latencyMs: true, rateLimit: true, failingSince: true, failureCount: true, features: true, webhookEnabled: true } }),
            this.prisma.integrationEvent.count({ where: { status: 'OPEN' } }),
            this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { lt: 5 } } }),
            this.prisma.discordOutbox.count({ where: { sentAt: null, attempts: { gte: 5 }, createdAt: { gte: new Date(now - 24 * 3_600_000) } } }),
            this.prisma.backupRun.findFirst({ where: { action: 'CREATE' }, orderBy: { startedAt: 'desc' } }),
            this.prisma.backupRun.findFirst({ where: { action: 'CREATE', status: 'SUCCESS' }, orderBy: { startedAt: 'desc' } }),
            this.prisma.backupRun.findFirst({ where: { action: 'VERIFY' }, orderBy: { startedAt: 'desc' } }),
        ]);
        const oldestPending = outboxPending ? await this.prisma.discordOutbox.findFirst({ where: { sentAt: null, attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }) : null;
        const members = this.live.getMembers();
        return {
            checkedAt: new Date(now).toISOString(),
            erlc: servers.map((s) => {
                const st = (s.active ? s.status : 'DISABLED');
                // veraltet: letzter erfolgreicher Abruf älter als drei Abruf-Intervalle (mind. 2 Minuten)
                const staleAfter = Math.max(120_000, s.pollSeconds * 3000);
                return { ...s, status: st, statusLabel: shared_1.ERLC_STATUS_LABEL[st] ?? st, stale: s.active && (!s.lastSyncAt || now - s.lastSyncAt.getTime() > staleAfter), staleAfterSeconds: Math.round(staleAfter / 1000) };
            }),
            bot: { lastReportAt: members.updatedAt, online: !!members.updatedAt && now - members.updatedAt.getTime() < 3 * 60_000, outboxPending, outboxOldestPendingAt: oldestPending?.createdAt ?? null, outboxFailed24h: outboxFailed },
            backups: { last: lastBackup, lastSuccess: lastBackupOk, lastVerify },
            openIncidents: open,
            config: await this.monitor.config(),
        };
    }
    events(q) { return this.monitor.events(q); }
    acknowledge(a, id) { return this.monitor.acknowledge(a, id); }
    saveConfig(a, b) { return this.monitor.saveConfig(a, b); }
    /** Kontrollierte Wiederverbindung: Backoff zurücksetzen und sofort einmal abrufen (Rate-Limits gelten weiter). */
    async retry(a, id) {
        const erlc = this.moduleRef.get(erlc_service_1.ErlcService, { strict: false });
        if (!erlc)
            throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'ER:LC-Anbindung nicht verfügbar.');
        const r = await erlc.reconnect(a, id, 'reconnect');
        return { ok: r.ok, status: r.status, message: r.message ?? null };
    }
};
exports.IntegrationsController = IntegrationsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, decorators_1.RequirePermission)('integrations.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "overview", null);
__decorate([
    (0, common_1.Get)('events'),
    (0, decorators_1.RequirePermission)('integrations.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(eventsQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "events", null);
__decorate([
    (0, common_1.Post)('events/:id/acknowledge'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('integrations.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "acknowledge", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('integrations.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(monitor_service_1.monitorConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], IntegrationsController.prototype, "saveConfig", null);
__decorate([
    (0, common_1.Post)('erlc/:id/retry'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('integrations.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], IntegrationsController.prototype, "retry", null);
exports.IntegrationsController = IntegrationsController = __decorate([
    (0, swagger_1.ApiTags)('integrations'),
    (0, common_1.Controller)('integrations'),
    __metadata("design:paramtypes", [monitor_service_1.MonitorService, prisma_service_1.PrismaService, discord_live_service_1.DiscordLiveService, core_1.ModuleRef])
], IntegrationsController);
//# sourceMappingURL=integrations.controller.js.map