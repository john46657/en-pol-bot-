import { Injectable } from '@nestjs/common';
import { Prisma, type Announcement } from '@prisma/client';
import { z } from 'zod';
import { announcementMessage, nextRecurrence, ANNOUNCEMENT_RECURRENCE, ANNOUNCEMENT_TYPE_INFO, ANNOUNCEMENT_TYPES, MAX_MENTION_ROLES, type AnnouncementContent, type AnnouncementType } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { currentGuild } from '../common/guild-context';

const sf = z.string().regex(/^\d{15,25}$/);
const https = z.string().url().max(500).refine((u) => u.startsWith('https://'), 'Nur https-Links');
export const contentSchema = z.object({
  title: z.string().trim().min(2).max(240), description: z.string().trim().min(1).max(4000),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(), imageUrl: https.nullish(), thumbnailUrl: https.nullish(), footer: z.string().trim().max(200).nullish(), timestamp: z.boolean().default(true),
  fields: z.array(z.object({ name: z.string().trim().min(1).max(256), value: z.string().trim().min(1).max(1024), inline: z.boolean().default(false) })).max(25).default([]),
  links: z.array(z.object({ label: z.string().trim().min(1).max(80), url: https })).max(5).default([]),
});
export const announcementBody = z.object({
  type: z.enum(ANNOUNCEMENT_TYPES), content: contentSchema, channelId: sf,
  audience: z.enum(['SERVER', 'ROLES', 'DEPARTMENTS']).default('SERVER'), audienceRoleIds: z.array(sf).max(10).default([]), audienceDepartments: z.array(z.string().max(64)).max(10).default([]),
  mentionRoleIds: z.array(sf).max(MAX_MENTION_ROLES).default([]),
  scheduledAt: z.coerce.date().nullish(), recurrence: z.enum(ANNOUNCEMENT_RECURRENCE).default('NONE'), templateName: z.string().trim().max(80).nullish(),
});
export const announceConfigSchema = z.object({ channelIds: z.array(sf).max(50).default([]) });
export type AnnouncementInput = z.infer<typeof announcementBody>;
const CONFIG = 'announce.config';

/** Vorlagen je Art (Startwerte im Editor) – keine Lesebestätigung, keine Abstimmung. */
export const ANNOUNCEMENT_TEMPLATES = ANNOUNCEMENT_TYPES.map((t) => ({
  type: t, name: ANNOUNCEMENT_TYPE_INFO[t].label,
  content: { title: ANNOUNCEMENT_TYPE_INFO[t].label, description: { GENERAL: 'Liebe Kolleginnen und Kollegen,\n\n…', DIRECTIVE: '**Gültig ab:** …\n**Betrifft:** …\n\n…', TRAINING: '**Ausbildung:** …\n**Termin:** …\n**Anmeldung:** über den Kalender bzw. `/termine`', MEETING: '**Besprechung:** …\n**Zeit:** …\n**Ort:** …', MAINTENANCE: '**Zeitraum:** …\n**Betroffen:** …\n**Auswirkung:** …', SYSTEM: '**Was ist passiert:** …\n**Was ist zu tun:** …' }[t], color: ANNOUNCEMENT_TYPE_INFO[t].color, fields: [], links: [], timestamp: true },
}));

