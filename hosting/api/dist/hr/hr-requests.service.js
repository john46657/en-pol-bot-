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
exports.HrRequestsService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const numbering_1 = require("../common/numbering");
const hr_core_service_1 = require("./hr-core.service");
const P = (k) => (k === 'PROMOTION' ? 'promotion' : 'transfer');
const OPEN = ['OPEN', 'IN_REVIEW', 'DEFERRED'];
/**
 * Beförderungs- und Versetzungsanträge: Antrag → Prüfung → Genehmigungsstufen → Durchführung
 * (Rang/Abteilung, Discord-/Dashboard-Rollen, Personalakte, Historie, Audit, Benachrichtigung).
 */
let HrRequestsService = class HrRequestsService {
    core;
    perms;
    constructor(core, perms) {
        this.core = core;
        this.perms = perms;
    }
    get prisma() { return this.core.prisma; }
    stagesOf(cfg, kind) { return kind === 'PROMOTION' ? cfg.promotion.stages : cfg.transfer.stages; }
    needed(cfg, kind) { const s = this.stagesOf(cfg, kind); return Math.max(s.length, kind === 'PROMOTION' ? cfg.promotion.approvalsRequired : cfg.transfer.approvalsRequired); }
    async list(actor, f) {
        const kinds = [...((await this.perms.has(actor.userId, 'promotion.view')) ? ['PROMOTION'] : []), ...((await this.perms.has(actor.userId, 'transfer.view')) ? ['TRANSFER'] : [])];
        if (!kinds.length)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Dafür fehlt dir die Berechtigung.');
        const where = {
            kind: f.kind && kinds.includes(f.kind) ? f.kind : { in: kinds }, ...(f.status === 'ACTIVE' ? { status: { in: OPEN } } : f.status ? { status: f.status } : {}), ...(f.personnelId ? { personnelId: f.personnelId } : {}),
            ...(f.requesterId ? { requesterId: f.requesterId } : {}), ...(f.rank ? { OR: [{ toValue: f.rank }, { fromValue: f.rank }] } : {}), ...(f.department ? { personnel: { team: f.department } } : {}),
            ...(f.approverId ? { approvals: { array_contains: [{ userId: f.approverId }] } } : {}),
            ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59Z`) } : {}) } } : {}),
            ...(f.q ? { AND: [{ OR: [{ number: { contains: f.q.toUpperCase() } }, { personnel: { user: { displayName: { contains: f.q, mode: 'insensitive' } } } }, { reason: { contains: f.q, mode: 'insensitive' } }] }] } : {}),
        };
        const [items, ranks, sens] = await Promise.all([
            this.prisma.hrRequest.findMany({ where, include: { personnel: { select: { id: true, rank: true, team: true, user: { select: { displayName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 500 }),
            this.core.ranks(), this.perms.has(actor.userId, 'personnel.view_sensitive'),
        ]);
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.requesterId))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        const rankName = (id) => (id ? ranks.find((r) => r.id === id)?.name ?? id : null);
        return items.map((r) => ({ ...r, internalNote: sens ? r.internalNote : null, requesterName: users.get(r.requesterId) ?? '—', fromLabel: r.kind === 'PROMOTION' ? rankName(r.fromValue) : r.fromValue, toLabel: r.kind === 'PROMOTION' ? rankName(r.toValue) : r.toValue, needed: 0 }));
    }
    async get(actor, id) {
        const r = await this.prisma.hrRequest.findUnique({ where: { id }, include: { personnel: { select: { id: true, rank: true, team: true, userId: true, user: { select: { displayName: true } } } } } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Antrag nicht gefunden.');
        await this.perms.assert(actor.userId, `${P(r.kind)}.view`);
        const cfg = await this.core.config();
        const ranks = await this.core.ranks();
        const rank = r.kind === 'PROMOTION' ? ranks.find((x) => x.id === r.toValue) : null;
        const check = rank ? await this.core.evaluate(r.personnelId, rank) : null;
        const sens = await this.perms.has(actor.userId, 'personnel.view_sensitive');
        const requester = await this.prisma.user.findUnique({ where: { id: r.requesterId }, select: { displayName: true } });
        return {
            ...r, internalNote: sens ? r.internalNote : null, requesterName: requester?.displayName ?? '—',
            fromLabel: r.kind === 'PROMOTION' ? ranks.find((x) => x.id === r.fromValue)?.name ?? r.fromValue : r.fromValue, toLabel: rank?.name ?? r.toValue,
            check, stages: this.stagesOf(cfg, r.kind), needed: this.needed(cfg, r.kind), next: await this.nextStage(r, cfg),
            can: await this.abilities(actor.userId, r, cfg),
        };
    }
    /** Welche Stufe als Nächstes genehmigt (null = alle durch). */
    async nextStage(r, cfg) {
        const stages = this.stagesOf(cfg, r.kind);
        const approvals = r.approvals.filter((a) => a.decision === 'APPROVE');
        return stages.find((s) => !approvals.some((a) => a.stage === s.id)) ?? null;
    }
    /** Darf der Benutzer in der aktuellen Stufe genehmigen? Stufen-Rollen und „Genehmiger-Ränge“ des Zielrangs werden geprüft. */
    async mayApprove(userId, r, cfg) {
        const kind = r.kind;
        if (!(await this.perms.has(userId, `${P(kind)}.approve`)))
            return { ok: false, why: 'Recht fehlt' };
        const me = await this.prisma.personnel.findFirst({ where: { userId } });
        if (me?.id === r.personnelId)
            return { ok: false, why: 'Eigener Antrag' };
        const approvals = r.approvals;
        if (approvals.some((a) => a.userId === userId && a.decision === 'APPROVE'))
            return { ok: false, why: 'Schon genehmigt' };
        const stage = await this.nextStage(r, cfg);
        if (stage?.roleIds.length) {
            const roles = await this.perms.roleIdsFor(userId);
            if (!stage.roleIds.some((x) => roles.includes(x)))
                return { ok: false, why: `Stufe „${stage.name}“ braucht eine andere Rolle` };
        }
        if (kind === 'PROMOTION') {
            const target = await this.prisma.hrRank.findUnique({ where: { id: r.toValue } });
            if (target?.approverRankIds.length) {
                const mine = await this.core.rankByName(me?.rank);
                if (!mine || !target.approverRankIds.includes(mine.id))
                    return { ok: false, why: 'Dein Rang darf diese Beförderung nicht genehmigen' };
            }
        }
        return { ok: true, why: null };
    }
    async abilities(userId, r, cfg) {
        const k = P(r.kind), open = OPEN.includes(r.status);
        const approve = open ? await this.mayApprove(userId, r, cfg) : { ok: false, why: null };
        return {
            approve: approve.ok, approveWhy: approve.why, reject: open && (await this.perms.has(userId, `${k}.reject`)),
            review: open && r.kind === 'PROMOTION' && (await this.perms.has(userId, 'promotion.review')),
            execute: r.status === 'APPROVED' && (await this.perms.has(userId, r.kind === 'PROMOTION' ? 'promotion.execute' : 'transfer.approve')),
            edit: open && (r.requesterId === userId || (await this.perms.has(userId, r.kind === 'PROMOTION' ? 'promotion.edit' : 'transfer.approve'))),
            cancel: open && (r.requesterId === userId || (await this.perms.has(userId, `${k}.reject`))),
        };
    }
    async create(actor, d) {
        const cfg = await this.core.config();
        await this.perms.assert(actor.userId, `${P(d.kind)}.create`);
        const p = await this.prisma.personnel.findUnique({ where: { id: d.personnelId }, include: { user: { select: { displayName: true } } } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
        if (d.kind === 'PROMOTION' && cfg.promotion.requireReason && d.reason.trim().length < 3)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine Begründung angeben.');
        if (await this.prisma.hrRequest.findFirst({ where: { personnelId: p.id, kind: d.kind, status: { in: [...OPEN, 'APPROVED'] } } }))
            throw new errors_1.AppError('CONFLICT', `Für diese Person läuft schon ein ${d.kind === 'PROMOTION' ? 'Beförderungs' : 'Versetzungs'}antrag.`);
        let fromValue, toValue;
        if (d.kind === 'PROMOTION') {
            const target = await this.prisma.hrRank.findUnique({ where: { id: d.to } });
            if (!target?.active)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Zielrang nicht gefunden oder inaktiv.');
            const current = await this.core.rankByName(p.rank);
            if (current?.id === target.id)
                throw new errors_1.AppError('CONFLICT', 'Die Person hat diesen Rang schon.');
            const allowed = current?.nextRankIds.length ? current.nextRankIds : null;
            if (allowed && !allowed.includes(target.id))
                throw new errors_1.AppError('CONFLICT', `Von „${current.name}“ ist keine Beförderung nach „${target.name}“ vorgesehen.`);
            if (cfg.promotion.requireRequirements) {
                const c = await this.core.evaluate(p.id, target);
                if (!c.eligible)
                    throw new errors_1.AppError('CONFLICT', `Voraussetzungen nicht erfüllt (${c.met}/${c.total}): ${c.results.filter((x) => !x.met).map((x) => x.label).join(', ')}`);
            }
            fromValue = current?.id ?? null;
            toValue = target.id;
        }
        else {
            const dept = cfg.departments.find((x) => x.name === d.to);
            if (!dept)
                throw new errors_1.AppError('VALIDATION_FAILED', 'Abteilung nicht gefunden.');
            if (p.team === dept.name)
                throw new errors_1.AppError('CONFLICT', 'Die Person ist schon in dieser Abteilung.');
            fromValue = p.team;
            toValue = dept.name;
        }
        const r = await this.prisma.$transaction(async (tx) => {
            const row = await tx.hrRequest.create({ data: { number: (0, numbering_1.makeNumber)(d.kind === 'PROMOTION' ? 'BF' : 'VS'), kind: d.kind, personnelId: p.id, fromValue, toValue, reason: d.reason, achievements: d.achievements || null, internalNote: d.internalNote || null, attachments: d.attachments ?? [], requesterId: actor.userId } });
            await this.core.audit.record(actor, { action: `${P(d.kind)}.request.create`, module: P(d.kind), entityType: 'HrRequest', entityId: row.id, after: row }, tx);
            return row;
        });
        const label = d.kind === 'PROMOTION' ? (await this.prisma.hrRank.findUnique({ where: { id: toValue } }))?.name : toValue;
        await this.core.notify(d.kind === 'PROMOTION' ? 'promotion.requested' : 'transfer.requested', { memberUserId: null, title: `${d.kind === 'PROMOTION' ? 'Beförderungsantrag' : 'Versetzungsantrag'} ${r.number}: ${p.user.displayName} → ${label}`, body: d.reason, entityType: 'HrRequest', entityId: r.id });
        return r;
    }
    async edit(actor, id, d) {
        const r = await this.prisma.hrRequest.findUnique({ where: { id } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Antrag nicht gefunden.');
        const ab = await this.abilities(actor.userId, r, await this.core.config());
        if (!ab.edit)
            throw new errors_1.AppError('PERMISSION_DENIED', 'Diesen Antrag kannst du nicht (mehr) bearbeiten.');
        const upd = await this.prisma.hrRequest.updateMany({ where: { id, ...(d.version ? { version: d.version } : {}) }, data: { ...(d.reason ? { reason: d.reason } : {}), ...(d.achievements !== undefined ? { achievements: d.achievements } : {}), ...(d.internalNote !== undefined ? { internalNote: d.internalNote } : {}), ...(d.attachments ? { attachments: d.attachments } : {}), version: { increment: 1 } } });
        if (!upd.count)
            throw new errors_1.AppError('CONFLICT', 'Der Antrag wurde inzwischen geändert. Bitte neu laden.');
        const after = await this.prisma.hrRequest.findUniqueOrThrow({ where: { id } });
        await this.core.audit.record(actor, { action: `${P(r.kind)}.request.edit`, module: P(r.kind), entityType: 'HrRequest', entityId: id, before: r, after });
        return after;
    }
    /** Entscheidung: genehmigen (Stufe), ablehnen, in Prüfung nehmen, zurückstellen, abbrechen. */
    async decide(actor, id, decision, comment) {
        const cfg = await this.core.config();
        const r = await this.prisma.hrRequest.findUnique({ where: { id }, include: { personnel: { include: { user: { select: { displayName: true } } } } } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Antrag nicht gefunden.');
        const kind = r.kind;
        const ab = await this.abilities(actor.userId, r, cfg);
        const allowed = { APPROVE: ab.approve, REJECT: ab.reject, REVIEW: ab.review, DEFER: ab.review, CANCEL: ab.cancel }[decision];
        if (!allowed)
            throw new errors_1.AppError('PERMISSION_DENIED', decision === 'APPROVE' && ab.approveWhy ? `Genehmigen nicht möglich: ${ab.approveWhy}.` : 'Das ist für diesen Antrag gerade nicht möglich.');
        if ((decision === 'REJECT' || decision === 'DEFER') && !comment?.trim())
            throw new errors_1.AppError('VALIDATION_FAILED', 'Bitte eine Begründung angeben.');
        const me = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } });
        const stage = decision === 'APPROVE' ? await this.nextStage(r, cfg) : null;
        const approvals = [...r.approvals, ...(decision === 'CANCEL' ? [] : [{ userId: actor.userId, name: me?.displayName ?? '—', stage: stage?.id ?? null, decision, comment: comment?.trim() || null, at: new Date().toISOString() }])];
        const approvedCount = approvals.filter((a) => a.decision === 'APPROVE').length;
        const status = decision === 'APPROVE' ? (approvedCount >= this.needed(cfg, kind) ? 'APPROVED' : 'IN_REVIEW') : decision === 'REJECT' ? 'REJECTED' : decision === 'REVIEW' ? 'IN_REVIEW' : decision === 'DEFER' ? 'DEFERRED' : 'CANCELLED';
        const after = await this.prisma.$transaction(async (tx) => {
            const upd = await tx.hrRequest.updateMany({ where: { id, version: r.version }, data: { approvals: approvals, status, ...(['APPROVED', 'REJECTED', 'CANCELLED'].includes(status) ? { decidedAt: new Date() } : {}), version: { increment: 1 } } });
            if (!upd.count)
                throw new errors_1.AppError('CONFLICT', 'Der Antrag wurde inzwischen geändert. Bitte neu laden.');
            await this.core.audit.record(actor, { action: `${P(kind)}.request.${decision.toLowerCase()}`, module: P(kind), entityType: 'HrRequest', entityId: id, before: { status: r.status }, after: { status, stage: stage?.name ?? null }, reason: comment }, tx);
            return tx.hrRequest.findUniqueOrThrow({ where: { id } });
        });
        const to = kind === 'PROMOTION' ? (await this.prisma.hrRank.findUnique({ where: { id: r.toValue } }))?.name ?? r.toValue : r.toValue;
        if (status === 'APPROVED') {
            await this.core.notify(kind === 'PROMOTION' ? 'promotion.approved' : 'transfer.approved', { memberUserId: kind === 'TRANSFER' ? r.personnel.userId : null, title: `${kind === 'PROMOTION' ? 'Beförderung' : 'Versetzung'} genehmigt: ${r.personnel.user.displayName} → ${to}`, entityType: 'HrRequest', entityId: id, dmText: kind === 'TRANSFER' ? `Deine Versetzung nach **${to}** wurde genehmigt.` : undefined });
            if ((kind === 'PROMOTION' && cfg.promotion.autoExecute) || (kind === 'TRANSFER' && cfg.transfer.autoExecute))
                return this.execute(actor, id, true);
        }
        if (status === 'REJECTED')
            await this.core.notify(kind === 'PROMOTION' ? 'promotion.rejected' : 'transfer.rejected', { memberUserId: r.personnel.userId, title: `${kind === 'PROMOTION' ? 'Beförderungsantrag' : 'Versetzungsantrag'} ${r.number} abgelehnt`, body: comment, entityType: 'HrRequest', entityId: id, dmText: `Dein ${kind === 'PROMOTION' ? 'Beförderungsantrag' : 'Versetzungsantrag'} (${to}) wurde abgelehnt.${comment ? `\n\n**Begründung:** ${comment}` : ''}` });
        return after;
    }
    /** Durchführung: Rang/Abteilung setzen, Rollen tauschen, Personalakte + Historie, Ankündigung, Benachrichtigung. */
    async execute(actor, id, auto = false) {
        const cfg = await this.core.config();
        const r = await this.prisma.hrRequest.findUnique({ where: { id }, include: { personnel: { include: { user: { select: { displayName: true } } } } } });
        if (!r)
            throw new errors_1.AppError('NOT_FOUND', 'Antrag nicht gefunden.');
        if (r.status !== 'APPROVED')
            throw new errors_1.AppError('CONFLICT', 'Nur genehmigte Anträge können durchgeführt werden.');
        const kind = r.kind;
        if (!auto)
            await this.perms.assert(actor.userId, kind === 'PROMOTION' ? 'promotion.execute' : 'transfer.approve');
        const p = r.personnel;
        const approvals = r.approvals;
        const approverNames = approvals.filter((a) => a.decision === 'APPROVE').map((a) => a.name);
        const by = (await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }))?.displayName ?? '—';
        let fromLabel = r.fromValue ?? '—', toLabel = r.toValue;
        const roleChanges = [];
        await this.prisma.$transaction(async (tx) => {
            const claimed = await tx.hrRequest.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'EXECUTED', executedById: actor.userId, executedAt: new Date(), version: { increment: 1 } } });
            if (!claimed.count)
                throw new errors_1.AppError('CONFLICT', 'Dieser Antrag wurde schon durchgeführt.');
            if (kind === 'PROMOTION') {
                const [from, to] = await Promise.all([r.fromValue ? tx.hrRank.findUnique({ where: { id: r.fromValue } }) : null, tx.hrRank.findUnique({ where: { id: r.toValue } })]);
                if (!to)
                    throw new errors_1.AppError('NOT_FOUND', 'Zielrang gibt es nicht mehr.');
                // aktueller Rang aus der Akte (falls sich zwischendurch etwas geändert hat)
                const current = (await this.core.rankByName(p.rank, tx)) ?? from;
                fromLabel = current?.name ?? p.rank ?? '—';
                toLabel = to.name;
                await tx.personnel.update({ where: { id: p.id }, data: { rank: to.name, rankSince: new Date(), customChecks: {} } });
                await tx.personnelRecord.create({ data: { personnelId: p.id, type: 'PROMOTION', summary: `${fromLabel} → ${to.name}`, details: r.reason, data: { from: fromLabel, to: to.name, fromRankId: current?.id ?? null, toRankId: to.id, requestId: r.id, requestNumber: r.number, requesterId: r.requesterId, reviewer: approvals.find((a) => a.decision === 'REVIEW')?.name ?? null, approvers: approverNames, executedBy: by, status: 'EXECUTED' }, attachments: r.attachments, createdById: actor.userId } });
                if (cfg.promotion.discordRoles && (await this.core.syncDiscordRoles(p.userId, to.discordRoleIds, current?.discordRoleIds ?? [], `Beförderung ${r.number}`, tx)))
                    roleChanges.push('discord');
                if (cfg.promotion.dashboardRoles) {
                    await this.core.syncDashboardRoles(p.userId, to.dashboardRoleIds, current?.dashboardRoleIds ?? [], tx);
                    roleChanges.push('dashboard');
                }
            }
            else {
                const [from, to] = [cfg.departments.find((x) => x.name === p.team), cfg.departments.find((x) => x.name === r.toValue)];
                if (!to)
                    throw new errors_1.AppError('NOT_FOUND', 'Zielabteilung gibt es nicht mehr.');
                fromLabel = p.team ?? '—';
                toLabel = to.name;
                await tx.personnel.update({ where: { id: p.id }, data: { team: to.name } });
                await tx.personnelRecord.create({ data: { personnelId: p.id, type: 'TRANSFER', summary: `${fromLabel} → ${to.name}`, details: r.reason, data: { from: fromLabel, to: to.name, requestId: r.id, requestNumber: r.number, requesterId: r.requesterId, approvers: approverNames, executedBy: by }, createdById: actor.userId } });
                if (cfg.transfer.discordRoles && (await this.core.syncDiscordRoles(p.userId, to.discordRoleIds, from?.discordRoleIds ?? [], `Versetzung ${r.number}`, tx)))
                    roleChanges.push('discord');
                if (cfg.transfer.dashboardRoles) {
                    await this.core.syncDashboardRoles(p.userId, to.dashboardRoleIds, from?.dashboardRoleIds ?? [], tx);
                    roleChanges.push('dashboard');
                }
            }
            await this.core.audit.record(actor, { action: `${P(kind)}.execute`, module: P(kind), entityType: 'Personnel', entityId: p.id, before: { value: fromLabel }, after: { value: toLabel, request: r.number, roles: roleChanges } }, tx);
            if (roleChanges.includes('discord'))
                await this.core.audit.record(actor, { action: 'personnel.discord_roles', module: P(kind), entityType: 'Personnel', entityId: p.id, after: { request: r.number } }, tx);
        });
        const date = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
        if (kind === 'PROMOTION') {
            const discordId = await this.core.discordIdOf(p.userId);
            if (cfg.promotion.announceChannelId) {
                const text = (0, shared_1.fillTemplate)(cfg.promotion.announceTemplate, { mitglied: discordId ? `<@${discordId}>` : p.user.displayName, name: p.user.displayName, alter_rang: fromLabel, neuer_rang: toLabel, begruendung: r.reason, durch: by, datum: date, antrag: r.number });
                await this.core.discord.postMessage(`hr-promo-${r.id}`, cfg.promotion.announceChannelId, { embeds: [{ description: text.slice(0, 4000), color: parseInt(cfg.promotion.announceColor.slice(1), 16), timestamp: new Date().toISOString() }] }, { forceNew: true });
            }
            await this.core.notify('promotion.executed', { memberUserId: p.userId, title: `🎖️ Beförderung: ${p.user.displayName} → ${toLabel}`, body: r.reason, entityType: 'Personnel', entityId: p.id, dmText: `Herzlichen Glückwunsch! Du wurdest befördert.\n\n**Alter Rang:** ${fromLabel}\n**Neuer Rang:** ${toLabel}\n**Begründung:** ${r.reason}`, color: 0xeab308 });
        }
        else if (cfg.transfer.announceChannelId) {
            await this.core.discord.postMessage(`hr-transfer-${r.id}`, cfg.transfer.announceChannelId, { embeds: [{ title: '🔀 Versetzung', description: `**${p.user.displayName}**\n${fromLabel} → **${toLabel}**`, color: 0x3b82f6, timestamp: new Date().toISOString() }] }, { forceNew: true });
        }
        return this.prisma.hrRequest.findUniqueOrThrow({ where: { id } });
    }
    /** Kennzahlen für die Übersicht „🎖️ Beförderungen“. */
    async stats() {
        const [byStatus, recent] = await Promise.all([
            this.prisma.hrRequest.groupBy({ by: ['kind', 'status'], _count: { _all: true } }),
            this.prisma.personnelRecord.findMany({ where: { type: 'PROMOTION', deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 10, include: { personnel: { select: { id: true, user: { select: { displayName: true } } } } } }),
        ]);
        return { byStatus: byStatus.map((s) => ({ kind: s.kind, status: s.status, count: s._count._all })), recent: recent.map((r) => ({ id: r.id, personnelId: r.personnel.id, name: r.personnel.user.displayName, summary: r.summary, at: r.createdAt })) };
    }
};
exports.HrRequestsService = HrRequestsService;
exports.HrRequestsService = HrRequestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, permission_service_1.PermissionService])
], HrRequestsService);
//# sourceMappingURL=hr-requests.service.js.map