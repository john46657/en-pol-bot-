import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { customIdsOf, mbDocumentDataSchema, mbFromDiscordJson, type MbAction, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { unscoped } from '../common/guild-context';
import { MessageBuilderService, requireGuild, sf } from './message-builder.service';
import { MessageBuilderSendService, type EditTarget } from './message-builder-send.service';

/** Discord-Nachrichtenlink: https://discord.com/channels/<Server>/<Kanal>/<Nachricht> (auch ptb/canary/discordapp). */
export const MESSAGE_LINK = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/channels\/(\d{15,25})\/(\d{15,25})\/(\d{15,25})\/?$/;
export const loadLinkSchema = z.object({ link: z.string().trim().max(200).regex(MESSAGE_LINK, 'Kein gültiger Discord-Nachrichtenlink (Rechtsklick auf die Nachricht → „Nachrichtenlink kopieren“).'), name: z.string().trim().max(100).optional() });
export const renameSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const editSchema = z.object({ data: mbDocumentDataSchema, confirm: z.literal(true, { errorMap: () => ({ message: 'Bearbeitung bitte bestätigen.' }) }) });
export const messagesQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), q: z.string().trim().max(100).optional() });
/** Antwort des Bots auf „Nachricht laden“. */
export const loadedSchema = z.object({
  ok: z.boolean(),
  error: z.string().max(500).optional(),
  /** bot = vom Bot selbst, webhook = von einem Webhook (Discord-ID), other = fremd */
  author: z.enum(['bot', 'webhook', 'other']).optional(),
  webhookId: sf.optional(),
  /** Kanal, in dem die Nachricht liegt; parentId, wenn das ein Thread ist */
  channelId: sf.optional(),
  parentId: sf.nullable().optional(),
  channelName: z.string().max(100).optional(),
  message: z.object({ content: z.string().max(4000).optional(), embeds: z.array(z.unknown()).max(10).optional(), components: z.array(z.unknown()).max(10).optional() }).optional(),
});

type Row = Prisma.MessageBuilderMessageGetPayload<object>;

/**
 * Gespeicherte Discord-Nachrichten des Embed Builders: Links zu gesendeten Nachrichten, per Link geladene Bot-/Webhook-Nachrichten,
 * Bearbeiten (mit Vorschau im Dashboard), Duplizieren/erneut senden (als neuer Entwurf im Dashboard).
 *
 * Rechte: `messagebuilder.edit` für eigene (von dir gesendete) Nachrichten, `messagebuilder.edit_others` für Nachrichten anderer
 * und für per Link geladene Nachrichten, deren Absender im Dashboard unbekannt ist. Bearbeiten kann ohnehin nur der Absender:
 * der Bot seine eigenen Nachrichten, ein Webhook die eigenen (Discord erzwingt das zusätzlich).
 */
