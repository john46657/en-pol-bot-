import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { can, fillTemplate, type HrConfig, type PermissionContext } from '@enrp/shared';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { DISCORD_ONLY_PASSWORD } from '../auth/discord-oauth.service';
import { AppError } from '../common/errors';
import { HrCoreService } from './hr-core.service';
import { DiscordLiveService } from '../discord/discord-live.service';

export interface OverviewFilter { q?: string; status?: string; rank?: string; department?: string; state?: 'active' | 'inactive' | 'absent' }
const INACTIVE = ['RESIGNED', 'TERMINATED', 'INACTIVE'];
export const RECORD_TYPES = ['NOTE', 'WARNING', 'AWARD', 'RECOMMENDATION'] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Personal-Übersicht, Personalakte und Einträge (Notizen, Verwarnungen, Auszeichnungen, Empfehlungen). */
@Injectable()
export class HrPeopleService {
  constructor(private readonly core: HrCoreService, private readonly perms: PermissionService, private readonly live: DiscordLiveService) {}
  private get prisma() { return this.core.prisma; }

  private async ctx(userId: string) { return this.perms.contextFor(userId); }
  /** Feld/Bereich sichtbar? Geschützt = nur mit personnel.view_sensitive. */
  private shows(cfg: HrConfig, c: PermissionContext, kind: 'fields' | 'sections', key: string) {
    const v = (cfg[kind] as Record<string, { visible: boolean; sensitive: boolean }>)[key];
    if (!v) return true;
    return v.visible && (!v.sensitive || can(c, 'personnel.view_sensitive'));
  }

  async overview(actor: Actor, f: OverviewFilter) {
    const [cfg, c, ranks] = await Promise.all([this.core.config(), this.ctx(actor.userId!), this.core.ranks()]);
    const now = new Date();
    const where: Prisma.PersonnelWhereInput = {
      ...(f.status ? { employmentStatus: f.status } : {}), ...(f.rank ? { rank: f.rank } : {}), ...(f.department ? { team: f.department } : {}),
      ...(f.state === 'active' ? { employmentStatus: { notIn: INACTIVE } } : f.state === 'inactive' ? { employmentStatus: { in: INACTIVE } } : {}),
      ...(f.state === 'absent' ? { user: { leaveRequests: { some: { status: 'APPROVED', startsAt: { lte: now }, endsAt: { gte: now } } } } } : {}),
    };
    const links = new Map((await this.prisma.discordLink.findMany()).map((l) => [l.userId, l.discordId]));
    const term = f.q?.trim().toLowerCase();
    const people = await this.prisma.personnel.findMany({ where, include: { user: { select: { id: true, displayName: true, username: true, robloxUsername: true, robloxUserId: true, active: true } } }, take: 2000 });
    const ids = people.map((p) => p.id);
    const [records, trainings, absent] = await Promise.all([
      this.prisma.personnelRecord.groupBy({ by: ['personnelId', 'type'], where: { personnelId: { in: ids }, deletedAt: null }, _count: { _all: true } }),
      this.prisma.hrTrainingProgress.groupBy({ by: ['personnelId'], where: { personnelId: { in: ids }, status: 'PASSED' }, _count: { _all: true } }),
      this.prisma.leaveRequest.findMany({ where: { status: 'APPROVED', startsAt: { lte: now }, endsAt: { gte: now }, userId: { in: people.map((p) => p.userId) } }, select: { userId: true, endsAt: true, type: true } }),
    ]);
    const count = (pid: string, type: string) => records.find((r) => r.personnelId === pid && r.type === type)?._count._all ?? 0;
    const discordMembers = new Map(this.live.getMembers().members.map((m) => [m.id, m]));
    const rankPos = new Map(ranks.map((r) => [r.name.toLowerCase(), r]));
    const sens = can(c, 'personnel.view_sensitive');
    const showWarn = can(c, 'warning.view') || sens;
    const show = (k: string) => this.shows(cfg, c, 'fields', k);
    const rows = people.map((p) => {
      const discordId = links.get(p.userId) ?? null;
      const d = discordId ? discordMembers.get(discordId) : undefined;
      const rank = p.rank ? rankPos.get(p.rank.toLowerCase()) : undefined;
      const away = absent.find((a) => a.userId === p.userId);
      return {
        id: p.id, userId: p.userId, name: p.user.displayName, username: p.user.username,
        discordName: show('discordName') ? d?.displayName ?? null : null, discordId: show('discordId') ? discordId : null, avatar: show('avatar') ? d?.avatar ?? null : null,
        robloxName: show('robloxName') ? p.user.robloxUsername : null, robloxId: show('robloxId') ? p.user.robloxUserId : null,
        rank: show('rank') ? p.rank : null, rankColor: rank?.color ?? null, rankIcon: rank?.icon ?? null, rankPosition: rank?.position ?? 999,
        department: show('department') ? p.team : null, status: show('status') ? p.employmentStatus : null, joinDate: show('joinDate') ? p.joinDate : null,
        serviceNumber: show('serviceNumber') ? p.serviceNumber : null, callsign: show('callsign') ? p.callsign : null,
        absentUntil: away && (cfg.showAbsenceInTeam || sens) ? away.endsAt : null,
        counts: { promotions: count(p.id, 'PROMOTION'), awards: count(p.id, 'AWARD'), warnings: showWarn ? count(p.id, 'WARNING') : null, trainings: trainings.find((t) => t.personnelId === p.id)?._count._all ?? 0 },
      };
    }).filter((r) => !term || [r.name, r.username, r.discordName, r.discordId, r.robloxName, r.robloxId, r.rank, r.department, r.status, r.serviceNumber, r.callsign].some((v) => v && String(v).toLowerCase().includes(term)));
    rows.sort((a, b) => a.rankPosition - b.rankPosition || a.name.localeCompare(b.name, 'de'));
    return { rows, statuses: cfg.statuses, departments: cfg.departments.map((d) => ({ name: d.name, color: d.color })), ranks: ranks.map((r) => ({ id: r.id, name: r.name, color: r.color, icon: r.icon })) };
  }

