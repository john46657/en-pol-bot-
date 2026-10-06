import { Injectable } from '@nestjs/common';
import { APPLICATION_TRANSITIONS, ApplicationStatus, checkAnswer, isValidRobloxUserId, type FormField } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';
import { makeNumber } from '../common/numbering';
import { nextStatus } from '../common/transition';
import { PageQuery, pageResult, skipTake } from '../common/pagination';
import { webUrl } from '../common/web-url';

export type { FormField };
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
  async submit(d: { robloxUsername: string; robloxUserId?: string; answers: Record<string, string | string[]> }, meta: { discordId?: string; discordName?: string; durationSec?: number; joinedAt?: Date } = {}) {
    if (d.robloxUserId && !isValidRobloxUserId(d.robloxUserId)) throw new AppError('VALIDATION_FAILED', 'Invalid Roblox user id.');
    const form = await this.form();
    const answers: Record<string, string> = {};
    const grantRoleIds = new Set<string>();
    for (const f of form) {
      const r = checkAnswer(f, d.answers[f.key]);
      if (!r.ok) throw new AppError('VALIDATION_FAILED', r.error);
      if (r.text) answers[f.key] = r.text;
      r.roleIds.forEach((x) => grantRoleIds.add(x));
    }
    if (d.robloxUserId && (await this.prisma.application.count({ where: { robloxUserId: d.robloxUserId, status: { in: OPEN_STATUSES } } }))) {
      throw new AppError('CONFLICT', 'An open application already exists for this Roblox user.');
    }
    if (meta.discordId && (await this.openForDiscord(meta.discordId)).open) throw new AppError('CONFLICT', 'An open application already exists for this Discord account.');
    const a = await this.prisma.application.create({ data: { number: makeNumber('APP'), robloxUsername: d.robloxUsername, robloxUserId: d.robloxUserId, answers, grantRoleIds: [...grantRoleIds], discordId: meta.discordId, discordName: meta.discordName, durationSec: meta.durationSec, joinedAt: meta.joinedAt, source: meta.discordId ? 'DISCORD' : 'WEB' } });
    await this.audit.record({ userId: null }, { action: 'application.submit', module: 'applications', entityType: 'Application', entityId: a.id, after: { source: a.source } });
    // Rollen-Ping für neue Bewerbungen (Qualifications → Setup → Bewerbung bei EN Polizei)
    const qcfg = (await this.prisma.systemSetting.findUnique({ where: { key: 'qualifications.config' } }))?.value as { police?: { pingRoleIds?: unknown } } | undefined;
    const pingRoleIds = Array.isArray(qcfg?.police?.pingRoleIds) ? qcfg.police.pingRoleIds.filter((r): r is string => typeof r === 'string' && /^\d{15,25}$/.test(r)) : [];
    await this.discord.enqueue('applications', 'application.submitted', {
      id: a.id, pingRoleIds, number: a.number, robloxUsername: a.robloxUsername, robloxUserId: a.robloxUserId ?? null, discordId: meta.discordId ?? null, discordName: meta.discordName ?? null, source: a.source,
      answers: form.filter((f) => answers[f.key]).map((f) => ({ question: f.label, answer: answers[f.key] })),
      durationSec: a.durationSec, joinedAt: a.joinedAt?.toISOString() ?? null, createdAt: a.createdAt.toISOString(), dashboardUrl: webUrl(`/applications/${a.id}`),
    });
    return { number: a.number, status: a.status };
  }

  /** Für den Bot: hat dieses Discord-Konto schon eine offene Bewerbung? */
  async openForDiscord(discordId: string) {
    const a = await this.prisma.application.findFirst({ where: { discordId, status: { in: OPEN_STATUSES } }, select: { number: true } });
    return { open: !!a, number: a?.number ?? null };
  }

  /** Bisherige Bewerbungen einer Discord-ID (Button „Verlauf“). */
  history(discordId: string) {
    return this.prisma.application.findMany({ where: { discordId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, number: true, status: true, createdAt: true, decisionReason: true } });
  }

  /**
   * Schnell-Entscheidung aus Discord (Buttons Annehmen/Ablehnen): aus jedem offenen Status direkt angenommen/abgelehnt.
   * `reason` geht – anders als der interne Grund im Web-Workflow – per DM an die Person.
   */
  async discordDecide(actor: Actor, id: string, to: 'ACCEPTED' | 'REJECTED', reason?: string) {
    const after = await this.prisma.$transaction(async (tx) => {
      const a = await tx.application.findUnique({ where: { id } });
      if (!a) throw new AppError('NOT_FOUND', 'Application not found.');
      if (!OPEN_STATUSES.includes(a.status)) throw new AppError('CONFLICT', 'This application has already been decided.');
      const claimed = await tx.application.updateMany({ where: { id, status: a.status, version: a.version }, data: { status: to, decidedById: actor.userId, decisionReason: reason || null, version: { increment: 1 } } });
      if (claimed.count === 0) throw new AppError('CONFLICT', 'This application has already been decided.');
      await this.audit.record(actor, { action: `application.${to.toLowerCase()}`, module: 'applications', entityType: 'Application', entityId: id, before: { status: a.status }, after: { status: to }, reason: reason || 'Entschieden über Discord' }, tx);
      return { ...a, status: to };
    });
    if (after.discordId) await this.discord.enqueue('applications', 'application.decided', { discordId: after.discordId, status: to, number: after.number, reason: reason || null, roleIds: to === 'ACCEPTED' ? after.grantRoleIds : [] }, { always: true });
    const by = actor.userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
    return { id, number: after.number, status: to, decidedByName: by?.displayName ?? null, reason: reason || null };
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
      if (after.discordId && (to === 'ACCEPTED' || to === 'REJECTED')) await this.discord.enqueue('applications', 'application.decided', { discordId: after.discordId, status: to, number: after.number, roleIds: to === 'ACCEPTED' ? after.grantRoleIds : [] }, { always: true });
      return after;
    });
  }
}
