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
exports.AuditService = exports.setAuditSink = void 0;
exports.redact = redact;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const SENSITIVE = /password|secret|token|apikey|api_key|hash/i;
/** Entfernt Geheimnisse rekursiv, bevor Daten ins Audit-Log gelangen. */
function redact(value) {
    if (value === undefined || value === null)
        return undefined;
    return JSON.parse(JSON.stringify(value, (k, v) => (k && SENSITIVE.test(k) ? '[REDACTED]' : v)));
}
let sink = null;
const setAuditSink = (s) => { sink = s; };
exports.setAuditSink = setAuditSink;
let AuditService = class AuditService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    /** Schreibt innerhalb der übergebenen Transaktion (oder eigenständig, wenn keine übergeben wird). */
    async record(actor, entry, tx) {
        const db = tx ?? this.prisma;
        await db.auditLog.create({
            data: {
                actorUserId: actor.userId,
                actorRobloxUserId: actor.robloxUserId ?? null,
                requestId: actor.requestId,
                action: entry.action,
                module: entry.module,
                entityType: entry.entityType,
                entityId: entry.entityId,
                before: redact(entry.before),
                after: redact(entry.after),
                reason: entry.reason,
            },
        });
        if (sink)
            await sink(db, actor, { ...entry, before: redact(entry.before), after: redact(entry.after) }).catch((e) => console.error(`logging failed for ${entry.action}: ${e instanceof Error ? e.message : e}`));
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuditService);
//# sourceMappingURL=audit.service.js.map