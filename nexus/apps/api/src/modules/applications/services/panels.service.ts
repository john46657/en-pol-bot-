import { Injectable, NotFoundException } from '@nestjs/common';
import { prisma, assertGuildId, Prisma } from '@nexus/database';
import { jsonInput } from '../../../common/utils/json.js';
import type { CreatePanelDto, UpdatePanelDto } from '../dto/panels.dto.js';

/**
 * PanelsService (§40/§41/§42) – Guild-scoped (§113).
 *
 * Panels verlinken eine Discord-Nachricht mit mehreren Applications. Die API
 * verwaltet ausschließlich die Konfiguration; das Rendering und Posten der
 * Nachricht übernimmt der Bot (messageId wird von ihm nach dem Posten
 * gepflegt).
 */
@Injectable()
export class PanelsService {
  async list(guildId: string) {
    return prisma.applicationPanel.findMany({
      where: { guildId: assertGuildId(guildId) },
      include: {
        applications: {
          include: { application: { select: { id: true, name: true, slug: true, status: true } } },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(guildId: string, panelId: string) {
    const panel = await prisma.applicationPanel.findFirst({
      where: { id: panelId, guildId: assertGuildId(guildId) },
      include: { applications: { orderBy: { order: 'asc' } } },
    });
    if (!panel) throw new NotFoundException('Panel nicht gefunden.');
    return panel;
  }

  async create(guildId: string, dto: CreatePanelDto) {
    const g = assertGuildId(guildId);
    return prisma.$transaction(async (tx) => {
      const panel = await tx.applicationPanel.create({
        data: {
          guildId: g,
          channelId: dto.channelId,
          title: dto.title,
          description: dto.description ?? null,
          embed: jsonInput(dto.embed ?? {}),
          layout: dto.layout ?? 'button',
          buttonLabel: dto.buttonLabel ?? null,
          buttonEmoji: dto.buttonEmoji ?? null,
        },
      });
      if (dto.applicationIds && dto.applicationIds.length > 0) {
        await tx.applicationPanelApplication.createMany({
          data: dto.applicationIds.map((applicationId, order) => ({
            panelId: panel.id,
            applicationId,
            order,
          })),
        });
      }
      return panel;
    });
  }

  async update(guildId: string, panelId: string, dto: UpdatePanelDto) {
    const existing = await this.getById(guildId, panelId);
    return prisma.$transaction(async (tx) => {
      const panel = await tx.applicationPanel.update({
        where: { id: existing.id },
        data: {
          ...(dto.channelId !== undefined ? { channelId: dto.channelId } : {}),
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.embed !== undefined ? { embed: jsonInput(dto.embed) } : {}),
          ...(dto.layout !== undefined ? { layout: dto.layout } : {}),
          ...(dto.buttonLabel !== undefined ? { buttonLabel: dto.buttonLabel } : {}),
          ...(dto.buttonEmoji !== undefined ? { buttonEmoji: dto.buttonEmoji } : {}),
        } as Prisma.ApplicationPanelUpdateInput,
      });
      if (dto.applicationIds !== undefined) {
        await tx.applicationPanelApplication.deleteMany({ where: { panelId: panel.id } });
        if (dto.applicationIds.length > 0) {
          await tx.applicationPanelApplication.createMany({
            data: dto.applicationIds.map((applicationId, order) => ({
              panelId: panel.id,
              applicationId,
              order,
            })),
          });
        }
      }
      return panel;
    });
  }

  async delete(guildId: string, panelId: string): Promise<void> {
    const existing = await this.getById(guildId, panelId);
    await prisma.applicationPanel.delete({ where: { id: existing.id } });
  }
}
