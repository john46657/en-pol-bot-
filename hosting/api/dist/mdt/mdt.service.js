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
exports.MdtService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const timeline_service_1 = require("../timeline/timeline.service");
const media_service_1 = require("../media/media.service");
const locks_service_1 = require("../locks/locks.service");
const roblox_service_1 = require("../persons/roblox.service");
const errors_1 = require("../common/errors");
const guild_context_1 = require("../common/guild-context");
const pagination_1 = require("../common/pagination");
const KEY = 'mdt.config';
const PHOTO_MAX = 8 * 1024 * 1024;
const ACTIVE_WANTED = ['ACTIVE'];
const dateOnly = (d) => (d ? d.toISOString().slice(0, 10) : null);
const normSerial = (s) => s.trim().toUpperCase().replace(/\s+/g, '');
/** Welche verknüpften Akten das Profil zeigt – und mit welchem Recht. */
const LINKED = [
    { type: 'Incident', perm: 'incidents.view', tab: 'incidents' },
    { type: 'Report', perm: 'reports.view', tab: 'reports' },
    { type: 'Investigation', perm: 'investigations.view', tab: 'investigations' },
    { type: 'Complaint', perm: 'complaints.view', tab: 'complaints' },
    { type: 'Evidence', perm: 'evidence.view', tab: 'evidence' },
];
/**
 * Polizei-MDT: Bürger-, Fahrzeug- und Waffenakten in der Ansicht eines Streifen-Terminals.
 * Nutzt dieselben Akten wie das Dashboard (Personen, Fahrzeuge, Fahndungen, Einsätze, Berichte …) – nichts wird doppelt gespeichert.
 * Alles zeigt nur gespeicherte Daten; was fehlt, bleibt leer („nicht erfasst“).
 */