@Injectable()
export class MessageBuilderMessagesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly mb: MessageBuilderService, private readonly send: MessageBuilderSendService) {}

  private async row(id: string) {
    const r = await this.prisma.messageBuilderMessage.findFirst({ where: { id, guildId: requireGuild(), archivedAt: null } });
    if (!r) throw new AppError('NOT_FOUND', 'Gespeicherte Nachricht nicht gefunden.');
    return r;
  }
  /** Darf die Person diese Nachricht bearbeiten (eigene vs. fremde)? */
  private async mayEdit(actor: Actor, r: Pick<Row, 'sentById'>) {
    const uid = actor.userId!;
    if (!(await this.perms.has(uid, 'messagebuilder.edit'))) return false;
    return r.sentById === uid || this.perms.has(uid, 'messagebuilder.edit_others');
  }
  private async assertEdit(actor: Actor, r: Pick<Row, 'sentById'>) {
    await this.perms.assert(actor.userId!, 'messagebuilder.edit');
    if (r.sentById !== actor.userId) await this.perms.assert(actor.userId!, 'messagebuilder.edit_others');
  }
  /** Ansehen: Historie, Bearbeiten oder eigene Nachricht. */
  private async assertView(actor: Actor, r?: Pick<Row, 'sentById'>) {
    const uid = actor.userId!;
    if (r && r.sentById === uid) return;
    if (await this.perms.has(uid, 'messagebuilder.history')) return;
    if (await this.perms.has(uid, 'messagebuilder.edit_others')) return;
    if (!r && (await this.perms.has(uid, 'messagebuilder.edit'))) return; // Liste: nur eigene
    throw new AppError('PERMISSION_DENIED', 'Dafür fehlt das Recht „Versandhistorie“ bzw. „Nachrichten anderer bearbeiten“.');
  }

  private view(r: Row, canEdit: boolean, withData = false) {
    const data = mbDocumentDataSchema.safeParse(r.data);
    return {
      id: r.id, name: r.name, channelId: r.channelId, channelName: r.channelName, threadId: r.threadId, messageId: r.messageId, mode: r.mode, webhookId: r.webhookId,
      sendId: r.sendId, status: r.status, error: r.error, sentById: r.sentById, createdByName: r.createdByName, createdAt: r.createdAt, lastEditedAt: r.lastEditedAt,
      link: r.guildId ? `https://discord.com/channels/${r.guildId}/${r.channelId}/${r.messageId}` : null, canEdit: canEdit && r.status === 'READY' && data.success,
      foreignComponents: (r.keptCustomIds as unknown as string[]).length, ...(withData ? { data: data.success ? data.data : null } : {}),
    };
  }

  async list(actor: Actor, q: z.infer<typeof messagesQuery>) {
    await this.assertView(actor);
    const uid = actor.userId!;
    const all = (await this.perms.has(uid, 'messagebuilder.history')) || (await this.perms.has(uid, 'messagebuilder.edit_others'));
    const where: Prisma.MessageBuilderMessageWhereInput = { guildId: requireGuild(), archivedAt: null, ...(all ? {} : { sentById: uid }), ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { channelName: { contains: q.q, mode: 'insensitive' } }, { messageId: q.q }] } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.messageBuilderMessage.count({ where }),
      this.prisma.messageBuilderMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    const canEdit = await this.perms.has(uid, 'messagebuilder.edit'), canOthers = await this.perms.has(uid, 'messagebuilder.edit_others');
    return { items: rows.map((r) => this.view(r, canEdit && (r.sentById === uid || canOthers))), total, page: q.page, pageSize: q.pageSize };
  }
  async get(actor: Actor, id: string) {
    const r = await this.row(id);
    await this.assertView(actor, r);
    return this.view(r, await this.mayEdit(actor, r), true);
  }
  async rename(actor: Actor, id: string, b: z.infer<typeof renameSchema>) {
    const r = await this.row(id);
    await this.assertEdit(actor, r);
    await this.prisma.messageBuilderMessage.update({ where: { id }, data: { name: b.name } });
    return this.get(actor, id);
  }
  /** Link entfernen (archivieren) – die Discord-Nachricht selbst bleibt unverändert. */
  async remove(actor: Actor, id: string) {
    const r = await this.row(id);
    await this.assertEdit(actor, r);
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderMessage.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.audit.record(actor, { action: 'messagebuilder.message_unlink', module: 'messagebuilder', entityType: 'MessageBuilderMessage', entityId: id, before: { messageId: r.messageId, name: r.name } }, tx);
    });
  }

  /** Nachricht per Link laden: der Bot holt sie ab (nur eigene Bot- oder Webhook-Nachrichten des gewählten Servers). */
  async loadByLink(actor: Actor, userName: string, b: z.infer<typeof loadLinkSchema>) {
    await this.perms.assert(actor.userId!, 'messagebuilder.edit');
    const [, guildId, channelId, messageId] = MESSAGE_LINK.exec(b.link)!;
    if (guildId !== requireGuild()) throw new AppError('VALIDATION_FAILED', 'Diese Nachricht liegt auf einem anderen Discord-Server als dem gewählten.');
    // Über den Embed Builder gesendet? Dann ist der Absender bekannt (eigene Nachricht)
    const item = await this.prisma.messageBuilderSendItem.findFirst({ where: { messageId: messageId!, status: 'SENT', send: { guildId } }, include: { send: true } });
    const server = await this.mb.serverInfo();
    const r = await this.prisma.$transaction(async (tx) => {
      const r = await tx.messageBuilderMessage.create({ data: {
        guildId, name: b.name || `Nachricht ${messageId}`, channelId: channelId!, channelName: server.channels.find((c) => c.id === channelId)?.name ?? server.threads.find((t) => t.id === channelId)?.name ?? null,
        messageId: messageId!, mode: 'BOT', status: 'LOADING', sentById: item?.send.createdById ?? null, createdById: actor.userId, createdByName: userName, sendId: item?.sendId ?? null, position: item?.position ?? null,
      } });
      await tx.discordOutbox.create({ data: { type: 'mb.fetch', channelKey: 'announcements', payload: { id: r.id } } });
      await this.audit.record(actor, { action: 'messagebuilder.message_load', module: 'messagebuilder', entityType: 'MessageBuilderMessage', entityId: r.id, after: { channelId, messageId } }, tx);
      return r;
    });
    return this.view(r, false);
  }
  /** Inhalt erneut aus Discord laden (z. B. nachdem jemand die Nachricht in Discord geändert hat). */
  async reload(actor: Actor, id: string) {
    const r = await this.row(id);
    await this.assertEdit(actor, r);
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderMessage.update({ where: { id }, data: { status: 'LOADING', error: null } });
      await tx.discordOutbox.create({ data: { type: 'mb.fetch', channelKey: 'announcements', payload: { id } } });
    });
    return this.get(actor, id);
  }

  /** Bearbeiten einreihen (Vorschau/Bestätigung im Dashboard). */
  async edit(actor: Actor, userName: string, id: string, b: z.infer<typeof editSchema>) {
    const r = await this.row(id);
    await this.assertEdit(actor, r);
    if (r.status !== 'READY') throw new AppError('CONFLICT', r.status === 'LOADING' ? 'Die Nachricht wird gerade aus Discord geladen – kurz warten.' : `Die Nachricht konnte nicht geladen werden: ${r.error ?? 'unbekannter Fehler'}`);
    const busy = await this.prisma.messageBuilderSend.count({ where: { targetId: id, status: { in: ['QUEUED', 'SENDING'] } } });
    if (busy) throw new AppError('CONFLICT', 'Für diese Nachricht läuft schon eine Bearbeitung – bitte warten, bis sie abgeschlossen ist.');
    const t: EditTarget = { id: r.id, guildId: r.guildId, channelId: r.channelId, channelName: r.channelName, threadId: r.threadId, messageId: r.messageId, mode: r.mode, webhookId: r.webhookId, keptCustomIds: r.keptCustomIds as unknown as string[], name: r.name };
    return this.send.queueEdit(actor, userName, t, b.data);
  }

  // ───────────── Bot: Nachricht laden ─────────────

  async botTarget(id: string) {
    const r = await unscoped(() => this.prisma.messageBuilderMessage.findUnique({ where: { id } }));
    if (!r || r.status !== 'LOADING') return { proceed: false as const };
    return { proceed: true as const, guildId: r.guildId, channelId: r.channelId, messageId: r.messageId };
  }

  async loaded(id: string, b: z.infer<typeof loadedSchema>) {
    const r = await unscoped(() => this.prisma.messageBuilderMessage.findUnique({ where: { id } }));
    if (!r || r.status !== 'LOADING') return;
    const fail = (error: string) => unscoped(() => this.prisma.messageBuilderMessage.update({ where: { id }, data: { status: 'FAILED', error: error.slice(0, 500) } }));
    if (!b.ok || !b.message) return void (await fail(b.error ?? 'Die Nachricht konnte nicht geladen werden.'));
    let mode = 'BOT', webhookId: string | null = null;
    if (b.author === 'webhook') {
      const w = await unscoped(() => this.prisma.messageBuilderWebhook.findFirst({ where: { guildId: r.guildId, webhookId: b.webhookId ?? '-', archivedAt: null } }));
      if (!w) return void (await fail('Die Nachricht stammt von einem Webhook, der im Embed Builder nicht eingerichtet ist – sie kann nur über diesen Webhook bearbeitet werden.'));
      mode = 'WEBHOOK'; webhookId = w.id;
    } else if (b.author !== 'bot') {
      return void (await fail('Diese Nachricht stammt weder vom Bot noch von einem eingerichteten Webhook – fremde Nachrichten können nicht bearbeitet werden.'));
    }
    // Komponenten früherer Embed-Builder-Versände (custom_id `mb:<Aktion>`) bekommen ihre Aktion zurück
    const ids = customIdsOf(b.message.components ?? []);
    const actionIds = ids.filter((c) => /^mb:[0-9a-f-]{36}$/.test(c)).map((c) => c.slice(3));
    const actions = actionIds.length ? await unscoped(() => this.prisma.messageBuilderAction.findMany({ where: { id: { in: actionIds }, guildId: r.guildId } })) : [];
    const json = { content: b.message.content ?? '', embeds: b.message.embeds ?? [], components: b.message.components ?? [] };
    const parsed = mbFromDiscordJson(json, { foreignCustomIds: 'keep' });
    if (!parsed.ok) return void (await fail(`Die Nachricht hat einen Aufbau, den der Editor nicht darstellen kann (${parsed.error.path}: ${parsed.error.message}).`));
    const data = restoreActions(parsed.data, new Map(actions.map((a) => [`mb:${a.id}`, a.config as { action?: MbAction; options?: Record<string, MbAction> }])));
    const kept = new Set<string>();
    for (const row of data.messages[0]!.rows) {
      if (row.type === 'select' && row.keepCustomId) kept.add(row.keepCustomId);
      if (row.type === 'buttons') for (const btn of row.buttons) if (btn.keepCustomId) kept.add(btn.keepCustomId);
    }
    const threadId = b.parentId ? (b.channelId ?? r.channelId) : null;
    await unscoped(() => this.prisma.messageBuilderMessage.update({ where: { id }, data: {
      status: 'READY', error: null, mode, webhookId, data: data as unknown as Prisma.InputJsonValue, keptCustomIds: [...kept], threadId,
      ...(b.channelName ? { channelName: b.channelName } : {}),
    } }));
  }
}

/** custom_ids `mb:<Aktion>` → normale Komponenten mit der damals festgelegten Aktion (beim Speichern entsteht eine neue Aktion). */
export function restoreActions(d: MbDocumentData, actions: Map<string, { action?: MbAction; options?: Record<string, MbAction> }>): MbDocumentData {
  return {
    ...d,
    messages: d.messages.map((m) => ({
      ...m,
      rows: m.rows.map((row) => {
        if (row.type === 'select') {
          const a = actions.get(row.keepCustomId);
          if (!a?.options) return row;
          return { ...row, keepCustomId: '', options: row.options.map((o) => ({ ...o, action: a.options![o.id] ?? o.action })) };
        }
        return { ...row, buttons: row.buttons.map((btn) => { const a = actions.get(btn.keepCustomId); return a?.action ? { ...btn, keepCustomId: '', action: a.action } : btn; }) };
      }),
    })),
  };
}
