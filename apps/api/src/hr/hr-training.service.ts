import { Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { HrCoreService } from './hr-core.service';

export const trainingSchema = z.object({
  name: z.string().trim().min(1).max(100), description: z.string().max(3000).nullable().default(null), requirements: z.string().max(1000).nullable().default(null),
  instructorIds: z.array(z.string().uuid()).max(30).default([]), duration: z.string().max(60).nullable().default(null), active: z.boolean().default(true), examRequired: z.boolean().default(false),
  examId: z.string().uuid().nullable().default(null), certificate: z.boolean().default(true), audience: z.string().max(200).nullable().default(null), requiredRoleId: z.string().regex(/^\d{15,25}$/).nullable().default(null),
  validDays: z.number().int().min(1).max(3650).nullable().default(null),
  modules: z.array(z.string().trim().min(1).max(100)).max(50).default([]).refine((m) => new Set(m).size === m.length, 'Jedes Modul darf nur einmal vorkommen.'),
});
export const TRAINING_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'ABORTED', 'EXPIRED'] as const;
const CERT = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Fortschritt in Prozent aus den abgehakten Modulen (nur Module, die es in der Ausbildung noch gibt). */
const moduleState = (modules: string[], done: string[]) => {
  const d = modules.filter((m) => done.includes(m));
  return { doneModules: d, progress: modules.length ? Math.round((d.length / modules.length) * 100) : 0 };
};
const certNo = () => `Z-${new Date().getUTCFullYear()}-${Array.from({ length: 6 }, () => CERT[randomInt(CERT.length)]).join('')}`;

/** Ausbildungen (mit Fortschritt und Zertifikat). Prüfungen: hr-exam.service.ts */
@Injectable()
export class HrTrainingService {
  constructor(private readonly core: HrCoreService, private readonly perms: PermissionService) {}
  private get prisma() { return this.core.prisma; }

