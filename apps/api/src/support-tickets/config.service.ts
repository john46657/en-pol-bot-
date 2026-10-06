import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { defaultTicketButtons, type TicketButtonConfig, type TicketQuestion } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DEFAULT_SETTINGS, settingsSchema, type CategoryInput, type PanelInput, type TicketSettings } from './config.schemas';
import type { z } from 'zod';
import type { prioritySchema, reasonSchema, statusSchema } from './config.schemas';

const SETTINGS_KEY = 'tickets.settings';
const json = (v: unknown) => v as Prisma.InputJsonValue;
/** Kopie ohne die genannten Felder (z. B. id/Zeitstempel beim Duplizieren). */
function omit<T extends object, K extends keyof T>(o: T, keys: K[]): Omit<T, K> {
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
}

/** Alles, was das Ticket-System konfigurierbar macht – ausschließlich Datenbank-Einträge. */
@Injectable()
export class TicketConfigService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private record(actor: Actor, action: string, entityType: string, entityId: string, after?: unknown) {
    return this.audit.record(actor, { action: `ticket.config.${action}`, module: 'tickets', entityType, entityId, after });
  }

  async all() {
    const [categories, panels, statuses, priorities, reasons, settings] = await Promise.all([
      this.prisma.ticketCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.prisma.ticketPanel.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }] }),
      this.statuses(), this.priorities(), this.reasons(), this.settings(),
    ]);
    return { categories: categories.map((c) => this.categoryOut(c)), panels, statuses, priorities, reasons, settings };
  }

  categoryOut<T extends { buttons: Prisma.JsonValue; questions: Prisma.JsonValue }>(c: T) {
    const buttons = (Array.isArray(c.buttons) && c.buttons.length ? c.buttons : defaultTicketButtons()) as unknown as TicketButtonConfig[];
    return { ...c, buttons, questions: (c.questions ?? []) as unknown as TicketQuestion[] };
  }
  statuses() { return this.prisma.ticketStatus.findMany({ orderBy: { position: 'asc' } }); }
  priorities() { return this.prisma.ticketPriority.findMany({ orderBy: { position: 'asc' } }); }
  reasons() { return this.prisma.ticketCloseReason.findMany({ orderBy: { position: 'asc' } }); }
  async settings(): Promise<TicketSettings> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }))?.value;
    const p = v ? settingsSchema.safeParse(v) : null;
    return p?.success ? p.data : DEFAULT_SETTINGS;
  }
  async category(id: string) {
    const c = await this.prisma.ticketCategory.findUnique({ where: { id } });
    if (!c) throw new AppError('NOT_FOUND', 'Ticket category not found.');
    return this.categoryOut(c);
  }

  // ---- Kategorien ----
  async saveCategory(actor: Actor, id: string | null, d: CategoryInput) {
    await this.checkRefs(d.defaultPriorityId, d.escalationPriorityId);
    const data = { ...d, questions: json(d.questions), buttons: json(d.buttons.length ? d.buttons : defaultTicketButtons()) };
    const c = id ? await this.prisma.ticketCategory.update({ where: { id }, data }).catch(() => { throw new AppError('NOT_FOUND', 'Ticket category not found.'); })
      : await this.prisma.ticketCategory.create({ data });
    await this.record(actor, id ? 'category.update' : 'category.create', 'TicketCategory', c.id, { name: c.name });
    return this.categoryOut(c);
  }
  async duplicateCategory(actor: Actor, id: string) {
    const rest = omit(await this.prisma.ticketCategory.findUniqueOrThrow({ where: { id } }).catch(() => { throw new AppError('NOT_FOUND', 'Ticket category not found.'); }), ['id', 'createdAt', 'updatedAt']);
    const c = await this.prisma.ticketCategory.create({ data: { ...rest, name: `${rest.name} (Kopie)`, questions: json(rest.questions), buttons: json(rest.buttons) } });
    await this.record(actor, 'category.duplicate', 'TicketCategory', c.id, { from: id });
    return this.categoryOut(c);
  }
  async deleteCategory(actor: Actor, id: string) {
    if (await this.prisma.supportTicket.count({ where: { categoryId: id, deletedAt: null, closedAt: null } })) throw new AppError('CONFLICT', 'This category still has open tickets. Close them or deactivate the category instead.');
    await this.prisma.ticketCategory.delete({ where: { id } }).catch(() => { throw new AppError('NOT_FOUND', 'Ticket category not found.'); });
    const panels = await this.prisma.ticketPanel.findMany({ where: { categoryIds: { has: id } } });
    for (const p of panels) await this.prisma.ticketPanel.update({ where: { id: p.id }, data: { categoryIds: p.categoryIds.filter((c) => c !== id) } });
    await this.record(actor, 'category.delete', 'TicketCategory', id);
  }

  // ---- Panels ----
  async savePanel(actor: Actor, id: string | null, d: PanelInput) {
    if (d.categoryIds.length && (await this.prisma.ticketCategory.count({ where: { id: { in: d.categoryIds } } })) !== new Set(d.categoryIds).size) throw new AppError('VALIDATION_FAILED', 'Unknown ticket category in panel.');
    const p = id ? await this.prisma.ticketPanel.update({ where: { id }, data: d }).catch(() => { throw new AppError('NOT_FOUND', 'Panel not found.'); })
      : await this.prisma.ticketPanel.create({ data: d });
    await this.record(actor, id ? 'panel.update' : 'panel.create', 'TicketPanel', p.id, { name: p.name });
    return p;
  }
  async duplicatePanel(actor: Actor, id: string) {
    const rest = omit(await this.prisma.ticketPanel.findUniqueOrThrow({ where: { id } }).catch(() => { throw new AppError('NOT_FOUND', 'Panel not found.'); }), ['id', 'createdAt', 'updatedAt', 'messageId', 'messageChannelId']);
    const p = await this.prisma.ticketPanel.create({ data: { ...rest, name: `${rest.name} (Kopie)` } });
    await this.record(actor, 'panel.duplicate', 'TicketPanel', p.id, { from: id });
    return p;
  }
  async deletePanel(actor: Actor, id: string) {
    await this.prisma.ticketPanel.delete({ where: { id } }).catch(() => { throw new AppError('NOT_FOUND', 'Panel not found.'); });
    await this.record(actor, 'panel.delete', 'TicketPanel', id);
  }

  // ---- Status / Prioritäten / Schließungsgründe ----
  async saveStatus(actor: Actor, id: string | null, d: z.infer<typeof statusSchema>) {
    const s = await this.prisma.$transaction(async (tx) => {
      // genau ein Status je Rolle (Standard, Übernommen, Eskaliert, Schließen)
      for (const flag of ['isDefault', 'isClaimed', 'isEscalation', 'isClose'] as const) if (d[flag]) await tx.ticketStatus.updateMany({ where: { [flag]: true, ...(id ? { id: { not: id } } : {}) }, data: { [flag]: false } });
      if (d.isDefault && d.kind !== 'OPEN') throw new AppError('VALIDATION_FAILED', 'The default status must be an open status.');
      if (d.isClose && d.kind !== 'CLOSED') throw new AppError('VALIDATION_FAILED', 'The close status must be a closed status.');
      return id ? tx.ticketStatus.update({ where: { id }, data: d }) : tx.ticketStatus.create({ data: d });
    });
    await this.record(actor, id ? 'status.update' : 'status.create', 'TicketStatus', s.id, { name: s.name });
    return s;
  }
  async deleteStatus(actor: Actor, id: string) {
    if (await this.prisma.supportTicket.count({ where: { statusId: id } })) throw new AppError('CONFLICT', 'Status is in use by tickets.');
    const s = await this.prisma.ticketStatus.findUnique({ where: { id } });
    if (!s) throw new AppError('NOT_FOUND', 'Status not found.');
    if (s.isDefault || s.isClose) throw new AppError('CONFLICT', 'Choose another default/close status first.');
    await this.prisma.ticketStatus.delete({ where: { id } });
    await this.record(actor, 'status.delete', 'TicketStatus', id);
  }
  async savePriority(actor: Actor, id: string | null, d: z.infer<typeof prioritySchema>) {
    const p = await this.prisma.$transaction(async (tx) => {
      if (d.isDefault) await tx.ticketPriority.updateMany({ where: { isDefault: true, ...(id ? { id: { not: id } } : {}) }, data: { isDefault: false } });
      return id ? tx.ticketPriority.update({ where: { id }, data: d }) : tx.ticketPriority.create({ data: d });
    });
    await this.record(actor, id ? 'priority.update' : 'priority.create', 'TicketPriority', p.id, { name: p.name });
    return p;
  }
  async deletePriority(actor: Actor, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.updateMany({ where: { priorityId: id }, data: { priorityId: null } });
      await tx.ticketCategory.updateMany({ where: { defaultPriorityId: id }, data: { defaultPriorityId: null } });
      await tx.ticketCategory.updateMany({ where: { escalationPriorityId: id }, data: { escalationPriorityId: null } });
      await tx.ticketPriority.delete({ where: { id } });
    }).catch((e) => { throw e instanceof AppError ? e : new AppError('NOT_FOUND', 'Priority not found.'); });
    await this.record(actor, 'priority.delete', 'TicketPriority', id);
  }
  async saveReason(actor: Actor, id: string | null, d: z.infer<typeof reasonSchema>) {
    const r = id ? await this.prisma.ticketCloseReason.update({ where: { id }, data: d }) : await this.prisma.ticketCloseReason.create({ data: d });
    await this.record(actor, id ? 'reason.update' : 'reason.create', 'TicketCloseReason', r.id, { text: r.text });
    return r;
  }
  async deleteReason(actor: Actor, id: string) {
    await this.prisma.ticketCloseReason.delete({ where: { id } }).catch(() => { throw new AppError('NOT_FOUND', 'Reason not found.'); });
    await this.record(actor, 'reason.delete', 'TicketCloseReason', id);
  }
  async saveSettings(actor: Actor, s: TicketSettings) {
    await this.prisma.systemSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: json(s) }, update: { value: json(s) } });
    await this.record(actor, 'settings.update', 'SystemSetting', SETTINGS_KEY);
    return s;
  }

  private async checkRefs(...ids: (string | null | undefined)[]) {
    const want = ids.filter((x): x is string => !!x);
    if (want.length && (await this.prisma.ticketPriority.count({ where: { id: { in: want } } })) !== new Set(want).size) throw new AppError('VALIDATION_FAILED', 'Unknown priority.');
  }
}
