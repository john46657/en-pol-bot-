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
  decideSubmission,
  describeAcceptPipeline,
  inviteToInterview,
  restDiscordPort,
  startReview,
} from '@nexus/automation';
import { SubmissionStatus } from '@nexus/types';
import { prisma, assertGuildId } from '@nexus/database';
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
  ) {
    await this.getById(guildId, submissionId);
    const note = dto.note ?? dto.publicReason;
    const r = await decideSubmission(this.port(), {
      submissionId,
      guildId,
      reviewerId,
      decision: 'ACCEPTED',
      note,
      internalReason: dto.internalReason,
      dashboardUrl: this.dashboardUrl(),
    });
    if (!r.ok) throw new ConflictException(r.message);
    return r;
  }

  async deny(guildId: string, submissionId: string, reviewerId: string, dto: DenySubmissionDto) {
    await this.getById(guildId, submissionId);
    const r = await decideSubmission(this.port(), {
      submissionId,
      guildId,
      reviewerId,
      decision: 'DENIED',
      reasonId: dto.reasonId,
      note: dto.note ?? dto.publicReason,
      internalReason: dto.internalReason,
      dashboardUrl: this.dashboardUrl(),
    });
    if (!r.ok) throw this.decisionError(r.message);
    return r;
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
