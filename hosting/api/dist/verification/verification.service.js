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
exports.VerificationService = exports.verifyConfigSchema = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const roblox_service_1 = require("../persons/roblox.service");
const KEY = 'verify.config';
const PANEL_KEY = 'verify.panel'; // wo das Panel steht (eigener Schlüssel, damit Autosave der Einstellungen es nicht überschreibt)
const CODE_TTL = 15 * 60_000;
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const roles = zod_1.z.array(sf).max(25).default([]);
const D = shared_1.DEFAULT_VERIFY_CONFIG;
exports.verifyConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(D.enabled),
    verifiedRoleIds: roles, unverifiedRoleIds: roles,
    nickname: zod_1.z.string().trim().max(64).default(D.nickname),
    autoOnJoin: zod_1.z.boolean().default(D.autoOnJoin),
    logChannelId: sf.nullish().transform((v) => v ?? null),
    panel: zod_1.z.object({
        channelId: sf.nullish().transform((v) => v ?? null),
        title: zod_1.z.string().trim().max(256).default(D.panel.title),
        message: zod_1.z.string().trim().max(4000).default(D.panel.message),
        color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).default(D.panel.color),
        buttonLabel: zod_1.z.string().trim().min(1).max(80).default(D.panel.buttonLabel),
    }).default({}),
    binds: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string().regex(/^[a-z0-9-]{1,40}$/),
        groupId: zod_1.z.string().regex(/^\d{1,15}$/, 'Roblox-Gruppen-ID (nur Ziffern)'),
        minRank: zod_1.z.number().int().min(0).max(255), maxRank: zod_1.z.number().int().min(0).max(255),
        roleIds: zod_1.z.array(sf).min(1, 'Wähle mindestens eine Rolle').max(10),
    })).max(50).default([]),
}).superRefine((c, ctx) => {
    c.binds.forEach((b, i) => { if (b.minRank > b.maxRank)
        ctx.addIssue({ code: 'custom', path: ['binds', i, 'maxRank'], message: '„Bis“-Rang muss mindestens so groß wie „Von“ sein.' }); });
    const both = c.verifiedRoleIds.filter((r) => c.unverifiedRoleIds.includes(r));
    if (both.length)
        ctx.addIssue({ code: 'custom', path: ['unverifiedRoleIds'], message: 'Eine Rolle kann nicht gleichzeitig „verifiziert“ und „nicht verifiziert“ sein.' });
});
/** Einfache Wörter, die Roblox im Profil nicht herausfiltert. */
const WORDS = ['apple', 'banana', 'blue', 'green', 'red', 'yellow', 'orange', 'purple', 'tiger', 'lion', 'eagle', 'falcon', 'river', 'ocean', 'forest', 'mountain', 'sunny', 'cloud', 'rain', 'snow', 'police', 'car', 'truck', 'boat', 'train', 'pizza', 'cookie', 'garden', 'flower', 'happy', 'quick', 'silver', 'golden', 'rocket', 'planet', 'star', 'moon', 'island', 'castle', 'dragon'];
const makeCode = () => Array.from({ length: 5 }, () => WORDS[(0, node_crypto_1.randomInt)(WORDS.length)]).join(' ');
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/**
 * Roblox-Verifizierung wie bei RoVer: Mitglied nennt sein Roblox-Konto, bekommt ein paar Wörter, trägt sie in „Über mich“ ein,
 * der Bot prüft das öffentliche Profil. Danach gibt es Rollen (verifiziert, Gruppen-Ränge) und den Nickname nach Vorlage – auf allen Servern.
 */