  /** Vollständige Personalakte (nur sichtbare Bereiche); Zugriff wird protokolliert. */
  async profile(actor: Actor, id: string) {
    const [cfg, c] = await Promise.all([this.core.config(), this.ctx(actor.userId!)]);
    const p = await this.prisma.personnel.findUnique({ where: { id }, include: { user: { select: { id: true, displayName: true, username: true, robloxUsername: true, robloxUserId: true, lastLogin: true } } } });
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    const sec = (k: string) => this.shows(cfg, c, 'sections', k);
    const fld = (k: string) => this.shows(cfg, c, 'fields', k);
    const sens = can(c, 'personnel.view_sensitive');
    const discordId = await this.core.discordIdOf(p.userId);
    const d = discordId ? this.live.getMembers().members.find((m) => m.id === discordId) : undefined;
    const rank = await this.core.rankByName(p.rank);
    const records = await this.prisma.personnelRecord.findMany({ where: { personnelId: id, deletedAt: null }, orderBy: { createdAt: 'desc' } });
    const userIds = [...new Set(records.map((r) => r.createdById))];
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const rec = (types: string[]) => records.filter((r) => types.includes(r.type)).map((r) => ({ ...r, createdByName: names.get(r.createdById) ?? '—' }));
    const now = new Date();
    const next = sec('rank') ? await this.core.nextRanks(rank) : [];
    const checks = await Promise.all(next.map((r) => this.core.evaluate(id, r)));
    const [requests, trainings, attempts, absences, numbers] = await Promise.all([
      (sec('promotions') || sec('transfers')) ? this.prisma.hrRequest.findMany({ where: { personnelId: id }, orderBy: { createdAt: 'desc' } }) : [],
      sec('trainings') ? this.prisma.hrTrainingProgress.findMany({ where: { personnelId: id }, include: { training: { select: { id: true, name: true, certificate: true, validDays: true } } }, orderBy: { updatedAt: 'desc' } }) : [],
      sec('exams') ? this.prisma.hrExamAttempt.findMany({ where: { personnelId: id }, include: { exam: { select: { id: true, title: true, passPercent: true, showResult: true } } }, orderBy: { startedAt: 'desc' } }) : [],
      sec('absences') ? this.prisma.leaveRequest.findMany({ where: { userId: p.userId }, orderBy: { startsAt: 'desc' }, take: 100 }) : [],
      sec('servicenumbers') ? this.prisma.serviceNumberEvent.findMany({ where: { OR: [{ personnelId: id }, { userId: p.userId }] }, orderBy: { createdAt: 'desc' }, take: 100 }) : [],
    ]);
    const deciders = new Map((await this.prisma.user.findMany({ where: { id: { in: [...absences.map((a) => a.decidedById), ...requests.map((r) => r.requesterId)].filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const history = sec('history') && (can(c, 'promotion.view_history') || sens)
      ? await this.prisma.auditLog.findMany({ where: { OR: [{ entityType: 'Personnel', entityId: id }, { entityType: 'HrRequest', entityId: { in: requests.map((r) => r.id) } }, { entityType: 'PersonnelRecord', entityId: { in: records.map((r) => r.id) } }] }, orderBy: { createdAt: 'desc' }, take: 200 })
      : null;
    const actorNames = history ? new Map((await this.prisma.user.findMany({ where: { id: { in: history.map((h) => h.actorUserId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName])) : new Map<string, string>();
    await this.core.audit.record(actor, { action: 'personnel.read', module: 'personnel', entityType: 'Personnel', entityId: id });
    const warnState = (r: { status: string | null; expiresAt: Date | null }) => (r.status === 'REVOKED' ? 'REVOKED' : r.expiresAt && r.expiresAt < now ? 'EXPIRED' : 'ACTIVE');
    return {
      id: p.id, userId: p.userId, name: p.user.displayName, username: p.user.username,
      discordName: fld('discordName') ? d?.displayName ?? null : null, discordId: fld('discordId') ? discordId : null, avatar: fld('avatar') ? d?.avatar ?? null : null,
      robloxName: fld('robloxName') ? p.user.robloxUsername : null, robloxId: fld('robloxId') ? p.user.robloxUserId : null,
      rank: fld('rank') ? p.rank : null, rankInfo: rank ? { id: rank.id, name: rank.name, color: rank.color, icon: rank.icon, description: rank.description } : null, rankSince: p.rankSince,
      department: fld('department') ? p.team : null, office: p.office, status: fld('status') ? p.employmentStatus : null, joinDate: fld('joinDate') ? p.joinDate : null,
      serviceNumber: fld('serviceNumber') ? p.serviceNumber : null, callsign: fld('callsign') ? p.callsign : null, customChecks: p.customChecks,
      sections: Object.fromEntries(Object.keys(cfg.sections).map((k) => [k, sec(k)])),
      next: checks,
      promotions: sec('promotions') ? rec(['PROMOTION']) : null,
      transfers: sec('transfers') ? rec(['TRANSFER']) : null,
      requests: requests.map((r) => ({ ...r, internalNote: sens ? r.internalNote : null, requesterName: deciders.get(r.requesterId) ?? '—' })),
      awards: sec('awards') ? rec(['AWARD']) : null,
      warnings: sec('warnings') && (can(c, 'warning.view') || sens) ? rec(['WARNING', 'DISCIPLINE']).map((w) => ({ ...w, state: warnState(w) })) : null,
      notes: sec('notes') && sens ? rec(['NOTE']) : null,
      recommendations: rec(['RECOMMENDATION']),
      trainings: sec('trainings') ? trainings : null,
      exams: sec('exams') ? attempts.map((a) => ({ ...a, answers: undefined })) : null,
      absences: sec('absences') ? absences.map((a) => ({ id: a.id, number: a.number, startsAt: a.startsAt, endsAt: a.endsAt, type: a.type, status: a.status, reason: sens ? a.reason : null, comment: sens ? a.comment : null, decidedByName: a.decidedById ? deciders.get(a.decidedById) ?? '—' : null, createdAt: a.createdAt })) : null,
      serviceNumbers: sec('servicenumbers') ? numbers : null,
      history: history?.map((h) => ({ id: h.id, action: h.action, at: h.createdAt, actor: h.actorUserId ? actorNames.get(h.actorUserId) ?? '—' : 'System', before: h.before, after: h.after, reason: h.reason })) ?? null,
      counts: { promotions: records.filter((r) => r.type === 'PROMOTION').length, trainings: trainings.filter((t) => t.status === 'PASSED').length, awards: records.filter((r) => r.type === 'AWARD').length, warnings: records.filter((r) => r.type === 'WARNING' && warnState(r) === 'ACTIVE').length },
    };
  }

  /** Personalakte anlegen – für einen Benutzer oder direkt per Discord-ID (Benutzer wird bei Bedarf angelegt). */
  async create(actor: Actor, d: { userId?: string; discordId?: string; name?: string; rank?: string | null; department?: string | null; status?: string; joinDate?: string; callsign?: string | null }) {
    const cfg = await this.core.config();
    return this.prisma.$transaction(async (tx) => {
      let userId = d.userId;
      if (!userId && d.discordId) userId = (await this.userForDiscord(tx, d.discordId, d.name ?? d.discordId)).id;
      if (!userId) throw new AppError('VALIDATION_FAILED', 'Benutzer oder Discord-ID angeben.');
      if (await tx.personnel.findFirst({ where: { userId } })) throw new AppError('CONFLICT', 'Für diese Person gibt es schon eine Personalakte.');
      if (d.status && !cfg.statuses.some((s) => s.key === d.status)) throw new AppError('VALIDATION_FAILED', 'Unbekannter Status.');
      const p = await tx.personnel.create({ data: { userId, rank: d.rank ?? null, team: d.department ?? null, employmentStatus: d.status ?? 'ACTIVE', joinDate: d.joinDate ? new Date(d.joinDate) : new Date(), callsign: d.callsign?.toUpperCase() || null } });
      await this.core.audit.record(actor, { action: 'personnel.create', module: 'personnel', entityType: 'Personnel', entityId: p.id, after: p }, tx);
      return p;
    });
  }

  /** Benutzer zu einer Discord-ID (vorhandene Verknüpfung oder neu, Anmeldung später über Discord). */
  async userForDiscord(tx: Prisma.TransactionClient, discordId: string, name: string) {
    const link = await tx.discordLink.findUnique({ where: { discordId } });
    if (link) return (await tx.user.findUniqueOrThrow({ where: { id: link.userId } }));
    const base = (name.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24) || 'discord').replace(/^\.+/, '') || 'discord';
    let username = base;
    for (let i = 2; await tx.user.findUnique({ where: { username } }); i++) username = `${base}${i}`;
    const u = await tx.user.create({ data: { username, displayName: name.slice(0, 64), passwordHash: DISCORD_ONLY_PASSWORD, settings: { create: {} } } });
    await tx.discordLink.create({ data: { userId: u.id, discordId } });
    return u;
  }

  async update(actor: Actor, id: string, d: { department?: string | null; office?: string | null; status?: string; joinDate?: string; callsign?: string | null; rank?: string | null; rankSince?: string }) {
    const cfg = await this.core.config();
    if (d.status && !cfg.statuses.some((s) => s.key === d.status)) throw new AppError('VALIDATION_FAILED', 'Unbekannter Status.');
    if (d.rank !== undefined && !(await this.perms.has(actor.userId!, 'promotion.execute'))) throw new AppError('PERMISSION_DENIED', 'Den Rang ändert man über eine Beförderung (Recht promotion.execute).');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.personnel.findUnique({ where: { id } });
      if (!before) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
      const after = await tx.personnel.update({ where: { id }, data: {
        ...(d.department !== undefined ? { team: d.department } : {}), ...(d.office !== undefined ? { office: d.office } : {}), ...(d.status ? { employmentStatus: d.status } : {}),
        ...(d.joinDate ? { joinDate: new Date(d.joinDate) } : {}), ...(d.callsign !== undefined ? { callsign: d.callsign?.toUpperCase() || null } : {}),
        ...(d.rank !== undefined ? { rank: d.rank, rankSince: new Date() } : {}), ...(d.rankSince ? { rankSince: new Date(d.rankSince) } : {}),
      } });
      if (d.status && d.status !== before.employmentStatus) {
        const label = (k: string) => cfg.statuses.find((s) => s.key === k)?.label ?? k;
        await tx.personnelRecord.create({ data: { personnelId: id, type: 'STATUS', summary: `Status: ${label(before.employmentStatus)} → ${label(d.status)}`, data: { from: before.employmentStatus, to: d.status }, createdById: actor.userId! } });
      }
      await this.core.audit.record(actor, { action: d.rank !== undefined ? 'personnel.rank.set' : 'personnel.update', module: 'personnel', entityType: 'Personnel', entityId: id, before, after }, tx);
      return after;
    });
  }

  async remove(actor: Actor, id: string) {
    const p = await this.prisma.personnel.findUnique({ where: { id } });
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      // Dienstnummer nach Einstellung des Nummernkreises freigeben/als ehemalig markieren
      for (const n of await tx.serviceNumber.findMany({ where: { personnelId: id, status: { in: ['ACTIVE', 'RESERVED'] } }, include: { range: true } })) {
        await tx.serviceNumber.update({ where: { id: n.id }, data: { status: n.range.releaseAs, personnelId: null, ...(n.range.releaseAs === 'FREE' ? { userId: null } : {}) } });
        await tx.serviceNumberEvent.create({ data: { display: n.display, userId: p.userId, personnelId: id, action: n.range.releaseAs === 'BLOCKED' ? 'BLOCKED' : n.range.releaseAs === 'FREE' ? 'RELEASED' : 'FORMER', reason: 'Personalakte gelöscht', actorId: actor.userId } });
      }
      await tx.personnel.delete({ where: { id } });
      await this.core.audit.record(actor, { action: 'personnel.delete', module: 'personnel', entityType: 'Personnel', entityId: id, before: p }, tx);
    });
  }

  // ---------------- Einträge ----------------
  private needFor(type: RecordType, op: 'create' | 'manage'): string {
    return { NOTE: 'personnel.edit', WARNING: op === 'create' ? 'warning.create' : 'warning.manage', AWARD: op === 'create' ? 'awards.create' : 'awards.manage', RECOMMENDATION: op === 'create' ? 'promotion.create' : 'promotion.manage' }[type];
  }

  async addRecord(actor: Actor, id: string, d: { type: RecordType; summary: string; details?: string; category?: string; severity?: string; expiresAt?: string | null; awardId?: string; attachments?: string[] }) {
    await this.perms.assert(actor.userId!, this.needFor(d.type, 'create'));
    if (d.type === 'NOTE') await this.perms.assert(actor.userId!, 'personnel.view_sensitive');
    const cfg = await this.core.config();
    const p = await this.prisma.personnel.findUnique({ where: { id } });
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    if ((d.type === 'WARNING' || d.type === 'RECOMMENDATION') && p.userId === actor.userId) throw new AppError('CONFLICT', 'Das geht nicht für dich selbst.');
    let data: Prisma.InputJsonValue = {}, expiresAt: Date | null = null, summary = d.summary;
    if (d.type === 'WARNING') {
      const sev = cfg.warningSeverities.find((s) => s.key === d.severity) ?? cfg.warningSeverities[0];
      if (!sev) throw new AppError('VALIDATION_FAILED', 'Lege zuerst Schweregrade an (Einstellungen → Personal).');
      expiresAt = d.expiresAt === null ? null : d.expiresAt ? new Date(d.expiresAt) : sev.defaultDays ? new Date(Date.now() + sev.defaultDays * 86_400_000) : null;
      data = { severity: sev.key, severityLabel: sev.label, emoji: sev.emoji, color: sev.color, category: d.category ?? null };
    }
    if (d.type === 'AWARD') {
      const a = cfg.awards.find((x) => x.id === d.awardId && x.active);
      if (!a) throw new AppError('VALIDATION_FAILED', 'Auszeichnung nicht gefunden.');
      data = { awardId: a.id, name: a.name, icon: a.icon, color: a.color, public: a.public };
      summary = `${a.icon} ${a.name}`;
    }
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await tx.personnelRecord.create({ data: { personnelId: id, type: d.type, summary: summary.slice(0, 300), details: d.details ?? (d.type === 'AWARD' ? d.summary : null), data, status: d.type === 'WARNING' ? 'ACTIVE' : null, expiresAt, attachments: d.attachments ?? [], createdById: actor.userId! } });
      await this.core.audit.record(actor, { action: { NOTE: 'personnel.note.create', WARNING: 'warning.create', AWARD: 'award.grant', RECOMMENDATION: 'promotion.recommendation' }[d.type], module: 'personnel', entityType: 'PersonnelRecord', entityId: row.id, after: { personnelId: id, type: d.type, summary: row.summary, data } }, tx);
      if (d.type === 'AWARD') {
        const a = cfg.awards.find((x) => x.id === d.awardId)!;
        if (a.discordRoleId) await this.core.syncDiscordRoles(p.userId, [a.discordRoleId], [], `Auszeichnung: ${a.name}`, tx);
      }
      return row;
    });
    const name = (await this.prisma.user.findUnique({ where: { id: p.userId }, select: { displayName: true } }))?.displayName ?? '—';
    if (d.type === 'AWARD') {
      const a = cfg.awards.find((x) => x.id === d.awardId)!;
      await this.core.notify('award.granted', { memberUserId: p.userId, title: `${a.icon} Auszeichnung: ${a.name}`, body: d.summary, entityType: 'Personnel', entityId: id, publicText: a.public ? `**${name}** hat die Auszeichnung **${a.icon} ${a.name}** erhalten.\n${d.summary}` : undefined, dmText: `Du hast die Auszeichnung **${a.icon} ${a.name}** erhalten.\n\n${d.summary}`, color: parseInt(a.color.slice(1), 16) });
    }
    if (d.type === 'WARNING') {
      await this.core.notify('warning.created', { memberUserId: null, title: `Verwarnung für ${name}`, body: summary, entityType: 'Personnel', entityId: id });
      await this.warningFollowUp(actor, p, r, name, cfg).catch((e) => console.error(`warning follow-up failed: ${e instanceof Error ? e.message : e}`));
    }
    return r;
  }

  /** Aktive Verwarnungen einer Person (nicht zurückgenommen, nicht abgelaufen). */
  async activeWarnings(personnelId: string, now = new Date()) {
    return this.prisma.personnelRecord.count({ where: { personnelId, type: { in: ['WARNING', 'DISCIPLINE'] }, deletedAt: null, status: { not: 'REVOKED' }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
  }

  /**
   * Nach einer neuen Verwarnung: Meldung im Verwarnungs-Kanal („Wer / Grund / 1/3“), DM an die Person und – bei Erreichen
   * der Grenze – Leitung benachrichtigen, Discord-Rollen entziehen und/oder Status setzen (Einstellungen → Personal → Verwarnungen).
   */
  private async warningFollowUp(actor: Actor, p: { id: string; userId: string }, row: { id: string; summary: string; details: string | null; data: Prisma.JsonValue; expiresAt: Date | null }, name: string, cfg: HrConfig) {
    const w = cfg.warnings;
    const count = await this.activeWarnings(p.id);
    const reached = count >= w.limit;
    const [link, by] = await Promise.all([this.prisma.discordLink.findUnique({ where: { userId: p.userId } }), actor.userId ? this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null]);
    const data = (row.data ?? {}) as { severityLabel?: string; emoji?: string; category?: string | null; color?: string };
    const vars = { mitglied: link ? `<@${link.discordId}>` : name, name, grund: row.details ? `${row.summary} – ${row.details}` : row.summary, schweregrad: `${data.emoji ?? ''} ${data.severityLabel ?? ''}`.trim(), kategorie: data.category ?? '—', anzahl: String(count), grenze: String(w.limit), durch: by?.displayName ?? 'System', datum: new Date().toLocaleDateString('de-DE'), ablauf: row.expiresAt ? row.expiresAt.toLocaleDateString('de-DE') : 'kein Ablauf' };
    const color = reached ? 0xef4444 : data.color ? parseInt(data.color.slice(1), 16) : 0xeab308;
    const limitText = reached ? `\n\n⚠️ **Grenze erreicht (${count}/${w.limit}).**` : '';
    if (w.channelId) {
      const ping = reached && w.atLimit.pingDiscordRoleIds.length ? { content: w.atLimit.pingDiscordRoleIds.map((r) => `<@&${r}>`).join(' '), mentionRoles: w.atLimit.pingDiscordRoleIds } : {};
      await this.core.discord.postMessage(`hr-warning-${row.id.slice(0, 8)}`, w.channelId, { ...ping, embeds: [{ title: `${reached ? '⛔' : '⚠️'} Verwarnung`, description: (fillTemplate(w.template, vars) + limitText).slice(0, 4000), color, footer: `Verwarnt von ${vars.durch}`, timestamp: new Date().toISOString() }] }, { forceNew: true });
    }
    if (w.dm) await this.core.dm(p.userId, { embeds: [{ title: '⚠️ Du wurdest verwarnt', description: `**Grund:** ${vars.grund}\n**Verwarnungen:** ${count}/${w.limit}\n**Gültig bis:** ${vars.ablauf}${limitText}`.slice(0, 4000), color }] });
    if (!reached) return;
    const a = w.atLimit;
    if (a.notifyRoleIds.length) {
      const users = (await this.prisma.userRole.findMany({ where: { roleId: { in: a.notifyRoleIds } }, select: { userId: true } })).map((u) => u.userId);
      if (users.length) await this.prisma.notification.createMany({ data: [...new Set(users)].map((userId) => ({ userId, type: 'PERSONNEL', title: `⛔ ${name}: Verwarnungs-Grenze erreicht (${count}/${w.limit})`, body: row.summary.slice(0, 500), entityType: 'Personnel', entityId: p.id })) });
    }
    if (a.removeDiscordRoleIds.length) await this.core.syncDiscordRoles(p.userId, [], a.removeDiscordRoleIds, `Verwarnungs-Grenze erreicht (${count}/${w.limit})`);
    if (a.status && cfg.statuses.some((x) => x.key === a.status)) {
      await this.prisma.personnel.update({ where: { id: p.id }, data: { employmentStatus: a.status } });
      await this.core.audit.record(actor, { action: 'warning.limit', module: 'personnel', entityType: 'Personnel', entityId: p.id, after: { count, limit: w.limit, status: a.status } });
    }
  }

  /** Alle Verwarnungen (Übersicht im Dashboard), mit aktuellem Zähler je Person. */
  async warnings(actor: Actor, f: { state?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ALL'; q?: string }) {
    await this.perms.assert(actor.userId!, 'warning.view');
    const now = new Date();
    const state = f.state ?? 'ACTIVE';
    const rows = await this.prisma.personnelRecord.findMany({
      where: { type: { in: ['WARNING', 'DISCIPLINE'] }, deletedAt: null,
        ...(state === 'REVOKED' ? { status: 'REVOKED' } : state === 'EXPIRED' ? { status: { not: 'REVOKED' }, expiresAt: { lte: now } } : state === 'ACTIVE' ? { status: { not: 'REVOKED' }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : {}),
        ...(f.q ? { OR: [{ summary: { contains: f.q, mode: 'insensitive' as const } }, { personnel: { user: { displayName: { contains: f.q, mode: 'insensitive' as const } } } }] } : {}) },
      include: { personnel: { select: { id: true, rank: true, user: { select: { id: true, displayName: true } } } } }, orderBy: { createdAt: 'desc' }, take: 500,
    });
    const ids = [...new Set(rows.map((r) => r.personnelId))];
    const active = await this.prisma.personnelRecord.groupBy({ by: ['personnelId'], where: { personnelId: { in: ids }, type: { in: ['WARNING', 'DISCIPLINE'] }, deletedAt: null, status: { not: 'REVOKED' }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, _count: { _all: true } });
    const authors = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    const limit = (await this.core.config()).warnings.limit;
    return { limit, items: rows.map((r) => ({ id: r.id, personnelId: r.personnelId, name: r.personnel.user.displayName, rank: r.personnel.rank, summary: r.summary, details: r.details, data: r.data, createdAt: r.createdAt, expiresAt: r.expiresAt, by: authors.get(r.createdById) ?? '—',
      state: r.status === 'REVOKED' ? 'REVOKED' : r.expiresAt && r.expiresAt <= now ? 'EXPIRED' : 'ACTIVE', active: active.find((x) => x.personnelId === r.personnelId)?._count._all ?? 0 })) };
  }

  /** Verwarnung über Discord (/verwarnen): Person per Discord-ID, Grund, optional Schweregrad. */
  async warnByDiscord(actor: Actor, d: { discordId: string; reason: string; severity?: string }) {
    const link = await this.prisma.discordLink.findUnique({ where: { discordId: d.discordId } });
    const p = link ? await this.prisma.personnel.findFirst({ where: { userId: link.userId } }) : null;
    if (!p) throw new AppError('NOT_FOUND', 'Für diese Person gibt es keine Personalakte.');
    const r = await this.addRecord(actor, p.id, { type: 'WARNING', summary: d.reason, severity: d.severity });
    const cfg = await this.core.config();
    return { id: r.id, count: await this.activeWarnings(p.id), limit: cfg.warnings.limit };
  }

  async editRecord(actor: Actor, recordId: string, d: { summary?: string; details?: string | null; status?: 'ACTIVE' | 'REVOKED'; expiresAt?: string | null; category?: string }) {
    const r = await this.prisma.personnelRecord.findUnique({ where: { id: recordId } });
    if (!r || r.deletedAt) throw new AppError('NOT_FOUND', 'Eintrag nicht gefunden.');
    const type = (['NOTE', 'WARNING', 'AWARD', 'RECOMMENDATION'] as const).find((t) => t === r.type || (t === 'WARNING' && r.type === 'DISCIPLINE'));
    if (type) await this.perms.assert(actor.userId!, this.needFor(type, 'manage'));
    else await this.perms.assert(actor.userId!, r.type === 'PROMOTION' || r.type === 'TRANSFER' ? 'promotion.manage' : 'personnel.edit');
    const after = await this.prisma.personnelRecord.update({ where: { id: recordId }, data: {
      ...(d.summary ? { summary: d.summary.slice(0, 300) } : {}), ...(d.details !== undefined ? { details: d.details } : {}), ...(d.status ? { status: d.status } : {}),
      ...(d.expiresAt !== undefined ? { expiresAt: d.expiresAt ? new Date(d.expiresAt) : null } : {}),
      ...(d.category !== undefined ? { data: { ...((r.data ?? {}) as object), category: d.category } } : {}),
    } });
    await this.core.audit.record(actor, { action: `${r.type.toLowerCase()}.edit`, module: 'personnel', entityType: 'PersonnelRecord', entityId: recordId, before: r, after });
    return after;
  }

  async deleteRecord(actor: Actor, recordId: string, reason?: string) {
    const r = await this.prisma.personnelRecord.findUnique({ where: { id: recordId } });
    if (!r || r.deletedAt) throw new AppError('NOT_FOUND', 'Eintrag nicht gefunden.');
    const need = r.type === 'PROMOTION' || r.type === 'TRANSFER' ? 'promotion.manage' : r.type === 'WARNING' || r.type === 'DISCIPLINE' ? 'warning.manage' : r.type === 'AWARD' ? 'awards.manage' : r.type === 'RECOMMENDATION' ? 'promotion.manage' : 'personnel.delete';
    await this.perms.assert(actor.userId!, need);
    await this.prisma.personnelRecord.update({ where: { id: recordId }, data: { deletedAt: new Date() } });
    await this.core.audit.record(actor, { action: `${r.type.toLowerCase()}.delete`, module: 'personnel', entityType: 'PersonnelRecord', entityId: recordId, before: r, reason });
  }

  /** Frei definierte Voraussetzung abhaken (promotion.manage_requirements). */
  async setCheck(actor: Actor, id: string, reqId: string, value: boolean) {
    const p = await this.prisma.personnel.findUnique({ where: { id } });
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    const checks = { ...((p.customChecks ?? {}) as Record<string, boolean>), [reqId]: value };
    if (!value) delete checks[reqId];
    await this.prisma.personnel.update({ where: { id }, data: { customChecks: checks } });
    await this.core.audit.record(actor, { action: 'promotion.requirement.check', module: 'promotion', entityType: 'Personnel', entityId: id, after: { reqId, value } });
    return checks;
  }
}
