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
var TwoFactorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoFactorService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
const erlc_crypto_1 = require("../cad/erlc-crypto");
const totp_1 = require("./totp");
const TICKET_MS = 5 * 60_000;
const ISSUER = 'EN Polizei';
const sha256 = (s) => (0, node_crypto_1.createHash)('sha256').update(s).digest('hex');
/**
 * Zwei-Faktor-Anmeldung (TOTP) für den Passwort-Login. Das Geheimnis liegt verschlüsselt in der Datenbank
 * (gleicher Schlüssel wie die ER:LC-Server-Keys: `ERLC_SECRET_KEY` bzw. `SESSION_SECRET`). Zwischen Passwort und Code
 * bekommt der Browser nur ein kurzlebiges, signiertes Ticket – erst nach dem Code entsteht eine Session.
 */
let TwoFactorService = class TwoFactorService {
    static { TwoFactorService_1 = this; }
    prisma;
    audit;
    env = (0, env_1.loadEnv)();
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    // ───────────── Ticket zwischen Passwort und Code ─────────────
    sign(payload) { return (0, node_crypto_1.createHmac)('sha256', `2fa:${this.env.SESSION_SECRET}`).update(payload).digest('base64url'); }
    issueTicket(userId, now = Date.now()) {
        const payload = `${userId}.${now + TICKET_MS}`;
        return `${Buffer.from(payload).toString('base64url')}.${this.sign(payload)}`;
    }
    /** Benutzer-ID aus einem gültigen, nicht abgelaufenen Ticket – sonst `null`. */
    readTicket(ticket, now = Date.now()) {
        const [p, sig] = ticket.split('.');
        if (!p || !sig)
            return null;
        const payload = Buffer.from(p, 'base64url').toString('utf8');
        const expected = Buffer.from(this.sign(payload)), got = Buffer.from(sig);
        if (expected.length !== got.length || !(0, node_crypto_1.timingSafeEqual)(expected, got))
            return null;
        const [userId, exp] = payload.split('.');
        return userId && Number(exp) > now ? userId : null;
    }
    // ───────────── Prüfung ─────────────
    /**
     * Prüft einen Authenticator- oder Wiederherstellungscode und „verbraucht“ ihn (TOTP-Zeitschritt bzw. Code wird
     * entfernt). Atomar: zwei gleichzeitige Anmeldungen mit demselben Code gelingen nicht beide.
     */
    async consume(userId, code) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpRecovery: true } });
        if (!u?.totpEnabledAt || !u.totpSecret)
            return null;
        const secret = (0, erlc_crypto_1.decryptSecret)(u.totpSecret);
        const step = secret ? (0, totp_1.verifyTotp)(secret, code, Date.now(), u.totpLastStep) : null;
        if (step !== null) {
            const r = await this.prisma.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
            return r.count ? 'totp' : null;
        }
        const norm = (0, totp_1.normalizeRecovery)(code);
        if (norm.length !== 10)
            return null;
        const hash = sha256(norm);
        if (!u.totpRecovery.includes(hash))
            return null;
        const r = await this.prisma.user.updateMany({ where: { id: userId, totpRecovery: { has: hash } }, data: { totpRecovery: u.totpRecovery.filter((h) => h !== hash) } });
        return r.count ? 'recovery' : null;
    }
    // ───────────── Selbstverwaltung ─────────────
    async status(userId) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true, totpRecovery: true } });
        return { enabled: !!u.totpEnabledAt, enabledAt: u.totpEnabledAt, recoveryCodesLeft: u.totpEnabledAt ? u.totpRecovery.length : 0 };
    }
    /** Schritt 1: neues Geheimnis erzeugen (noch nicht aktiv, bis ein Code bestätigt wurde). */
    async setup(actor) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { username: true, totpEnabledAt: true } });
        if (u.totpEnabledAt)
            throw new errors_1.AppError('CONFLICT', 'Two-factor authentication is already enabled.');
        const secret = (0, totp_1.newSecret)();
        await this.prisma.user.update({ where: { id: actor.userId }, data: { totpPending: (0, erlc_crypto_1.encryptSecret)(secret) } });
        return { secret, otpauthUrl: (0, totp_1.otpauthUrl)(secret, u.username, ISSUER) };
    }
    /** Schritt 2: Code aus der App bestätigen → aktiv; liefert die Wiederherstellungscodes (nur dieses eine Mal). */
    async enable(actor, code) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { totpPending: true, totpEnabledAt: true } });
        if (u.totpEnabledAt)
            throw new errors_1.AppError('CONFLICT', 'Two-factor authentication is already enabled.');
        const secret = u.totpPending ? (0, erlc_crypto_1.decryptSecret)(u.totpPending) : null;
        if (!secret)
            throw new errors_1.AppError('CONFLICT', 'Start the setup first.');
        const step = (0, totp_1.verifyTotp)(secret, code);
        if (step === null)
            throw new errors_1.AppError('VALIDATION_FAILED', 'The code is not correct. Check the time on your phone and try again.');
        const codes = (0, totp_1.newRecoveryCodes)();
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: actor.userId }, data: { totpSecret: u.totpPending, totpPending: null, totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: codes.map((c) => sha256((0, totp_1.normalizeRecovery)(c))) } });
            await this.audit.record(actor, { action: 'auth.2fa.enable', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
        });
        return { recoveryCodes: codes };
    }
    async disable(actor, code) {
        if (!(await this.consume(actor.userId, code)))
            throw new errors_1.AppError('VALIDATION_FAILED', 'The code is not correct.');
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: actor.userId }, data: TwoFactorService_1.cleared });
            await this.audit.record(actor, { action: 'auth.2fa.disable', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
        });
    }
    async regenerateRecovery(actor, code) {
        if (!(await this.consume(actor.userId, code)))
            throw new errors_1.AppError('VALIDATION_FAILED', 'The code is not correct.');
        const codes = (0, totp_1.newRecoveryCodes)();
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: actor.userId }, data: { totpRecovery: codes.map((c) => sha256((0, totp_1.normalizeRecovery)(c))) } });
            await this.audit.record(actor, { action: 'auth.2fa.recovery_regenerate', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
        });
        return { recoveryCodes: codes };
    }
    static cleared = { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: [] };
};
exports.TwoFactorService = TwoFactorService;
exports.TwoFactorService = TwoFactorService = TwoFactorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], TwoFactorService);
//# sourceMappingURL=two-factor.service.js.map