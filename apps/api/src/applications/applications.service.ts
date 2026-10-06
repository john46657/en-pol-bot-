import { Injectable } from '@nestjs/common';
import { APPLICATION_TRANSITIONS, ApplicationStatus, isValidRobloxUserId } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

export interface FormField { key: string; label: string; required: boolean; maxLength: number }
/** Die Beschriftungen sind zugleich die Fragen, die der Discord-Bot per Direktnachricht stellt. */
export const DEFAULT_FORM: FormField[] = [
  { key: 'experience', label: 'Welche Erfahrung hast du im Polizei-Roleplay (auch auf anderen Servern)?', required: true, maxLength: 2000 },
  { key: 'availability', label: 'Wann und wie oft kannst du aktiv sein?', required: true, maxLength: 500 },
  { key: 'motivation', label: 'Warum möchtest du zur EN Polizei?', required: true, maxLength: 3000 },
  { key: 'roleplayKnowledge', label: 'Was bedeutet für dich gutes Roleplay?', required: true, maxLength: 3000 },
  { key: 'erlcKnowledge', label: 'Wie gut kennst du ER:LC (Steuerung, Fahrzeuge, Regeln)?', required: false, maxLength: 3000 },
  { key: 'communication', label: 'Wie gehst du im Funk und mit Kollegen mit Konflikten um?', required: false, maxLength: 2000 },
];
const OPEN_STATUSES = ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'];

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

  async form(): Promise<FormField[]> {
    const s = await this.prisma.systemSetting.findUnique({ where: { key: 'application.form' } });
    return (s?.value as unknown as FormField[] | undefined) ?? DEFAULT_FORM;
  }

  /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
  async submit(d: { robloxUsername: string; robloxUserId?: string; answers: Record<string, string> }, meta: { discordId?: string } = {}) {
    if (d.robloxUserId && !isValidRobloxUserId(d.robloxUserId)) throw new AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
    const form = await this.form();
    const answers: Record<string, string> = {};
    for (const f of form) {
      const v = (d.answers[f.key] ?? '').trim();
      if (f.required && !v) throw new AppError('VALIDATION_FAILED', `"${f.label}" is required.`);
      if (v.length > f.maxLength) throw new AppError('VALIDATION_FAILED', `"${f.label}" is too long.`);
      if (v) answers[f.key] = v;
    }
    if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: OPEN_STATUSES } } }))) {
      throw new AppError('CONFLICT', 'An open application already exists for this Roblox user.');
    }
    if (meta.discordId && (await this.openForDiscord(meta.discordId)).open) throw new AppError('CONFLICT', 'An open application already exists for this Discord account.');
    const a = await this.prisma.application.create({ data: { number: makeNumber('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers, discordId: meta.discordId, source: meta.discordId ? 'DISCORD' : 'WEB' } });
    await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id, after: { source: a.source } });
    await this.discord.enqueue('applications', 'application.submitted', { number: a.number, robloxUsername: a.robloxUsername, discordId: meta.discordId ?? null, source: a.source });
    return { number: a.number, status: a.status };
  }

  /** Für den Bot: hat dieses Discord-Konto schon eine offene Bewerbung? */
  async openForDiscord(discordId: string) {
    const a = await this.prisma.application.findFirst({ where: { discordId, status: { in: OPEN_STATUSES } }, select: { number: true } });
    return { open: !!a, number: a?.number ?? null };
  }

  async list(p: PageQuery, status?: string) {
    const where = { ...(status ? { status } : {}), ...(p.q ? { OR: [{ number: { contains: p.q.toUpperCase() } }, { robloxUsername: { contains: p.q, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.application.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(p) }), this.prisma.application.count({ where })]);
    return pageResult(items, total, p);
  }

  async get(id: string) {
    const a = await this.prisma.application.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Application not found.');
    return a;
  }

  async transition(actor: Actor, id: string, to: ApplicationStatus, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const a = await tx.application.findUnique({ where: { id } });
      if (!a) throw new AppError('NOT_FOUND', 'Application not found.');
      nextStatus(APPLICATION_TRANSITIONS, a.status, to);
      if ((to === 'ACCEPTED' || to === 'REJECTED') && !reason) throw new AppError('VALIDATION_FAILED', 'A reason is required.');
      const after = await tx.application.update({ where: { id }, data: { status: to, decidedById: to === 'ACCEPTED' || to === 'REJECTED' ? actor.userId : a.decidedById, version: { increment: 1 } } });
      await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason }, tx);
      return after;
    }).then(async (after) => {
      // Entscheidung per Direktnachricht (nur bei Bewerbung über Discord). Der interne Grund wird NICHT mitgeschickt.
      if (after.discordId && (to === 'ACCEPTED' || to === 'REJECTED')) await this.discord.enqueue('applications', 'application.decided', { discordId: after.discordId, status: to, number: after.number }, { always: true });
      return after;
    });
  }
}
