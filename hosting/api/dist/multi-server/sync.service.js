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
exports.SyncService = exports.versionAt = exports.backoffMs = exports.MAX_ATTEMPTS = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const authorization_service_1 = require("../authz/authorization.service");
const guild_context_1 = require("../common/guild-context");
/** Endgültig fehlgeschlagen nach so vielen Versuchen (danach manuell wiederholbar). */
exports.MAX_ATTEMPTS = 6;
/** Begrenzung der Ereignisrate: höchstens so viele Ereignisse je Verbindung und Durchlauf (alle 5 s). */
const PER_CONNECTION_PER_TICK = 100;
/** Exponentieller Backoff, gedeckelt: 10 s, 20 s, 40 s … höchstens 30 min. */
const backoffMs = (attempt) => Math.min(10_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
exports.backoffMs = backoffMs;
/** Versionsnummer aus einem Zeitpunkt (Sekunden seit 2020 – passt in Int und steigt monoton). */
const versionAt = (d) => Math.max(1, Math.floor((d.getTime() - Date.UTC(2020, 0, 1)) / 1000));
exports.versionAt = versionAt;
/**
 * Serverübergreifende Synchronisierung (Outbox-Pattern):
 * 1. Eine autorisierte Aktion ändert einen Datensatz und ruft `emit` IN DERSELBEN Transaktion auf.
 * 2. `emit` prüft die Datenfreigaben (aktive Verbindung, Richtung) und legt je Ziel ein `SyncEvent` mit Idempotenzschlüssel an.
 * 3. Der Hintergrundprozess holt Ereignisse mit `FOR UPDATE SKIP LOCKED` (mehrere Instanzen ok), prüft die Freigabe auf der
 *    Zielseite ERNEUT und schreibt eine nur lesbare Kopie (`SyncedRecord`) – idempotent und mit Versionsprüfung.
 * Synchronisierte Kopien lösen nie neue Ereignisse aus (keine Schleifen). Fachdatensätze werden nie gelöscht.
 */
let SyncService = class SyncService {
    prisma;
    audit;
    authz;
    log = new common_1.Logger('Sync');
    timer;
    running = false;
    constructor(prisma, audit, authz) {
        this.prisma = prisma;
        this.audit = audit;
        this.authz = authz;
    }
    onApplicationBootstrap() {
        if (process.env.NODE_ENV === 'test')
            return;
        this.timer = setInterval(() => void this.tick().catch((e) => this.log.error(e.message)), 5_000);
        this.timer.unref();
    }
    onModuleDestroy() { if (this.timer)
        clearInterval(this.timer); }
    /** Ereignisse für alle aktiven Freigaben des Quellservers anlegen. Ohne registrierten Server/Freigabe: nichts. Liefert die Anzahl. */
    async emit(tx, e) {
        const guildId = e.sourceGuildId === undefined ? (0, guild_context_1.currentGuild)() : e.sourceGuildId;
        if (!guildId || !shared_1.SYNC_DATA_TYPES.some((t) => t.key === e.dataType))
            return 0;
        const source = await tx.discordServer.findUnique({ where: { guildId }, select: { id: true, status: true, archivedAt: true } });
        if (!source || source.status === 'DISABLED' || source.archivedAt)
            return 0;
        const policies = await tx.connectionDataPolicy.findMany({
            where: { dataType: e.dataType, enabled: true, direction: { not: 'NONE' }, connection: { status: 'ACTIVE' }, OR: [{ sourceServerId: source.id }, { targetServerId: source.id }] },
        });
        const data = [];
        for (const p of policies) {
            const target = p.sourceServerId === source.id ? p.targetServerId : p.sourceServerId;
            if (!(0, shared_1.policyAllowsFlow)(p, source.id, target))
                continue; // unidirektional bleibt unidirektional
            const idempotencyKey = (0, node_crypto_1.createHash)('sha256').update([p.id, target, e.dataType, e.eventType, e.recordId, e.version].join('|')).digest('hex');
            data.push({ connectionId: p.connectionId, policyId: p.id, sourceServerId: source.id, targetServerId: target, dataType: e.dataType, eventType: e.eventType, sourceRecordId: e.recordId, sourceVersion: e.version, idempotencyKey, payload: e.payload });
        }
        if (!data.length)
            return 0;
        const r = await tx.syncEvent.createMany({ data, skipDuplicates: true });
        return r.count;
    }
    /** Ein Durchlauf des Hintergrundprozesses. */
    async tick(now = new Date()) {
        if (this.running)
            return { processed: 0 };
        this.running = true;
        try {
            let processed = 0;
            const perConnection = new Map();
            for (let i = 0; i < 500; i++) {
                const r = await this.processNext(now, perConnection);
                if (r === 'none')
                    break;
                processed++;
            }
            return { processed };
        }
        finally {
            this.running = false;
        }
    }
    /** Nächstes fälliges Ereignis verarbeiten (gesperrt, damit keine zweite Instanz es gleichzeitig bearbeitet). */
    async processNext(now, perConnection) {
        let failed = null;
        const r = await this.prisma.$transaction(async (tx) => {
            const skip = [...perConnection.entries()].filter(([, n]) => n >= PER_CONNECTION_PER_TICK).map(([c]) => c);
            const rows = await tx.$queryRaw `
        SELECT "id", "connectionId", "policyId", "sourceServerId", "targetServerId", "dataType", "sourceRecordId", "sourceVersion", "payload", "attemptCount"
        FROM "SyncEvent" WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
        ${skip.length ? client_1.Prisma.sql `AND "connectionId" NOT IN (${client_1.Prisma.join(skip.map((c) => client_1.Prisma.sql `${c}::uuid`))})` : client_1.Prisma.empty}
        ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
            const ev = rows[0];
            if (!ev)
                return 'none';
            perConnection.set(ev.connectionId, (perConnection.get(ev.connectionId) ?? 0) + 1);
            try {
                const outcome = await this.apply(tx, ev);
                await tx.syncEvent.update({ where: { id: ev.id }, data: { status: outcome.status, lastError: outcome.note ?? null, processedAt: new Date(), attemptCount: { increment: 1 } } });
                if (outcome.status === 'SKIPPED')
                    await this.audit.record({ userId: null }, { action: 'sync.conflict', module: 'sync', entityType: 'ServerConnection', entityId: ev.connectionId, serverId: null, after: { eventId: ev.id, dataType: ev.dataType, recordId: ev.sourceRecordId, version: ev.sourceVersion, note: outcome.note } }, tx);
            }
            catch (e) {
                failed = { ev, error: e instanceof Error ? e.message : String(e) };
                throw e;
            }
            return 'done';
        }).catch(async (e) => {
            if (!failed)
                throw e;
            return 'failed';
        });
        if (r === 'failed' && failed)
            await this.markFailed(failed.ev, failed.error, now);
        return r === 'none' ? 'none' : 'done';
    }
    async markFailed(ev, error, now) {
        const attempts = ev.attemptCount + 1;
        const final = attempts >= exports.MAX_ATTEMPTS;
        // nur die Fehlermeldung, nie den Inhalt des Datensatzes protokollieren
        await this.prisma.syncEvent.update({ where: { id: ev.id }, data: { attemptCount: attempts, lastError: error.slice(0, 300), status: final ? 'FAILED' : 'PENDING', nextAttemptAt: new Date(now.getTime() + (0, exports.backoffMs)(attempts)) } });
        if (final)
            await this.audit.record({ userId: null }, { action: 'sync.failed', module: 'sync', entityType: 'ServerConnection', entityId: ev.connectionId, serverId: null, result: 'FAILED', after: { eventId: ev.id, dataType: ev.dataType, attempts } });
    }
    /** Zielseite: Freigabe erneut prüfen und die Kopie idempotent schreiben. */
    async apply(tx, ev) {
        const [connection, policy, target] = await Promise.all([
            tx.serverConnection.findUnique({ where: { id: ev.connectionId }, select: { status: true } }),
            tx.connectionDataPolicy.findUnique({ where: { id: ev.policyId } }),
            tx.discordServer.findUnique({ where: { id: ev.targetServerId }, select: { status: true, archivedAt: true } }),
        ]);
        if (!connection || connection.status !== 'ACTIVE')
            return { status: 'CANCELLED', note: 'Verbindung deaktiviert' };
        if (!policy || policy.dataType !== ev.dataType || !(0, shared_1.policyAllowsFlow)(policy, ev.sourceServerId, ev.targetServerId))
            return { status: 'CANCELLED', note: 'Freigabe nicht mehr aktiv' };
        if (!target || target.archivedAt || target.status === 'DISABLED')
            return { status: 'CANCELLED', note: 'Zielserver deaktiviert' };
        const module = shared_1.SYNC_DATA_TYPES.find((t) => t.key === ev.dataType)?.module;
        if (module && (await this.authz.disabledModules(ev.targetServerId)).has(module))
            return { status: 'CANCELLED', note: 'Modul auf dem Zielserver aus' };
        const key = { targetServerId_dataType_sourceRecordId: { targetServerId: ev.targetServerId, dataType: ev.dataType, sourceRecordId: ev.sourceRecordId } };
        const existing = await tx.syncedRecord.findUnique({ where: key, select: { sourceVersion: true } });
        // Konflikterkennung: ältere Stände überschreiben nie neuere; gleiche Version = schon verarbeitet (idempotent)
        if (existing && existing.sourceVersion > ev.sourceVersion)
            return { status: 'SKIPPED', note: `veraltet: Ziel hat Version ${existing.sourceVersion}` };
        if (existing && existing.sourceVersion === ev.sourceVersion)
            return { status: 'DONE', note: 'bereits übernommen' };
        const data = (ev.payload ?? {});
        await tx.syncedRecord.upsert({
            where: key,
            create: { targetServerId: ev.targetServerId, sourceServerId: ev.sourceServerId, connectionId: ev.connectionId, dataType: ev.dataType, sourceRecordId: ev.sourceRecordId, sourceVersion: ev.sourceVersion, data },
            update: { sourceServerId: ev.sourceServerId, connectionId: ev.connectionId, sourceVersion: ev.sourceVersion, data },
        });
        return { status: 'DONE' };
    }
    /** Fehlgeschlagene Ereignisse erneut einreihen. Idempotent: bereits übernommene Stände werden nicht doppelt geschrieben. */
    async retryFailed(actor, connectionId) {
        const r = await this.prisma.$transaction(async (tx) => {
            const u = await tx.syncEvent.updateMany({ where: { connectionId, status: 'FAILED' }, data: { status: 'PENDING', attemptCount: 0, nextAttemptAt: new Date(), lastError: null } });
            await this.audit.record(actor, { action: 'sync.retry', module: 'sync', entityType: 'ServerConnection', entityId: connectionId, serverId: null, after: { events: u.count } }, tx);
            return u.count;
        });
        return { requeued: r };
    }
    /** Verbindung/Freigabe abgeschaltet: offene Ereignisse werden verworfen (CANCELLED), Fachdaten bleiben unberührt. */
    async cancelPending(tx, where, note) {
        return (await tx.syncEvent.updateMany({ where: { ...where, status: 'PENDING' }, data: { status: 'CANCELLED', lastError: note, processedAt: new Date() } })).count;
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, authorization_service_1.AuthorizationService])
], SyncService);
//# sourceMappingURL=sync.service.js.map