let VerificationService = class VerificationService {
    prisma;
    audit;
    roblox;
    constructor(prisma, audit, roblox) {
        this.prisma = prisma;
        this.audit = audit;
        this.roblox = roblox;
    }
    keyOf(guildId, key = KEY) { const g = (0, guild_context_1.settingsGuild)(guildId); return g ? `${key}@${g}` : key; }
    async config(guildId) {
        const own = guildId ? await this.prisma.systemSetting.findUnique({ where: { key: this.keyOf(guildId) } }) : null;
        const row = own ?? await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
        const parsed = row ? exports.verifyConfigSchema.safeParse(row.value) : null;
        const panel = (await this.prisma.systemSetting.findUnique({ where: { key: this.keyOf(guildId, PANEL_KEY) } }))?.value;
        return { ...(parsed?.success ? parsed.data : exports.verifyConfigSchema.parse({})), own: !guildId || !!own, panelMessageId: panel?.messageId ?? null };
    }
    async save(actor, input, guildId) {
        const key = this.keyOf(guildId);
        const value = input;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
            await this.audit.record(actor, { action: 'verification.config', module: 'settings', entityType: 'SystemSetting', entityId: key, after: value }, tx);
        });
        return this.config(guildId);
    }
    /** Panel („Verifizieren“-Button) posten bzw. aktualisieren. */
    async postPanel(actor, guildId) {
        const cfg = await this.config(guildId);
        if (!cfg.panel.channelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal für das Panel.');
        await this.prisma.discordOutbox.create({ data: { type: 'verify.panel', channelKey: 'announcements', payload: { guildId, channelId: cfg.panel.channelId, messageId: cfg.panelMessageId, panel: cfg.panel } } });
        await this.audit.record(actor, { action: 'verification.panel', module: 'settings', entityType: 'SystemSetting', entityId: this.keyOf(guildId) });
        return { queued: true };
    }
    async panelPosted(guildId, channelId, messageId) {
        const key = this.keyOf(guildId, PANEL_KEY);
        const value = { channelId, messageId };
        await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
        return { ok: true };
    }
    /** Schritt 1: Roblox-Konto nennen → Code. */
    async start(guildId, discordId, input) {
        if (guildId && !(await this.config(guildId)).enabled)
            throw new errors_1.AppError('CONFLICT', 'Die Roblox-Verifizierung ist auf diesem Server nicht aktiviert.');
        if (!roblox_service_1.RobloxService.parse(input))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Das ist kein gültiger Roblox-Name (3–20 Zeichen: Buchstaben, Ziffern, _).');
        const p = await this.roblox.lookup(input);
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', `Kein Roblox-Konto „${input.trim()}“ gefunden (oder Roblox ist gerade nicht erreichbar).`);
        if (p.isBanned)
            throw new errors_1.AppError('CONFLICT', 'Dieses Roblox-Konto ist von Roblox gesperrt.');
        const code = makeCode();
        const data = { robloxId: p.id, robloxName: p.name, displayName: p.displayName, code, expiresAt: new Date(Date.now() + CODE_TTL) };
        await this.prisma.robloxVerifyCode.upsert({ where: { discordId }, create: { discordId, ...data }, update: { ...data, createdAt: new Date() } });
        return { code, expiresAt: data.expiresAt, roblox: { id: p.id, name: p.name, displayName: p.displayName, avatarUrl: p.avatarUrl, profileUrl: p.profileUrl } };
    }
    /** Schritt 2: Steht der Code im Profil? Dann verknüpfen und Rollen/Nickname für diesen Server liefern. */
    async check(guildId, discordId, discordName) {
        const pending = await this.prisma.robloxVerifyCode.findUnique({ where: { discordId } });
        if (!pending)
            throw new errors_1.AppError('NOT_FOUND', 'Keine laufende Verifizierung – starte sie mit „Verifizieren“ neu.');
        if (pending.expiresAt < new Date()) {
            await this.prisma.robloxVerifyCode.delete({ where: { discordId } });
            throw new errors_1.AppError('CONFLICT', 'Der Code ist abgelaufen – starte die Verifizierung neu.');
        }
        const about = await this.roblox.description(pending.robloxId);
        if (about === null)
            throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', 'Roblox ist gerade nicht erreichbar – versuch es gleich noch einmal.');
        if (!norm(about).includes(norm(pending.code)))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Die Wörter stehen (noch) nicht in deinem Roblox-Profil unter „Über mich“. Speichere sie dort und versuch es erneut – Roblox braucht manchmal ein paar Sekunden.');
        await this.prisma.robloxVerifyCode.delete({ where: { discordId } });
        await this.linkAccount(guildId, discordId, discordName, { id: pending.robloxId, name: pending.robloxName, displayName: pending.displayName }, 'Code im Profil');
        return this.status(guildId, discordId, discordName);
    }
    /** Discord ↔ Roblox verknüpfen (nach Code-Prüfung oder „Mit Roblox anmelden“): Dashboard-Konto/CAD abgleichen, Log. */
    async linkAccount(guildId, discordId, discordName, roblox, method) {
        const data = { robloxId: roblox.id, robloxName: roblox.name, displayName: roblox.displayName, ...(discordName ? { discordName } : {}) };
        const before = await this.prisma.robloxLink.findUnique({ where: { discordId } });
        const link = await this.prisma.$transaction(async (tx) => {
            const l = await tx.robloxLink.upsert({ where: { discordId }, create: { discordId, ...data }, update: { ...data, verifiedAt: new Date() } });
            await this.audit.record({ userId: null }, { action: 'verification.verified', module: 'settings', entityType: 'RobloxLink', entityId: discordId, before: before ? { robloxId: before.robloxId, robloxName: before.robloxName } : undefined, after: { robloxId: l.robloxId, robloxName: l.robloxName, method } }, tx);
            return l;
        });
        await this.syncAccounts(link);
        await this.log(guildId, `✅ <@${discordId}> hat sich als **${link.robloxName}** verifiziert${before && before.robloxId !== link.robloxId ? ` (vorher ${before.robloxName})` : ''}.`, 0x22c55e, link.robloxId);
        return link;
    }
    /** Verknüpfung + was der Bot auf diesem Server tun soll (Rollen, Nickname). */
    async status(guildId, discordId, discordName) {
        const [cfg, link] = await Promise.all([this.config(guildId), this.prisma.robloxLink.findUnique({ where: { discordId } })]);
        if (link && discordName && link.discordName !== discordName)
            await this.prisma.robloxLink.update({ where: { discordId }, data: { discordName } }).catch(() => undefined);
        const ranks = link && cfg.binds.length ? await this.roblox.groupRanks(link.robloxId) : {};
        const actions = cfg.enabled ? (0, shared_1.verifyActions)(cfg, link ? { robloxName: link.robloxName, displayName: link.displayName, discordName: discordName ?? link.discordName ?? '', robloxId: link.robloxId, ranks } : null) : null;
        return { enabled: cfg.enabled, link: link ? this.view(link) : null, actions };
    }
    async unlink(actor, discordId) {
        const l = await this.prisma.robloxLink.findUnique({ where: { discordId } });
        if (!l)
            throw new errors_1.AppError('NOT_FOUND', 'Diese Person ist nicht verifiziert.');
        await this.prisma.robloxLink.delete({ where: { discordId } });
        if (actor)
            await this.audit.record(actor, { action: 'verification.removed', module: 'settings', entityType: 'RobloxLink', entityId: discordId, before: { robloxId: l.robloxId, robloxName: l.robloxName } });
        await this.refresh(discordId);
        await this.log(null, `🗑️ Verifizierung von <@${discordId}> (**${l.robloxName}**) wurde entfernt.`, 0xef4444);
        return { ok: true };
    }
    /** Rollen/Nickname auf allen Servern neu setzen (nach Änderungen im Dashboard). */
    async refresh(discordId) {
        await this.prisma.discordOutbox.create({ data: { type: 'verify.member', channelKey: 'announcements', payload: { discordId } } });
        return { queued: true };
    }
    async list(q) {
        const where = q.q ? { OR: [{ robloxName: { contains: q.q, mode: 'insensitive' } }, { displayName: { contains: q.q, mode: 'insensitive' } }, { discordName: { contains: q.q, mode: 'insensitive' } }, { discordId: q.q }, { robloxId: q.q }] } : {};
        const [items, total] = await Promise.all([
            this.prisma.robloxLink.findMany({ where, orderBy: { verifiedAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
            this.prisma.robloxLink.count({ where }),
        ]);
        return { items: items.map((l) => this.view(l)), total, page: q.page, pageSize: q.pageSize };
    }
    async whois(discordId) {
        const l = await this.prisma.robloxLink.findUnique({ where: { discordId } });
        return { link: l ? this.view(l) : null };
    }
    view(l) {
        return { discordId: l.discordId, discordName: l.discordName, robloxId: l.robloxId, robloxName: l.robloxName, displayName: l.displayName, verifiedAt: l.verifiedAt, profileUrl: `https://www.roblox.com/users/${l.robloxId}/profile` };
    }
    /** Verknüpftes Dashboard-Konto und CAD-Zuordnung bekommen das bestätigte Roblox-Konto (falls dort noch keins/dasselbe steht). */
    async syncAccounts(l) {
        const dl = await this.prisma.discordLink.findUnique({ where: { discordId: l.discordId } }).catch(() => null);
        if (dl) {
            const u = await this.prisma.user.findUnique({ where: { id: dl.userId }, select: { robloxUserId: true } });
            if (u && (!u.robloxUserId || u.robloxUserId === l.robloxId)) {
                await this.prisma.user.update({ where: { id: dl.userId }, data: { robloxUserId: l.robloxId, robloxUsername: l.robloxName, robloxStatus: 'VERIFIED', robloxVerifiedAt: new Date() } }).catch(() => undefined); // ID schon bei jemand anderem → überspringen
            }
        }
        await this.prisma.cadMember.updateMany({ where: { discordId: l.discordId }, data: { robloxId: l.robloxId, robloxName: l.robloxName } }).catch(() => undefined);
    }
    async log(guildId, text, color, robloxId) {
        const cfg = await this.config(guildId ?? null);
        if (!cfg.logChannelId)
            return;
        await this.prisma.discordOutbox.create({ data: { type: 'verify.log', channelKey: 'announcements', payload: { channelId: cfg.logChannelId, text, color, ...(robloxId ? { profileUrl: `https://www.roblox.com/users/${robloxId}/profile` } : {}) } } }).catch(() => undefined);
    }
};
exports.VerificationService = VerificationService;
exports.VerificationService = VerificationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, roblox_service_1.RobloxService])
], VerificationService);
//# sourceMappingURL=verification.service.js.map