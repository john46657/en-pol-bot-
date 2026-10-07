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
exports.RobloxOAuthService = exports.RobloxOAuthFailure = exports.oauthSettingsSchema = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
const web_url_1 = require("../common/web-url");
const verification_service_1 = require("./verification.service");
const KEY = 'verify.oauth';
const STATE_TTL = 10 * 60_000;
exports.oauthSettingsSchema = zod_1.z.object({
    clientId: zod_1.z.string().trim().regex(/^\d{5,25}$/, 'Client-ID: nur Ziffern (aus create.roblox.com → OAuth 2.0 Apps)').or(zod_1.z.literal('')),
    /** Leer lassen = bisheriges Secret behalten. */
    clientSecret: zod_1.z.string().trim().max(200).optional(),
});
class RobloxOAuthFailure extends Error {
}
exports.RobloxOAuthFailure = RobloxOAuthFailure;
/**
 * „Mit Roblox anmelden“ (OAuth 2.0, Scopes `openid profile`) – wie bei RoVer: Das Mitglied meldet sich direkt bei Roblox an,
 * Roblox bestätigt das Konto, danach gibt es Rollen und Nickname. Der Vorgang gehört über einen einmaligen `state` zum Discord-Mitglied.
 */
let RobloxOAuthService = class RobloxOAuthService {
    prisma;
    audit;
    verification;
    env = (0, env_1.loadEnv)();
    log = new common_1.Logger('RobloxOAuth');
    constructor(prisma, audit, verification) {
        this.prisma = prisma;
        this.audit = audit;
        this.verification = verification;
    }
    redirectUri() { return (0, web_url_1.webUrl)('/api/v1/verify/roblox/callback'); }
    async creds() {
        if (this.env.ROBLOX_CLIENT_ID && this.env.ROBLOX_CLIENT_SECRET)
            return { clientId: this.env.ROBLOX_CLIENT_ID, clientSecret: this.env.ROBLOX_CLIENT_SECRET };
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        return v?.clientId && v.clientSecret ? { clientId: v.clientId, clientSecret: v.clientSecret } : null;
    }
    async enabled() { return !!(await this.creds()); }
    /** Für das Dashboard – das Secret verlässt den Server nie. */
    async settings() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const fromEnv = !!(this.env.ROBLOX_CLIENT_ID && this.env.ROBLOX_CLIENT_SECRET);
        return { enabled: await this.enabled(), fromEnv, clientId: fromEnv ? this.env.ROBLOX_CLIENT_ID : v?.clientId ?? '', hasSecret: fromEnv || !!v?.clientSecret, redirectUri: this.redirectUri() };
    }
    async save(actor, input) {
        const cur = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const value = { clientId: input.clientId, clientSecret: input.clientId ? (input.clientSecret || cur?.clientSecret || '') : '' };
        await this.prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
        await this.audit.record(actor, { action: 'verification.oauth', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: { clientId: value.clientId, secretChanged: !!input.clientSecret } });
        return this.settings();
    }
    /** Bot: Anmelde-Link für ein Mitglied (10 Minuten, einmal verwendbar). */
    async link(guildId, discordId, discordName) {
        const c = await this.creds();
        if (!c)
            throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Die Roblox-Anmeldung ist noch nicht eingerichtet (Dashboard → Roblox-Verifizierung).');
        if (guildId && !(await this.verification.config(guildId)).enabled)
            throw new errors_1.AppError('CONFLICT', 'Die Roblox-Verifizierung ist auf diesem Server nicht aktiviert.');
        await this.prisma.robloxOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { discordId }] } });
        const state = (0, node_crypto_1.randomBytes)(24).toString('base64url');
        await this.prisma.robloxOAuthState.create({ data: { state, discordId, discordName: discordName ?? null, guildId: guildId ?? null, expiresAt: new Date(Date.now() + STATE_TTL) } });
        const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: this.redirectUri(), scope: 'openid profile', response_type: 'code', state });
        return { url: `https://apis.roblox.com/oauth/v1/authorize?${q}`, expiresAt: new Date(Date.now() + STATE_TTL) };
    }
    /** Rücksprung von Roblox: Code einlösen, Konto lesen, verknüpfen; Rollen setzt der Bot gleich auf allen Servern. */
    async callback(code, state) {
        const s = state ? await this.prisma.robloxOAuthState.findUnique({ where: { state } }) : null;
        if (s)
            await this.prisma.robloxOAuthState.delete({ where: { state: s.state } }); // nur einmal verwendbar
        if (!s || s.expiresAt < new Date())
            throw new RobloxOAuthFailure('Der Link ist abgelaufen oder wurde schon benutzt. Klick in Discord noch einmal auf „Verifizieren“.');
        const c = await this.creds();
        if (!c || !code)
            throw new RobloxOAuthFailure('Die Anmeldung bei Roblox hat nicht geklappt. Versuch es noch einmal.');
        const user = await this.fetchUser(c, code).catch((e) => { this.log.warn(`roblox oauth failed: ${e instanceof Error ? e.message : e}`); return null; });
        if (!user)
            throw new RobloxOAuthFailure('Roblox hat das Konto nicht bestätigt. Versuch es noch einmal.');
        const link = await this.verification.linkAccount(s.guildId, s.discordId, s.discordName, user, 'Roblox-Anmeldung');
        await this.verification.refresh(s.discordId);
        return { robloxName: link.robloxName, displayName: link.displayName };
    }
    async fetchUser(c, code) {
        const tok = await fetch('https://apis.roblox.com/oauth/v1/token', {
            method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
            body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: this.redirectUri() }),
        });
        if (!tok.ok)
            throw new Error(`token HTTP ${tok.status}`);
        const { access_token } = (await tok.json());
        if (!access_token)
            throw new Error('no access token');
        const info = await fetch('https://apis.roblox.com/oauth/v1/userinfo', { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000) });
        if (!info.ok)
            throw new Error(`userinfo HTTP ${info.status}`);
        const u = (await info.json());
        if (!u.sub || !/^\d{1,19}$/.test(u.sub) || !u.preferred_username)
            return null;
        return { id: u.sub, name: u.preferred_username, displayName: u.nickname || u.name || u.preferred_username };
    }
};
exports.RobloxOAuthService = RobloxOAuthService;
exports.RobloxOAuthService = RobloxOAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, verification_service_1.VerificationService])
], RobloxOAuthService);
//# sourceMappingURL=roblox-oauth.service.js.map