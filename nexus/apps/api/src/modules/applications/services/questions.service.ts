import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { assertGuildId, Prisma, prisma } from '@nexus/database';
import type { Question } from '@nexus/types';
import {
  BUILDER_QUESTION_TYPES,
  QuestionBuilderError,
  addQuestion,
  moveQuestion,
  removeQuestion,
  updateQuestion,
} from '@nexus/validation';
import { jsonInput } from '../../../common/utils/json.js';

type Tx = Prisma.TransactionClient;
interface Result<T> {
  questions: Question[];
  value: T;
  audit: { action: string; before?: unknown; after?: unknown };
}

/**
 * Fragen-Builder (Phase 8). Die Fragen liegen als sortierte Liste in `Application.config.questions`
 * (dieser Stand wird beim Veröffentlichen als Version eingefroren – laufende Bewerbungen bleiben unberührt).
 * Jede Änderung ist eine Transaktion mit Zeilensperre, damit parallele Bearbeitungen nichts überschreiben.
 */
@Injectable()
export class QuestionsService {
  async list(guildId: string, applicationId: string) {
    const app = await this.load(prisma, guildId, applicationId);
    const questions = readQuestions(app.config);
    const latest = await prisma.applicationVersion.findFirst({
      where: { applicationId: app.id },
      orderBy: { version: 'desc' },
      select: { version: true, questions: true },
    });
    const published = latest ? readQuestions(latest.questions) : null;
    return {
      questions,
      types: BUILDER_QUESTION_TYPES,
      publishedVersion: latest?.version ?? null,
      unpublishedChanges:
        published === null
          ? questions.length > 0
          : JSON.stringify(published) !== JSON.stringify(questions),
    };
  }

  create(
    guildId: string,
    applicationId: string,
    userId: string,
    input: unknown,
    position?: number,
  ) {
    return this.mutate(guildId, applicationId, userId, (list) => {
      const r = addQuestion(list, input, position);
      return {
        questions: r.list,
        value: r.question,
        audit: { action: 'question.created', after: r.question },
      };
    });
  }

  update(
    guildId: string,
    applicationId: string,
    userId: string,
    questionId: string,
    input: unknown,
  ) {
    return this.mutate(guildId, applicationId, userId, (list) => {
      const before = list.find((q) => q.id === questionId);
      const r = updateQuestion(list, questionId, input);
      return {
        questions: r.list,
        value: r.question,
        audit: { action: 'question.updated', before, after: r.question },
      };
    });
  }

  remove(guildId: string, applicationId: string, userId: string, questionId: string) {
    return this.mutate(guildId, applicationId, userId, (list) => {
      const r = removeQuestion(list, questionId);
      return {
        questions: r.list,
        value: r.removed,
        audit: { action: 'question.deleted', before: r.removed },
      };
    });
  }

  move(
    guildId: string,
    applicationId: string,
    userId: string,
    questionId: string,
    toIndex: number,
  ) {
    return this.mutate(guildId, applicationId, userId, (list) => {
      const before = list.findIndex((q) => q.id === questionId);
      const r = moveQuestion(list, questionId, toIndex);
      return {
        questions: r.list,
        value: r.list.find((q) => q.id === questionId),
        audit: { action: 'question.moved', before: { index: before }, after: { index: toIndex } },
      };
    });
  }

  // --- intern -----------------------------------------------------------------

  private async mutate<T>(
    guildId: string,
    applicationId: string,
    userId: string,
    op: (list: Question[]) => Result<T>,
  ) {
    try {
      return await prisma.$transaction(async (tx) => {
        const app = await this.load(tx, guildId, applicationId, true);
        const config = (app.config ?? {}) as Record<string, unknown>;
        const result = op(readQuestions(config));
        await tx.application.update({
          where: { id: app.id },
          data: {
            config: jsonInput({ ...config, questions: result.questions }),
            updatedBy: userId,
          },
        });
        await tx.applicationAuditEvent.create({
          data: {
            guildId: assertGuildId(guildId),
            applicationId: app.id,
            actorType: 'USER',
            actorId: userId,
            action: result.audit.action,
            ...(result.audit.before !== undefined
              ? { before: jsonInput(result.audit.before) }
              : {}),
            ...(result.audit.after !== undefined ? { after: jsonInput(result.audit.after) } : {}),
          },
        });
        return { questions: result.questions, question: result.value };
      });
    } catch (e) {
      if (e instanceof QuestionBuilderError) throw mapError(e);
      throw e;
    }
  }

  private async load(db: Tx | typeof prisma, guildId: string, applicationId: string, lock = false) {
    const g = assertGuildId(guildId);
    if (lock)
      await (db as Tx)
        .$queryRaw`SELECT 1 FROM applications WHERE id = ${applicationId} AND "guildId" = ${g} FOR UPDATE`;
    const app = await db.application.findFirst({ where: { id: applicationId, guildId: g } });
    if (!app) throw new NotFoundException('Bewerbung nicht gefunden.');
    return app;
  }
}

export function readQuestions(json: unknown): Question[] {
  const raw =
    json && typeof json === 'object' ? (json as { questions?: unknown }).questions : undefined;
  return Array.isArray(raw) ? ([...raw] as Question[]).sort((a, b) => a.order - b.order) : [];
}

function mapError(e: QuestionBuilderError) {
  const body = { message: e.details?.length ? [e.message, ...e.details] : e.message };
  switch (e.code) {
    case 'not-found':
      return new NotFoundException(e.message);
    case 'conflict':
      return new ConflictException(body);
    default:
      return new BadRequestException(body);
  }
}
