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
exports.OrgService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const notify_service_1 = require("../notifications/notify.service");
const errors_1 = require("../common/errors");
const personSelect = { id: true, rank: true, team: true, callsign: true, serviceNumber: true, employmentStatus: true, userId: true, user: { select: { displayName: true } } };
const brief = (p) => (p ? { id: p.id, userId: p.userId, name: p.user.displayName, rank: p.rank, callsign: p.callsign, serviceNumber: p.serviceNumber } : null);
const INACTIVE = ['RESIGNED', 'TERMINATED', 'INACTIVE'];
/**
 * Organigramm: Einheiten (Führung, Abteilungen, Dienstgruppen …) als Baum. Abteilungs-Einheiten können mit einer Abteilung der
 * Personal-Einstellungen verknüpft werden – ihre Mitglieder sind dann die Personalakten dieser Abteilung (keine Doppelpflege,
 * Versetzungen laufen weiter über den Antrags-Workflow). Andere Einheiten haben ausdrückliche Zuordnungen mit Historie.
 * Einheiten werden deaktiviert, nie gelöscht.
 */
let OrgService = class OrgService {
    prisma;
    audit;
    perms;
    notify;
    constructor(prisma, audit, perms, notify) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
        this.notify = notify;
    }
    async units(includeInactive = false) {
        return this.prisma.orgUnit.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ position: 'asc' }, { name: 'asc' }], take: 1000 });
    }
    /** Vollständige Struktur mit Führung, Stellvertretung und Mitgliedern (für Dashboard, MDT, Leitstelle). */
    async structure(q = {}) {
        const units = await this.units(q.includeInactive);
        const assignments = await this.prisma.orgAssignment.findMany({ where: { endedAt: null, unitId: { in: units.map((u) => u.id) } }, select: { unitId: true, personnelId: true, function: true, startedAt: true } });
        const depts = [...new Set(units.map((u) => u.departmentName).filter((x) => !!x))];
        const ids = new Set([...assignments.map((a) => a.personnelId), ...units.flatMap((u) => [u.leaderPersonnelId, u.deputyPersonnelId]).filter((x) => !!x)]);
        const people = await this.prisma.personnel.findMany({ where: { OR: [{ id: { in: [...ids] } }, ...(depts.length ? [{ team: { in: depts }, employmentStatus: { notIn: INACTIVE } }] : [])] }, select: personSelect, take: 5000 });
        const byId = new Map(people.map((p) => [p.id, p]));
        return units.map((u) => {
            const explicit = assignments.filter((a) => a.unitId === u.id).map((a) => ({ ...brief(byId.get(a.personnelId)), function: a.function, since: a.startedAt, via: 'ASSIGNMENT' })).filter((m) => m.id);
            const fromDept = u.departmentName ? people.filter((p) => p.team === u.departmentName && !INACTIVE.includes(p.employmentStatus) && !explicit.some((e) => e.id === p.id)).map((p) => ({ ...brief(p), function: null, since: null, via: 'DEPARTMENT' })) : [];
            const members = [...explicit, ...fromDept];
            return {
                id: u.id, parentId: u.parentId, name: u.name, kind: u.kind, description: u.description, responsibilities: u.responsibilities, departmentName: u.departmentName,
                color: u.color, position: u.position, active: u.active, version: u.version,
                leader: brief(u.leaderPersonnelId ? byId.get(u.leaderPersonnelId) : null), deputy: brief(u.deputyPersonnelId ? byId.get(u.deputyPersonnelId) : null),
                memberCount: members.length, members: q.members === false ? undefined : members,
            };
        });
    }
    /** Kurzfassung der Führungsstruktur (Bot, MDT, Leitstelle): ohne Mitgliederlisten. */
    async summary() {
        return (await this.structure({ members: false })).map(({ members: _m, ...u }) => u);
    }
    async detail(id) {
        const u = await this.prisma.orgUnit.findUnique({ where: { id } });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        const row = (await this.structure({ includeInactive: true })).find((x) => x.id === id);
        const past = await this.prisma.orgAssignment.findMany({ where: { unitId: id, endedAt: { not: null } }, orderBy: { endedAt: 'desc' }, take: 200, include: { personnel: { select: personSelect } } });
        const history = await this.prisma.auditLog.findMany({ where: { entityType: 'OrgUnit', entityId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: history.map((h) => h.actorUserId).filter((x) => !!x) } }, select: { id: true, displayName: true } })).map((x) => [x.id, x.displayName]));
        return {
            ...row,
            formerMembers: past.map((a) => ({ ...brief(a.personnel), function: a.function, startedAt: a.startedAt, endedAt: a.endedAt })),
            history: history.map((h) => ({ id: h.id, action: h.action, at: h.createdAt, actor: h.actorUserId ? names.get(h.actorUserId) ?? '—' : 'System', before: h.before, after: h.after })),
        };
    }
    async assertPersonnel(tx, id) {
        if (!id)
            return;
        if (!(await tx.personnel.findUnique({ where: { id }, select: { id: true } })))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Personalakte nicht gefunden.');
    }
    /** Struktur-Änderungen (übergeordnete Einheit, Führung, Stellvertretung) brauchen zusätzlich `org.hierarchy`. */
    async assertHierarchy(actor) {
        if (!(await this.perms.has(actor.userId, 'org.hierarchy')))
            throw new errors_1.AppError('PERMISSION_DENIED', 'Übergeordnete Einheit, Führung und Stellvertretung ändern braucht das Recht „Hierarchie bearbeiten“ (org.hierarchy).');
    }
    async create(actor, d) {
        if (d.parentId || d.leaderPersonnelId || d.deputyPersonnelId)
            await this.assertHierarchy(actor);
        if (d.leaderPersonnelId && d.leaderPersonnelId === d.deputyPersonnelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Führung und Stellvertretung müssen verschiedene Personen sein.');
        const u = await this.prisma.$transaction(async (tx) => {
            if (d.parentId && !(await tx.orgUnit.findUnique({ where: { id: d.parentId } })))
                throw new errors_1.AppError('VALIDATION_FAILED', 'Übergeordnete Einheit nicht gefunden.');
            await this.assertPersonnel(tx, d.leaderPersonnelId);
            await this.assertPersonnel(tx, d.deputyPersonnelId);
            const row = await tx.orgUnit.create({ data: { name: d.name, kind: d.kind, parentId: d.parentId ?? null, description: d.description ?? null, responsibilities: d.responsibilities ?? null, departmentName: d.departmentName ?? null, leaderPersonnelId: d.leaderPersonnelId ?? null, deputyPersonnelId: d.deputyPersonnelId ?? null, color: d.color ?? null, position: d.position ?? 0 } });
            await this.audit.record(actor, { action: 'org.unit.create', module: 'org', entityType: 'OrgUnit', entityId: row.id, after: row }, tx);
            return row;
        });
        await this.changed(actor, `🏛️ Organigramm: „${u.name}“ angelegt`, u.id);
        return u;
    }
    async update(actor, id, d) {
        const before = await this.prisma.orgUnit.findUnique({ where: { id } });
        if (!before)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        if (d.version !== undefined && d.version !== before.version)
            throw new errors_1.AppError('CONFLICT', 'Die Einheit wurde inzwischen geändert – bitte neu laden.', { reason: 'VERSION' });
        const structural = (d.parentId !== undefined && d.parentId !== before.parentId) || (d.leaderPersonnelId !== undefined && d.leaderPersonnelId !== before.leaderPersonnelId) || (d.deputyPersonnelId !== undefined && d.deputyPersonnelId !== before.deputyPersonnelId);
        if (structural)
            await this.assertHierarchy(actor);
        const leader = d.leaderPersonnelId !== undefined ? d.leaderPersonnelId : before.leaderPersonnelId;
        const deputy = d.deputyPersonnelId !== undefined ? d.deputyPersonnelId : before.deputyPersonnelId;
        if (leader && leader === deputy)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Führung und Stellvertretung müssen verschiedene Personen sein.');
        const after = await this.prisma.$transaction(async (tx) => {
            if (d.parentId !== undefined && d.parentId !== before.parentId) {
                const all = await tx.orgUnit.findMany({ select: { id: true, parentId: true } });
                if (d.parentId && !all.some((x) => x.id === d.parentId))
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Übergeordnete Einheit nicht gefunden.');
                if ((0, shared_1.orgWouldCycle)(all, id, d.parentId))
                    throw new errors_1.AppError('VALIDATION_FAILED', 'Eine Einheit kann nicht unter sich selbst oder einer ihrer Untereinheiten stehen.');
            }
            await this.assertPersonnel(tx, d.leaderPersonnelId);
            await this.assertPersonnel(tx, d.deputyPersonnelId);
            const row = await tx.orgUnit.update({ where: { id }, data: {
                    ...(d.name !== undefined ? { name: d.name } : {}), ...(d.kind !== undefined ? { kind: d.kind } : {}), ...(d.parentId !== undefined ? { parentId: d.parentId } : {}),
                    ...(d.description !== undefined ? { description: d.description } : {}), ...(d.responsibilities !== undefined ? { responsibilities: d.responsibilities } : {}),
                    ...(d.departmentName !== undefined ? { departmentName: d.departmentName } : {}), ...(d.leaderPersonnelId !== undefined ? { leaderPersonnelId: d.leaderPersonnelId } : {}),
                    ...(d.deputyPersonnelId !== undefined ? { deputyPersonnelId: d.deputyPersonnelId } : {}), ...(d.color !== undefined ? { color: d.color } : {}), ...(d.position !== undefined ? { position: d.position } : {}),
                    version: { increment: 1 },
                } });
            await this.audit.record(actor, { action: structural ? 'org.unit.hierarchy' : 'org.unit.update', module: 'org', entityType: 'OrgUnit', entityId: id, before, after: row }, tx);
            return row;
        });
        await this.changed(actor, `🏛️ Organigramm: „${after.name}“ geändert`, id, [leader, deputy]);
        return after;
    }
    /** Deaktivieren (nicht löschen). Mit aktiven Untereinheiten nicht möglich. */
    async setActive(actor, id, active) {
        const u = await this.prisma.orgUnit.findUnique({ where: { id } });
        if (!u)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
        if (!active && (await this.prisma.orgUnit.count({ where: { parentId: id, active: true } })))
            throw new errors_1.AppError('CONFLICT', 'Die Einheit hat noch aktive Untereinheiten – diese zuerst verschieben oder deaktivieren.');
        if (active && u.parentId && !(await this.prisma.orgUnit.findFirst({ where: { id: u.parentId, active: true } })))
            throw new errors_1.AppError('CONFLICT', 'Die übergeordnete Einheit ist deaktiviert – zuerst diese aktivieren.');
        const row = await this.prisma.$transaction(async (tx) => {
            const r = await tx.orgUnit.update({ where: { id }, data: { active, deactivatedAt: active ? null : new Date(), version: { increment: 1 } } });
            await this.audit.record(actor, { action: active ? 'org.unit.activate' : 'org.unit.deactivate', module: 'org', entityType: 'OrgUnit', entityId: id, before: { active: u.active }, after: { active } }, tx);
            return r;
        });
        await this.changed(actor, `🏛️ Organigramm: „${u.name}“ ${active ? 'aktiviert' : 'deaktiviert'}`, id);
        return row;
    }
    async assign(actor, unitId, d) {
        const u = await this.prisma.orgUnit.findUnique({ where: { id: unitId } });
        if (!u || !u.active)
            throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden oder deaktiviert.');
        const p = await this.prisma.personnel.findUnique({ where: { id: d.personnelId }, select: { id: true, userId: true } });
        if (!p)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Personalakte nicht gefunden.');
        const row = await this.prisma.$transaction(async (tx) => {
            if (await tx.orgAssignment.findFirst({ where: { unitId, personnelId: d.personnelId, endedAt: null } }))
                throw new errors_1.AppError('CONFLICT', 'Die Person ist dieser Einheit schon zugeordnet.');
            const a = await tx.orgAssignment.create({ data: { unitId, personnelId: d.personnelId, function: d.function?.trim() || null, createdById: actor.userId } });
            await this.audit.record(actor, { action: 'org.assign', module: 'org', entityType: 'OrgUnit', entityId: unitId, after: { personnelId: d.personnelId, function: a.function } }, tx);
            await tx.personnelRecord.create({ data: { personnelId: d.personnelId, type: 'STATUS', summary: `Organigramm: „${u.name}“ zugeordnet${a.function ? ` (${a.function})` : ''}`, data: { orgUnitId: unitId, kind: 'ORG_ASSIGN' }, createdById: actor.userId } });
            return a;
        });
        await this.notify.notify([p.userId].filter((x) => x !== actor.userId), { type: 'ORG', title: `🏛️ Du wurdest „${u.name}“ zugeordnet`, entityType: 'OrgUnit', entityId: unitId });
        return row;
    }
    async endAssignment(actor, assignmentId) {
        const a = await this.prisma.orgAssignment.findUnique({ where: { id: assignmentId }, include: { unit: true } });
        if (!a || a.endedAt)
            throw new errors_1.AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
        // Einheit im gewählten Server? (OrgUnit ist serverbezogen; fremde gelten als nicht vorhanden)
        if (!(await this.prisma.orgUnit.findUnique({ where: { id: a.unitId }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
        return this.prisma.$transaction(async (tx) => {
            const r = await tx.orgAssignment.update({ where: { id: assignmentId }, data: { endedAt: new Date(), endedById: actor.userId } });
            await this.audit.record(actor, { action: 'org.unassign', module: 'org', entityType: 'OrgUnit', entityId: a.unitId, before: { personnelId: a.personnelId, function: a.function } }, tx);
            return r;
        });
    }
    /** Zuordnungen anhand der aktiven Zuordnung (Person + Einheit) beenden – für das Dashboard. */
    async unassign(actor, unitId, personnelId) {
        const a = await this.prisma.orgAssignment.findFirst({ where: { unitId, personnelId, endedAt: null } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Zuordnung nicht gefunden.');
        return this.endAssignment(actor, a.id);
    }
    /**
     * Abteilungen aus den Personal-Einstellungen als Abteilungs-Einheiten übernehmen (nur fehlende; nichts wird erfunden oder
     * überschrieben). Optional unter einer übergeordneten Einheit.
     */
    async importDepartments(actor, parentId) {
        const cfg = (0, shared_1.withHrDefaults)((await this.prisma.systemSetting.findUnique({ where: { key: 'hr.config' } }))?.value);
        if (parentId && !(await this.prisma.orgUnit.findUnique({ where: { id: parentId } })))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Übergeordnete Einheit nicht gefunden.');
        const existing = new Set((await this.prisma.orgUnit.findMany({ where: { departmentName: { not: null } }, select: { departmentName: true } })).map((u) => u.departmentName));
        const created = [];
        await this.prisma.$transaction(async (tx) => {
            for (const [i, d] of cfg.departments.entries()) {
                if (existing.has(d.name))
                    continue;
                const u = await tx.orgUnit.create({ data: { name: d.name, kind: 'DEPARTMENT', departmentName: d.name, color: d.color ?? null, parentId: parentId ?? null, position: i } });
                await this.audit.record(actor, { action: 'org.unit.import', module: 'org', entityType: 'OrgUnit', entityId: u.id, after: u }, tx);
                created.push(d.name);
            }
        });
        if (created.length)
            await this.changed(actor, `🏛️ Organigramm: ${created.length} Abteilung(en) übernommen`, null);
        return { created };
    }
    // ───────── Bereichsbezogene Zugriffe (Vererbung innerhalb der Organisation) ─────────
    /**
     * Personalakten, für die ein Benutzer als Führung/Stellvertretung zuständig ist: Mitglieder seiner Einheiten und aller
     * Untereinheiten (abteilungsbezogen + ausdrückliche Zuordnungen). Grundlage für `personnel.view_unit`.
     */
    async scopeOf(userId) {
        const mine = await this.prisma.personnel.findMany({ where: { userId }, select: { id: true } });
        if (!mine.length)
            return new Set();
        const units = await this.units();
        const ids = new Set(mine.map((m) => m.id));
        const led = units.filter((u) => (u.leaderPersonnelId && ids.has(u.leaderPersonnelId)) || (u.deputyPersonnelId && ids.has(u.deputyPersonnelId)));
        if (!led.length)
            return new Set();
        const all = new Set(led.map((u) => u.id));
        for (const u of led)
            for (const d of (0, shared_1.orgDescendants)(units, u.id))
                all.add(d);
        const scope = units.filter((u) => all.has(u.id));
        const [assigned, dept] = await Promise.all([
            this.prisma.orgAssignment.findMany({ where: { unitId: { in: [...all] }, endedAt: null }, select: { personnelId: true } }),
            this.prisma.personnel.findMany({ where: { team: { in: scope.map((u) => u.departmentName).filter((x) => !!x) } }, select: { id: true } }),
        ]);
        const out = new Set([...assigned.map((a) => a.personnelId), ...dept.map((p) => p.id), ...scope.flatMap((u) => [u.leaderPersonnelId, u.deputyPersonnelId]).filter((x) => !!x)]);
        return out;
    }
    /** Einheiten einer Person inkl. übergeordneter Kette und zuständiger Führung (Personalakte, MDT, Leitstelle). */
    async unitsOf(personnelId, team) {
        const units = await this.units();
        const assigned = await this.prisma.orgAssignment.findMany({ where: { personnelId, endedAt: null, unitId: { in: units.map((u) => u.id) } }, select: { unitId: true, function: true, startedAt: true } });
        const direct = units.filter((u) => assigned.some((a) => a.unitId === u.id) || (team && u.departmentName === team) || u.leaderPersonnelId === personnelId || u.deputyPersonnelId === personnelId);
        const leaderIds = new Set(units.flatMap((u) => [u.leaderPersonnelId, u.deputyPersonnelId]).filter((x) => !!x));
        const people = new Map((await this.prisma.personnel.findMany({ where: { id: { in: [...leaderIds] } }, select: personSelect })).map((p) => [p.id, p]));
        const byId = new Map(units.map((u) => [u.id, u]));
        return direct.map((u) => {
            const a = assigned.find((x) => x.unitId === u.id);
            // zuständige Führungskraft: Führung der Einheit, bei eigener Führungsrolle die nächsthöhere Einheit
            const chain = [u.id, ...(0, shared_1.orgAncestors)(units, u.id)].map((id) => byId.get(id)).filter(Boolean);
            const sup = chain.find((x) => x.leaderPersonnelId && x.leaderPersonnelId !== personnelId);
            return {
                id: u.id, name: u.name, kind: u.kind, function: a?.function ?? null, since: a?.startedAt ?? null,
                role: u.leaderPersonnelId === personnelId ? 'LEADER' : u.deputyPersonnelId === personnelId ? 'DEPUTY' : 'MEMBER',
                path: chain.slice().reverse().map((x) => x.name),
                supervisor: brief(sup?.leaderPersonnelId ? people.get(sup.leaderPersonnelId) : null),
            };
        });
    }
    /** Benachrichtigung bei Organigramm-Änderungen: Verwalter (org.edit) und betroffene Führungskräfte. */
    async changed(actor, title, unitId, personnelIds = []) {
        try {
            await this.sendChanged(actor, title, unitId, personnelIds);
        }
        catch { /* Benachrichtigungen stören den Fachprozess nie */ }
    }
    async sendChanged(actor, title, unitId, personnelIds) {
        const users = (await this.prisma.personnel.findMany({ where: { id: { in: personnelIds.filter((x) => !!x) } }, select: { userId: true } })).map((p) => p.userId);
        const staff = await this.notify.usersWith('org.edit', { exceptUserId: actor.userId });
        await this.notify.notify([...staff, ...users].filter((u) => u !== actor.userId), { type: 'ORG', title, entityType: 'OrgUnit', entityId: unitId ?? undefined });
    }
};
exports.OrgService = OrgService;
exports.OrgService = OrgService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService, notify_service_1.NotifyService])
], OrgService);
//# sourceMappingURL=org.service.js.map