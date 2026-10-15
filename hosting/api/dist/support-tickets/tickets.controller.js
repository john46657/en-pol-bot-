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
exports.BotSupportTicketsController = exports.SupportTicketsController = void 0;
const guild_context_1 = require("../common/guild-context");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const tickets_service_1 = require("./tickets.service");
const config_service_1 = require("./config.service");
const config_schemas_1 = require("./config.schemas");
const snowflake = zod_1.z.string().regex(/^\d{15,25}$/);
const actionSchema = zod_1.z.discriminatedUnion('action', [
    zod_1.z.object({ action: zod_1.z.literal('close'), reason: zod_1.z.string().trim().max(500).optional() }), zod_1.z.object({ action: zod_1.z.literal('close_request') }),
    zod_1.z.object({ action: zod_1.z.literal('reopen') }), zod_1.z.object({ action: zod_1.z.literal('claim') }), zod_1.z.object({ action: zod_1.z.literal('unclaim'), targetId: snowflake.optional() }),
    zod_1.z.object({ action: zod_1.z.literal('add_access'), targetId: snowflake, kind: zod_1.z.enum(['USER', 'ROLE']), minutes: zod_1.z.number().int().min(1).max(60 * 24 * 30).optional() }),
    zod_1.z.object({ action: zod_1.z.literal('remove_access'), targetId: snowflake }),
    zod_1.z.object({ action: zod_1.z.literal('priority'), priorityId: zod_1.z.string().uuid() }), zod_1.z.object({ action: zod_1.z.literal('status'), statusId: zod_1.z.string().uuid() }),
    zod_1.z.object({ action: zod_1.z.literal('category'), categoryId: zod_1.z.string().uuid() }), zod_1.z.object({ action: zod_1.z.literal('rename'), name: zod_1.z.string().trim().min(1).max(90) }),
    zod_1.z.object({ action: zod_1.z.literal('move'), parentId: snowflake.nullable() }), zod_1.z.object({ action: zod_1.z.literal('transcript') }),
    zod_1.z.object({ action: zod_1.z.literal('lock') }), zod_1.z.object({ action: zod_1.z.literal('unlock') }), zod_1.z.object({ action: zod_1.z.literal('escalate') }),
    zod_1.z.object({ action: zod_1.z.literal('note'), text: zod_1.z.string().trim().min(1).max(4000) }), zod_1.z.object({ action: zod_1.z.literal('rating') }), zod_1.z.object({ action: zod_1.z.literal('delete') }),
    zod_1.z.object({ action: zod_1.z.literal('reply'), text: zod_1.z.string().trim().min(1).max(4000) }),
]);
const listQ = zod_1.z.object({
    kind: zod_1.z.enum(['open', 'closed', 'archived', 'escalated', 'deleted', 'all']).optional(), statusId: zod_1.z.string().uuid().optional(), priorityId: zod_1.z.string().uuid().optional(), categoryId: zod_1.z.string().uuid().optional(),
    claimer: zod_1.z.union([snowflake, zod_1.z.literal('me')]).optional(), creator: zod_1.z.string().trim().max(100).optional(), from: zod_1.z.coerce.date().optional(), to: zod_1.z.coerce.date().optional(),
    q: zod_1.z.string().trim().max(100).optional(), guildId: snowflake.optional(), page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(500).default(25),
});
const transcriptQ = zod_1.z.object({
    q: zod_1.z.string().trim().max(100).optional(), categoryName: zod_1.z.string().max(80).optional(), creator: zod_1.z.string().max(100).optional(), staff: snowflake.optional(), status: zod_1.z.string().max(60).optional(),
    number: zod_1.z.coerce.number().int().positive().optional(), from: zod_1.z.coerce.date().optional(), to: zod_1.z.coerce.date().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(500).default(25),
});
const ratingQ = zod_1.z.object({ stars: zod_1.z.coerce.number().int().min(1).max(5).optional(), categoryId: zod_1.z.string().uuid().optional(), page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(500).default(25) });
const openQ = zod_1.z.object({ categoryId: zod_1.z.string().uuid(), discordId: snowflake, discordName: zod_1.z.string().trim().max(100).optional(), guildId: snowflake.optional() });
const actor = (u) => ({ userId: u.id, robloxUserId: u.robloxUserId });
/** Support-Tickets im Dashboard (Pfad `support-tickets`, weil `tickets` die Strafzettel sind). */
let SupportTicketsController = class SupportTicketsController {
    s;
    cfg;
    constructor(s, cfg) {
        this.s = s;
        this.cfg = cfg;
    }
    // ---- Konfiguration ----
    config(q) { return this.cfg.all(q.guildId); }
    settings(u, b) { return this.cfg.saveSettings(actor(u), b); }
    createCategory(u, b) { return this.cfg.saveCategory(actor(u), null, b); }
    updateCategory(u, id, b) { return this.cfg.saveCategory(actor(u), id, b); }
    dupCategory(u, id) { return this.cfg.duplicateCategory(actor(u), id); }
    delCategory(u, id) { return this.cfg.deleteCategory(actor(u), id); }
    createPanel(u, b) { return this.cfg.savePanel(actor(u), null, b); }
    updatePanel(u, id, b) { return this.cfg.savePanel(actor(u), id, b); }
    dupPanel(u, id) { return this.cfg.duplicatePanel(actor(u), id); }
    delPanel(u, id) { return this.cfg.deletePanel(actor(u), id); }
    preview(id) { return this.s.panelMessage(id); }
    async publish(u, id, b) { return this.s.publishPanel(await this.s.actorFromUser(u), id, b.channelId); }
    createStatus(u, b) { return this.cfg.saveStatus(actor(u), null, b); }
    updateStatus(u, id, b) { return this.cfg.saveStatus(actor(u), id, b); }
    delStatus(u, id) { return this.cfg.deleteStatus(actor(u), id); }
    createPriority(u, b) { return this.cfg.savePriority(actor(u), null, b); }
    updatePriority(u, id, b) { return this.cfg.savePriority(actor(u), id, b); }
    delPriority(u, id) { return this.cfg.deletePriority(actor(u), id); }
    createReason(u, b) { return this.cfg.saveReason(actor(u), null, b); }
    updateReason(u, id, b) { return this.cfg.saveReason(actor(u), id, b); }
    delReason(u, id) { return this.cfg.deleteReason(actor(u), id); }
    // ---- Tickets ----
    list(u, q) { return this.s.list(u.id, { ...q, guildId: q.guildId ?? (0, guild_context_1.currentGuild)() ?? undefined, kind: q.kind === 'all' ? undefined : q.kind }); }
    async create(u, b) { return this.s.openFromDashboard(await this.s.actorFromUser(u), b); }
    stats(u) { return this.s.stats(u.id); }
    ratings(u, q) { return this.s.ratings(u.id, q); }
    transcripts(u, q) { return this.s.transcripts(u.id, q); }
    async transcript(u, id, download, res) {
        const tr = await this.s.transcript(u.id, id);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // Transcript-HTML in einer Sandbox anzeigen: keine Skripte, kein Zugriff auf das Dashboard
        res.setHeader('Content-Security-Policy', "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'; sandbox");
        res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="transcript-${String(tr.ticketNumber).padStart(4, '0')}.html"`);
        res.send(tr.html);
    }
    async delTranscript(u, id) { return this.s.deleteTranscript(await this.s.actorFromUser(u), id); }
    async attachment(u, key, res) {
        const a = await this.s.attachment(u.id, key);
        res.setHeader('Content-Type', a.contentType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', `${a.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(a.name)}"`);
        res.send(a.data);
    }
    detail(u, id) { return this.s.detail(u.id, id); }
    async options(u, id) { return this.s.options(await this.s.actorFromUser(u), id); }
    /** Alle Ticket-Aktionen (Web und Discord-Buttons); jede Aktion prüft ihr eigenes Recht. */
    async action(u, id, b) { return this.s.action(id, await this.s.actorFromUser(u), b); }
};
exports.SupportTicketsController = SupportTicketsController;
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: snowflake.optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.settingsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "settings", null);
__decorate([
    (0, common_1.Post)('categories'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.categorySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "createCategory", null);
__decorate([
    (0, common_1.Put)('categories/:id'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.categorySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "updateCategory", null);
__decorate([
    (0, common_1.Post)('categories/:id/duplicate'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "dupCategory", null);
__decorate([
    (0, common_1.Delete)('categories/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "delCategory", null);
__decorate([
    (0, common_1.Post)('panels'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.panelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "createPanel", null);
__decorate([
    (0, common_1.Put)('panels/:id'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.panelSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "updatePanel", null);
__decorate([
    (0, common_1.Post)('panels/:id/duplicate'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "dupPanel", null);
__decorate([
    (0, common_1.Delete)('panels/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "delPanel", null);
__decorate([
    (0, common_1.Get)('panels/:id/preview'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('panels/:id/publish'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: snowflake.optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)('statuses'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.statusSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "createStatus", null);
__decorate([
    (0, common_1.Put)('statuses/:id'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.statusSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "updateStatus", null);
__decorate([
    (0, common_1.Delete)('statuses/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "delStatus", null);
__decorate([
    (0, common_1.Post)('priorities'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.prioritySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "createPriority", null);
__decorate([
    (0, common_1.Put)('priorities/:id'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.prioritySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "updatePriority", null);
__decorate([
    (0, common_1.Delete)('priorities/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "delPriority", null);
__decorate([
    (0, common_1.Post)('reasons'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.reasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "createReason", null);
__decorate([
    (0, common_1.Put)('reasons/:id'),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(config_schemas_1.reasonSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "updateReason", null);
__decorate([
    (0, common_1.Delete)('reasons/:id'),
    (0, common_1.HttpCode)(204),
    (0, decorators_1.RequirePermission)('ticket.settings'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "delReason", null);
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('ticket.create'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(openQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('stats'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "stats", null);
__decorate([
    (0, common_1.Get)('ratings'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(ratingQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "ratings", null);
__decorate([
    (0, common_1.Get)('transcripts'),
    (0, decorators_1.RequirePermission)('ticket.transcript'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(transcriptQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "transcripts", null);
__decorate([
    (0, common_1.Get)('transcripts/:id'),
    (0, decorators_1.RequirePermission)('ticket.transcript'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Query)('download')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "transcript", null);
__decorate([
    (0, common_1.Delete)('transcripts/:id'),
    (0, decorators_1.RequirePermission)('ticket.transcript_delete'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "delTranscript", null);
__decorate([
    (0, common_1.Get)('attachments/:key'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('key')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "attachment", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SupportTicketsController.prototype, "detail", null);
__decorate([
    (0, common_1.Get)(':id/options'),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "options", null);
__decorate([
    (0, common_1.Post)(':id/actions'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('ticket.view'),
    __param(0, (0, decorators_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(actionSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", Promise)
], SupportTicketsController.prototype, "action", null);
exports.SupportTicketsController = SupportTicketsController = __decorate([
    (0, swagger_1.ApiTags)('support-tickets'),
    (0, common_1.Controller)('support-tickets'),
    __metadata("design:paramtypes", [tickets_service_1.SupportTicketsService, config_service_1.TicketConfigService])
], SupportTicketsController);
const botOpen = zod_1.z.object({ categoryId: zod_1.z.string().uuid(), panelId: zod_1.z.string().uuid().optional(), guildId: snowflake, discordId: snowflake, discordName: zod_1.z.string().trim().min(1).max(100), memberRoleIds: zod_1.z.array(snowflake).max(250).default([]) });
const botMessage = zod_1.z.object({
    channelId: snowflake, discordMessageId: snowflake, authorId: snowflake, authorName: zod_1.z.string().max(100), authorAvatar: zod_1.z.string().url().max(500).nullable().optional(), isBot: zod_1.z.boolean(),
    content: zod_1.z.string().max(8000), attachments: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string().max(200), url: zod_1.z.string().url().max(1000), size: zod_1.z.number().int().min(0), contentType: zod_1.z.string().max(100).nullable().optional() })).max(10).default([]),
    embeds: zod_1.z.array(zod_1.z.object({ title: zod_1.z.string().max(256).optional(), description: zod_1.z.string().max(4096).optional() })).max(10).default([]),
});
/** Dienst-Endpunkte für den Bot (Ersteller ohne Konto, Channel-Meldungen, Panels, Transcripts). */
let BotSupportTicketsController = class BotSupportTicketsController {
    s;
    constructor(s) {
        this.s = s;
    }
    open(b) { return this.s.open(b, { userId: null, discordId: b.discordId, name: b.discordName, viaBot: true }); }
    attach(id, b) { return this.s.attachChannel(id, b.channelId, b.controlMessageId); }
    abort(id, b) { return this.s.abort(id, b.reason); }
    answer(id, b) { return this.s.answer(id, b.discordId, b.questionId, b.values); }
    closeRequest(id, b) { return this.s.closeRequestAnswer(id, b.discordId, b.accept); }
    creatorAdd(id, b) { return this.s.creatorAdd(id, b.discordId, b.targetId); }
    creatorClose(id, b) { return this.s.creatorClose(id, b.discordId, b.reason); }
    rate(id, b) { return this.s.rate(id, b.discordId, b.stars); }
    rateComment(id, b) { return this.s.rateComment(id, b.discordId, b.comment); }
    message(b) { return this.s.message(b); }
    channels() { return this.s.channels(); }
    categories(q) { return this.s.openableCategories(q.guildId); }
    closeOptions(id) { return this.s.closeOptions(id); }
    posted(id, b) { return this.s.panelPosted(id, b.channelId, b.messageId); }
    async transcript(id) { const t = await this.s.transcript(null, id); return { html: t.html }; }
};
exports.BotSupportTicketsController = BotSupportTicketsController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('open'),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(botOpen))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "open", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/channel'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: snowflake, controlMessageId: snowflake.nullable() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "attach", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/abort'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ reason: zod_1.z.string().max(300).default('') })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "abort", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/answer'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: snowflake, questionId: zod_1.z.string().max(40), values: zod_1.z.array(zod_1.z.string().max(2000)).max(25).nullable() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "answer", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/close-request'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: snowflake, accept: zod_1.z.boolean() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "closeRequest", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/creator-add'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: snowflake, targetId: snowflake })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "creatorAdd", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/creator-close'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: snowflake, reason: zod_1.z.string().trim().max(500).optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "creatorClose", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/rating'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: snowflake, stars: zod_1.z.number().int().min(1).max(5) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "rate", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)(':id/rating-comment'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: snowflake, comment: zod_1.z.string().trim().min(1).max(1000) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "rateComment", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('messages'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(botMessage))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "message", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('channels'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "channels", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('categories'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: snowflake.optional() })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "categories", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)(':id/close-options'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "closeOptions", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('panels/:id/posted'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ channelId: snowflake, messageId: snowflake })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BotSupportTicketsController.prototype, "posted", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('transcripts/:id'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BotSupportTicketsController.prototype, "transcript", null);
exports.BotSupportTicketsController = BotSupportTicketsController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/support-tickets'),
    __metadata("design:paramtypes", [tickets_service_1.SupportTicketsService])
], BotSupportTicketsController);
//# sourceMappingURL=tickets.controller.js.map