import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus } from '@nexus/types';
import { prisma, assertGuildId, Prisma } from '@nexus/database';
import {
  applicationConfigSchema,
  checkQuestionsForPublish,
  validateApplicationPublish,
} from '@nexus/validation';
import type { Question } from '@nexus/types';
import { jsonInput } from '../../../common/utils/json.js';
import type { CreateApplicationDto, UpdateApplicationDto } from '../dto/applications.dto.js';

/**
 * ApplicationService (§146: Service-Grenzen, keine God-Class).
 *
 * Jede Methode ist Guild-scoped (§113). Versionierung: beim Publish wird
 * ein Snapshot aller Fragen angelegt (§65); Submissions bleiben immer auf
 * der Version, mit der sie erstellt wurden.
 */
@Injectable()
export class ApplicationsService {
  async list(
    guildId: string,
    query: { search?: string; status?: ApplicationStatus; page?: number; limit?: number },
  ) {
    const g = assertGuildId(guildId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);

    const [items, total] = await Promise.all([
      prisma.application.findMany({
        where: {
          guildId: g,
          ...(query.status ? { status: query.status } : {}),
          ...(query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { slug: { contains: query.search } },
                ],
              }
            : {}),
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { submissions: true } } },
      }),
      prisma.application.count({
        where: {
          guildId: g,
          ...(query.status ? { status: query.status } : {}),
          ...(query.search
            ? {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { slug: { contains: query.search } },
                ],
              }
            : {}),
        },
      }),
    ]);

    return { items, total, page, limit };
  }

  async getById(guildId: string, applicationId: string) {
    const application = await prisma.application.findFirst({
      where: { id: applicationId, guildId: assertGuildId(guildId) },
      include: { versions: { orderBy: { version: 'desc' }, take: 10 } },
    });
    if (!application) throw new NotFoundException('Application nicht gefunden.');
    return application;
  }

  async create(guildId: string, dto: CreateApplicationDto, userId: string) {
    const slug = dto.slug ?? slugify(dto.name);
    if (!slug)
      throw new BadRequestException(
        'Aus dem Namen lässt sich kein gültiger Slug bilden – bitte einen angeben.',
      );
    if (
      await prisma.application.findFirst({
        where: { guildId: assertGuildId(guildId), slug },
        select: { id: true },
      })
    ) {
      throw new ConflictException(`Die Kurzbezeichnung „${slug}“ ist schon vergeben.`);
    }
    return prisma.application.create({
      data: {
        guildId: assertGuildId(guildId),
        name: dto.name,
        slug,
        description: dto.description ?? null,
        icon: dto.icon ?? null,
        image: dto.image ?? null,
        color: dto.color ?? null,
        status: ApplicationStatus.DRAFT,
        config: {
          requirements: { enabled: false },
          messages: {},
          embed: {},
          stats: {},
          review: {},
          advanced: {},
          roleRules: [],
          questions: [],
        },
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async update(guildId: string, applicationId: string, dto: UpdateApplicationDto, userId: string) {
    const existing = await this.getById(guildId, applicationId);
    const { config, idPrefix, ...rest } = dto;
    let nextConfig: Record<string, unknown> | undefined;
    if (config) {
      // Fragen werden ausschließlich über den Fragen-Builder geändert (dort validiert, gesperrt, auditiert).
      const { questions: _ignored, ...incoming } = config as Record<string, unknown>;
      const parsed = applicationConfigSchema
        .omit({ questions: true })
        .partial()
        .safeParse(incoming);
      if (!parsed.success) {
        throw new BadRequestException(
          parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
        );
      }
      const current = (existing.config ?? {}) as Record<string, unknown>;
      nextConfig = { ...current, ...parsed.data, questions: current['questions'] ?? [] };
    }
    return prisma.application.update({
      where: { id: existing.id },
      data: {
        ...rest,
        ...(idPrefix !== undefined ? { idPrefix: idPrefix.trim().toUpperCase() || null } : {}),
        updatedBy: userId,
        ...(nextConfig ? { config: jsonInput(nextConfig) } : {}),
      } as Prisma.ApplicationUpdateInput,
    });
  }

  async delete(guildId: string, applicationId: string, userId: string): Promise<void> {
    const existing = await this.getById(guildId, applicationId);
    await prisma.application.delete({ where: { id: existing.id } });
    await prisma.applicationAuditEvent.create({
      data: {
        guildId: assertGuildId(guildId),
        applicationId: existing.id,
        actorType: 'USER',
        actorId: userId,
        action: 'application.deleted',
      },
    });
  }

  /**
   * Publish (§97): Validierungs-Checklist muss vollständig erfüllt sein,
   * sonst wird der Publish blockiert. Beim Publish entsteht eine neue
   * Version mit Snapshot aller Fragen (§65).
   */
  async publish(guildId: string, applicationId: string, userId: string) {
    const application = await this.getById(guildId, applicationId);
    const config = (application.config ?? {}) as {
      questions?: Array<{
        id: string;
        type: string;
        title: string;
        required: boolean;
      }>;
      review?: { submissionChannelId?: string };
    };
    const check = validateApplicationPublish({
      name: application.name,
      questions: config.questions ?? [],
      ...(config.review !== undefined ? { review: config.review } : {}),
    });
    const errors = [
      ...check.errors,
      ...checkQuestionsForPublish((config.questions ?? []) as unknown as Question[]),
    ];
    if (errors.length > 0) {
      return { ok: false as const, errors };
    }

    const nextVersion = (application.versions[0]?.version ?? 0) + 1;
    const version = await prisma.applicationVersion.create({
      data: {
        applicationId: application.id,
        version: nextVersion,
        questions: jsonInput(config),
        changelog: `Published v${nextVersion}`,
        publishedById: userId,
      },
    });

    const updated = await prisma.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.PUBLISHED, publishedAt: new Date(), updatedBy: userId },
    });

    await prisma.applicationAuditEvent.create({
      data: {
        guildId: assertGuildId(guildId),
        applicationId: application.id,
        actorType: 'USER',
        actorId: userId,
        action: 'application.published',
        after: { version: nextVersion },
      },
    });

    return { ok: true as const, application: updated, version };
  }

  async setStatus(
    guildId: string,
    applicationId: string,
    status: ApplicationStatus,
    userId: string,
  ) {
    const application = await this.getById(guildId, applicationId);
    return prisma.application.update({
      where: { id: application.id },
      data: { status, updatedBy: userId },
    });
  }

  /** Duplicate (§99): kopiert alles außer Submissions/Audit/Cooldowns. */
  async duplicate(guildId: string, applicationId: string, userId: string) {
    const application = await this.getById(guildId, applicationId);
    let slug = `${application.slug}-kopie`.slice(0, 60);
    for (
      let n = 2;
      await prisma.application.findFirst({
        where: { guildId: assertGuildId(guildId), slug },
        select: { id: true },
      });
      n++
    ) {
      slug = `${application.slug.slice(0, 50)}-kopie-${n}`;
    }
    return prisma.application.create({
      data: {
        guildId: assertGuildId(guildId),
        name: `${application.name} (Kopie)`,
        slug,
        description: application.description,
        icon: application.icon,
        image: application.image,
        color: application.color,
        status: ApplicationStatus.DRAFT,
        config: jsonInput(application.config ?? {}),
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
