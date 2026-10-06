import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';
import { configSchema, DEFAULT_CONFIG, type QualificationConfig } from './qualifications.config';

const KEY = 'qualifications.config';
export interface Answer { question: string; answer: string }

/**
 * Qualifikations-Bewerbungen (SEK, Flugstaffel, Ausbilder …): Discord-Panel → Fragen per DM → Team entscheidet (Web oder Button im Team-Channel).
 * Bei Annahme: Direktnachricht, optionale Discord-Rolle; für die Einheit `sek` zusätzlich SEK-Roster + System-Rolle „SEK“ (bei verknüpftem Konto).
 */
@Injectable()
export class QualificationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

  async config(): Promise<QualificationConfig> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key: KEY } });
    const parsed = row ? configSchema.safeParse(row.value) : null;
    return parsed?.success ? parsed.data : DEFAULT_CONFIG;
  }

  async saveConfig(actor: Actor, c: QualificationConfig) {
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: c as Prisma.InputJsonValue }, update: { value: c as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: 'qualifications.config', module: 'qualifications', entityType: 'SystemSetting', entityId: KEY, after: { units: c.units.map((u) => u.key) } }, tx);
    });
    return c;
  }

  /** Für den Bot: läuft für diese Discord-ID schon eine offene Bewerbung (je Einheit)? */
  async openFor(discordId: string, unit?: string) {
    const open = await this.prisma.qualificationApplication.findFirst({ where: { discordId, status: 'OPEN', ...(unit ? { unit } : {}) }, select: { number: true, unitName: true } });
    return { open: !!open, number: open?.number ?? null, unitName: open?.unitName ?? null };
  }

  async submit(d: { unit: string; discordId: string; discordName: string; answers: Answer[] }) {
    const cfg = await this.config();
    const unit = cfg.units.find((u) => u.key === d.unit);
    if (!unit) throw new AppError('NOT_FOUND', 'Unknown unit.');
    if (d.answers.length !== unit.questions.length) throw new AppError('VALIDATION_FAILED', `Expected ${unit.questions.length} answers.`);
    if ((await this.openFor(d.discordId, unit.key)).open) throw new AppError('CONFLICT', `There is already an open application for ${unit.name}.`);
    const user = await this.discord.resolveUser(d.discordId);
    const a = await this.prisma.$transaction(async (tx) => {
      const row = await tx.qualificationApplication.create({ data: { number: makeNumber('Q'), unit: unit.key, unitName: unit.name, discordId: d.discordId, discordName: d.discordName, userId: user?.id, answers: d.answers as unknown as Prisma.InputJsonValue } });
      await this.audit.record({ userId: user?.id ?? null }, { action: 'qualifications.application.submit', module: 'qualifications', entityType: 'QualificationApplication', entityId: row.id, after: { number: row.number, unit: unit.key, discordId: d.discordId } }, tx);
      return row;
    });
    await this.discord.enqueue('qualifications', 'qualification.submitted', { id: a.id, number: a.number, unitName: a.unitName, discordId: a.discordId, discordName: a.discordName, linkedName: user?.displayName ?? null, answers: d.answers });
    return { id: a.id, number: a.number, unitName: a.unitName };
  }

  async list(f: { unit?: string; status?: string }) {
    const rows = await this.prisma.qualificationApplication.findMany({ where: { ...(f.unit ? { unit: f.unit } : {}), ...(f.status ? { status: f.status } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
    const ids = [...new Set(rows.flatMap((r) => [r.userId, r.decidedById]).filter((x): x is string => !!x))];
    const users = new Map((await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ ...r, linkedName: r.userId ? users.get(r.userId) ?? null : null, decidedByName: r.decidedById ? users.get(r.decidedById) ?? '—' : null }));
  }

  async decide(actor: Actor, id: string, status: 'ACCEPTED' | 'REJECTED') {
    const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Application not found.');
    if (a.status !== 'OPEN') throw new AppError('CONFLICT', 'This application has already been decided.');
    const ownLink = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
    if ((a.userId && a.userId === actor.userId) || ownLink?.discordId === a.discordId) throw new AppError('PERMISSION_DENIED', 'You cannot decide on your own application.');
    const unit = (await this.config()).units.find((u) => u.key === a.unit);
    let addedToSek = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.qualificationApplication.updateMany({ where: { id, status: 'OPEN' }, data: { status, decidedById: actor.userId, decidedAt: new Date() } });
      if (claimed.count === 0) throw new AppError('CONFLICT', 'This application has already been decided.');
      if (status === 'ACCEPTED' && a.unit === 'sek' && a.userId) {
        await tx.sekMember.upsert({ where: { userId: a.userId }, create: { userId: a.userId, addedById: actor.userId }, update: {} });
        // System-Rolle „SEK“ (Einsatzberichte schreiben), falls vorhanden
        const role = await tx.role.findUnique({ where: { name: 'SEK' } });
        if (role) await tx.userRole.upsert({ where: { userId_roleId: { userId: a.userId, roleId: role.id } }, create: { userId: a.userId, roleId: role.id }, update: {} });
        addedToSek = true;
      }
      if (a.userId) await tx.notification.create({ data: { userId: a.userId, type: 'QUALIFICATION', title: `Your ${a.unitName} application ${a.number} was ${status === 'ACCEPTED' ? 'accepted' : 'not accepted'}` } });
      await this.audit.record(actor, { action: `qualifications.application.${status === 'ACCEPTED' ? 'accept' : 'reject'}`, module: 'qualifications', entityType: 'QualificationApplication', entityId: id, before: { status: 'OPEN' }, after: { status } }, tx);
    });
    await this.discord.enqueue('qualifications', 'qualification.decided', { discordId: a.discordId, status, number: a.number, unitName: a.unitName, roleId: status === 'ACCEPTED' ? unit?.roleId || null : null }, { always: true });
    return { id, number: a.number, unitName: a.unitName, status, addedToSek };
  }
}
