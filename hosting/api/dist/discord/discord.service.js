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
exports.DiscordService = exports.CHANNEL_KEYS = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 10 * 60_000;
const hash = (c) => (0, node_crypto_1.createHash)('sha256').update(c.toUpperCase().replace(/[\s-]/g, '')).digest('hex');
exports.CHANNEL_KEYS = ['dispatch', 'wanted', 'announcements', 'applications', 'danger', 'sek', 'qualifications', 'duty', 'tickets', 'cad'];
const GUILDS_KEY = 'discord.guilds';
let DiscordService = class DiscordService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    // ---- Verknüpfung (Web-Benutzer erzeugt Code, Bot löst ihn ein) ----
    async createLinkCode(actor) {
        const userId = actor.userId;
        if (await this.prisma.discordLink.findUnique({ where: { userId } }))
            throw new errors_1.AppError('CONFLICT', 'Dein Konto ist bereits mit Discord verknüpft. Hebe die Verknüpfung zuerst auf.');
        let raw = '';
        for (let i = 0; i < 8; i++)
            raw += ALPHABET[(0, node_crypto_1.randomInt)(ALPHABET.length)];
        const expiresAt = new Date(Date.now() + CODE_TTL_MS);
        await this.prisma.$transaction(async (tx) => {
            await tx.discordLinkCode.deleteMany({ where: { userId, usedAt: null } }); // nur ein offener Code pro Benutzer
            await tx.discordLinkCode.create({ data: { userId, codeHash: hash(raw), expiresAt } });
            await this.audit.record(actor, { action: 'discord.link.code_created', module: 'discord', entityType: 'User', entityId: userId }, tx);
        });
        return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt };
    }
    /** Vom Bot aufgerufen. Einmalig, zeitlich begrenzt; ein Discord-Konto kann nur mit einem Benutzer verknüpft sein. */
    async redeem(code, discordId) {
        const row = await this.prisma.discordLinkCode.findUnique({ where: { codeHash: hash(code) }, });
        if (!row || row.usedAt || row.expiresAt < new Date())
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der Code ist ungültig oder abgelaufen.');
        const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
        if (!user?.active)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der Code ist ungültig oder abgelaufen.');
        try {
            await this.prisma.$transaction(async (tx) => {
                const claimed = await tx.discordLinkCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
                if (claimed.count === 0)
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Der Code ist ungültig oder abgelaufen.');
                await tx.discordLink.create({ data: { userId: row.userId, discordId } });
                await this.audit.record({ userId: row.userId, robloxUserId: user.robloxUserId }, { action: 'discord.link', module: 'discord', entityType: 'User', entityId: row.userId, after: { discordId } }, tx);
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', 'Dieses Discord-Konto bzw. dieser Benutzer ist bereits verknüpft.');
            throw e;
        }
        return { displayName: user.displayName, username: user.username };
    }
    async unlink(actor, userId) {
        const link = await this.prisma.discordLink.findUnique({ where: { userId } });
        if (!link)
            throw new errors_1.AppError('NOT_FOUND', 'Keine Discord-Verknüpfung vorhanden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.discordLink.delete({ where: { userId } });
            await this.audit.record(actor, { action: 'discord.unlink', module: 'discord', entityType: 'User', entityId: userId, before: { discordId: link.discordId } }, tx);
        });
    }
    async status(userId) {
        const link = await this.prisma.discordLink.findUnique({ where: { userId } });
        return { linked: !!link, discordId: link?.discordId ?? null, linkedAt: link?.linkedAt ?? null };
    }
    /** Auflösung Discord-ID → aktiver Benutzer (für die Bot-Authentifizierung). */
    async resolveUser(discordId) {
        const link = await this.prisma.discordLink.findUnique({ where: { discordId } });
        if (!link)
            return null;
        const user = await this.prisma.user.findUnique({ where: { id: link.userId } });
        return user?.active ? user : null;
    }
    // ---- Ausgangs-Warteschlange ----
    async channels() {
        return (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value ?? {};
    }
    /** Nur Einreihen, wenn für den Kanal-Schlüssel ein Channel konfiguriert ist (kein Datenanfall ohne Bot). Fehler dürfen den Fachprozess nie stören. */
    async enqueue(channelKey, type, payload, opts = {}) {
        try {
            const ch = await this.channels();
            if (!ch[channelKey] && !opts.always)
                return; // `always`: z. B. Direktnachrichten brauchen keinen Channel
            await this.prisma.discordOutbox.create({ data: { type, channelKey, payload: payload } });
        }
        catch { /* Benachrichtigung ist best effort */ }
    }
    /**
     * Antrags-/Bewerbungsnachricht in Discord nach der Entscheidung anpassen (egal ob im Dashboard oder in Discord entschieden):
     * Farbe, Feld „Entscheidung“, Annehmen/Ablehnen-Buttons weg. Der Bot hat sich beim Posten gemerkt, wo sie steht (`msg-<art>-<id>`).
     */
    async markDecided(kind, id, actor, outcome, reason) {
        let by = 'Automatik';
        if (actor.userId) {
            const [user, link] = await Promise.all([this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }), this.prisma.discordLink.findUnique({ where: { userId: actor.userId } })]);
            by = link ? `<@${link.discordId}>${user ? ` (${user.displayName})` : ''}` : user?.displayName ?? 'dem Team';
        }
        const head = outcome === 'ACCEPTED' ? `✅ Angenommen von ${by}` : outcome === 'REJECTED' ? `❌ Abgelehnt von ${by}` : '↩️ Zurückgezogen';
        const text = `${head}${reason ? `\n**Grund:** ${reason}` : ''}`.slice(0, 1024);
        const color = outcome === 'ACCEPTED' ? 0x22c55e : outcome === 'REJECTED' ? 0xef4444 : 0x64748b;
        await this.enqueue('applications', 'message.decided', { key: `msg-${kind[0]}-${id}`, text, color }, { always: true });
    }
    /**
     * „Ticket mit Bewerber öffnen“ aus dem Dashboard: der Bot legt (wie beim Discord-Button) einen privaten Kanal mit Person, Team-Rolle und dir an.
     * Server: der der Bewerbung, sonst der eingestellte Haupt-Server.
     */
    async applicantTicket(actor, a, entityType) {
        if (!a.discordId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Bewerbung kam nicht über Discord – es gibt keinen Discord-Benutzer für ein Ticket.');
        const guildId = a.guildId ?? (await this.channels()).guildId ?? (await this.guilds())[0]?.id;
        if (!guildId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Kein Discord-Server bekannt – ist der Bot online?');
        const link = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
        await this.prisma.$transaction(async (tx) => {
            await tx.discordOutbox.create({ data: { type: 'application.ticket', channelKey: 'applications', payload: { guildId, discordId: a.discordId, userName: a.discordName ?? a.robloxUsername ?? a.discordId, number: a.number, unitName: a.unitName ?? null, requesterId: link?.discordId ?? null } } });
            await this.audit.record(actor, { action: 'application.ticket', module: 'applications', entityType, entityId: a.id, after: { guildId } }, tx);
        });
        return { queued: true, linked: !!link };
    }
    // ---- Bot-Zustand (z. B. IDs der selbst aktualisierenden Nachrichten) ----
    /** Server des Bots mit Channels und Rollen (meldet der Bot regelmäßig) – für Namen und Auswahllisten im Dashboard. */
    async guilds() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: GUILDS_KEY } }))?.value;
        return Array.isArray(v) ? v : [];
    }
    async saveGuilds(guilds) {
        const value = guilds;
        await this.prisma.systemSetting.upsert({ where: { key: GUILDS_KEY }, create: { key: GUILDS_KEY, value }, update: { value } });
    }
    /**
     * Nachricht in einen Kanal setzen oder die dort zuletzt unter `stateKey` gepostete bearbeiten (Funk-Codes, Staff-Liste, Panels …).
     * Der Bot merkt sich den Ort unter `bot.state.<stateKey>`; `posted()` liest ihn wieder.
     */
    async postMessage(stateKey, channelId, message, opts = {}) {
        await (opts.tx ?? this.prisma).discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { stateKey, channelId, message, forceNew: !!opts.forceNew } } });
    }
    async posted(stateKey) {
        const v = (await this.getState(stateKey));
        return v && typeof v.channelId === 'string' && typeof v.messageId === 'string' ? { channelId: v.channelId, messageId: v.messageId } : null;
    }
    async getState(key) {
        return (await this.prisma.systemSetting.findUnique({ where: { key: `bot.state.${key}` } }))?.value ?? null;
    }
    async setState(key, value) {
        await this.prisma.systemSetting.upsert({ where: { key: `bot.state.${key}` }, create: { key: `bot.state.${key}`, value: value }, update: { value: value } });
    }
    pending(limit) {
        return this.prisma.discordOutbox.findMany({ where: { sentAt: null, attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: limit });
    }
    async ack(id, ok, error) {
        const r = ok
            ? await this.prisma.discordOutbox.updateMany({ where: { id, sentAt: null }, data: { sentAt: new Date() } })
            : await this.prisma.discordOutbox.updateMany({ where: { id, sentAt: null }, data: { attempts: { increment: 1 }, lastError: (error ?? 'failed').slice(0, 300) } });
        if (r.count === 0)
            throw new errors_1.AppError('NOT_FOUND', 'Ausgangseintrag nicht gefunden.');
    }
};
exports.DiscordService = DiscordService;
exports.DiscordService = DiscordService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], DiscordService);
//# sourceMappingURL=discord.service.js.map