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
exports.RobloxOAuthController = exports.BotVerificationController = exports.VerificationController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const zod_1 = require("zod");
const verification_service_1 = require("./verification.service");
const roblox_oauth_service_1 = require("./roblox-oauth.service");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const guild_context_1 = require("../common/guild-context");
const errors_1 = require("../common/errors");
const sf = zod_1.z.string().regex(/^\d{15,25}$/);
const guildQ = zod_1.z.object({ guildId: sf.optional() });
const listQ = zod_1.z.object({ q: zod_1.z.string().trim().max(64).optional(), page: zod_1.z.coerce.number().int().min(1).default(1), pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(25) });
const member = zod_1.z.object({ guildId: sf.optional(), discordId: sf, discordName: zod_1.z.string().trim().max(100).optional() });
const did = (v) => { if (!/^\d{15,25}$/.test(v))
    throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Discord-ID.'); return v; };
const fast = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 600, ttl: 60_000 } };
/** Administration → Roblox-Verifizierung. */
let VerificationController = class VerificationController {
    s;
    oauth;
    constructor(s, oauth) {
        this.s = s;
        this.oauth = oauth;
    }
    oauthSettings() { return this.oauth.settings(); }
    saveOauth(a, b) { return this.oauth.save(a, b); }
    config(q) { return this.s.config(q.guildId ?? (0, guild_context_1.currentGuild)()); }
    save(a, q, b) { return this.s.save(a, b, q.guildId ?? (0, guild_context_1.currentGuild)()); }
    panel(a, q) { return this.s.postPanel(a, q.guildId ?? (0, guild_context_1.currentGuild)() ?? null); }
    list(q) { return this.s.list(q); }
    unlink(a, id) { return this.s.unlink(a, did(id)); }
    refresh(id) { return this.s.refresh(did(id)); }
};
exports.VerificationController = VerificationController;
__decorate([
    (0, common_1.Get)('oauth'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "oauthSettings", null);
__decorate([
    (0, common_1.Put)('oauth'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(roblox_oauth_service_1.oauthSettingsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "saveOauth", null);
__decorate([
    (0, common_1.Get)('config'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "config", null);
__decorate([
    (0, common_1.Put)('config'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(verification_service_1.verifyConfigSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0, Object]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('panel'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(guildQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "panel", null);
__decorate([
    (0, common_1.Get)('links'),
    (0, decorators_1.RequirePermission)('settings.view'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "list", null);
__decorate([
    (0, common_1.Delete)('links/:discordId'),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('discordId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "unlink", null);
__decorate([
    (0, common_1.Post)('links/:discordId/refresh'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('settings.manage'),
    __param(0, (0, common_1.Param)('discordId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], VerificationController.prototype, "refresh", null);
exports.VerificationController = VerificationController = __decorate([
    (0, swagger_1.ApiTags)('verification'),
    (0, common_1.Controller)('verification'),
    __metadata("design:paramtypes", [verification_service_1.VerificationService, roblox_oauth_service_1.RobloxOAuthService])
], VerificationController);
/** Dienstweg des Bots: Verifizieren, Status (Beitritt, /aktualisieren), Panel-Ort melden. */
let BotVerificationController = class BotVerificationController {
    s;
    oauth;
    constructor(s, oauth) {
        this.s = s;
        this.oauth = oauth;
    }
    /** „Mit Roblox anmelden“: eingerichtet? Dann Anmelde-Link für dieses Mitglied. */
    async oauthLink(b) { return (await this.oauth.enabled()) ? { enabled: true, ...(await this.oauth.link(b.guildId, b.discordId, b.discordName)) } : { enabled: false }; }
    config(q) { return this.s.config(q.guildId); }
    start(b) { return this.s.start(b.guildId, b.discordId, b.roblox); }
    check(b) { return this.s.check(b.guildId, b.discordId, b.discordName); }
    status(b) { return this.s.status(b.guildId, b.discordId, b.discordName); }
    whois(q) { return this.s.whois(q.discordId); }
    unlink(b) { return this.s.unlink(null, b.discordId); }
    posted(b) { return this.s.panelPosted(b.guildId ?? null, b.channelId, b.messageId); }
};
exports.BotVerificationController = BotVerificationController;
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)(fast),
    (0, common_1.Post)('oauth'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(member))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", Promise)
], BotVerificationController.prototype, "oauthLink", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('config'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "config", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)(fast),
    (0, common_1.Post)('start'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(member.extend({ roblox: zod_1.z.string().trim().min(1).max(100) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "start", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)(fast),
    (0, common_1.Post)('check'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(member))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "check", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, throttler_1.Throttle)(fast),
    (0, common_1.Post)('status'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(member))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [void 0]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "status", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Get)('whois'),
    __param(0, (0, common_1.Query)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "whois", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('unlink'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ discordId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "unlink", null);
__decorate([
    (0, decorators_1.BotService)(),
    (0, common_1.Post)('panel-posted'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)((0, zod_pipe_1.zodBody)(zod_1.z.object({ guildId: sf.nullish(), channelId: sf, messageId: sf })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], BotVerificationController.prototype, "posted", null);
exports.BotVerificationController = BotVerificationController = __decorate([
    (0, swagger_1.ApiTags)('bot'),
    (0, common_1.Controller)('bot/verify'),
    __metadata("design:paramtypes", [verification_service_1.VerificationService, roblox_oauth_service_1.RobloxOAuthService])
], BotVerificationController);
const page = (ok, title, text) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e5e7eb;font:16px system-ui,sans-serif;padding:16px}main{max-width:420px;text-align:center;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px}h1{font-size:22px;margin:8px 0}p{color:#9ca3af}.i{font-size:42px}</style></head>
<body><main><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${text}</p></main></body></html>`;
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** Rücksprung von Roblox (diese Adresse muss in der Roblox-OAuth-App als Redirect-URL stehen). */
let RobloxOAuthController = class RobloxOAuthController {
    oauth;
    constructor(oauth) {
        this.oauth = oauth;
    }
    async callback(code, state, error, res) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        if (error)
            return res.status(400).send(page(false, 'Abgebrochen', 'Die Anmeldung bei Roblox wurde abgebrochen. Klick in Discord noch einmal auf „Verifizieren“.'));
        try {
            const r = await this.oauth.callback(code, state);
            return res.send(page(true, `Verifiziert als ${esc(r.robloxName)}`, 'Dein Roblox-Konto ist jetzt mit Discord verknüpft. Rollen und Nickname kommen in ein paar Sekunden – du kannst dieses Fenster schließen und zurück zu Discord gehen.'));
        }
        catch (e) {
            return res.status(400).send(page(false, 'Nicht verifiziert', esc(e instanceof roblox_oauth_service_1.RobloxOAuthFailure ? e.message : 'Etwas ist schiefgelaufen. Versuch es noch einmal.')));
        }
    }
};
exports.RobloxOAuthController = RobloxOAuthController;
__decorate([
    (0, decorators_1.Public)(),
    (0, throttler_1.Throttle)({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, ttl: 60_000 } }),
    (0, common_1.Get)('callback'),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('error')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], RobloxOAuthController.prototype, "callback", null);
exports.RobloxOAuthController = RobloxOAuthController = __decorate([
    (0, swagger_1.ApiTags)('verification'),
    (0, common_1.Controller)('verify/roblox'),
    __metadata("design:paramtypes", [roblox_oauth_service_1.RobloxOAuthService])
], RobloxOAuthController);
//# sourceMappingURL=verification.controller.js.map