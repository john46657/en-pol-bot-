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
exports.ERLCWebhookService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const env_1 = require("../config/env");
/**
 * Pipeline: Receive → Authenticate → Validate → Normalize → Deduplicate → Process → Audit → Update.
 * Signatur: Ed25519 über (timestamp + rawBody) – laut ER:LC-Doku. Replay-Schutz: Zeitfenster + Dedupe-Key.
 */
let ERLCWebhookService = class ERLCWebhookService {
    prisma;
    audit;
    env = (0, env_1.loadEnv)();
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    verifySignature(rawBody, signatureHex, timestamp) {
        if (!signatureHex || !timestamp || !/^[0-9a-fA-F]{128}$/.test(signatureHex) || !/^\d{9,13}$/.test(timestamp))
            return false;
        try {
            const key = (0, node_crypto_1.createPublicKey)({ key: Buffer.from(this.env.ERLC_WEBHOOK_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' });
            return (0, node_crypto_1.verify)(null, Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]), key, Buffer.from(signatureHex, 'hex'));
        }
        catch {
            return false;
        }
    }
    async reject(reason, ctx) {
        await this.prisma.securityEvent.create({ data: { type: 'WEBHOOK_FAILURE', detail: reason, ip: ctx.ip, requestId: ctx.requestId } });
        throw new errors_1.AppError('PERMISSION_DENIED', 'Webhook rejected.');
    }
    async receive(rawBody, headers, ctx) {
        if (!rawBody)
            return this.reject('missing body', ctx);
        if (!this.verifySignature(rawBody, headers.signature, headers.timestamp))
            return this.reject('bad signature', ctx); // Authenticate
        const ts = Number(headers.timestamp.length > 11 ? Number(headers.timestamp) / 1000 : headers.timestamp);
        if (Math.abs(Date.now() / 1000 - ts) > this.env.ERLC_WEBHOOK_MAX_AGE_SECONDS)
            return this.reject('stale timestamp (replay window)', ctx);
        let payload; // Validate
        try {
            payload = JSON.parse(rawBody.toString('utf8'));
        }
        catch {
            throw new errors_1.AppError('VALIDATION_FAILED', 'Body must be JSON.');
        }
        if (payload === null || typeof payload !== 'object')
            throw new errors_1.AppError('VALIDATION_FAILED', 'Body must be a JSON object.');
        // Normalize: Das Payload-Schema ist in der Doku NICHT spezifiziert → nur den Typ defensiv lesen, Rohdaten unverändert speichern.
        const o = payload;
        const rawType = o.type ?? o.event ?? o.eventType;
        const type = typeof rawType === 'string' && /^[\w .:-]{1,64}$/.test(rawType) ? rawType : 'UNKNOWN';
        const dedupeKey = (0, node_crypto_1.createHash)('sha256').update(headers.timestamp).update(rawBody).digest('hex'); // Deduplicate
        try {
            const ev = await this.prisma.$transaction(async (tx) => {
                const created = await tx.eRLCEvent.create({ data: { dedupeKey, type, payload: payload, processedAt: new Date() } }); // Process
                await this.audit.record({ userId: null, requestId: ctx.requestId }, { action: 'erlc.webhook.received', module: 'erlc', entityType: 'ERLCEvent', entityId: created.id, after: { type } }, tx); // Audit
                return created;
            });
            return { status: 'processed', eventId: ev.id };
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                return { status: 'duplicate' }; // idempotent: 2xx, kein zweiter Datensatz
            throw e;
        }
    }
};
exports.ERLCWebhookService = ERLCWebhookService;
exports.ERLCWebhookService = ERLCWebhookService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], ERLCWebhookService);
//# sourceMappingURL=erlc.webhook.js.map