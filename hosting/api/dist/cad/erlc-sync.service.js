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
exports.ErlcSyncService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const timeline_service_1 = require("../timeline/timeline.service");
const realtime_service_1 = require("../realtime/realtime.service");
const guild_context_1 = require("../common/guild-context");
const SYSTEM = { userId: null };
const NOTE = 'Automatisch aus ER:LC übernommen.';
const lc = (s) => s.trim().toLowerCase();
/**
 * Personen und Fahrzeuge aus der ER:LC-API ins System übernehmen (bei jedem erfolgreichen Abruf):
 * Spieler → Personenakte (Roblox-Name + ID), gespawnte Fahrzeuge mit Kennzeichen → Fahrzeugregister (Halter über den Roblox-Namen).
 * Es wird nur geschrieben, was neu ist oder sich geändert hat; von Hand gepflegte Angaben (Notizen, Status) bleiben unberührt.
 */
let ErlcSyncService = class ErlcSyncService {
    prisma;
    audit;
    timeline;
    rt;
    log = new common_1.Logger('ErlcSync');
    /** Letzter Stand je Server – unveränderte Abrufe kosten keine Datenbank-Abfrage. */
    last = new Map();
    constructor(prisma, audit, timeline, rt) {
        this.prisma = prisma;
        this.audit = audit;
        this.timeline = timeline;
        this.rt = rt;
    }
    /** `guildId`: Discord-Server des ER:LC-Servers → Akten-Bereich (Server-Verbund); ohne = gemeinsamer Bestand. */
    async sync(serverId, snap, guildId = null) {
        const space = (0, guild_context_1.recordSpace)(guildId) ?? null;
        const players = (snap.players ?? []).filter((p) => p.name && p.id && /^\d{1,20}$/.test(p.id));
        const vehicles = (snap.vehicles ?? []).filter((v) => v.plate && v.plate.trim().length >= 2);
        const sig = JSON.stringify([space, players.map((p) => `${p.id}:${p.name}`).sort(), vehicles.map((v) => `${v.plate}|${v.name}|${v.owner}|${v.colorName}`).sort()]);
        if (this.last.get(serverId) === sig)
            return { persons: 0, vehicles: 0 };
        let persons = 0, cars = 0;
        try {
            // ---- Personen ----
            const ids = players.map((p) => p.id);
            const known = await this.prisma.person.findMany({ where: { serverId: space, OR: [{ robloxUserId: { in: ids } }, { robloxUsername: { in: [...players.map((p) => p.name), ...vehicles.map((v) => v.owner)], mode: 'insensitive' } }] }, select: { id: true, robloxUserId: true, robloxUsername: true } });
            const byId = new Map(known.filter((k) => k.robloxUserId).map((k) => [k.robloxUserId, k]));
            const byName = new Map(known.map((k) => [lc(k.robloxUsername), k]));
            for (const p of players) {
                const hit = byId.get(p.id) ?? (() => { const n = byName.get(lc(p.name)); return n && !n.robloxUserId ? n : undefined; })();
                if (hit) {
                    // ID nachtragen bzw. neuen Roblox-Namen übernehmen (Namensänderung)
                    if (hit.robloxUserId !== p.id || hit.robloxUsername !== p.name) {
                        await this.prisma.person.update({ where: { id: hit.id }, data: { robloxUserId: p.id, robloxUsername: p.name, version: { increment: 1 } } }).catch(() => undefined);
                        byName.set(lc(p.name), { ...hit, robloxUserId: p.id, robloxUsername: p.name });
                    }
                    continue;
                }
                const created = await this.prisma.$transaction(async (tx) => {
                    const c = await tx.person.create({ data: { serverId: space, robloxUsername: p.name, robloxUserId: p.id, notes: NOTE } });
                    await this.timeline.add(tx, { entityType: 'Person', entityId: c.id, action: 'person.created', summary: 'Personenakte aus ER:LC angelegt', actorId: null });
                    await this.audit.record(SYSTEM, { action: 'person.create', module: 'persons', entityType: 'Person', entityId: c.id, after: { robloxUsername: c.robloxUsername, robloxUserId: c.robloxUserId, source: 'ERLC' } }, tx);
                    return c;
                }).catch((e) => { if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                    return null; throw e; }); // gleichzeitig angelegt
                if (created) {
                    byName.set(lc(p.name), created);
                    persons++;
                }
            }
            // ---- Fahrzeuge ----
            const plates = vehicles.map((v) => v.plate.trim());
            const existing = await this.prisma.vehicle.findMany({ where: { serverId: space, plate: { in: plates, mode: 'insensitive' } }, select: { id: true, plate: true, model: true, color: true, ownerId: true, erlcReference: true } });
            const byPlate = new Map(existing.map((v) => [lc(v.plate), v]));
            for (const v of vehicles) {
                const plate = v.plate.trim().slice(0, 16);
                const ownerId = byName.get(lc(v.owner))?.id ?? null;
                const data = { model: v.name.slice(0, 64) || null, color: v.colorName?.slice(0, 32) ?? null, erlcReference: v.owner.slice(0, 64) || null, ...(ownerId ? { ownerId } : {}) };
                const old = byPlate.get(lc(plate));
                if (old) {
                    if (old.model !== data.model || old.color !== data.color || old.erlcReference !== data.erlcReference || (ownerId && old.ownerId !== ownerId)) {
                        await this.prisma.vehicle.update({ where: { id: old.id }, data: { ...data, version: { increment: 1 } } });
                        cars++;
                    }
                    continue;
                }
                await this.prisma.$transaction(async (tx) => {
                    const c = await tx.vehicle.create({ data: { serverId: space, plate, ...data, notes: NOTE } });
                    await this.audit.record(SYSTEM, { action: 'vehicle.create', module: 'vehicles', entityType: 'Vehicle', entityId: c.id, after: { plate, model: c.model, owner: v.owner, source: 'ERLC' } }, tx);
                }).then(() => { cars++; }, (e) => { if (!(e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
                    throw e; });
            }
            this.last.set(serverId, sig);
            if (persons || cars)
                this.rt.publish('cad', 'erlc.records', { serverId, persons, vehicles: cars });
        }
        catch (e) {
            this.log.warn(`Abgleich ${serverId} fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
        }
        return { persons, vehicles: cars };
    }
    /** Wer/was gerade auf den ER:LC-Servern ist (letzter Abruf), mit Verweis auf die Akte. `guildId`: nur Server dieses Discord-Servers. */
    async live(kind, guildId) {
        const servers = await this.prisma.erlcServer.findMany({ where: { active: true, ...(guildId ? { OR: [{ guildId }, { guildId: null }] } : {}) }, select: { id: true, name: true, status: true, lastSyncAt: true, snapshot: true } });
        const meta = servers.map((s) => ({ id: s.id, name: s.name, status: s.status, lastSyncAt: s.lastSyncAt }));
        if (kind === 'persons') {
            const rows = servers.flatMap((s) => (s.snapshot?.players ?? []).map((p) => ({ serverName: s.name, name: p.name, robloxUserId: p.id, team: p.team, callsign: p.callsign, wantedStars: p.wantedStars })));
            const ids = rows.map((r) => r.robloxUserId).filter((x) => !!x);
            const people = await this.prisma.person.findMany({ where: { ...(0, guild_context_1.recordWhere)(guildId), OR: [{ robloxUserId: { in: ids } }, { robloxUsername: { in: rows.map((r) => r.name), mode: 'insensitive' } }] }, select: { id: true, robloxUserId: true, robloxUsername: true } });
            return { servers: meta, items: rows.map((r) => ({ ...r, personId: people.find((x) => (r.robloxUserId && x.robloxUserId === r.robloxUserId) || lc(x.robloxUsername) === lc(r.name))?.id ?? null })) };
        }
        const rows = servers.flatMap((s) => (s.snapshot?.vehicles ?? []).map((v) => ({ serverName: s.name, name: v.name, owner: v.owner, plate: v.plate, colorName: v.colorName, colorHex: v.colorHex })));
        const plates = rows.map((r) => r.plate).filter((x) => !!x);
        const [cars, owners] = await Promise.all([
            this.prisma.vehicle.findMany({ where: { ...(0, guild_context_1.recordWhere)(guildId), plate: { in: plates, mode: 'insensitive' } }, select: { id: true, plate: true } }),
            this.prisma.person.findMany({ where: { ...(0, guild_context_1.recordWhere)(guildId), robloxUsername: { in: rows.map((r) => r.owner), mode: 'insensitive' } }, select: { id: true, robloxUsername: true } }),
        ]);
        return { servers: meta, items: rows.map((r) => ({ ...r, vehicleId: r.plate ? cars.find((c) => lc(c.plate) === lc(r.plate))?.id ?? null : null, ownerPersonId: owners.find((o) => lc(o.robloxUsername) === lc(r.owner))?.id ?? null })) };
    }
};
exports.ErlcSyncService = ErlcSyncService;
exports.ErlcSyncService = ErlcSyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, timeline_service_1.TimelineService, realtime_service_1.RealtimeService])
], ErlcSyncService);
//# sourceMappingURL=erlc-sync.service.js.map