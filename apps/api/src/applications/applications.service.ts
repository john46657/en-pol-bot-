import { Injectable } from '@nestjs/common';
import { APPLICATION_TRANSITIONS, ApplicationStatus, isValidRobloxUserId } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';

export interface FormField { key: string; label: string; required: boolean; maxLength: number }
export const DEFAULT_FORM: FormField[] = [
  { key: 'experience', label: 'Experience', required: true, maxLength: 2000 },
  { key: 'availability', label: 'Availability', required: true, maxLength: 500 },
  { key: 'motivation', label: 'Motivation', required: true, maxLength: 3000 },
  { key: 'roleplayKnowledge', label: 'Roleplay Knowledge', required: true, maxLength: 3000 },
  { key: 'erlcKnowledge', label: 'ER:LC Knowledge', required: true, maxLength: 3000 },
  { key: 'communication', label: 'Communication', required: false, maxLength: 2000 },
];

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async form(): Promise<FormField[]> {
    const s = await this.prisma.systemSetting.findUnique({ where: { key: 'application.form' } });
    return (s?.value as unknown as FormField[] | undefined) ?? DEFAULT_FORM;
  }

  /** Öffentliche Bewerbung (kein Account nötig). Antworten werden strikt gegen das konfigurierte Formular validiert. */
  async submit(d: { robloxUsername: string; robloxUserId?: string; answers: Record<string, string> }) {
    if (d.robloxUserId && !isValidRobloxUserId(d.robloxUserId)) throw new AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
    const form = await this.form();
    const answers: Record<string, string> = {};
    for (const f of form) {
      const v = (d.answers[f.key] ?? '').trim();
      if (f.required && !v) throw new AppError('VALIDATION_FAILED', `"${f.label}" is required.`);
      if (v.length > f.maxLength) throw new AppError('VALIDATION_FAILED', `"${f.label}" is too long.`);
      if (v) answers[f.key] = v;
    }
    if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: ['SUBMITTED', 'SCREENING', 'INTERVIEW', 'PENDING_DECISION'] } } }))) {
      throw new AppError('CONFLICT', 'An open application already exists for this Roblox user.');
    }
    const a = await this.prisma.application.create({ data: { number: makeNumber('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers } });
    await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id });
    return { number: a.number, status: a.status };
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
    });
  }
}
