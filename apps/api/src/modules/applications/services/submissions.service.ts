import { Injectable, NotFoundException } from '@nestjs/common';
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

  /** Accept (§30) – Statusmaschine wird über den Bot/Worker ausgeführt;
   *  die API erlaubt die Decision mit Gründen. */
  async accept(
    guildId: string,
    submissionId: string,
    reviewerId: string,
    dto: AcceptSubmissionDto,
  ) {
    const submission = await this.getById(guildId, submissionId);
    if (submission.status === SubmissionStatus.ACCEPTED) {
      return { ok: false, message: 'Diese Bewerbung wurde bereits angenommen.' };
    }
    return this.decide(submission.id, SubmissionStatus.ACCEPTED, reviewerId, dto);
  }

  async deny(guildId: string, submissionId: string, reviewerId: string, dto: DenySubmissionDto) {
    const submission = await this.getById(guildId, submissionId);
    if (submission.status === SubmissionStatus.DENIED) {
      return { ok: false, message: 'Diese Bewerbung wurde bereits abgelehnt.' };
    }
    return this.decide(submission.id, SubmissionStatus.DENIED, reviewerId, dto);
  }

  private async decide(
    submissionId: string,
    status: Extract<SubmissionStatus, 'ACCEPTED' | 'DENIED'>,
    reviewerId: string,
    dto: { publicReason?: string; internalReason?: string },
  ) {
    const now = new Date();
    const updated = await prisma.applicationSubmission.update({
      where: { id: submissionId },
      data: {
        status,
        reviewerUserId: reviewerId,
        ...(status === SubmissionStatus.ACCEPTED ? { acceptedAt: now } : { deniedAt: now }),
        ...(dto.publicReason !== undefined ? { publicReason: dto.publicReason } : {}),
        ...(dto.internalReason !== undefined ? { internalReason: dto.internalReason } : {}),
      },
    });
    await prisma.applicationAuditEvent.create({
      data: {
        guildId: updated.guildId,
        submissionId: updated.id,
        actorType: 'USER',
        actorId: reviewerId,
        action: status === SubmissionStatus.ACCEPTED ? 'submission.accepted' : 'submission.denied',
        after: { publicReason: dto.publicReason, internalReason: dto.internalReason },
      },
    });
    return { ok: true, submission: updated };
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
