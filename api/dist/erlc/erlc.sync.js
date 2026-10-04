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
exports.ERLCSyncService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const erlc_client_1 = require("./erlc.client");
const erlc_types_1 = require("./erlc.types");
const env_1 = require("../config/env");
const PATHS = { SERVER: '/v1/server', PLAYERS: '/v1/server/players', VEHICLES: '/v1/server/vehicles' };
const MIN_INTERVAL_MS = 15_000; // kein aggressives Polling
const cacheKey = (c) => c;
/** Cache + Synchronisation (ERLCCacheService / ERLCSyncService). Daten sind immer als LIVE ER:LC gekennzeichnet. */
let ERLCSyncService = class ERLCSyncService {
    prisma;
    client;
    cache = new Map();
    inflight = new Map();
    env = (0, env_1.loadEnv)();
    constructor(prisma, client) {
        this.prisma = prisma;
        this.client = client;
    }
    async serverRow() {
        const externalId = this.env.ERLC_SERVER_ID ?? 'default';
        return this.prisma.eRLCServer.upsert({ where: { externalId }, create: { name: externalId, externalId }, update: {} });
    }
    async state(cap) {
        const server = await this.serverRow();
        return this.prisma.eRLCSyncState.upsert({ where: { serverId_capability: { serverId: server.id, capability: cap } }, create: { serverId: server.id, capability: cap }, update: {} });
    }
    /** Liefert gecachte Daten oder synchronisiert (max. alle 15 s, Single-Flight, respektiert Rate-Limit-Sperre). */
    async fetch(cap) {
        const hit = this.cache.get(cacheKey(cap));
        if (hit && Date.now() - hit.at < MIN_INTERVAL_MS)
            return { source: 'ERLC_LIVE', fetchedAt: new Date(hit.at).toISOString(), stale: false, data: hit.data };
        const st = await this.state(cap);
        if (st.rateLimitUntil && st.rateLimitUntil > new Date())
            return this.fallback(cap, hit, new erlc_client_1.ERLCError('RATE_LIMITED', 'Rate limit active.'));
        let p = this.inflight.get(cap);
        if (!p) {
            p = this.sync(cap, st.serverId).finally(() => this.inflight.delete(cap));
            this.inflight.set(cap, p);
        }
        try {
            await p;
        }
        catch (e) {
            return this.fallback(cap, hit, e);
        }
        const fresh = this.cache.get(cacheKey(cap));
        return { source: 'ERLC_LIVE', fetchedAt: new Date(fresh.at).toISOString(), stale: false, data: fresh.data };
    }
    fallback(cap, hit, err) {
        if (hit)
            return { source: 'ERLC_LIVE', fetchedAt: new Date(hit.at).toISOString(), stale: true, data: hit.data };
        throw err; // keine Fake-Daten: ohne echte Daten gibt es einen Fehler
    }
    async sync(cap, serverId) {
        try {
            const r = await this.client.get(PATHS[cap]);
            const data = this.normalize(cap, r.data);
            this.cache.set(cacheKey(cap), { at: Date.now(), data });
            await this.prisma.eRLCSyncState.update({ where: { serverId_capability: { serverId, capability: cap } }, data: { available: true, lastSuccessAt: new Date(), lastError: null, latencyMs: r.latencyMs, rateLimitUntil: null } });
            if (cap === 'SERVER')
                await this.prisma.eRLCServer.update({ where: { id: serverId }, data: { status: 'ONLINE', name: data.name ?? undefined } });
        }
        catch (e) {
            const err = e instanceof erlc_client_1.ERLCError ? e : new erlc_client_1.ERLCError('INVALID_RESPONSE', 'Unexpected ER:LC response.');
            await this.prisma.eRLCSyncState.update({
                where: { serverId_capability: { serverId, capability: cap } },
                data: { lastFailureAt: new Date(), lastError: `${err.kind}: ${err.message}`, available: err.kind !== 'NOT_CONFIGURED' && err.kind !== 'UNAUTHORIZED', rateLimitUntil: err.kind === 'RATE_LIMITED' ? new Date(Date.now() + (err.retryAfterSeconds ?? 60) * 1000) : undefined },
            });
            if (cap === 'SERVER' && err.kind !== 'RATE_LIMITED')
                await this.prisma.eRLCServer.update({ where: { id: serverId }, data: { status: err.kind === 'NOT_CONFIGURED' ? 'UNKNOWN' : 'ERROR' } });
            throw err;
        }
    }
    normalize(cap, raw) {
        if (cap === 'SERVER') {
            const s = raw;
            if (!s || typeof s !== 'object' || typeof s.Name !== 'string')
                throw new erlc_client_1.ERLCError('INVALID_RESPONSE', 'Unexpected server payload.');
            // JoinKey wird bewusst NICHT weitergegeben (nicht zur Anzeige nötig, vermeidet unnötige Offenlegung).
            return { name: s.Name, currentPlayers: s.CurrentPlayers, maxPlayers: s.MaxPlayers, teamBalance: s.TeamBalance, accountVerification: s.AccVerifiedReq };
        }
        if (!Array.isArray(raw))
            throw new erlc_client_1.ERLCError('INVALID_RESPONSE', 'Expected an array.');
        return cap === 'PLAYERS' ? raw.map(erlc_types_1.normalizePlayer) : raw.map(erlc_types_1.normalizeVehicle);
    }
    /** Connector-Gesundheit und Capabilities für das Admin-Dashboard. */
    async health() {
        const server = await this.serverRow();
        const states = await this.prisma.eRLCSyncState.findMany({ where: { serverId: server.id } });
        const events = await this.prisma.eRLCEvent.count();
        const by = (c) => states.find((s) => s.capability === c);
        const poll = (cap) => {
            const s = by(cap);
            return { capability: cap, available: this.client.configured && s?.available !== false, reason: this.client.configured ? undefined : 'NOT_CONFIGURED', lastSuccessAt: s?.lastSuccessAt ?? null, lastFailureAt: s?.lastFailureAt ?? null, lastError: s?.lastError ?? null, latencyMs: s?.latencyMs ?? null, rateLimitUntil: s?.rateLimitUntil ?? null };
        };
        const caps = [
            poll('SERVER'), poll('PLAYERS'), poll('VEHICLES'),
            { capability: 'PLAYER_POSITIONS', available: false, reason: 'NOT_PROVIDED_BY_DOCUMENTED_API', message: erlc_types_1.CAPABILITY_MESSAGE },
            { capability: 'EMERGENCY_CALLS', available: events > 0, reason: events > 0 ? undefined : 'WEBHOOK_ONLY_NO_EVENTS_RECEIVED', message: events > 0 ? undefined : erlc_types_1.CAPABILITY_MESSAGE },
        ];
        return { connector: { configured: this.client.configured, serverStatus: server.status, serverId: server.externalId }, webhook: { eventsReceived: events }, capabilities: caps };
    }
};
exports.ERLCSyncService = ERLCSyncService;
exports.ERLCSyncService = ERLCSyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, erlc_client_1.ERLCClient])
], ERLCSyncService);
//# sourceMappingURL=erlc.sync.js.map