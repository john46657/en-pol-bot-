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
const RECOVERY_COUNT = 10;
const sha = (s) => (0, node_crypto_1.createHash)('sha256').update(s.replace(/[\s-]/g, '').toUpperCase()).digest('hex');
/**
 * Zwei-Faktor-Anmeldung (TOTP, Authenticator-App) für den Passwort-Login.
 * - Einrichten: Geheimnis erzeugen → in der App hinzufügen → mit einem Code bestätigen → 10 Wiederherstellungscodes (einmalig sichtbar).
 * - Anmelden: Passwort ok → kurzlebiges Ticket → Code oder Wiederherstellungscode → Sitzung.
 * - Geheimnis verschlüsselt (wie die ER:LC-Keys), Wiederherstellungscodes nur als Hash, jeder Code nur einmal gültig.
 * „Mit Discord anmelden“ nutzt die Zwei-Faktor-Sicherung von Discord und fragt hier nicht zusätzlich.
 */
let TwoFactorService = class TwoFactorService {
    prisma;
    audit;
    secret = (0, env_1.loadEnv)().SESSION_SECRET;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    // ---- Ticket zwischen Passwort und Code (signiert, 5 Minuten gültig) ----
    ticket(userId) {
        const exp = Date.now() + TICKET_MS;
        const body = `${userId}.${exp}.${(0, node_crypto_1.randomBytes)(8).toString('hex')}`;
        return `${body}.${(0, node_crypto_1.createHmac)('sha256', this.secret).update(`2fa:${body}`).digest('base64url')}`;
    }
    readTicket(ticket) {
        const parts = ticket.split('.');
        if (parts.length !== 4)
            throw new errors_1.AppError('UNAUTHENTICATED', 'Anmeldung abgelaufen – bitte erneut anmelden.');
        const [userId, exp, nonce, sig] = parts;
        const expected = (0, node_crypto_1.createHmac)('sha256', this.secret).update(`2fa:${userId}.${exp}.${nonce}`).digest('base64url');
        const a = Buffer.from(sig), b = Buffer.from(expected);
        if (a.length !== b.length || !(0, node_crypto_1.timingSafeEqual)(a, b) || Number(exp) < Date.now())
            throw new errors_1.AppError('UNAUTHENTICATED', 'Anmeldung abgelaufen – bitte erneut anmelden.');
        return userId;
    }
    /** Code (TOTP) oder Wiederherstellungscode prüfen und verbrauchen. */
    async consume(userId, code) {
        const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpLastStep: true, totpRecovery: true, totpEnabledAt: true } });
        if (!u?.totpEnabledAt || !u.totpSecret)
            return null;
        const secret = (0, erlc_crypto_1.decryptSecret)(u.totpSecret);
        if (secret) {
            const step = (0, totp_1.verifyTotp)(secret, code, Date.now(), u.totpLastStep);
            if (step !== null) {
                // nur verbrauchen, wenn niemand denselben Schritt gerade benutzt hat
                const n = await this.prisma.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
                return n.count ? 'totp' : null;
            }
        }
        const h = sha(code);
        if (/^[A-Z0-9-]{8,14}$/i.test(code.trim()) && u.totpRecovery.includes(h)) {
            await this.prisma.user.update({ where: { id: userId }, data: { totpRecovery: u.totpRecovery.filter((x) => x !== h) } });
            return 'recovery';
        }
        return null;
    }
    async status(userId) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { totpEnabledAt: true, totpRecovery: true } });
        return { enabled: !!u.totpEnabledAt, enabledAt: u.totpEnabledAt, recoveryLeft: u.totpRecovery.length };
    }
    async setup(actor) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { username: true, totpEnabledAt: true } });
        if (u.totpEnabledAt)
            throw new errors_1.AppError('CONFLICT', 'Zwei-Faktor ist bereits aktiv.');
        const secret = (0, totp_1.newSecret)();
        await this.prisma.user.update({ where: { id: actor.userId }, data: { totpPending: (0, erlc_crypto_1.encryptSecret)(secret) } });
        const org = (await this.prisma.systemSetting.findUnique({ where: { key: 'org.name' } }))?.value;
        return { secret, otpauthUrl: (0, totp_1.otpauthUrl)(secret, u.username, typeof org === 'string' ? org : 'EN Polizei') };
    }
    recoveryCodes() {
        const codes = Array.from({ length: RECOVERY_COUNT }, () => { const r = (0, node_crypto_1.randomBytes)(5).toString('hex').toUpperCase(); return `${r.slice(0, 5)}-${r.slice(5)}`; });
        return { codes, hashes: codes.map(sha) };
    }
    async enable(actor, code) {
        const u = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { totpPending: true, totpEnabledAt: true } });
        if (u.totpEnabledAt)
            throw new errors_1.AppError('CONFLICT', 'Zwei-Faktor ist bereits aktiv.');
        const secret = u.totpPending ? (0, erlc_crypto_1.decryptSecret)(u.totpPending) : null;
        if (!secret)
            throw new errors_1.AppError('CONFLICT', 'Bitte zuerst die Einrichtung starten.');
        const step = (0, totp_1.verifyTotp)(secret, code);
        if (step === null)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der Code stimmt nicht. Uhrzeit des Handys prüfen und den aktuellen Code eingeben.');
        const { codes, hashes } = this.recoveryCodes();
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: actor.userId }, data: { totpSecret: (0, erlc_crypto_1.encryptSecret)(secret), totpPending: null, totpEnabledAt: new Date(), totpLastStep: step, totpRecovery: hashes } });
            await this.audit.record(actor, { action: 'auth.2fa.enable', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
        });
        return { recoveryCodes: codes };
    }
    /** Abschalten mit aktuellem Code oder Wiederherstellungscode. */
    async disable(actor, code) {
        if (!(await this.consume(actor.userId, code)))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der Code stimmt nicht.');
        await this.clear(actor, actor.userId, 'auth.2fa.disable');
    }
    async regenerate(actor, code) {
        if (!(await this.consume(actor.userId, code)))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der Code stimmt nicht.');
        const { codes, hashes } = this.recoveryCodes();
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: actor.userId }, data: { totpRecovery: hashes } });
            await this.audit.record(actor, { action: 'auth.2fa.recovery_regenerated', module: 'auth', entityType: 'User', entityId: actor.userId }, tx);
        });
        return { recoveryCodes: codes };
    }
    /** Verwaltung: Zwei-Faktor eines Kontos zurücksetzen (Handy verloren und keine Wiederherstellungscodes). */
    async adminReset(actor, userId) {
        if (userId === actor.userId)
            throw new errors_1.AppError('CONFLICT', 'Die eigene Zwei-Faktor-Sicherung bitte unter „Persönlich“ abschalten.');
        if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'User not found.');
        await this.clear(actor, userId, 'auth.2fa.reset');
    }
    async clear(actor, userId, action) {
        await this.prisma.$transaction(async (tx) => {
            await tx.user.update({ where: { id: userId }, data: { totpSecret: null, totpPending: null, totpEnabledAt: null, totpLastStep: null, totpRecovery: [] } });
            await this.audit.record(actor, { action, module: 'auth', entityType: 'User', entityId: userId }, tx);
        });
    }
};
exports.TwoFactorService = TwoFactorService;
exports.TwoFactorService = TwoFactorService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], TwoFactorService);
//# sourceMappingURL=two-factor.service.js.map