  // ---------------- Ausbildungen ----------------
  async trainings() {
    const list = await this.prisma.hrTraining.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { _count: { select: { progress: { where: { status: 'PASSED' } } } } } });
    return list.map(({ _count, ...t }) => ({ ...t, passed: _count.progress }));
  }
  async saveTraining(actor: Actor, d: z.infer<typeof trainingSchema>, id?: string) {
    const t = id ? await this.prisma.hrTraining.update({ where: { id }, data: d }) : await this.prisma.hrTraining.create({ data: { ...d, position: ((await this.prisma.hrTraining.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1 } });
    // Module geändert → Fortschritt der laufenden Ausbildungen neu berechnen (gelöschte Module zählen nicht mehr)
    if (id && t.modules.length) {
      for (const r of await this.prisma.hrTrainingProgress.findMany({ where: { trainingId: id, status: { notIn: ['PASSED', 'EXPIRED'] } } })) {
        const m = moduleState(t.modules, r.doneModules);
        if (m.progress !== r.progress || m.doneModules.length !== r.doneModules.length) await this.prisma.hrTrainingProgress.update({ where: { id: r.id }, data: m });
      }
    }
    await this.core.audit.record(actor, { action: id ? 'training.update' : 'training.create', module: 'training', entityType: 'HrTraining', entityId: t.id, after: t });
    return t;
  }
  async deleteTraining(actor: Actor, id: string) {
    const t = await this.prisma.hrTraining.delete({ where: { id } }).catch(() => null);
    if (!t) throw new AppError('NOT_FOUND', 'Ausbildung nicht gefunden.');
    await this.core.audit.record(actor, { action: 'training.delete', module: 'training', entityType: 'HrTraining', entityId: id, before: t });
  }
  /** Fortschritt aller Personen in einer Ausbildung (Matrix). */
  async progressOf(trainingId: string) {
    return this.prisma.hrTrainingProgress.findMany({ where: { trainingId }, include: { personnel: { select: { id: true, rank: true, user: { select: { displayName: true } } } } }, orderBy: { updatedAt: 'desc' } });
  }
  /** Fortschritt setzen (Ausbilder oder training.manage); bei „bestanden“ ggf. Zertifikat und Ablaufdatum. */
  async setProgress(actor: Actor, d: { trainingId: string; personnelId: string; status: (typeof TRAINING_STATUSES)[number]; progress?: number; doneModules?: string[]; note?: string | null }) {
    const t = await this.prisma.hrTraining.findUnique({ where: { id: d.trainingId } });
    if (!t) throw new AppError('NOT_FOUND', 'Ausbildung nicht gefunden.');
    if (!t.instructorIds.includes(actor.userId!) && !(await this.perms.has(actor.userId!, 'training.manage'))) throw new AppError('PERMISSION_DENIED', 'Nur Ausbilder dieser Ausbildung oder Verwalter können den Fortschritt setzen.');
    const p = await this.prisma.personnel.findUnique({ where: { id: d.personnelId }, include: { user: { select: { displayName: true } } } });
    if (!p) throw new AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
    if (d.status === 'PASSED' && t.examRequired && t.examId && !(await this.prisma.hrExamAttempt.count({ where: { examId: t.examId, personnelId: p.id, passed: true, status: 'GRADED' } }))) throw new AppError('CONFLICT', 'Für diese Ausbildung muss zuerst die Prüfung bestanden sein.');
    const before = await this.prisma.hrTrainingProgress.findUnique({ where: { trainingId_personnelId: { trainingId: t.id, personnelId: p.id } } });
    const passed = d.status === 'PASSED';
    // mit Modulen: Fortschritt kommt aus der Checkliste, „bestanden“ erst wenn alle Module abgehakt sind
    const mods = t.modules.length ? moduleState(t.modules, d.doneModules ?? before?.doneModules ?? []) : null;
    if (passed && mods && mods.doneModules.length < t.modules.length) throw new AppError('CONFLICT', `Erst alle Module abhaken (${mods.doneModules.length}/${t.modules.length} erledigt).`);
    const progress = passed ? 100 : mods ? mods.progress : d.progress ?? before?.progress ?? 0;
    const data = {
      status: d.status, progress: Math.max(0, Math.min(100, progress)), ...(mods ? { doneModules: mods.doneModules } : {}), note: d.note ?? before?.note ?? null, examinerId: actor.userId,
      ...(d.status !== 'NOT_STARTED' && !before?.startedAt ? { startedAt: new Date() } : {}),
      ...(passed ? { completedAt: new Date(), expiresAt: t.validDays ? new Date(Date.now() + t.validDays * 86_400_000) : null, certificateNo: before?.certificateNo ?? (t.certificate ? certNo() : null) } : {}),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const r = await tx.hrTrainingProgress.upsert({ where: { trainingId_personnelId: { trainingId: t.id, personnelId: p.id } }, create: { trainingId: t.id, personnelId: p.id, ...data }, update: data });
      if (passed && before?.status !== 'PASSED') await tx.personnelRecord.create({ data: { personnelId: p.id, type: 'TRAINING', summary: `Ausbildung bestanden: ${t.name}`, data: { trainingId: t.id, certificateNo: r.certificateNo }, createdById: actor.userId! } });
      await this.core.audit.record(actor, { action: 'training.progress', module: 'training', entityType: 'HrTrainingProgress', entityId: r.id, before, after: r }, tx);
      return r;
    });
    if (passed && before?.status !== 'PASSED') await this.core.notify('training.passed', { memberUserId: p.userId, title: `🎓 Ausbildung bestanden: ${t.name}`, entityType: 'Personnel', entityId: p.id, publicText: `**${p.user.displayName}** hat die Ausbildung **${t.name}** bestanden.`, dmText: `Glückwunsch! Du hast die Ausbildung **${t.name}** bestanden.${row.certificateNo ? `\nZertifikat: ${row.certificateNo}` : ''}`, color: 0x22c55e });
    return row;
  }
  /** Abgelaufene Ausbildungen markieren (beim Lesen). */
  async expire() { await this.prisma.hrTrainingProgress.updateMany({ where: { status: 'PASSED', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } }); }

  /** Digitales Zertifikat (nur bestandene Ausbildungen mit Zertifikat). Sichtbar für die Person selbst und mit training.view. */
  async certificate(actor: Actor, certificateNo: string) {
    const r = await this.prisma.hrTrainingProgress.findUnique({ where: { certificateNo }, include: { training: true, personnel: { include: { user: { select: { displayName: true, robloxUsername: true } } } } } });
    if (!r || (r.personnel.userId !== actor.userId && !(await this.perms.has(actor.userId!, 'training.view')))) throw new AppError('NOT_FOUND', 'Zertifikat nicht gefunden.');
    const cfg = await this.core.config();
    const examiner = r.examinerId ? await this.prisma.user.findUnique({ where: { id: r.examinerId }, select: { displayName: true } }) : null;
    const attempt = r.training.examId ? await this.prisma.hrExamAttempt.findFirst({ where: { examId: r.training.examId, personnelId: r.personnelId, passed: true, status: 'GRADED' }, orderBy: { score: 'desc' } }) : null;
    return {
      certificateNo, name: r.personnel.user.displayName, roblox: r.personnel.user.robloxUsername, training: r.training.name, description: r.training.description,
      result: attempt?.score != null && attempt.maxScore ? `${Math.round((attempt.score / attempt.maxScore) * 100)} %` : 'Bestanden',
      date: r.completedAt, expiresAt: r.expiresAt, examiner: examiner?.displayName ?? '—', organisation: cfg.certificate.organisation, logo: cfg.certificate.logo, signature: cfg.certificate.signature, status: r.status,
    };
  }
}