let MdtService = class MdtService {
    prisma;
    audit;
    perms;
    timeline;
    media;
    locks;
    roblox;
    constructor(prisma, audit, perms, timeline, media, locks, roblox) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.timeline = timeline;
        this.media = media;
        this.locks = locks;
        this.roblox = roblox;
    }
    // ───────── Einstellungen ─────────
    async config() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const r = shared_1.mdtConfigSchema.safeParse({ ...shared_1.DEFAULT_MDT_CONFIG, ...(v ?? {}) });
        return r.success ? r.data : shared_1.DEFAULT_MDT_CONFIG;
    }
    async saveConfig(actor, patch) {
        const before = await this.config();
        const value = shared_1.mdtConfigSchema.parse({ ...before, ...patch });
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: value }, update: { value: value } });
            await this.audit.record(actor, { action: 'mdt.config', module: 'settings', entityType: 'SystemSetting', entityId: KEY, before: before, after: patch }, tx);
        });
        return value;
    }
    // ───────── Bürger ─────────
    citizen(p, activeWarrants) {
        return {
            id: p.id, robloxUsername: p.robloxUsername, robloxUserId: p.robloxUserId, fullName: p.fullName, status: p.status, aliases: p.aliases,
            dateOfBirth: dateOnly(p.dateOfBirth), age: (0, shared_1.ageOf)(dateOnly(p.dateOfBirth)), gender: p.gender, phone: p.phone, job: p.job, nationality: p.nationality, address: p.address,
            appearance: (p.appearance ?? null), licenses: p.licenses, flags: p.flags, photoUrl: p.photoId ? `/api/v1/media/${p.photoId}` : null,
            activeWarrants, version: p.version, updatedAt: p.updatedAt,
        };
    }
    async warrantCounts(personIds) {
        if (!personIds.length)
            return new Map();
        const rows = await this.prisma.wantedRecord.groupBy({ by: ['personId'], where: { personId: { in: personIds }, status: { in: ACTIVE_WANTED } }, _count: { _all: true } });
        return new Map(rows.map((r) => [r.personId, r._count._all]));
    }
    async citizens(p) {
        const q = p.q?.trim();
        const where = {
            ...(0, guild_context_1.recordWhere)(), status: 'ACTIVE',
            ...(p.flag ? { flags: { has: p.flag } } : {}),
            ...(q ? { OR: [
                    { robloxUsername: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }, { robloxUserId: q },
                    { phone: { contains: q } }, { aliases: { has: q } },
                ] } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.person.findMany({ where, orderBy: [{ fullName: { sort: 'asc', nulls: 'last' } }, { robloxUsername: 'asc' }], ...(0, pagination_1.skipTake)(p) }),
            this.prisma.person.count({ where }),
        ]);
        const [counts, heads] = await Promise.all([this.warrantCounts(items.map((i) => i.id)), this.roblox.headshots(items.map((i) => i.robloxUserId).filter((x) => !!x))]);
        return (0, pagination_1.pageResult)(items.map((i) => ({ ...this.citizen(i, counts.get(i.id) ?? 0), robloxHeadshotUrl: i.robloxUserId ? heads.get(i.robloxUserId) ?? null : null })), total, p);
    }
    async profile(actor, id) {
        const p = await this.prisma.person.findFirst({ where: { id, ...(0, guild_context_1.recordWhere)() } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Person nicht gefunden.');
        const can = async (perm) => this.perms.has(actor.userId, perm);
        const [canVehicles, canWeapons, canWanted] = await Promise.all([can('vehicles.view'), can('weapons.view'), can('wanted.view')]);
        const [vehicles, weapons, warrants, links, timeline] = await Promise.all([
            canVehicles ? this.prisma.vehicle.findMany({ where: { ownerId: id }, orderBy: { plate: 'asc' } }) : null,
            canWeapons ? this.prisma.weapon.findMany({ where: { ownerId: id }, orderBy: { serial: 'asc' } }) : null,
            canWanted ? this.prisma.wantedRecord.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 100 }) : null,
            this.prisma.recordLink.findMany({ where: { personId: id }, orderBy: { createdAt: 'desc' }, take: 300 }),
            this.timeline.list('Person', id),
        ]);
        // verknüpfte Akten auflösen – nur Bereiche, die der Benutzer sehen darf
        const linked = {};
        for (const l of LINKED) {
            if (!(await can(l.perm))) {
                linked[l.tab] = null;
                continue;
            }
            const ids = [...new Set(links.filter((x) => x.entityType === l.type).map((x) => x.entityId))];
            const role = (eid) => links.find((x) => x.entityType === l.type && x.entityId === eid)?.role ?? 'SUBJECT';
            const rows = !ids.length ? [] : l.type === 'Incident'
                ? (await this.prisma.incident.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.title, status: r.status, createdAt: r.createdAt }))
                : l.type === 'Report'
                    ? (await this.prisma.report.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.title, status: r.status, createdAt: r.createdAt }))
                    : l.type === 'Investigation'
                        ? (await this.prisma.investigation.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.caseNumber, title: r.title, status: r.status, createdAt: r.createdAt }))
                        : l.type === 'Complaint'
                            ? (await this.prisma.complaint.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.category, status: r.status, createdAt: r.createdAt }))
                            : (await this.prisma.evidence.findMany({ where: { id: { in: ids } } })).map((r) => ({ id: r.id, ref: r.number, title: r.description, status: r.custodyState, createdAt: r.createdAt }));
            linked[l.tab] = rows.map((r) => ({ ...r, role: role(r.id) })).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        const active = warrants?.filter((w) => ACTIVE_WANTED.includes(w.status)).length ?? 0;
        return {
            person: { ...this.citizen(p, active), notes: p.notes, custom: p.custom, createdAt: p.createdAt },
            counts: {
                activeWarrants: warrants ? active : null, vehicles: vehicles?.length ?? null, weapons: weapons?.length ?? null,
                incidents: linked.incidents?.length ?? null, reports: linked.reports?.length ?? null, investigations: linked.investigations?.length ?? null, evidence: linked.evidence?.length ?? null,
            },
            vehicles, weapons, warrants, ...linked, timeline,
        };
    }
    async updateCitizen(actor, id, version, d) {
        await this.locks.assertFree('person', id, actor.userId);
        const before = await this.prisma.person.findFirst({ where: { id, ...(0, guild_context_1.recordWhere)() } });
        if (!before)
            throw new errors_1.AppError('NOT_FOUND', 'Person nicht gefunden.');
        const cfg = await this.config();
        const bad = (list, allowed) => list?.find((k) => !allowed.some((a) => a.key === k));
        const badLicense = bad(d.licenses, cfg.licenses), badFlag = bad(d.flags, cfg.flags);
        if (badLicense)
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Lizenz „${badLicense}“.`);
        if (badFlag)
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekanntes Merkmal „${badFlag}“.`);
        const { dateOfBirth, appearance, licenses, flags, ...rest } = d;
        const data = {
            ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v])),
            ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null } : {}),
            ...(appearance !== undefined ? { appearance: appearance ? appearance : client_1.Prisma.DbNull } : {}),
            ...(licenses ? { licenses: [...new Set(licenses)] } : {}), ...(flags ? { flags: [...new Set(flags)] } : {}),
        };
        if (dateOfBirth && (Number.isNaN(Date.parse(dateOfBirth)) || new Date(dateOfBirth) > new Date()))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültiges Geburtsdatum.');
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.person.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
            if (!r.count)
                throw new errors_1.AppError('CONFLICT', 'Die Akte wurde inzwischen von jemand anderem geändert. Bitte neu laden.');
            const after = await tx.person.findUniqueOrThrow({ where: { id } });
            const fields = Object.keys(data);
            await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.updated', summary: `Personalien geändert (${fields.join(', ')})`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'person.update', module: 'persons', entityType: 'Person', entityId: id, before: Object.fromEntries(fields.map((k) => [k, before[k]])), after: Object.fromEntries(fields.map((k) => [k, after[k]])) }, tx);
            return this.citizen(after, 0);
        });
    }
    /**
     * Roblox-Profil der Person (Avatar, Anzeigename, Kontoalter, Freunde, Gruppen, frühere Namen) – live von Roblox.
     * Ohne gespeicherte Roblox-ID wird sie über den Roblox-Namen gesucht (nur exakter Treffer) und in der Akte nachgetragen.
     */
    async robloxProfile(actor, id) {
        const p = await this.prisma.person.findFirst({ where: { id, ...(0, guild_context_1.recordWhere)() }, select: { id: true, robloxUserId: true, robloxUsername: true } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Person nicht gefunden.');
        let rid = p.robloxUserId;
        if (!rid) {
            const found = await this.roblox.verifyName(p.robloxUsername);
            if (found === undefined)
                return { status: 'unreachable', profile: null };
            if (found === null)
                return { status: 'not_found', profile: null };
            rid = found.id;
            const taken = await this.prisma.person.findFirst({ where: { robloxUserId: rid, serverId: (await this.prisma.person.findUnique({ where: { id }, select: { serverId: true } }))?.serverId ?? null }, select: { id: true } });
            if (!taken) {
                await this.prisma.person.update({ where: { id }, data: { robloxUserId: rid } });
                await this.timeline.add(this.prisma, { entityType: 'Person', entityId: id, action: 'person.updated', summary: `Roblox-ID ${rid} von Roblox übernommen`, actorId: actor.userId });
            }
        }
        const profile = await this.roblox.profileDetails(rid);
        return profile ? { status: 'ok', profile } : { status: process.env.ROBLOX_LOOKUP === 'off' ? 'disabled' : 'unreachable', profile: null };
    }
    /** Foto hochladen oder mit der Kamera aufnehmen (Bild bis 8 MB); ersetzt das bisherige Foto. */
    async setPhoto(actor, id, file) {
        if (!file || !/^image\/(png|jpeg|webp)$/.test(file.mimetype))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte ein Bild (PNG, JPG oder WebP) hochladen.');
        const p = await this.prisma.person.findFirst({ where: { id, ...(0, guild_context_1.recordWhere)() } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Person nicht gefunden.');
        const m = await this.media.upload(actor, file, { linkedType: 'Person', linkedId: id }, PHOTO_MAX);
        await this.prisma.$transaction(async (tx) => {
            await tx.person.update({ where: { id }, data: { photoId: m.id, version: { increment: 1 } } });
            await this.timeline.add(tx, { entityType: 'Person', entityId: id, action: 'person.photo', summary: 'Foto geändert', actorId: actor.userId });
            await this.audit.record(actor, { action: 'person.photo', module: 'persons', entityType: 'Person', entityId: id, before: { photoId: p.photoId }, after: { photoId: m.id } }, tx);
        });
        return { photoUrl: `/api/v1/media/${m.id}` };
    }
    // ───────── Fahrzeuge ─────────
    async vehicles(p) {
        const q = p.q?.trim();
        const plate = q?.toUpperCase().replace(/\s+/g, '');
        const where = {
            ...(0, guild_context_1.recordWhere)(), status: { not: 'ARCHIVED' },
            ...(q ? { OR: [{ plate: { contains: plate } }, { model: { contains: q, mode: 'insensitive' } }, { owner: { OR: [{ robloxUsername: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } }] } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.vehicle.findMany({ where, include: { owner: { select: { id: true, robloxUsername: true, fullName: true } } }, orderBy: { plate: 'asc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.vehicle.count({ where }),
        ]);
        const bolos = items.length ? await this.prisma.wantedRecord.groupBy({ by: ['vehicleId'], where: { vehicleId: { in: items.map((v) => v.id) }, status: { in: ACTIVE_WANTED } }, _count: { _all: true } }) : [];
        const n = new Map(bolos.map((b) => [b.vehicleId, b._count._all]));
        return (0, pagination_1.pageResult)(items.map((v) => ({ ...v, activeBolos: n.get(v.id) ?? 0 })), total, p);
    }
    async vehicle(actor, id) {
        const v = await this.prisma.vehicle.findFirst({ where: { id, ...(0, guild_context_1.recordWhere)() }, include: { owner: { select: { id: true, robloxUsername: true, fullName: true, flags: true, photoId: true } } } });
        if (!v)
            throw new errors_1.AppError('NOT_FOUND', 'Fahrzeug nicht gefunden.');
        const [wanted, links, timeline] = await Promise.all([
            (await this.perms.has(actor.userId, 'wanted.view')) ? this.prisma.wantedRecord.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 50 }) : null,
            this.prisma.recordLink.findMany({ where: { vehicleId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
            this.timeline.list('Vehicle', id),
        ]);
        const incIds = links.filter((l) => l.entityType === 'Incident').map((l) => l.entityId);
        const incidents = incIds.length && (await this.perms.has(actor.userId, 'incidents.view')) ? await this.prisma.incident.findMany({ where: { id: { in: incIds } }, select: { id: true, number: true, title: true, status: true, createdAt: true } }) : [];
        return { vehicle: { ...v, owner: v.owner ? { ...v.owner, photoUrl: v.owner.photoId ? `/api/v1/media/${v.owner.photoId}` : null } : null }, wanted, incidents, timeline };
    }
    // ───────── Waffen ─────────
    async weapons(p) {
        const q = p.q?.trim();
        const where = {
            ...(0, guild_context_1.recordWhere)(), ...(p.ownerId ? { ownerId: p.ownerId } : {}), ...(p.status ? { status: p.status } : {}),
            ...(q ? { OR: [{ serial: { contains: normSerial(q) } }, { model: { contains: q, mode: 'insensitive' } }, { owner: { OR: [{ robloxUsername: { contains: q, mode: 'insensitive' } }, { fullName: { contains: q, mode: 'insensitive' } }] } }] } : {}),
        };
        const [items, total] = await Promise.all([
            this.prisma.weapon.findMany({ where, include: { owner: { select: { id: true, robloxUsername: true, fullName: true } } }, orderBy: { serial: 'asc' }, ...(0, pagination_1.skipTake)(p) }),
            this.prisma.weapon.count({ where }),
        ]);
        return (0, pagination_1.pageResult)(items, total, p);
    }
    async checkWeapon(d) {
        const cfg = await this.config();
        if (d.type && !cfg.weaponTypes.some((t) => t.key === d.type))
            throw new errors_1.AppError('VALIDATION_FAILED', `Unbekannte Waffenart „${d.type}“.`);
        if (d.ownerId && !(await this.prisma.person.findFirst({ where: { id: d.ownerId, ...(0, guild_context_1.recordWhere)() }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Besitzer nicht gefunden.');
    }
    async createWeapon(actor, d) {
        await this.checkWeapon(d);
        const serial = normSerial(d.serial);
        const serverId = (0, guild_context_1.recordSpace)() ?? null;
        if (await this.prisma.weapon.findFirst({ where: { serial, serverId } }))
            throw new errors_1.AppError('CONFLICT', `Die Seriennummer ${serial} ist schon registriert.`);
        return this.prisma.$transaction(async (tx) => {
            const w = await tx.weapon.create({ data: { ...d, serial, serverId } });
            if (w.ownerId)
                await this.timeline.add(tx, { entityType: 'Person', entityId: w.ownerId, action: 'weapon.linked', summary: `Waffe ${serial} registriert`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'weapon.create', module: 'weapons', entityType: 'Weapon', entityId: w.id, after: w }, tx);
            return w;
        });
    }
    async updateWeapon(actor, id, version, d) {
        await this.checkWeapon(d);
        const before = await this.prisma.weapon.findFirst({ where: { id, ...(0, guild_context_1.recordWhere)() } });
        if (!before)
            throw new errors_1.AppError('NOT_FOUND', 'Waffe nicht gefunden.');
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.weapon.updateMany({ where: { id, version }, data: { ...d, version: { increment: 1 } } });
            if (!r.count)
                throw new errors_1.AppError('CONFLICT', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden.');
            const after = await tx.weapon.findUniqueOrThrow({ where: { id } });
            if (d.ownerId !== undefined && d.ownerId !== before.ownerId && d.ownerId)
                await this.timeline.add(tx, { entityType: 'Person', entityId: d.ownerId, action: 'weapon.linked', summary: `Waffe ${after.serial} zugeordnet`, actorId: actor.userId });
            await this.audit.record(actor, { action: 'weapon.update', module: 'weapons', entityType: 'Weapon', entityId: id, before: Object.fromEntries(Object.keys(d).map((k) => [k, before[k]])), after: d }, tx);
            return after;
        });
    }
    // ───────── Haftbefehle / Fahndungen ─────────
    async warrants(status) {
        const rows = await this.prisma.wantedRecord.findMany({ where: status === 'ACTIVE' ? { status: { in: ACTIVE_WANTED } } : {}, orderBy: { createdAt: 'desc' }, take: 200 });
        const [persons, vehicles] = await Promise.all([
            this.prisma.person.findMany({ where: { id: { in: rows.map((r) => r.personId).filter((x) => !!x) }, ...(0, guild_context_1.recordWhere)() }, select: { id: true, robloxUsername: true, fullName: true, photoId: true, flags: true } }),
            this.prisma.vehicle.findMany({ where: { id: { in: rows.map((r) => r.vehicleId).filter((x) => !!x) }, ...(0, guild_context_1.recordWhere)() }, select: { id: true, plate: true, model: true, color: true } }),
        ]);
        const pm = new Map(persons.map((p) => [p.id, { ...p, photoUrl: p.photoId ? `/api/v1/media/${p.photoId}` : null }])), vm = new Map(vehicles.map((v) => [v.id, v]));
        // nur Fahndungen zu Akten im gewählten Server-Bereich
        return rows.filter((r) => (r.personId ? pm.has(r.personId) : r.vehicleId ? vm.has(r.vehicleId) : true))
            .map((r) => ({ ...r, person: r.personId ? pm.get(r.personId) ?? null : null, vehicle: r.vehicleId ? vm.get(r.vehicleId) ?? null : null }));
    }
};
exports.MdtService = MdtService;
exports.MdtService = MdtService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService,
        timeline_service_1.TimelineService, media_service_1.MediaService, locks_service_1.LocksService,
        roblox_service_1.RobloxService])
], MdtService);
//# sourceMappingURL=mdt.service.js.map