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
exports.CadService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const realtime_service_1 = require("../realtime/realtime.service");
const timeline_service_1 = require("../timeline/timeline.service");
const errors_1 = require("../common/errors");
const web_url_1 = require("../common/web-url");
const cad_config_service_1 = require("./cad-config.service");
const cad_notify_service_1 = require("./cad-notify.service");
const locks_service_1 = require("../locks/locks.service");
const fleet_service_1 = require("../fleet/fleet.service");
const unitInclude = { members: true, incidents: { where: { clearedAt: null }, include: { incident: { select: { id: true, number: true, title: true, status: true } } } } };
const incidentInclude = { units: { include: { unit: { select: { id: true, callsign: true, name: true, type: true, status: true } } } } };
let CadService = class CadService {
    prisma;
    audit;
    perms;
    rt;
    timeline;
    cfg;
    notify;
    locks;
    fleet;
    constructor(prisma, audit, perms, rt, timeline, cfg, notify, locks, fleet) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.rt = rt;
        this.timeline = timeline;
        this.cfg = cfg;
        this.notify = notify;
        this.locks = locks;
        this.fleet = fleet;
    }
    // ───────── Hilfen ─────────
    label(list, key) {
        const o = list.find((x) => x.key === key);
        return o ? `${o.emoji ? `${o.emoji} ` : ''}${o.label}` : (key ?? '—');
    }
    /**
     * Beendete Einsätze (Status mit „closed“, z. B. Abgeschlossen/Abgebrochen) werden einen Tag nach Abschluss gelöscht.
     * Chronik und Einheiten-Zuordnungen fallen per Cascade mit weg; Verweise aus Berichten, Notrufen und Funk werden gelöst.
     */
    async purgeClosedIncidents(maxAgeMs = 24 * 3_600_000) {
        const cfg = await this.cfg.get();
        const closed = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
        if (!closed.length)
            return 0;
        const before = new Date(Date.now() - maxAgeMs);
        // ohne Abschlusszeit (ältere Daten) zählt die letzte Änderung
        const rows = await this.prisma.incident.findMany({ where: { status: { in: closed }, OR: [{ closedAt: { lt: before } }, { closedAt: null, updatedAt: { lt: before } }] }, select: { id: true } });
        if (!rows.length)
            return 0;
        const ids = rows.map((r) => r.id);
        // Kennzahlen bleiben für die Statistik (ältere Einsätze ohne Eintrag werden hier nachgetragen)
        await this.prisma.$transaction((tx) => this.archiveStats(tx, ids, true));
        await this.prisma.$transaction([
            this.prisma.report.updateMany({ where: { incidentId: { in: ids } }, data: { incidentId: null } }),
            this.prisma.erlcEmergencyCall.updateMany({ where: { incidentId: { in: ids } }, data: { incidentId: null } }),
            this.prisma.cadRadioMessage.updateMany({ where: { incidentId: { in: ids } }, data: { incidentId: null } }),
            this.prisma.incident.deleteMany({ where: { id: { in: ids } } }),
        ]);
        this.changed('incident');
        return ids.length;
    }
    /** Kennzahlen abgeschlossener Einsätze dauerhaft sichern (CadIncidentStat), damit die Statistik das Löschen nach einem Tag überlebt. */
    async archiveStats(tx, ids, onlyMissing = false) {
        if (!ids.length)
            return;
        const have = onlyMissing ? new Set((await tx.cadIncidentStat.findMany({ where: { incidentId: { in: ids } }, select: { incidentId: true } })).map((r) => r.incidentId)) : new Set();
        const rows = await tx.incident.findMany({ where: { id: { in: ids.filter((i) => !have.has(i)) } }, include: { units: { include: { unit: { select: { callsign: true, type: true } } } } } });
        if (!rows.length)
            return;
        await tx.cadIncidentStat.deleteMany({ where: { incidentId: { in: rows.map((r) => r.id) } } });
        await tx.cadIncidentStat.createMany({ data: rows.map((i) => ({
                incidentId: i.id, number: i.number, type: i.type, priority: i.priority, status: i.status, source: i.source, guildId: i.guildId, dispatcherId: i.dispatcherId,
                createdAt: i.createdAt, closedAt: i.closedAt ?? i.updatedAt,
                units: [...new Set(i.units.map((u) => u.unit.callsign))], unitTypes: [...new Set(i.units.map((u) => u.unit.type).filter((t) => !!t))],
            })) });
    }
    changed(kind, id) { this.rt.publish('cad', 'cad.changed', { kind, id: id ?? null }); this.rt.publish('dispatch', 'queue.changed', { id: id ?? null }); }
    /**
     * Server-übergreifende Aktionen: Vom Heimat-Server (Leitstelle) aus immer erlaubt; von einem anderen Discord-Server
     * nur, wenn eine aktive Server-Verbindung diese Aktion freigibt (und ggf. die Rolle passt).
     * Geprüft wird nur, was aus Discord kommt (Bot mit Discord-ID): im Dashboard ist der gewählte Server nur ein Filter.
     * Ohne eingestellten Heimat-Server ist nur ein Ein-Server-Betrieb (keine Server-Verbindungen) offen.
     */
    async assertCrossServer(actor, action, memberRoleIds = []) {
        const g = actor.discordId ? actor.guildId ?? null : null;
        const home = (await this.cfg.get()).homeGuildId ?? null;
        if (!g || g === home)
            return;
        if (!home) {
            if (!(await this.prisma.cadServerLink.count()))
                return;
            throw new errors_1.AppError('PERMISSION_DENIED', 'Der Discord-Server der Leitstelle ist noch nicht eingestellt (CAD → Einstellungen → Allgemein).');
        }
        const link = await this.prisma.cadServerLink.findFirst({ where: { active: true, sourceGuildId: home, targetGuildId: g, allowActions: { has: action } } });
        if (!link)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dieser Discord-Server ist für diese Aktion nicht mit der Leitstelle verbunden.');
        if (link.roleIds.length && !memberRoleIds.some((r) => link.roleIds.includes(r)))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dir fehlt die freigegebene Rolle für diese Server-Verbindung.');
    }
    /** Fortlaufende Einsatznummer, z. B. E-2026-00421 (Präfix in den CAD-Einstellungen). */
    async nextNumber(tx, prefix) {
        const head = `${prefix}-${new Date().getUTCFullYear()}-`;
        const last = await tx.incident.findFirst({ where: { number: { startsWith: head } }, orderBy: { number: 'desc' }, select: { number: true } });
        const n = last ? Number(last.number.slice(head.length)) || 0 : 0;
        return `${head}${String(n + 1).padStart(5, '0')}`;
    }
    async log(tx, incidentId, kind, text, actor, unitId) {
        await tx.cadIncidentLog.create({ data: { incidentId, kind, text: text.slice(0, 2000), unitId: unitId ?? null, authorId: actor.userId, guildId: actor.guildId ?? null } });
    }
    incidentPayload(cfg, i, extra = {}) {
        const prio = cfg.priorities.find((p) => p.key === i.priority);
        return {
            id: i.id, number: i.number, title: i.title, keyword: i.keyword, type: i.type ? this.label(cfg.incidentTypes, i.type) : null,
            priority: this.label(cfg.priorities, i.priority), priorityColor: prio?.color ?? null, status: this.label(cfg.incidentStatuses, i.status),
            location: i.location, description: i.description?.slice(0, 1000) ?? null, dashboardUrl: (0, web_url_1.webUrl)(`/cad/incidents?id=${i.id}`),
            ...(i.mapX !== null && i.mapX !== undefined && i.mapZ !== null && i.mapZ !== undefined ? { mapUrl: (0, web_url_1.webUrl)(`/cad/map?incident=${i.id}`) } : {}), ...extra,
        };
    }
    // ───────── Einsätze ─────────
    /** Sichtbarkeit vertraulicher Einsätze: CAD-Verwaltung, Disponent des Einsatzes oder eine der freigegebenen Rollen. */
    async visibility(actor) {
        if (!actor?.userId || (await this.perms.has(actor.userId, 'cad.manage_settings')))
            return {};
        const roles = (await this.prisma.userRole.findMany({ where: { userId: actor.userId }, select: { roleId: true } })).map((r) => r.roleId);
        return { OR: [{ restrictRoleIds: { isEmpty: true } }, { dispatcherId: actor.userId }, ...(roles.length ? [{ restrictRoleIds: { hasSome: roles } }] : [])] };
    }
    async assertVisible(actor, id) {
        const ok = await this.prisma.incident.findFirst({ where: { id, ...(await this.visibility(actor)) }, select: { id: true } });
        if (!ok)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
    }
    async listIncidents(f, actor) {
        const cfg = await this.cfg.get();
        const closed = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
        const vis = await this.visibility(actor);
        const where = {
            AND: [vis],
            ...(f.active ? { status: { notIn: closed } } : {}),
            ...(f.q ? { OR: [{ number: { contains: f.q, mode: 'insensitive' } }, { title: { contains: f.q, mode: 'insensitive' } }, { keyword: { contains: f.q, mode: 'insensitive' } }, { location: { contains: f.q, mode: 'insensitive' } }] } : {}),
        };
        const rows = await this.prisma.incident.findMany({ where, include: incidentInclude, orderBy: { createdAt: 'desc' }, take: Math.min(f.take ?? 100, 300) });
        const calls = await this.prisma.erlcEmergencyCall.findMany({ where: { incidentId: { in: rows.map((r) => r.id) } }, select: { id: true, callNumber: true, incidentId: true } });
        const order = new Map(cfg.priorities.map((p, i) => [p.key, p.order ?? i]));
        return rows
            .map((r) => ({ ...r, calls: calls.filter((c) => c.incidentId === r.id) }))
            .sort((a, b) => (f.active ? (order.get(a.priority) ?? 99) - (order.get(b.priority) ?? 99) : 0) || b.createdAt.getTime() - a.createdAt.getTime());
    }
    async getIncident(id, actor) {
        if (actor)
            await this.assertVisible(actor, id);
        const i = await this.prisma.incident.findUnique({ where: { id }, include: { ...incidentInclude, log: { orderBy: { createdAt: 'asc' }, take: 500 } } });
        if (!i)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        const [calls, users] = await Promise.all([
            this.prisma.erlcEmergencyCall.findMany({ where: { incidentId: id } }),
            this.prisma.user.findMany({ where: { id: { in: [...new Set([i.dispatcherId, ...i.log.map((l) => l.authorId)].filter((x) => !!x))] } }, select: { id: true, displayName: true } }),
        ]);
        const names = Object.fromEntries(users.map((u) => [u.id, u.displayName]));
        return { ...i, calls, names };
    }
    async validateIncident(d) {
        const cfg = await this.cfg.get();
        if (d.priority && !cfg.priorities.some((p) => p.key === d.priority))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Priorität „${d.priority}“.`);
        if (d.status && !cfg.incidentStatuses.some((p) => p.key === d.status))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannter Status „${d.status}“.`);
        if (d.type && !cfg.incidentTypes.some((p) => p.key === d.type))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Einsatzart „${d.type}“.`);
        return cfg;
    }
    async createIncident(actor, d, opts = {}) {
        const cfg = await this.validateIncident(d);
        const status = d.status ?? cfg.incidentStatuses.find((s) => !s.closed).key;
        const priority = d.priority ?? cfg.priorities[Math.floor(cfg.priorities.length / 2)].key;
        const guildId = actor.guildId ?? cfg.homeGuildId ?? null;
        let inc;
        for (let attempt = 0;; attempt++) {
            try {
                inc = await this.prisma.$transaction(async (tx) => {
                    const row = await tx.incident.create({ data: {
                            number: await this.nextNumber(tx, cfg.incidentNumberPrefix), title: d.title, type: d.type ?? null, keyword: d.keyword ?? null, priority, status, location: d.location ?? null,
                            description: d.description ?? null, involved: d.involved ?? null, requiredUnits: d.requiredUnits ?? null, internalNotes: d.internalNotes ?? null, mapX: d.mapX ?? null, mapZ: d.mapZ ?? null,
                            restrictRoleIds: d.restrictRoleIds ?? [], dispatcherId: d.dispatcherId ?? actor.userId, source: opts.callId ? 'ERLC_CALL' : 'CAD', guildId,
                        } });
                    await this.log(tx, row.id, 'CREATED', `Einsatz ${row.number} angelegt`, actor);
                    if (opts.callId) {
                        const call = await tx.erlcEmergencyCall.findUnique({ where: { id: opts.callId } });
                        if (!call)
                            throw new errors_1.AppError('NOT_FOUND', 'Notruf nicht gefunden.');
                        // nur verknüpfen, wenn noch kein Einsatz dran hängt (gleichzeitige Klicks in Discord und Dashboard)
                        const linked = await tx.erlcEmergencyCall.updateMany({ where: { id: call.id, incidentId: null }, data: { incidentId: row.id, status: 'CLAIMED', claimedById: call.claimedById ?? actor.userId } });
                        if (!linked.count)
                            throw new errors_1.AppError('CONFLICT', 'Aus diesem Notruf wurde schon ein Einsatz erstellt.', { incidentId: call.incidentId });
                        await this.log(tx, row.id, 'CALL', `Verknüpft mit ER:LC-Notruf #${call.callNumber}${call.description ? `: ${call.description}` : ''}`, actor);
                    }
                    await this.timeline.add(tx, { entityType: 'Incident', entityId: row.id, action: 'incident.created', summary: `Einsatz ${row.number} im CAD angelegt`, actorId: actor.userId });
                    await this.audit.record(actor, { action: 'cad.incident.create', module: 'cad', entityType: 'Incident', entityId: row.id, after: { ...row, callId: opts.callId ?? null } }, tx);
                    return row;
                });
                break;
            }
            catch (e) {
                // gleichzeitige Nummernvergabe → neu versuchen
                if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 5)
                    continue;
                throw e;
            }
        }
        await this.zoneActions(actor, inc);
        this.changed('incident', inc.id);
        this.rt.publish('incidents', 'incident.created', { id: inc.id, number: inc.number });
        if (!inc.restrictRoleIds.length)
            await this.notify.emit('incident.created', this.incidentPayload(cfg, inc), inc.guildId); // vertrauliche Einsätze nicht nach Discord
        return inc;
    }
    /** Zonen mit automatischer Aktion: Einsatz liegt in der Zone → Hinweis in der Chronik („warn“) bzw. zusätzlich Leitstellenmeldung („notify“). */
    async zoneActions(actor, inc) {
        if (inc.mapX === null || inc.mapZ === null)
            return;
        const zones = await this.prisma.cadMapObject.findMany({ where: { kind: 'ZONE', autoAction: { not: null } } });
        for (const z of zones) {
            const pts = (z.points ?? []);
            if (pts.length < 3 || !inside(inc.mapX, inc.mapZ, pts))
                continue;
            await this.log(this.prisma, inc.id, 'NOTE', `⚠️ Einsatzort liegt in Zone „${z.name}“${z.description ? ` – ${z.description}` : ''}`, actor);
            if (z.autoAction === 'notify')
                await this.notify.emit('announcement', { text: `Einsatz ${inc.number} (${inc.title}) liegt in der Zone „${z.name}“.`, from: 'CAD' }, inc.guildId);
        }
    }
    async updateIncident(actor, id, d) {
        await this.assertVisible(actor, id);
        await this.locks.assertFree('incident', id, actor.userId);
        const cfg = await this.validateIncident(d);
        const before = await this.prisma.incident.findUnique({ where: { id } });
        if (!before)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        const { status, ...rest } = d;
        if (status && status !== before.status)
            await this.assertStatusAllowed(actor, cfg, before.status, status);
        const after = await this.prisma.$transaction(async (tx) => {
            const row = await tx.incident.update({ where: { id }, data: { ...rest, version: { increment: 1 } } });
            const fields = Object.keys(rest);
            if (fields.length)
                await this.log(tx, id, 'NOTE', `Geändert: ${fields.join(', ')}`, actor);
            await this.audit.record(actor, { action: 'cad.incident.update', module: 'cad', entityType: 'Incident', entityId: id, before: Object.fromEntries(fields.map((k) => [k, before[k]])), after: rest }, tx);
            return row;
        });
        this.changed('incident', id);
        if (status && status !== before.status)
            return this.setStatus(actor, id, status);
        void cfg;
        return after;
    }
    /** Abschließen und Wiederöffnen eines abgeschlossenen Einsatzes brauchen cad.close_incident. */
    async assertStatusAllowed(actor, cfg, from, to) {
        const closed = (k) => !!cfg.incidentStatuses.find((s) => s.key === k)?.closed;
        if ((closed(to) || closed(from)) && !(await this.perms.has(actor.userId, 'cad.close_incident')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Zum Abschließen oder Wiederöffnen eines Einsatzes fehlt dir das Recht (cad.close_incident).');
    }
    async setStatus(actor, id, status, note) {
        await this.assertVisible(actor, id);
        const cfg = await this.validateIncident({ status });
        const st = cfg.incidentStatuses.find((s) => s.key === status);
        const inc = await this.prisma.incident.findUnique({ where: { id } });
        if (!inc)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        if (inc.status === status)
            return inc;
        await this.assertStatusAllowed(actor, cfg, inc.status, status);
        const after = await this.prisma.$transaction(async (tx) => {
            const row = await tx.incident.update({ where: { id }, data: { status, closedAt: st.closed ? new Date() : null, version: { increment: 1 } } });
            if (st.closed) {
                const open = await tx.incidentUnit.findMany({ where: { incidentId: id, clearedAt: null } });
                await tx.incidentUnit.updateMany({ where: { incidentId: id, clearedAt: null }, data: { clearedAt: new Date() } });
                await tx.unit.updateMany({ where: { id: { in: open.map((u) => u.unitId) }, status: { notIn: ['OFF_DUTY', 'UNAVAILABLE'] } }, data: { status: cfg.unitStatuses[0].key } });
                await tx.erlcEmergencyCall.updateMany({ where: { incidentId: id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED' } });
                await this.archiveStats(tx, [id]);
            }
            else
                await tx.cadIncidentStat.deleteMany({ where: { incidentId: id } }); // wiedereröffnet → zählt wieder als offen
            await this.log(tx, id, 'STATUS', `Status: ${this.label(cfg.incidentStatuses, inc.status)} → ${this.label(cfg.incidentStatuses, status)}${note ? ` – ${note}` : ''}`, actor);
            await this.audit.record(actor, { action: st.closed ? 'cad.incident.close' : 'cad.incident.status', module: 'cad', entityType: 'Incident', entityId: id, before: { status: inc.status }, after: { status }, reason: note }, tx);
            return row;
        });
        this.changed('incident', id);
        this.rt.publish('incidents', 'incident.status', { id, status });
        const event = st.closed ? 'incident.closed' : 'incident.status';
        if (!after.restrictRoleIds.length)
            await this.notify.emit(event, this.incidentPayload(cfg, after, { previous: this.label(cfg.incidentStatuses, inc.status), note: note ?? null }), after.guildId);
        return after;
    }
    async addNote(actor, id, text) {
        await this.assertVisible(actor, id);
        if (!(await this.prisma.incident.findUnique({ where: { id }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        await this.log(this.prisma, id, 'NOTE', text, actor);
        await this.audit.record(actor, { action: 'cad.incident.note', module: 'cad', entityType: 'Incident', entityId: id });
        this.changed('incident', id);
    }
    async assignUnit(actor, id, unitId) {
        await this.assertVisible(actor, id);
        const cfg = await this.cfg.get();
        const closed = cfg.incidentStatuses.filter((s) => s.closed).map((s) => s.key);
        const { inc, unit } = await this.prisma.$transaction(async (tx) => {
            const inc = await tx.incident.findUnique({ where: { id } });
            if (!inc)
                throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
            if (closed.includes(inc.status))
                throw new errors_1.AppError('INVALID_TRANSITION', 'Der Einsatz ist bereits abgeschlossen.');
            const unit = await tx.unit.findUnique({ where: { id: unitId }, include: { members: true } });
            if (!unit)
                throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
            if (!unit.operational || ['OFF_DUTY', 'UNAVAILABLE'].includes(unit.status))
                throw new errors_1.AppError('CONFLICT', `${unit.callsign} ist nicht einsatzfähig/verfügbar.`);
            await tx.incidentUnit.upsert({ where: { incidentId_unitId: { incidentId: id, unitId } }, create: { incidentId: id, unitId }, update: { clearedAt: null, assignedAt: new Date() } });
            const busy = cfg.unitStatuses.find((s) => s.key === 'EN_ROUTE') ?? cfg.unitStatuses.find((s) => s.key === 'BUSY');
            if (busy)
                await tx.unit.update({ where: { id: unitId }, data: { status: busy.key } });
            await this.log(tx, id, 'ASSIGN', `${unit.callsign} zugewiesen`, actor, unitId);
            await this.audit.record(actor, { action: 'cad.unit.assign', module: 'cad', entityType: 'Incident', entityId: id, after: { unitId, callsign: unit.callsign } }, tx);
            if (unit.members.length)
                await tx.notification.createMany({ data: unit.members.map((m) => ({ userId: m.userId, type: 'INCIDENT_ASSIGNMENT', title: `Einsatz ${inc.number}: ${inc.title}`, entityType: 'Incident', entityId: id })) });
            return { inc, unit };
        });
        this.changed('incident', id);
        this.rt.publish('dispatch', 'unit.assigned', { incidentId: id, unitId });
        if (!inc.restrictRoleIds.length)
            await this.notify.emit('incident.assigned', this.incidentPayload(cfg, inc, { callsign: unit.callsign, unitName: unit.name, unitType: unit.type ? this.label(cfg.unitTypes, unit.type) : null, unitRoleId: unit.discordRoleId }), inc.guildId);
        return { ok: true };
    }
    async clearUnit(actor, id, unitId) {
        const cfg = await this.cfg.get();
        const link = await this.prisma.incidentUnit.findUnique({ where: { incidentId_unitId: { incidentId: id, unitId } }, include: { unit: true } });
        if (!link || link.clearedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Die Einheit ist diesem Einsatz nicht zugewiesen.');
        await this.prisma.$transaction(async (tx) => {
            await tx.incidentUnit.update({ where: { incidentId_unitId: { incidentId: id, unitId } }, data: { clearedAt: new Date() } });
            if (!['OFF_DUTY', 'UNAVAILABLE'].includes(link.unit.status))
                await tx.unit.update({ where: { id: unitId }, data: { status: cfg.unitStatuses[0].key } });
            await this.log(tx, id, 'ASSIGN', `${link.unit.callsign} aus dem Einsatz gelöst`, actor, unitId);
            await this.audit.record(actor, { action: 'cad.unit.clear', module: 'cad', entityType: 'Incident', entityId: id, after: { unitId } }, tx);
        });
        this.changed('incident', id);
    }
    // ───────── Einheiten ─────────
    async listUnits() {
        const [units, members, servers] = await Promise.all([
            this.prisma.unit.findMany({ include: unitInclude, orderBy: { callsign: 'asc' } }),
            this.prisma.cadMember.findMany({ where: { unitId: { not: null } } }),
            this.prisma.erlcServer.findMany({ where: { active: true }, select: { snapshot: true } }),
        ]);
        const players = new Map();
        for (const s of servers)
            for (const p of (s.snapshot?.players ?? []))
                players.set(p.name.toLowerCase(), p);
        const userIds = [...new Set(units.flatMap((u) => u.members.map((m) => m.userId)))];
        const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } });
        const uname = new Map(users.map((u) => [u.id, u.displayName]));
        return units.map((u) => {
            const crew = members.filter((m) => m.unitId === u.id);
            // Position: erster Spieler der Besatzung, der gerade in ER:LC ist – sonst manuell gesetzte Position
            const live = crew.map((m) => (m.erlcName ? players.get(m.erlcName.toLowerCase()) : undefined)).find((p) => p?.location);
            return {
                ...u, crew: crew.map((m) => ({ id: m.id, discordName: m.discordName, discordId: m.discordId, robloxName: m.robloxName, erlcName: m.erlcName, callsign: m.callsign, team: m.team, inGame: !!(m.erlcName && players.has(m.erlcName.toLowerCase())) })),
                memberNames: u.members.map((m) => uname.get(m.userId) ?? m.userId),
                current: u.incidents[0]?.incident ?? null,
                position: live?.location ? { x: live.location.x, z: live.location.z, source: 'erlc', street: live.location.street, postal: live.location.postal } : u.mapX !== null && u.mapZ !== null ? { x: u.mapX, z: u.mapZ, source: 'manual', street: null, postal: null } : null,
            };
        });
    }
    async validateUnit(d) {
        const cfg = await this.cfg.get();
        if (d.type && !cfg.unitTypes.some((t) => t.key === d.type))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannter Einheitentyp „${d.type}“.`);
        if (d.status && !cfg.unitStatuses.some((t) => t.key === d.status))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannter Einheitenstatus „${d.status}“.`);
        return cfg;
    }
    async createUnit(actor, d) {
        const cfg = await this.validateUnit(d);
        try {
            const u = await this.prisma.$transaction(async (tx) => {
                const row = await tx.unit.create({ data: { ...d, callsign: d.callsign.toUpperCase(), status: d.status ?? cfg.unitStatuses[0].key } });
                await this.audit.record(actor, { action: 'cad.unit.create', module: 'cad', entityType: 'Unit', entityId: row.id, after: row }, tx);
                return row;
            });
            this.changed('unit', u.id);
            return u;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', `Es gibt schon eine Einheit „${d.callsign.toUpperCase()}“.`);
            throw e;
        }
    }
    async updateUnit(actor, id, d) {
        await this.validateUnit(d);
        const before = await this.prisma.unit.findUnique({ where: { id } });
        if (!before)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        const u = await this.prisma.$transaction(async (tx) => {
            const row = await tx.unit.update({ where: { id }, data: { ...d, ...(d.callsign ? { callsign: d.callsign.toUpperCase() } : {}) } });
            await this.audit.record(actor, { action: 'cad.unit.update', module: 'cad', entityType: 'Unit', entityId: id, before: Object.fromEntries(Object.keys(d).map((k) => [k, before[k]])), after: d }, tx);
            return row;
        });
        this.changed('unit', id);
        return u;
    }
    async deleteUnit(actor, id) {
        const u = await this.prisma.unit.findUnique({ where: { id } });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.cadMember.updateMany({ where: { unitId: id }, data: { unitId: null } });
            await tx.unit.delete({ where: { id } });
            await this.audit.record(actor, { action: 'cad.unit.delete', module: 'cad', entityType: 'Unit', entityId: id, before: u }, tx);
        });
        this.changed('unit', id);
    }
    /** Für eine Einheit melden darf: die Leitstelle (cad.assign_unit), die Besatzung oder – aus Discord – die Rolle der Einheit bzw. freigegebene Status-Rollen. */
    async assertUnitReporter(actor, u, memberRoleIds) {
        if (await this.perms.has(actor.userId, 'cad.assign_unit'))
            return this.assertCrossServer(actor, 'dispatch', memberRoleIds);
        const crew = u.members.some((m) => m.userId === actor.userId) || !!(await this.prisma.cadMember.findFirst({ where: { unitId: u.id, OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] } }));
        const byRole = memberRoleIds.some((r) => r === u.discordRoleId || u.statusRoleIds.includes(r));
        if (!crew && !byRole)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Nur die Leitstelle, die Besatzung oder freigegebene Rollen dürfen für diese Einheit melden.');
        await this.assertCrossServer(actor, 'status_report', memberRoleIds);
    }
    /** Status einer Einheit: Leitstelle (cad.assign_unit) oder ein Besatzungsmitglied selbst (auch vom verbundenen SEK/K9-Server). */
    async setUnitStatus(actor, id, status, memberRoleIds = []) {
        const cfg = await this.validateUnit({ status });
        const u = await this.prisma.unit.findUnique({ where: { id }, include: { members: true, incidents: { where: { clearedAt: null } } } });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        await this.assertUnitReporter(actor, u, memberRoleIds);
        if (u.status === status)
            return u;
        const after = await this.prisma.$transaction(async (tx) => {
            const row = await tx.unit.update({ where: { id }, data: { status } });
            for (const link of u.incidents)
                await this.log(tx, link.incidentId, 'STATUS', `${u.callsign}: ${this.label(cfg.unitStatuses, status)}`, actor, id);
            await this.audit.record(actor, { action: 'cad.unit.status', module: 'cad', entityType: 'Unit', entityId: id, before: { status: u.status }, after: { status } }, tx);
            return row;
        });
        this.changed('unit', id);
        this.rt.publish('dispatch', 'unit.status', { unitId: id, status });
        return after;
    }
    /**
     * Rückmeldung einer Einheit zu ihrem Einsatz (MDT / Discord): steht in der Einsatzchronik, setzt ggf. den Einheitenstatus
     * und geht an die Leitstelle. Der Einsatz selbst (Status, Abschluss) bleibt der Leitstelle vorbehalten.
     */
    async feedback(actor, unitId, d, memberRoleIds = []) {
        const cfg = await this.cfg.get();
        const fb = shared_1.CAD_FEEDBACK.find((f) => f.key === d.kind);
        if (!fb)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Unbekannte Rückmeldung.');
        const u = await this.prisma.unit.findUnique({ where: { id: unitId }, include: { members: true, incidents: { where: { clearedAt: null }, orderBy: { assignedAt: 'desc' } } } });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        await this.assertUnitReporter(actor, u, memberRoleIds);
        const incidentId = d.incidentId ?? u.incidents[0]?.incidentId;
        if (!incidentId)
            throw new errors_1.AppError('CONFLICT', `${u.callsign} ist gerade keinem Einsatz zugewiesen.`);
        if (!u.incidents.some((l) => l.incidentId === incidentId))
            throw new errors_1.AppError('CONFLICT', `${u.callsign} ist diesem Einsatz nicht (mehr) zugewiesen.`);
        const inc = await this.prisma.incident.findUnique({ where: { id: incidentId } });
        if (!inc)
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        const unitStatus = 'unitStatus' in fb && cfg.unitStatuses.some((s) => s.key === fb.unitStatus) ? fb.unitStatus : null;
        const note = d.note?.trim() || null;
        const text = `${u.callsign}: ${fb.emoji} ${fb.label}${note ? ` – ${note}` : ''}`;
        await this.prisma.$transaction(async (tx) => {
            await this.log(tx, incidentId, 'FEEDBACK', text, actor, unitId);
            if (unitStatus && u.status !== unitStatus)
                await tx.unit.update({ where: { id: unitId }, data: { status: unitStatus } });
            await this.audit.record(actor, { action: 'cad.unit.feedback', module: 'cad', entityType: 'Incident', entityId: incidentId, after: { unitId, callsign: u.callsign, kind: fb.key, note, unitStatus } }, tx);
            // Disponent des Einsatzes direkt benachrichtigen, wenn Hilfe gebraucht oder der Abschluss gemeldet wird
            if ((fb.key === 'support' || fb.key === 'completed') && inc.dispatcherId && inc.dispatcherId !== actor.userId) {
                await tx.notification.create({ data: { userId: inc.dispatcherId, type: fb.key === 'support' ? 'INCIDENT_SUPPORT' : 'INCIDENT_COMPLETED', title: `${inc.number}: ${u.callsign} – ${fb.label}`, body: note, entityType: 'Incident', entityId: incidentId } });
            }
        });
        this.changed('incident', incidentId);
        this.rt.publish('dispatch', 'unit.feedback', { unitId, incidentId, kind: fb.key });
        if (!inc.restrictRoleIds.length) {
            await this.notify.emit(fb.key === 'support' ? 'incident.support' : 'incident.feedback', this.incidentPayload(cfg, inc, { callsign: u.callsign, feedback: `${fb.emoji} ${fb.label}`, feedbackKey: fb.key, note }), inc.guildId);
        }
        return { ok: true, incidentId, number: inc.number, callsign: u.callsign, unitStatus };
    }
    /**
     * MDT eines Mitglieds: eigene Einheit(en) (Zuordnung über das Benutzerkonto oder die Teamübersicht), deren laufende Einsätze mit Chronik,
     * Funkmeldungen, letzte Benachrichtigungen und die Einsatzhistorie der eigenen Einheiten.
     */
    async mdt(actor) {
        const uid = actor.userId;
        const [direct, mapped] = await Promise.all([
            this.prisma.unitMember.findMany({ where: { userId: uid }, select: { unitId: true } }),
            this.prisma.cadMember.findMany({ where: { OR: [{ userId: uid }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])], unitId: { not: null } }, select: { unitId: true } }),
        ]);
        const unitIds = [...new Set([...direct, ...mapped].map((m) => m.unitId))];
        const vis = await this.visibility(actor);
        const units = await this.prisma.unit.findMany({ where: { id: { in: unitIds } }, orderBy: { callsign: 'asc' }, include: { incidents: { where: { clearedAt: null, incident: vis }, orderBy: { assignedAt: 'desc' }, select: { assignedAt: true, incidentId: true } } } });
        const incidentIds = [...new Set(units.flatMap((u) => u.incidents.map((l) => l.incidentId)))];
        const callsigns = units.map((u) => u.callsign);
        const [incidents, radio, notifications, history] = await Promise.all([
            this.prisma.incident.findMany({ where: { id: { in: incidentIds } }, include: { ...incidentInclude, log: { orderBy: { createdAt: 'desc' }, take: 30 } } }),
            this.prisma.cadRadioMessage.findMany({ where: { OR: [{ incidentId: { in: incidentIds } }, { unitId: { in: unitIds } }] }, orderBy: { createdAt: 'desc' }, take: 30 }),
            this.prisma.notification.findMany({ where: { userId: uid, archivedAt: null }, orderBy: { createdAt: 'desc' }, take: 10 }),
            callsigns.length ? this.prisma.cadIncidentStat.findMany({ where: { units: { hasSome: callsigns } }, orderBy: { closedAt: 'desc' }, take: 15 }) : Promise.resolve([]),
        ]);
        const byId = new Map(incidents.map((i) => [i.id, i]));
        return {
            units: units.map((u) => ({
                id: u.id, callsign: u.callsign, name: u.name, type: u.type, status: u.status, color: u.color, icon: u.icon, vehicle: u.vehicle, operational: u.operational,
                incidents: u.incidents.map((l) => byId.get(l.incidentId)).filter((i) => !!i).map((i) => ({ ...i, log: [...i.log].reverse() })),
            })),
            radio, notifications, history, feedback: shared_1.CAD_FEEDBACK,
            // intern zugewiesene Polizeifahrzeuge (keine bestätigte Live-Nutzung)
            vehicles: (await this.perms.has(uid, 'fleet.view')) ? await this.fleet.forUnits(unitIds) : [],
        };
    }
    // ───────── Notrufe (ER:LC) ─────────
    async listCalls(f) {
        const rows = await this.prisma.erlcEmergencyCall.findMany({ where: f.status && f.status !== 'ALL' ? { status: f.status } : {}, include: { server: { select: { id: true, name: true } } }, orderBy: { startedAt: 'desc' }, take: Math.min(f.take ?? 100, 300) });
        const incs = await this.prisma.incident.findMany({ where: { id: { in: rows.map((r) => r.incidentId).filter((x) => !!x) } }, select: { id: true, number: true, status: true } });
        const byId = new Map(incs.map((i) => [i.id, i]));
        return rows.map((r) => ({ ...r, incident: r.incidentId ? byId.get(r.incidentId) ?? null : null }));
    }
    async callAction(actor, id, action) {
        const c = await this.prisma.erlcEmergencyCall.findUnique({ where: { id } });
        if (!c)
            throw new errors_1.AppError('NOT_FOUND', 'Notruf nicht gefunden.');
        const status = action === 'claim' ? 'CLAIMED' : action === 'close' ? 'CLOSED' : 'OPEN';
        const row = await this.prisma.$transaction(async (tx) => {
            const r = await tx.erlcEmergencyCall.update({ where: { id }, data: { status, ...(action === 'claim' ? { claimedById: actor.userId } : {}) } });
            if (c.incidentId)
                await this.log(tx, c.incidentId, 'CALL', `Notruf #${c.callNumber}: ${action === 'claim' ? 'übernommen' : action === 'close' ? 'geschlossen' : 'wieder geöffnet'}`, actor);
            await this.audit.record(actor, { action: `cad.call.${action}`, module: 'cad', entityType: 'ErlcEmergencyCall', entityId: id, before: { status: c.status }, after: { status } }, tx);
            return r;
        });
        this.changed('call', id);
        return row;
    }
    /** Notruf → Einsatz (Position, Ort und Beschreibung werden übernommen; die Verknüpfung bleibt gespeichert). */
    async incidentFromCall(actor, callId, d) {
        const c = await this.prisma.erlcEmergencyCall.findUnique({ where: { id: callId }, include: { server: { select: { guildId: true } } } });
        if (!c)
            throw new errors_1.AppError('NOT_FOUND', 'Notruf nicht gefunden.');
        return this.createIncident({ ...actor, guildId: actor.guildId ?? c.server.guildId }, {
            title: d.title ?? (c.description ? c.description.slice(0, 200) : `Notruf #${c.callNumber}`), type: d.type, keyword: d.keyword ?? (c.team ? `Notruf ${c.team}` : null), priority: d.priority, status: d.status,
            location: d.location ?? c.positionDescriptor, description: d.description ?? c.description, mapX: d.mapX ?? c.mapX, mapZ: d.mapZ ?? c.mapZ, involved: d.involved ?? (c.callerName ?? c.callerRobloxId ? `Anrufer: ${c.callerName ?? c.callerRobloxId}` : null),
        }, { callId });
    }
    /** Einheit direkt zu einem Notruf: legt bei Bedarf den Einsatz an. */
    async assignToCall(actor, callId, unitId) {
        const c = await this.prisma.erlcEmergencyCall.findUnique({ where: { id: callId } });
        if (!c)
            throw new errors_1.AppError('NOT_FOUND', 'Notruf nicht gefunden.');
        const incidentId = c.incidentId ?? (await this.incidentFromCall(actor, callId, {})).id;
        await this.assignUnit(actor, incidentId, unitId);
        return { incidentId };
    }
    // ───────── Funk ─────────
    async listRadio(f) {
        const rows = await this.prisma.cadRadioMessage.findMany({ where: f.incidentId ? { incidentId: f.incidentId } : {}, orderBy: { createdAt: 'desc' }, take: Math.min(f.take ?? 50, 200) });
        const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter((x) => !!x) } }, select: { id: true, displayName: true } });
        const n = new Map(users.map((u) => [u.id, u.displayName]));
        const incs = await this.prisma.incident.findMany({ where: { id: { in: rows.map((r) => r.incidentId).filter((x) => !!x) } }, select: { id: true, number: true } });
        const inum = new Map(incs.map((i) => [i.id, i.number]));
        return rows.map((r) => ({ ...r, authorName: r.authorId ? n.get(r.authorId) ?? null : null, incidentNumber: r.incidentId ? inum.get(r.incidentId) ?? null : null }));
    }
    /** Funkmeldung (Dashboard oder Discord). Mit Einsatz → zusätzlich in der Einsatzchronik. */
    async radioUnits(actor) {
        const dispatcher = await this.perms.has(actor.userId, 'cad.assign_unit');
        const member = await this.prisma.cadMember.findFirst({ where: { OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] }, select: { unitId: true } });
        const units = await this.prisma.unit.findMany({ where: dispatcher ? {} : { id: member?.unitId ?? '00000000-0000-0000-0000-000000000000' }, select: { id: true, callsign: true, name: true }, orderBy: { callsign: 'asc' } });
        return { units, mine: member?.unitId ?? null, dispatcher };
    }
    async sendRadio(actor, d, memberRoleIds = []) {
        await this.assertCrossServer(actor, 'radio', memberRoleIds);
        // Leitstelle darf für jede Einheit/jeden Einsatz funken; alle anderen nur als eigene Einheit in deren Einsätze
        const dispatcher = await this.perms.has(actor.userId, 'cad.assign_unit');
        const member = await this.prisma.cadMember.findFirst({ where: { OR: [{ userId: actor.userId }, ...(actor.discordId ? [{ discordId: actor.discordId }] : [])] } });
        if (!dispatcher && d.unitId && d.unitId !== member?.unitId)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Du kannst nur als deine eigene Einheit funken.');
        const unitId = dispatcher ? d.unitId ?? member?.unitId : member?.unitId;
        const unit = unitId ? await this.prisma.unit.findUnique({ where: { id: unitId } }) : null;
        let incidentId = d.incidentId ?? null;
        if (incidentId && !(await this.prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Einsatz nicht gefunden.');
        if (!incidentId && d.incidentNumber) {
            const i = await this.prisma.incident.findFirst({ where: { number: { equals: d.incidentNumber.trim(), mode: 'insensitive' } }, select: { id: true } });
            if (!i)
                throw new errors_1.AppError('NOT_FOUND', `Einsatz „${d.incidentNumber}“ nicht gefunden.`);
            incidentId = i.id;
        }
        if (incidentId && !dispatcher && !(unit && (await this.prisma.incidentUnit.findFirst({ where: { incidentId, unitId: unit.id, clearedAt: null } }))))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Funkmeldungen in einen Einsatz nur, wenn deine Einheit ihm zugewiesen ist.');
        if (!incidentId && unit)
            incidentId = (await this.prisma.incidentUnit.findFirst({ where: { unitId: unit.id, clearedAt: null }, orderBy: { assignedAt: 'desc' } }))?.incidentId ?? null;
        const callsign = (dispatcher ? d.callsign : null) ?? unit?.callsign ?? member?.callsign ?? null;
        const msg = await this.prisma.$transaction(async (tx) => {
            const row = await tx.cadRadioMessage.create({ data: { text: d.text, callsign, unitId: unit?.id ?? null, incidentId, authorId: actor.userId, discordId: actor.discordId ?? null, guildId: actor.guildId ?? null } });
            if (incidentId)
                await this.log(tx, incidentId, 'RADIO', `${callsign ?? 'Funk'}: „${d.text}“`, actor, unit?.id);
            await this.audit.record(actor, { action: 'cad.radio', module: 'cad', entityType: 'CadRadioMessage', entityId: row.id, after: { callsign, incidentId, crossServer: !!actor.guildId } }, tx);
            return row;
        });
        this.changed('radio', msg.id);
        const inc = incidentId ? await this.prisma.incident.findUnique({ where: { id: incidentId }, select: { number: true, guildId: true } }) : null;
        await this.notify.emit('radio', { id: msg.id, callsign, text: d.text, incidentNumber: inc?.number ?? null }, inc?.guildId ?? null);
        return { ...msg, incidentNumber: inc?.number ?? null };
    }
    /** Wichtige Leitstellenmeldung an alle konfigurierten Kanäle (inkl. verbundener Server). */
    async announce(actor, text) {
        await this.audit.record(actor, { action: 'cad.announcement', module: 'cad', after: { text } });
        const t = await this.notify.emit('announcement', { text, from: (await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }))?.displayName ?? null }, actor.guildId ?? null);
        return { channels: t?.channelIds.length ?? 0 };
    }
    // ───────── Zuordnung Discord ↔ Roblox ↔ ER:LC ↔ Team ↔ Einheit ─────────
    async listMembers() {
        const [rows, servers] = await Promise.all([this.prisma.cadMember.findMany({ orderBy: [{ team: 'asc' }, { callsign: 'asc' }] }), this.prisma.erlcServer.findMany({ where: { active: true }, select: { snapshot: true } })]);
        const online = new Set(servers.flatMap((s) => (s.snapshot?.players ?? []).map((p) => p.name.toLowerCase())));
        return rows.map((m) => ({ ...m, inGame: !!(m.erlcName && online.has(m.erlcName.toLowerCase())) }));
    }
    async saveMember(actor, id, d) {
        const cfg = await this.cfg.get();
        if (d.extra)
            for (const k of Object.keys(d.extra))
                if (!cfg.memberFields.some((f) => f.key === k))
                    throw new errors_1.AppError('VALIDATION_FAILED', `Unbekanntes Zusatzfeld „${k}“.`);
        if (d.unitId && !(await this.prisma.unit.findUnique({ where: { id: d.unitId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        if (!id && !d.userId && d.discordId)
            d.userId = (await this.prisma.discordLink.findUnique({ where: { discordId: d.discordId } }))?.userId ?? null;
        const data = { ...d, extra: (d.extra ?? undefined) };
        try {
            const row = await this.prisma.$transaction(async (tx) => {
                const before = id ? await tx.cadMember.findUnique({ where: { id } }) : null;
                if (id && !before)
                    throw new errors_1.AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
                const r = id ? await tx.cadMember.update({ where: { id }, data }) : await tx.cadMember.create({ data });
                await this.audit.record(actor, { action: id ? 'cad.member.update' : 'cad.member.create', module: 'cad', entityType: 'CadMember', entityId: r.id, before, after: d }, tx);
                return r;
            });
            this.changed('member', row.id);
            return row;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', 'Für diesen Discord-/Systembenutzer gibt es schon eine Zuordnung.');
            throw e;
        }
    }
    async deleteMember(actor, id) {
        const m = await this.prisma.cadMember.findUnique({ where: { id } });
        if (!m)
            throw new errors_1.AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.cadMember.delete({ where: { id } });
            await this.audit.record(actor, { action: 'cad.member.delete', module: 'cad', entityType: 'CadMember', entityId: id, before: m }, tx);
        });
        this.changed('member', id);
    }
    // ───────── Karte: POIs & Zonen ─────────
    async listMapObjects(actor) {
        const rows = await this.prisma.cadMapObject.findMany({ orderBy: [{ layer: 'asc' }, { name: 'asc' }] });
        if (await this.perms.has(actor.userId, 'cad.manage_map'))
            return rows;
        const mine = new Set((await this.prisma.userRole.findMany({ where: { userId: actor.userId }, select: { roleId: true } })).map((r) => r.roleId));
        return rows.filter((o) => !o.roleIds.length || o.roleIds.some((r) => mine.has(r)));
    }
    checkGeometry(d, kind) {
        if (kind === 'POI' && (d.x === undefined || d.x === null || d.z === undefined || d.z === null))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ein POI braucht eine Position.');
        if (kind === 'ZONE' && (!d.points || d.points.length < 3))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Eine Zone braucht mindestens 3 Punkte.');
    }
    async saveMapObject(actor, id, d) {
        const cfg = await this.cfg.get();
        if (d.layer && !cfg.layers.some((l) => l.key === d.layer))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannter Layer „${d.layer}“.`);
        const before = id ? await this.prisma.cadMapObject.findUnique({ where: { id } }) : null;
        if (id && !before)
            throw new errors_1.AppError('NOT_FOUND', 'Kartenobjekt nicht gefunden.');
        const kind = d.kind ?? before?.kind ?? 'POI';
        this.checkGeometry({ ...(before ? { x: before.x, z: before.z, points: before.points } : {}), ...d }, kind);
        const data = { ...d, points: d.points === undefined ? undefined : d.points === null ? client_1.Prisma.DbNull : d.points };
        const row = await this.prisma.$transaction(async (tx) => {
            const r = id ? await tx.cadMapObject.update({ where: { id }, data }) : await tx.cadMapObject.create({ data: { ...data, kind, createdById: actor.userId } });
            const what = kind === 'ZONE' ? 'zone' : 'poi';
            await this.audit.record(actor, { action: `cad.map.${what}.${id ? 'update' : 'create'}`, module: 'cad', entityType: 'CadMapObject', entityId: r.id, before, after: d }, tx);
            return r;
        });
        this.changed('map', row.id);
        return row;
    }
    async deleteMapObject(actor, id) {
        const o = await this.prisma.cadMapObject.findUnique({ where: { id } });
        if (!o)
            throw new errors_1.AppError('NOT_FOUND', 'Kartenobjekt nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.cadMapObject.delete({ where: { id } });
            await this.audit.record(actor, { action: `cad.map.${o.kind === 'ZONE' ? 'zone' : 'poi'}.delete`, module: 'cad', entityType: 'CadMapObject', entityId: id, before: o }, tx);
        });
        this.changed('map', id);
    }
    // ───────── Server-Verbindungen ─────────
    listLinks() { return this.prisma.cadServerLink.findMany({ orderBy: { name: 'asc' } }); }
    async saveLink(actor, id, d) {
        const before = id ? await this.prisma.cadServerLink.findUnique({ where: { id } }) : null;
        if (id && !before)
            throw new errors_1.AppError('NOT_FOUND', 'Server-Verbindung nicht gefunden.');
        const src = d.sourceGuildId ?? before?.sourceGuildId, dst = d.targetGuildId ?? before?.targetGuildId;
        if (src && src === dst)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Quelle und Ziel müssen verschiedene Server sein.');
        const data = { ...d, channels: d.channels === undefined ? undefined : d.channels };
        try {
            const row = await this.prisma.$transaction(async (tx) => {
                const r = id ? await tx.cadServerLink.update({ where: { id }, data }) : await tx.cadServerLink.create({ data: data });
                await this.audit.record(actor, { action: id ? 'cad.link.update' : 'cad.link.create', module: 'cad', entityType: 'CadServerLink', entityId: r.id, before, after: d }, tx);
                return r;
            });
            this.changed('link', row.id);
            return row;
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', 'Diese Server-Verbindung gibt es schon (gleiche Richtung).');
            throw e;
        }
    }
    async deleteLink(actor, id) {
        const l = await this.prisma.cadServerLink.findUnique({ where: { id } });
        if (!l)
            throw new errors_1.AppError('NOT_FOUND', 'Server-Verbindung nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await tx.cadServerLink.delete({ where: { id } });
            await this.audit.record(actor, { action: 'cad.link.delete', module: 'cad', entityType: 'CadServerLink', entityId: id, before: l }, tx);
        });
        this.changed('link', id);
    }
    // ───────── Protokolle & Übersicht ─────────
    async logs(take = 200) {
        const rows = await this.prisma.auditLog.findMany({ where: { module: { in: ['cad', 'erlc'] } }, orderBy: { createdAt: 'desc' }, take: Math.min(take, 500) });
        const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.actorUserId).filter((x) => !!x) } }, select: { id: true, displayName: true } });
        const n = new Map(users.map((u) => [u.id, u.displayName]));
        return rows.map((r) => ({ id: r.id, action: r.action, module: r.module, entityType: r.entityType, entityId: r.entityId, after: r.after, actor: r.actorUserId ? n.get(r.actorUserId) ?? null : null, createdAt: r.createdAt }));
    }
    /** Daten für die Leitstellen-Startseite in einem Abruf. ER:LC-Ausfall → letzter Stand + Hinweis, CAD läuft weiter. */
    async overview(actor) {
        const [cfg, incidents, units, calls, radio, servers] = await Promise.all([
            this.cfg.get(), this.listIncidents({ active: true, take: 50 }, actor), this.listUnits(), this.listCalls({ status: 'OPEN', take: 50 }), this.listRadio({ take: 15 }),
            this.prisma.erlcServer.findMany({ orderBy: { name: 'asc' } }),
        ]);
        const can = async (p) => this.perms.has(actor.userId, p);
        const [persons, vehicles] = await Promise.all([
            (await can('cad.view_persons')) ? this.prisma.person.count() : Promise.resolve(null),
            (await can('cad.view_vehicles')) ? this.prisma.vehicle.count() : Promise.resolve(null),
        ]);
        const erlc = (await can('cad.view_erlc')) ? servers.map((s) => {
            const snap = s.snapshot;
            const staff = snap?.staff ? new Set([...snap.staff.admins, ...snap.staff.mods, ...snap.staff.helpers].map((x) => x.name.toLowerCase())) : null;
            return { id: s.id, name: s.name, logoUrl: s.logoUrl, status: s.active ? s.status : 'DISABLED', lastSyncAt: s.lastSyncAt, lastError: s.lastError, latencyMs: s.latencyMs,
                players: snap?.server.currentPlayers ?? null, maxPlayers: snap?.server.maxPlayers ?? null, queue: snap?.queue?.length ?? null,
                staffOnline: snap?.players ? snap.players.filter((p) => (p.permission && p.permission !== 'Normal') || staff?.has(p.name.toLowerCase())).length : null };
        }) : [];
        return { config: cfg, incidents, units, calls, radio, erlc, counts: { persons, vehicles } };
    }
    /** Kartendaten: Einsätze, Notrufe, Einheiten, Spieler/Staff/Fahrzeuge (live), eigene POIs/Zonen. */
    async mapData(actor) {
        const [incidents, units, calls, objects, servers] = await Promise.all([
            this.listIncidents({ active: true, take: 200 }, actor), this.listUnits(), this.listCalls({ status: 'OPEN', take: 200 }), this.listMapObjects(actor),
            this.prisma.erlcServer.findMany({ where: { active: true } }),
        ]);
        const erlcAllowed = await this.perms.has(actor.userId, 'cad.view_erlc');
        const players = [];
        // Polizeifahrzeuge: ER:LC liefert keine Fahrzeugposition – gezeigt wird die Position des Besitzers (als solche gekennzeichnet)
        const vehicles = erlcAllowed && (await this.perms.has(actor.userId, 'fleet.view')) ? await this.fleet.forMap() : [];
        if (erlcAllowed)
            for (const s of servers) {
                const snap = s.snapshot;
                if (!snap?.players)
                    continue;
                const staffNames = snap.staff ? new Set([...snap.staff.admins, ...snap.staff.mods, ...snap.staff.helpers].map((x) => x.name.toLowerCase())) : new Set();
                // Nur Polizei-Leitstelle: Sheriffs erscheinen nicht auf der Karte
                for (const p of snap.players)
                    if (p.team?.toLowerCase() !== 'sheriff')
                        players.push({ ...p, serverId: s.id, staff: (!!p.permission && p.permission !== 'Normal') || staffNames.has(p.name.toLowerCase()) });
            }
        return {
            incidents: incidents.filter((i) => i.mapX !== null && i.mapZ !== null),
            calls: calls.filter((c) => c.mapX !== null && c.mapZ !== null),
            units: units.filter((u) => u.position), objects, players, vehicles,
            stale: servers.some((s) => s.status !== 'CONNECTED'),
        };
    }
};
exports.CadService = CadService;
exports.CadService = CadService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, realtime_service_1.RealtimeService,
        timeline_service_1.TimelineService, cad_config_service_1.CadConfigService, cad_notify_service_1.CadNotifyService, locks_service_1.LocksService,
        fleet_service_1.FleetService])
], CadService);
/** Punkt-in-Polygon (Strahlverfahren). */
function inside(x, z, pts) {
    let hit = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, zi] = pts[i], [xj, zj] = pts[j];
        if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
            hit = !hit;
    }
    return hit;
}
//# sourceMappingURL=cad.service.js.map