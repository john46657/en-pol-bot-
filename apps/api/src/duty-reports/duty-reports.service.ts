import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { cleanReportValues, dutyTimeText, isDutyTimeField, periodEnd, periodStart, reportMessage, reportTemplateSchema, type ReportTemplate } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { JsonListStore } from '../common/json-store';
import { makeNumber } from '../common/numbering';

type Row = Prisma.DutyReportGetPayload<{ include: { author: { select: { id: true; displayName: true } } } }>;
export interface ReportFilter { templateId?: string; authorId?: string; from?: string; to?: string; q?: string; status?: string; mine?: boolean }

/** Tages-/Wochenberichte: Vorlagen mit eigenen Feldern; ausfüllen, ansehen und bearbeiten im Dashboard und in Discord. */
@Injectable()
export class DutyReportsService {
  readonly templates: JsonListStore<ReportTemplate>;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly discord: DiscordService) {
    this.templates = new JsonListStore(prisma, 'dutyReports.templates', reportTemplateSchema as never, 50);
  }

  // ---------------- Vorlagen ----------------
  async listTemplates(guildId: string | null, onlyActive = false) {
    return (await this.templates.all()).filter((t) => (!guildId || !t.guildId || t.guildId === guildId) && (!onlyActive || t.active));
  }
  async saveTemplate(actor: Actor, t: ReportTemplate) {
    const doc = reportTemplateSchema.parse(t);
    const ids = doc.fields.map((f) => f.id);
    if (new Set(ids).size !== ids.length) throw new AppError('VALIDATION_FAILED', 'Jedes Feld braucht ein eigenes Kürzel.');
    const [d, old] = await this.templates.upsert(doc);
    await this.audit.record(actor, { action: old ? 'dutyreport.template.update' : 'dutyreport.template.create', module: 'dutyreports', entityType: 'ReportTemplate', entityId: d.id, before: old ? { name: old.name, fields: old.fields.length } : undefined, after: { name: d.name, fields: d.fields.length } });
    return d;
  }
  async duplicateTemplate(actor: Actor, id: string) {
    const t = await this.templates.get(id);
    if (!t) throw new AppError('NOT_FOUND', 'Vorlage nicht gefunden.');
    return this.saveTemplate(actor, { ...t, id: randomUUID(), name: `${t.name} (Kopie)`.slice(0, 60) });
  }
  async removeTemplate(actor: Actor, id: string) {
    if (!(await this.templates.remove(id))) throw new AppError('NOT_FOUND', 'Vorlage nicht gefunden.');
    await this.audit.record(actor, { action: 'dutyreport.template.delete', module: 'dutyreports', entityType: 'ReportTemplate', entityId: id });
  }
  private async template(id: string) {
    const t = await this.templates.get(id);
    if (!t) throw new AppError('NOT_FOUND', 'Vorlage nicht gefunden.');
    return t;
  }

  // ---------------- Berichte ----------------
  private async seeAll(userId: string) { return this.perms.has(userId, 'dutyreports.view_all'); }

  async list(actor: Actor, f: ReportFilter, page = 1, pageSize = 50) {
    const all = await this.seeAll(actor.userId!);
    const where: Prisma.DutyReportWhereInput = {
      ...(f.templateId ? { templateId: f.templateId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(!all || f.mine ? { authorId: actor.userId! } : f.authorId ? { authorId: f.authorId } : {}),
      ...(f.from || f.to ? { periodStart: { ...(f.from ? { gte: new Date(f.from) } : {}), ...(f.to ? { lte: new Date(f.to) } : {}) } } : {}),
      ...(f.q ? { OR: [{ number: { contains: f.q.toUpperCase() } }, { templateName: { contains: f.q, mode: 'insensitive' } }, { author: { displayName: { contains: f.q, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.dutyReport.findMany({ where, include: { author: { select: { id: true, displayName: true } } }, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.dutyReport.count({ where }),
    ]);
    return { items, total, page, pageSize, seeAll: all };
  }

  async get(actor: Actor, idOrNumber: string) {
    const r = await this.prisma.dutyReport.findFirst({ where: /^[0-9a-f-]{36}$/.test(idOrNumber) ? { id: idOrNumber } : { number: idOrNumber.toUpperCase() }, include: { author: { select: { id: true, displayName: true } } } });
    if (!r || (r.authorId !== actor.userId && !(await this.seeAll(actor.userId!)))) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
    const [t, posted] = await Promise.all([this.templates.get(r.templateId), this.discord.posted(`drep-${r.id}`)]);
    const reviewerName = r.reviewedById ? (await this.prisma.user.findUnique({ where: { id: r.reviewedById }, select: { displayName: true } }))?.displayName ?? null : null;
    return { ...r, template: t ?? null, posted, reviewerName, canEdit: await this.canEdit(actor.userId!, r, t) };
  }

  private async canEdit(userId: string, r: { authorId: string }, t?: ReportTemplate | null) {
    if (await this.perms.has(userId, 'dutyreports.edit_all')) return true;
    return r.authorId === userId && (t?.authorCanEdit ?? true);
  }

  /** Neuer Bericht – bei „ein Bericht je Zeitraum“ wird der vorhandene des Zeitraums bearbeitet. */
  /** Dienstzeit des Zeitraums aus den Dienst-Sitzungen (Pausen abgezogen) – für Felder wie „Dienstzeit“. */
  async dutyTime(userId: string, t: ReportTemplate, date?: string) {
    if (t.period === 'FREE') return null;
    const from = periodStart(t.period, date ? new Date(date) : new Date()), to = periodEnd(t.period, from);
    const [sessions, tz] = await Promise.all([
      this.prisma.dutySession.findMany({ where: { userId, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] }, select: { status: true, startedAt: true, endedAt: true } }),
      this.prisma.systemSetting.findUnique({ where: { key: 'org.timezone' } }).then((r) => (typeof r?.value === 'string' && r.value ? r.value : 'Europe/Berlin')),
    ]);
    try { return dutyTimeText(t.period, sessions, from, to, tz); } catch { return dutyTimeText(t.period, sessions, from, to, 'Europe/Berlin'); }
  }
  /** Vorbelegung fürs Formular (Dashboard und Discord): Dienstzeit-Felder automatisch. */
  async prefill(actor: Actor, templateId: string, date?: string) {
    const t = await this.template(templateId);
    const fields = t.fields.filter(isDutyTimeField);
    const text = fields.length ? await this.dutyTime(actor.userId!, t, date) : null;
    return { values: text ? Object.fromEntries(fields.map((f) => [f.id, text.slice(0, f.maxLength)])) : {} };
  }

  async create(actor: Actor, d: { templateId: string; periodStart?: string; values: Record<string, unknown>; source?: 'WEB' | 'DISCORD'; guildId?: string | null }) {
    const t = await this.template(d.templateId);
    if (!t.active) throw new AppError('CONFLICT', 'Diese Vorlage ist deaktiviert.');
    // leere Dienstzeit-Felder automatisch aus den Dienst-Sitzungen füllen
    const empty = t.fields.filter((f) => isDutyTimeField(f) && !String(d.values[f.id] ?? '').trim());
    if (empty.length) { const text = await this.dutyTime(actor.userId!, t, d.periodStart); if (text) d = { ...d, values: { ...d.values, ...Object.fromEntries(empty.map((f) => [f.id, text])) } }; }
    const clean = cleanReportValues(t, d.values);
    if ('error' in clean) throw new AppError('VALIDATION_FAILED', clean.error);
    const start = periodStart(t.period, d.periodStart ? new Date(d.periodStart) : new Date());
    const existing = t.onePerPeriod && t.period !== 'FREE' ? await this.prisma.dutyReport.findFirst({ where: { templateId: t.id, authorId: actor.userId!, periodStart: start } }) : null;
    if (existing) return { ...(await this.update(actor, existing.id, { values: clean.values })), merged: true };
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await tx.dutyReport.create({ data: { number: makeNumber(t.period === 'WEEKLY' ? 'WB' : 'TB'), templateId: t.id, templateName: t.name, period: t.period, periodStart: start, authorId: actor.userId!, values: clean.values, source: d.source ?? 'WEB', guildId: d.guildId ?? null } });
      await this.audit.record(actor, { action: 'dutyreport.create', module: 'dutyreports', entityType: 'DutyReport', entityId: row.id, after: { number: row.number, template: t.name, values: clean.values } }, tx);
      return row;
    });
    await this.publish(r.id, true);
    return { ...r, merged: false };
  }

  async update(actor: Actor, id: string, d: { values: Record<string, unknown>; version?: number }) {
    const r = await this.prisma.dutyReport.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
    const t = await this.templates.get(r.templateId);
    if (!(await this.canEdit(actor.userId!, r, t))) throw new AppError(r.authorId === actor.userId ? 'CONFLICT' : 'PERMISSION_DENIED', r.authorId === actor.userId ? 'Diese Vorlage erlaubt kein nachträgliches Bearbeiten.' : 'Dafür fehlt dir die Berechtigung.');
    // gelöschte Vorlage: Felder aus dem Bericht weiter bearbeitbar
    const clean = t ? cleanReportValues(t, d.values) : { values: Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k, String(v ?? '').slice(0, 4000)])) };
    if ('error' in clean) throw new AppError('VALIDATION_FAILED', clean.error);
    const after = await this.prisma.$transaction(async (tx) => {
      // nachgebessert vom Verfasser → wieder „eingereicht“, damit die Leitung erneut prüft
      const back = r.status === 'RETURNED' && r.authorId === actor.userId;
      const upd = await tx.dutyReport.updateMany({ where: { id, ...(d.version ? { version: d.version } : {}) }, data: { values: clean.values, version: { increment: 1 }, editedById: actor.userId, ...(back ? { status: 'SUBMITTED' } : {}) } });
      if (!upd.count) throw new AppError('CONFLICT', 'Der Bericht wurde inzwischen geändert. Bitte neu laden.');
      await this.audit.record(actor, { action: 'dutyreport.edit', module: 'dutyreports', entityType: 'DutyReport', entityId: id, before: { values: r.values }, after: { values: clean.values } }, tx);
      return tx.dutyReport.findUniqueOrThrow({ where: { id } });
    });
    await this.publish(id, false);
    return after;
  }

  /**
   * Leitung bearbeitet den Bericht: „Geprüft“ (Anmerkung optional), „Zur Nachbesserung“ (Anmerkung Pflicht) oder zurück auf „eingereicht“.
   * Ohne `decision`: zwischen geprüft und eingereicht umschalten. Der Verfasser bekommt eine Benachrichtigung (und bei Nachbesserung eine DM).
   */
  async review(actor: Actor, id: string, d: { decision?: 'REVIEWED' | 'RETURNED' | 'SUBMITTED'; note?: string } = {}) {
    const r = await this.prisma.dutyReport.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
    if (r.authorId === actor.userId) throw new AppError('CONFLICT', 'Eigene Berichte kannst du nicht prüfen.');
    const status = d.decision ?? (r.status === 'REVIEWED' ? 'SUBMITTED' : 'REVIEWED');
    const note = d.note?.trim() || null;
    if (status === 'RETURNED' && !note) throw new AppError('VALIDATION_FAILED', 'Bitte schreib dazu, was nachgebessert werden soll.');
    const after = await this.prisma.dutyReport.update({ where: { id }, data: { status, reviewedById: status === 'SUBMITTED' ? null : actor.userId, reviewedAt: status === 'SUBMITTED' ? null : new Date(), reviewNote: status === 'SUBMITTED' ? null : note } });
    await this.audit.record(actor, { action: status === 'REVIEWED' ? 'dutyreport.review' : status === 'RETURNED' ? 'dutyreport.return' : 'dutyreport.unreview', module: 'dutyreports', entityType: 'DutyReport', entityId: id, ...(note ? { reason: note } : {}) });
    if (status !== 'SUBMITTED') {
      const title = status === 'REVIEWED' ? `${r.templateName} ${r.number} wurde geprüft ✅` : `${r.templateName} ${r.number}: bitte nachbessern ↩️`;
      await this.prisma.notification.create({ data: { userId: r.authorId, type: 'REPORT_REVIEW', title, ...(note ? { body: note.slice(0, 500) } : {}), entityType: 'DutyReport', entityId: id } });
      const link = status === 'RETURNED' ? await this.prisma.discordLink.findUnique({ where: { userId: r.authorId } }) : null;
      if (link) await this.prisma.discordOutbox.create({ data: { type: 'bot.dm', channelKey: 'duty', payload: { discordId: link.discordId, message: { embeds: [{ title: `↩️ ${r.templateName} ${r.number} – bitte nachbessern`, description: `${note}\n\nÜber „Bearbeiten“ am Bericht (Discord oder Dashboard) kannst du ihn anpassen.`.slice(0, 4000), color: 0xf59e0b }] } } as Prisma.InputJsonValue } });
    }
    await this.publish(id, false);
    return after;
  }

  async remove(actor: Actor, id: string) {
    const r = await this.prisma.dutyReport.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Bericht nicht gefunden.');
    await this.prisma.dutyReport.delete({ where: { id } });
    const posted = await this.discord.posted(`drep-${id}`);
    if (posted) await this.prisma.discordOutbox.create({ data: { type: 'bot.delete', channelKey: 'announcements', payload: posted } });
    await this.audit.record(actor, { action: 'dutyreport.delete', module: 'dutyreports', entityType: 'DutyReport', entityId: id, before: { number: r.number, values: r.values } });
  }

  /** Bericht in den Kanal der Vorlage posten bzw. die vorhandene Nachricht aktualisieren. */
  private async publish(id: string, isNew: boolean) {
    const r: Row | null = await this.prisma.dutyReport.findUnique({ where: { id }, include: { author: { select: { id: true, displayName: true } } } });
    const t = r ? await this.templates.get(r.templateId) : undefined;
    if (!r || !t?.channelId) return;
    const posted = await this.discord.posted(`drep-${id}`);
    if (!isNew && !posted) return; // nie gepostet → bei Änderungen nicht nachträglich posten
    const link = await this.prisma.discordLink.findUnique({ where: { userId: r.authorId } });
    const reviewer = r.reviewedById ? await this.prisma.discordLink.findUnique({ where: { userId: r.reviewedById } }).then(async (l) => (l ? `<@${l.discordId}>` : (await this.prisma.user.findUnique({ where: { id: r.reviewedById! }, select: { displayName: true } }))?.displayName ?? null)) : null;
    const msg = reportMessage(t, { number: r.number, period: t.period, periodStart: r.periodStart, values: r.values as Record<string, string>, authorName: r.author.displayName, authorDiscordId: link?.discordId, status: r.status, updatedAt: r.updatedAt, edited: r.version > 1, reviewerName: reviewer, reviewNote: r.reviewNote }, r.id);
    const ping = isNew && t.pingRoleIds.length ? { content: t.pingRoleIds.map((x) => `<@&${x}>`).join(' '), mentionRoles: t.pingRoleIds } : {};
    await this.discord.postMessage(`drep-${id}`, posted?.channelId ?? t.channelId, { ...msg, ...ping });
  }
}