/**
 * Ankündigungsmanager: Discord-Ankündigungen über den vorhandenen Bot (gleiche Strecke wie der Embed Builder: `message.post`).
 * Erwähnungen nur ausgewählter Rollen (Recht announce.mention, max. 3), nie @everyone/@here. Zurückgezogene bleiben erhalten
 * (Nachricht wird in Discord als zurückgezogen markiert). Planen und Wiederholen genau einmal je Termin (Versandhistorie mit Zeitpunkt).
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly notify: NotifyService, private readonly discord: DiscordService) {}

  async config() { const r = announceConfigSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: CONFIG } }))?.value ?? {}); return r.success ? r.data : { channelIds: [] }; }
  async saveConfig(actor: Actor, c: z.infer<typeof announceConfigSchema>) {
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CONFIG }, create: { key: CONFIG, value: c }, update: { value: c } });
      await this.audit.record(actor, { action: 'announce.config', module: 'announce', entityType: 'SystemSetting', entityId: CONFIG, after: c }, tx);
    });
    return this.config();
  }

  private async check(actor: Actor, d: AnnouncementInput) {
    const cfg = await this.config();
    if (cfg.channelIds.length && !cfg.channelIds.includes(d.channelId)) throw new AppError('VALIDATION_FAILED', 'Dieser Kanal ist für Ankündigungen nicht freigegeben (Einstellungen der Ankündigungen).');
    if (d.mentionRoleIds.length && !(await this.perms.has(actor.userId!, 'announce.mention'))) throw new AppError('PERMISSION_DENIED', 'Rollen erwähnen darf nur, wer „announce.mention“ hat.');
    if (d.scheduledAt && d.scheduledAt.getTime() <= Date.now() - 60_000) throw new AppError('VALIDATION_FAILED', 'Der geplante Zeitpunkt liegt in der Vergangenheit.');
    if (d.recurrence !== 'NONE' && !d.scheduledAt) throw new AppError('VALIDATION_FAILED', 'Wiederkehrende Ankündigungen brauchen einen ersten Zeitpunkt.');
  }
  preview(d: Pick<AnnouncementInput, 'type' | 'content' | 'mentionRoleIds'>) { return announcementMessage(d.type, d.content as AnnouncementContent, d.mentionRoleIds); }

  private view(a: Announcement & { deliveries?: { kind: string; createdAt: Date; slot: Date | null }[] }) {
    return { ...a, typeLabel: ANNOUNCEMENT_TYPE_INFO[a.type as AnnouncementType]?.label ?? a.type, deliveries: a.deliveries ?? undefined };
  }
  async list(f: { status?: string }) {
    const rows = await this.prisma.announcement.findMany({ where: f.status ? { status: f.status } : {}, orderBy: { updatedAt: 'desc' }, take: 300 });
    return rows.map((r) => this.view(r));
  }
  private async load(id: string) {
    const a = await this.prisma.announcement.findUnique({ where: { id }, include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 100 } } });
    if (!a) throw new AppError('NOT_FOUND', 'Ankündigung nicht gefunden.');
    return a;
  }
  async get(id: string) {
    const a = await this.load(id);
    const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [a.createdById, ...a.deliveries.map((d) => d.actorId).filter((x): x is string => !!x)] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return { ...this.view(a), createdByName: names.get(a.createdById) ?? '—', deliveries: a.deliveries.map((d) => ({ kind: d.kind, at: d.createdAt, slot: d.slot, by: d.actorId ? names.get(d.actorId) ?? '—' : 'Automatik' })) };
  }

  async create(actor: Actor, d: AnnouncementInput) {
    await this.check(actor, d);
    const a = await this.prisma.$transaction(async (tx) => {
      const x = await tx.announcement.create({ data: { type: d.type, title: d.content.title, content: d.content as unknown as Prisma.InputJsonValue, channelId: d.channelId, audience: d.audience, audienceRoleIds: d.audienceRoleIds, audienceDepartments: d.audienceDepartments, mentionRoleIds: d.mentionRoleIds, scheduledAt: d.scheduledAt ?? null, recurrence: d.recurrence, templateName: d.templateName || null, createdById: actor.userId! } });
      await this.audit.record(actor, { action: 'announce.create', module: 'announce', entityType: 'Announcement', entityId: x.id, after: { type: x.type, title: x.title, channelId: x.channelId } }, tx);
      return x;
    });
    return this.get(a.id);
  }

  async update(actor: Actor, id: string, d: AnnouncementInput & { version: number }) {
    const a = await this.load(id);
    if (['RETRACTED'].includes(a.status)) throw new AppError('CONFLICT', 'Zurückgezogene Ankündigungen bleiben unverändert erhalten.');
    if (a.status === 'PUBLISHED' && a.channelId !== d.channelId) throw new AppError('CONFLICT', 'Der Kanal einer veröffentlichten Ankündigung kann nicht geändert werden.');
    await this.check(actor, d);
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.announcement.updateMany({ where: { id, version: d.version }, data: { type: d.type, title: d.content.title, content: d.content as unknown as Prisma.InputJsonValue, channelId: d.channelId, audience: d.audience, audienceRoleIds: d.audienceRoleIds, audienceDepartments: d.audienceDepartments, mentionRoleIds: d.mentionRoleIds, ...(a.status === 'PUBLISHED' && a.recurrence === 'NONE' ? {} : { scheduledAt: d.scheduledAt ?? null, recurrence: d.recurrence }), templateName: d.templateName || null, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Die Ankündigung wurde inzwischen geändert. Bitte neu laden.');
      await this.audit.record(actor, { action: 'announce.update', module: 'announce', entityType: 'Announcement', entityId: id, before: { title: a.title, content: a.content }, after: { title: d.content.title, content: d.content } }, tx);
      // veröffentlicht: dieselbe Discord-Nachricht aktualisieren (ohne erneuten Ping)
      if (a.status === 'PUBLISHED') {
        const last = await tx.announcementDelivery.findFirst({ where: { announcementId: id, kind: 'PUBLISH' }, orderBy: { createdAt: 'desc' } });
        if (last) {
          await this.discord.postMessage(last.stateKey, a.channelId, announcementMessage(d.type, d.content as AnnouncementContent, []), { tx });
          await tx.announcementDelivery.create({ data: { announcementId: id, kind: 'UPDATE', stateKey: last.stateKey, actorId: actor.userId } });
        }
      }
    });
    return this.get(id);
  }

  /** Jetzt veröffentlichen (Entwurf/geplant/fehlgeschlagen) bzw. planen, falls `scheduledAt` in der Zukunft liegt. */
  async publish(actor: Actor, id: string) {
    await this.perms.assert(actor.userId!, 'announce.publish');
    const a = await this.load(id);
    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(a.status)) throw new AppError('CONFLICT', 'Diese Ankündigung ist schon veröffentlicht oder zurückgezogen.');
    if (a.scheduledAt && a.scheduledAt.getTime() > Date.now()) {
      await this.prisma.$transaction(async (tx) => {
        const n = await tx.announcement.updateMany({ where: { id, status: { in: ['DRAFT', 'FAILED'] } }, data: { status: 'SCHEDULED', version: { increment: 1 } } });
        if (!n.count) throw new AppError('CONFLICT', 'Die Ankündigung ist schon geplant.');
        await this.audit.record(actor, { action: 'announce.schedule', module: 'announce', entityType: 'Announcement', entityId: id, after: { scheduledAt: a.scheduledAt, recurrence: a.recurrence } }, tx);
      });
      return this.get(id);
    }
    await this.send(actor, a, null);
    return this.get(id);
  }

  /** Senden genau einmal je Zeitpunkt (`slot`): Zeile in der Versandhistorie ist der Riegel (übersteht Neustarts, mehrere Instanzen). */
  private async send(actor: Actor, a: Announcement, slot: Date | null) {
    const stateKey = `ann-${a.id.slice(0, 8)}-${(slot ?? new Date()).getTime().toString(36)}`;
    const sent = await this.prisma.$transaction(async (tx) => {
      if (!slot) {
        const n = await tx.announcement.updateMany({ where: { id: a.id, status: { in: ['DRAFT', 'SCHEDULED', 'FAILED'] } }, data: { status: 'PUBLISHED', publishedAt: new Date(), ...(a.recurrence === 'NONE' ? {} : { scheduledAt: nextRecurrence(new Date(), a.recurrence as 'DAILY') }), version: { increment: 1 } } });
        if (!n.count) throw new AppError('CONFLICT', 'Die Ankündigung wurde gerade schon veröffentlicht.');
      } else {
        try { await tx.announcementDelivery.create({ data: { announcementId: a.id, kind: 'PUBLISH', stateKey, slot, actorId: null } }); }
        catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false; throw e; }
        await tx.announcement.update({ where: { id: a.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), scheduledAt: a.recurrence === 'NONE' ? a.scheduledAt : nextRecurrence(slot, a.recurrence as 'DAILY'), version: { increment: 1 } } });
      }
      if (!slot) await tx.announcementDelivery.create({ data: { announcementId: a.id, kind: 'PUBLISH', stateKey, actorId: actor.userId } });
      await this.discord.postMessage(stateKey, a.channelId, announcementMessage(a.type as AnnouncementType, a.content as unknown as AnnouncementContent, a.mentionRoleIds), { tx, forceNew: true });
      await this.audit.record(actor, { action: 'announce.publish', module: 'announce', entityType: 'Announcement', entityId: a.id, after: { channelId: a.channelId, mentions: a.mentionRoleIds.length, slot } }, tx);
      return true;
    });
    if (sent) await this.notifyAudience(a);
  }

  /** Dashboard/MDT/Leitstelle: Hinweis an die Zielgruppe (ohne DM, ohne Inhalt außer Titel). */
  private async notifyAudience(a: Announcement) {
    let users: string[];
    if (a.audience === 'DEPARTMENTS' && a.audienceDepartments.length) users = (await this.prisma.personnel.findMany({ where: { team: { in: a.audienceDepartments } }, select: { userId: true } })).map((p) => p.userId);
    else if (a.audience === 'ROLES' && a.audienceRoleIds.length) {
      const g = currentGuild();
      users = (await this.prisma.serverMembership.findMany({ where: { status: 'MEMBER', discordRoleIds: { hasSome: a.audienceRoleIds }, ...(g ? { server: { guildId: g } } : {}) }, select: { userId: true } })).map((m) => m.userId);
    } else users = await this.notify.usersWith('dashboard.view');
    await this.notify.emit('announcement.new', users, { title: `📣 ${ANNOUNCEMENT_TYPE_INFO[a.type as AnnouncementType]?.emoji ?? ''} ${a.title}`, link: `/announcements?id=${a.id}`, entityType: 'Announcement', entityId: a.id, dedupeKey: `${a.id}:${a.publishedAt?.getTime() ?? Date.now()}`, dm: false });
  }

  /** Zurückziehen: bleibt in der Historie; die Discord-Nachricht(en) werden als zurückgezogen markiert (kein Löschen, kein Ping). */
  async retract(actor: Actor, id: string, reason: string) {
    await this.perms.assert(actor.userId!, 'announce.publish');
    const a = await this.load(id);
    if (a.status === 'RETRACTED') throw new AppError('CONFLICT', 'Schon zurückgezogen.');
    await this.prisma.$transaction(async (tx) => {
      const n = await tx.announcement.updateMany({ where: { id, status: { not: 'RETRACTED' } }, data: { status: 'RETRACTED', retractedAt: new Date(), retractReason: reason, version: { increment: 1 } } });
      if (!n.count) throw new AppError('CONFLICT', 'Schon zurückgezogen.');
      for (const d of a.deliveries.filter((x) => x.kind === 'PUBLISH')) {
        await this.discord.postMessage(d.stateKey, a.channelId, announcementMessage(a.type as AnnouncementType, a.content as unknown as AnnouncementContent, [], { retracted: true }), { tx });
        await tx.announcementDelivery.create({ data: { announcementId: id, kind: 'RETRACT', stateKey: d.stateKey, actorId: actor.userId } });
      }
      await this.audit.record(actor, { action: 'announce.retract', module: 'announce', entityType: 'Announcement', entityId: id, reason }, tx);
    });
    return this.get(id);
  }

  /** Jede Minute: geplante und wiederkehrende Ankündigungen veröffentlichen (je Zeitpunkt genau einmal). */
  async tick(now = new Date()) {
    const due = await this.prisma.announcement.findMany({ where: { scheduledAt: { lte: now }, OR: [{ status: 'SCHEDULED' }, { status: 'PUBLISHED', recurrence: { not: 'NONE' } }] }, take: 50 });
    let published = 0;
    for (const a of due) {
      try { await this.send({ userId: null }, a, a.scheduledAt!); published++; }
      catch (e) {
        await this.prisma.announcement.updateMany({ where: { id: a.id, status: 'SCHEDULED' }, data: { status: 'FAILED' } });
        await this.notify.emitPermission('system.error', 'announce.publish', { title: `Ankündigung „${a.title}“ konnte nicht veröffentlicht werden`, body: e instanceof Error ? e.message : String(e), link: `/announcements?id=${a.id}`, dedupeKey: `ann-fail-${a.id}-${a.scheduledAt?.getTime()}` }, { guildId: null });
      }
    }
    return { published };
  }
}
