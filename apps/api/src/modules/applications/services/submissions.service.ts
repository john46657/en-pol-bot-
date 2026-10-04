import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DENY_REASONS,
  askClarification,
  assignSubmission,
  decideSubmission,
  describeAcceptPipeline,
  inviteToInterview,
  restDiscordPort,
  startReview,
  withdrawByStaff,
} from '@nexus/automation';
import { SubmissionStatus } from '@nexus/types';
import { auditRepository, prisma, assertGuildId } from '@nexus/database';
import { EXPORT_LIMIT, toExportCsv, toExportJson, type ExportRow } from './submissions-export.js';
import type {
  AcceptSubmissionDto,
  DenySubmissionDto,
  CreateNoteDto,
} from '../dto/applications.dto.js';

/**
 * SubmissionsService – Guild- scoped (§113) mit Cursor-Pagination (§107).
 */
@Injectable()
export class SubmissionsService {
  constructor(private readonly config: ConfigService) {}

  async list(
    guildId: string,
    options: {
      applicationId?: string;
      status?: SubmissionStatus;
      search?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const g = assertGuildId(guildId);
    const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

    const items = await prisma.applicationSubmission.findMany({
      where: {
        guildId: g,
        ...(options.applicationId ? { applicationId: options.applicationId } : {}),
        ...(options.status ? { status: options.status } : {}),
        ...(options.search
          ? {
              OR: [
                { submissionNumber: { contains: options.search } },
                { usernameSnapshot: { contains: options.search, mode: 'insensitive' } },
                { displayNameSnapshot: { contains: options.search, mode: 'insensitive' } },
                { userId: { contains: options.search } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(options.cursor ? { skip: 1, cursor: { id: options.cursor } } : {}),
      include: { application: true },
    });

    const hasMore = items.length > limit;
    const rows = hasMore ? items.slice(0, -1) : items;
    return { items: rows, nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined };
  }

  async getById(guildId: string, submissionId: string) {
    const submission = await prisma.applicationSubmission.findFirst({
      where: { id: submissionId, guildId: assertGuildId(guildId) },
      include: {
        application: true,
        version: true,
        answers: true,
        notes: { orderBy: { createdAt: 'desc' } },
        attachments: true,
        reviewers: { orderBy: { assignedAt: 'desc' } },
      },
    });
    if (!submission) throw new NotFoundException('Submission nicht gefunden.');
    return submission;
  }

  /** Fachliche Ablehnungen: unbekannter Grund → 400, bereits entschieden → 409. */
  private decisionError(message: string) {
    return message.startsWith('Unbekannter')
      ? new BadRequestException(message)
      : new ConflictException(message);
  }

  private port() {
    return restDiscordPort(this.config.get<string>('DISCORD_TOKEN') ?? '');
  }

  private dashboardUrl(): string | undefined {
    return this.config.get<string>('DASHBOARD_URL')?.split(',')[0];
  }

  /**
   * Annehmen (§30): dieselbe Logik wie im Bot (`@nexus/automation`) – Statusmaschine, atomarer Wechsel,
   * Annahme-Pipeline (Rollen, Benachrichtigungen …), Audit. Ergebnis enthält jeden Schritt einzeln.
   */
  async accept(
    guildId: string,
    submissionId: string,
    reviewerId: string,
    dto: AcceptSubmissionDto,
    bypassAssignee = false,
  ) {
    await this.getById(guildId, submissionId);
    const note = dto.note ?? dto.publicReason;
    const r = await decideSubmission(this.port(), {
      submissionId,
      guildId,
      reviewerId,
      decision: 'ACCEPTED',
      bypassAssignee,
      note,
      internalReason: dto.internalReason,
      dashboardUrl: this.dashboardUrl(),
    });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  async deny(guildId: string, submissionId: string, reviewerId: string, dto: DenySubmissionDto, bypassAssignee = false) {
    await this.getById(guildId, submissionId);
    const r = await decideSubmission(this.port(), {
      submissionId,
      guildId,
      reviewerId,
      decision: 'DENIED',
      bypassAssignee,
      reasonId: dto.reasonId,
      note: dto.note ?? dto.publicReason,
      internalReason: dto.internalReason,
      dashboardUrl: this.dashboardUrl(),
    });
    if (!r.ok) throw this.decisionError(r.message);
    return r;
  }

  /** Übernehmen (`assigneeId` = eigene ID), Freigeben (`null`) oder Zuweisen (nur mit „Zuständigkeit ändern“). */
  async assign(guildId: string, submissionId: string, actorId: string, assigneeId: string | null, canReassign: boolean) {
    await this.getById(guildId, submissionId);
    const r = await assignSubmission(this.port(), { submissionId, guildId, actorId, assigneeId, canReassign });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  /** Zurücknehmen durch das Team (Status WITHDRAWN, Grund Pflicht). */
  async withdraw(guildId: string, submissionId: string, actorId: string, reason: string | undefined) {
    await this.getById(guildId, submissionId);
    const r = await withdrawByStaff(this.port(), { submissionId, guildId, actorId, reason });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  /**
   * Export (CSV oder JSON) der Bewerbungen dieses Servers, optional nach Bewerbung, Status und Zeitraum gefiltert
   * (höchstens 5000 Zeilen, neueste zuerst). Der Export selbst wird protokolliert.
   */
  async export(
    guildId: string,
    userId: string,
    q: { format?: string; applicationId?: string; status?: string; from?: string; to?: string },
  ): Promise<{ filename: string; contentType: string; body: string }> {
    const gid = assertGuildId(guildId);
    const format = q.format === 'json' ? 'json' : q.format === 'csv' || !q.format ? 'csv' : null;
    if (!format) throw new BadRequestException('Format: csv oder json.');
    const date = (v: string | undefined) => {
      if (!v) return undefined;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Ungültiges Datum.');
      return d;
    };
    const from = date(q.from);
    const to = date(q.to);
    const status = q.status && (Object.values(SubmissionStatus) as string[]).includes(q.status) ? (q.status as SubmissionStatus) : undefined;
    if (q.status && !status) throw new BadRequestException('Unbekannter Status.');
    const subs = await prisma.applicationSubmission.findMany({
      where: {
        guildId: gid,
        isTest: false,
        submittedAt: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
        ...(q.applicationId ? { applicationId: q.applicationId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { submittedAt: 'desc' },
      take: EXPORT_LIMIT,
      include: { application: { select: { name: true } }, version: { select: { questions: true } }, answers: true },
    });
    const rows: ExportRow[] = subs.map((s) => {
      const raw = s.version.questions as unknown;
      const questions = (Array.isArray(raw) ? raw : ((raw as { questions?: unknown[] } | null)?.questions ?? [])) as ExportRow['questions'];
      return {
        id: s.id,
        submissionNumber: s.submissionNumber,
        applicationName: s.application.name,
        applicantName: s.displayNameSnapshot,
        userId: s.userId,
        status: s.status,
        submittedAt: s.submittedAt,
        decidedAt: s.acceptedAt ?? s.deniedAt,
        publicReason: s.publicReason,
        assigneeUserId: s.assigneeUserId,
        isTest: s.isTest,
        questions,
        answers: Object.fromEntries(s.answers.map((a) => [a.questionId, a.value])),
      };
    });
    await auditRepository.log({
      guildId: gid,
      actorId: userId,
      action: 'submissions.exported',
      resource: ['ApplicationSubmission', 'export'],
      after: { format, rows: rows.length, truncated: subs.length >= EXPORT_LIMIT, filter: { ...q } } as never,
      permission: 'applications.submissions.export',
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return format === 'json'
      ? { filename: `bewerbungen-${stamp}.json`, contentType: 'application/json; charset=utf-8', body: toExportJson(rows) }
      : { filename: `bewerbungen-${stamp}.csv`, contentType: 'text/csv; charset=utf-8', body: toExportCsv(rows) };
  }

  /** Bisherige Bewerbungen eines Discord-Benutzers auf diesem Server (neueste zuerst). */
  async byUser(guildId: string, userId: string) {
    return prisma.applicationSubmission.findMany({
      where: { guildId: assertGuildId(guildId), userId, isTest: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, submissionNumber: true, status: true, submittedAt: true, createdAt: true, deniedAt: true, acceptedAt: true, publicReason: true, application: { select: { name: true } } },
    });
  }

  async startReview(guildId: string, submissionId: string, reviewerId: string) {
    const r = await startReview(this.port(), { submissionId, guildId, reviewerId });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  async clarify(guildId: string, submissionId: string, reviewerId: string, text: string) {
    const r = await askClarification(this.port(), {
      submissionId,
      guildId,
      reviewerId,
      question: text,
    });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  async interview(guildId: string, submissionId: string, reviewerId: string, text: string) {
    const r = await inviteToInterview(this.port(), {
      submissionId,
      guildId,
      reviewerId,
      message: text,
    });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  /** Annahme-Schritte (mit Verfügbarkeit) und Standard-Ablehnungsgründe für die Einstellungen. */
  reviewOptions() {
    return { steps: describeAcceptPipeline(), defaultDenyReasons: DEFAULT_DENY_REASONS };
  }

  async createNote(guildId: string, submissionId: string, authorId: string, dto: CreateNoteDto) {
    const submission = await this.getById(guildId, submissionId);
    const note = await prisma.applicationNote.create({
      data: { submissionId: submission.id, authorId, content: dto.content },
    });
    await prisma.applicationAuditEvent.create({
      data: {
        guildId: assertGuildId(guildId),
        submissionId: submission.id,
        actorType: 'USER',
        actorId: authorId,
        action: 'note.created',
      },
    });
    return note;
  }

  async history(guildId: string, submissionId: string) {
    return prisma.applicationAuditEvent.findMany({
      where: { submissionId, guildId: assertGuildId(guildId) },
      orderBy: { createdAt: 'asc' },
    });
  }
}
