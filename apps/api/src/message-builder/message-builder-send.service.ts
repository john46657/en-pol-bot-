import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hasErrors, interactiveComponents, mbDocumentDataSchema, mbSummary, missingBotPerms, toDiscordPayload, validateMbDocument, type MbAction, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { AppError } from '../common/errors';
import { unscoped } from '../common/guild-context';
import { decryptSecret, encryptSecret } from '../cad/erlc-crypto';
import { MessageBuilderService, requireGuild, sf } from './message-builder.service';
import { DiscordHttpError, WEBHOOK_URL, WebhookClient } from './webhook-client';

export const sendSchema = z.object({
  documentId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(100).default('Ohne Namen'),
  data: mbDocumentDataSchema,
  /** bot = über den vorhandenen Discord-Bot (Standard), webhook = ausdrücklich gewählter Webhook, test = nur prüfen, nichts senden */
  mode: z.enum(['bot', 'webhook', 'test']),
  channelId: sf.nullable().default(null),
  webhookId: z.string().uuid().nullable().default(null),
  /** Bestätigung im Dialog („Jetzt senden“) */
  confirm: z.literal(true, { errorMap: () => ({ message: 'Versand bitte bestätigen.' }) }),
});
export const itemResultSchema = z.object({ ok: z.boolean(), messageId: sf.optional(), error: z.string().max(500).optional() });
export const finishSchema = z.object({ error: z.string().max(500).optional() });
export const interactionSchema = z.object({ actionId: z.string().uuid(), value: z.string().max(100).optional(), guildId: sf.nullable().default(null), discordId: sf });
export const webhookCreateSchema = z.object({ name: z.string().trim().min(1).max(60), url: z.string().trim().max(400).regex(WEBHOOK_URL, 'Keine gültige Discord-Webhook-URL (https://discord.com/api/webhooks/<id>/<token>).') });
export const historyQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), status: z.string().max(20).optional() });

const QUEUE_TIMEOUT_MS = 10 * 60_000;
const SENDING_TIMEOUT_MS = 15 * 60_000;
const ERR = (s: string | undefined | null) => (s ?? '').replace(/https?:\/\/\S*webhooks\S*/gi, '[Webhook-URL]').slice(0, 500) || null;
type Payload = ReturnType<typeof toDiscordPayload>;

/** Versand der Nachrichtengruppen (Bot über die Outbox, optional Webhook, Testmodus) und Versandhistorie. */
@Injectable()
export class MessageBuilderSendService {
  private readonly log = new Logger('MessageBuilder');
  /** laufende Webhook-Versände (Tests warten darauf) */
  readonly running = new Set<Promise<void>>();
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly mb: MessageBuilderService, private readonly webhooks: WebhookClient) {}

  // ───────────── Versand ─────────────

  async send(actor: Actor, userName: string, b: z.infer<typeof sendSchema>) {
    const uid = actor.userId!;
    if (b.mode === 'test') await this.perms.assert(uid, 'messagebuilder.create');
    else await this.perms.assert(uid, 'messagebuilder.send');
    if (b.mode === 'webhook') await this.perms.assert(uid, 'messagebuilder.webhooks');
    const guildId = requireGuild();
    if (b.documentId) await this.mb.get(actor, b.documentId); // eigener Entwurf bzw. Vorlage dieses Servers (sonst 404)

    const server = await this.mb.serverInfo();
    const issues = validateMbDocument(b.data, { target: b.mode === 'webhook' ? 'webhook' : 'bot', allowRoleActions: await this.perms.has(uid, 'messagebuilder.roles'), ...(server.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) });
    if (hasErrors(issues)) throw new AppError('VALIDATION_FAILED', `Die Nachrichten sind so nicht sendbar: ${issues.find((i) => i.level === 'error')!.where} – ${issues.find((i) => i.level === 'error')!.message}`, { issues });

    let channelId: string | null = b.channelId, channelName: string | null = null, webhook: { id: string; url: string } | null = null;
    if (b.mode === 'webhook') {
      if (!b.webhookId) throw new AppError('VALIDATION_FAILED', 'Webhook wählen.');
      const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id: b.webhookId, guildId, archivedAt: null } });
      if (!w) throw new AppError('NOT_FOUND', 'Webhook nicht gefunden.');
      const url = decryptSecret(w.secret);
      if (!url) throw new AppError('VALIDATION_FAILED', 'Die Webhook-URL lässt sich nicht mehr entschlüsseln (Schlüssel geändert?) – Webhook neu anlegen.');
      webhook = { id: w.id, url };
      channelId = w.channelId;
      channelName = server.channels.find((c) => c.id === w.channelId)?.name ?? null;
    } else {
      if (!channelId) throw new AppError('VALIDATION_FAILED', 'Kanal wählen.');
      if (!server.guild) throw new AppError('CAPABILITY_UNAVAILABLE', 'Die Kanäle dieses Discord-Servers sind noch nicht bekannt – ist der Bot dort und läuft er?');
      const ch = server.channels.find((c) => c.id === channelId);
      if (!ch) throw new AppError('VALIDATION_FAILED', 'Diesen Textkanal gibt es auf diesem Discord-Server nicht.');
      if (!ch.allowed) throw new AppError('PERMISSION_DENIED', `In #${ch.name} darf über den Message Builder nicht gesendet werden (erlaubte Kanäle festgelegt).`);
      if (ch.bot) {
        const miss = missingBotPerms(ch.bot, b.data);
        if (miss.length) throw new AppError('VALIDATION_FAILED', `Dem Bot fehlen in #${ch.name} Rechte: ${miss.join(', ')}.`, { missing: miss });
      }
      channelName = ch.name;
    }

    const sendId = randomUUID();
    const now = new Date();
    // Aktionen interaktiver Komponenten festschreiben (custom_id `mb:<aktion>`) – nur bei echtem Versand über den Bot
    const actions: { id: string; kind: string; config: unknown }[] = [];
    const items = b.data.messages.map((m, position) => {
      const ids = new Map<string, string>();
      for (const c of interactiveComponents(m)) {
        const id = b.mode === 'bot' ? randomUUID() : `test-${c.componentId}`.slice(0, 36);
        ids.set(c.componentId, `mb:${id}`);
        if (b.mode === 'bot') actions.push({ id, kind: c.kind, config: c.kind === 'button' ? { action: c.action } : { options: c.options } });
      }
      const payload: Payload = toDiscordPayload(m, { now, customIdOf: (cid) => ids.get(cid) });
      return { position, summary: mbSummary(m), payload };
    });
    const test = b.mode === 'test';
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderSend.create({ data: {
        id: sendId, guildId, documentId: b.documentId, documentName: b.name, mode: b.mode.toUpperCase(), channelId, channelName, webhookId: webhook?.id ?? null,
        status: test ? 'TEST' : 'QUEUED', createdById: uid, createdByName: userName, ...(test ? { startedAt: now, finishedAt: now } : {}),
        items: { create: items.map((i) => ({ position: i.position, summary: i.summary, status: test ? 'TEST' : 'PENDING', payload: test ? Prisma.DbNull : (i.payload as unknown as Prisma.InputJsonValue) })) },
      } });
      if (actions.length) await tx.messageBuilderAction.createMany({ data: actions.map((a) => ({ id: a.id, guildId, sendId, kind: a.kind, config: a.config as Prisma.InputJsonValue, createdById: uid })) });
      if (b.mode === 'bot') await tx.discordOutbox.create({ data: { type: 'mb.send', channelKey: 'announcements', payload: { sendId } } });
      await this.audit.record(actor, { action: test ? 'messagebuilder.test' : 'messagebuilder.send', module: 'messagebuilder', entityType: 'MessageBuilderSend', entityId: sendId, after: { mode: b.mode, channelId, messages: items.length, document: b.name } }, tx);
    });
    if (webhook) this.track(this.runWebhook(sendId, webhook.url, b.data, items.map((i) => i.payload)));
    return { ...(await this.get(actor, sendId)), warnings: issues.filter((i) => i.level === 'warning'), ...(test ? { payloads: items.map((i) => i.payload) } : {}) };
  }

  private track(p: Promise<void>) { this.running.add(p); void p.finally(() => this.running.delete(p)); }
  async waitIdle() { await Promise.all([...this.running]); }

  /** Webhook-Versand: Nachricht für Nachricht; bei einem Fehler werden die restlichen nicht gesendet (Reihenfolge bleibt erhalten). */
  private async runWebhook(sendId: string, url: string, data: MbDocumentData, payloads: Payload[]) {
    try {
      await this.prisma.messageBuilderSend.update({ where: { id: sendId }, data: { status: 'SENDING', startedAt: new Date() } });
      const profile = { ...(data.webhookProfile.username.trim() ? { username: data.webhookProfile.username.trim() } : {}), ...(data.webhookProfile.avatarUrl ? { avatar_url: data.webhookProfile.avatarUrl } : {}) };
      let failed: string | null = null;
      for (const [position, p] of payloads.entries()) {
        try {
          const r = await this.webhooks.execute(url, { ...p, ...profile });
          await this.itemResult(sendId, position, { ok: true, ...(r.messageId ? { messageId: r.messageId } : {}) });
        } catch (e) {
          failed = e instanceof DiscordHttpError ? e.message : 'Unbekannter Fehler beim Webhook-Versand.';
          await this.itemResult(sendId, position, { ok: false, error: failed });
          break;
        }
      }
      await this.finish(sendId, failed ? { error: 'Nicht gesendet, weil eine vorherige Nachricht fehlschlug.' } : {});
    } catch (e) {
      this.log.error(`webhook send ${sendId} failed: ${e instanceof Error ? e.message : e}`);
      await this.finish(sendId, { error: 'Interner Fehler beim Webhook-Versand.' }).catch(() => undefined);
    }
  }

  // ───────────── Rückmeldungen des Bots ─────────────

  /** Bot holt den Auftrag ab: nur einmal (QUEUED → SENDING), sonst wird nichts gesendet (kein doppelter Versand). */
  async start(sendId: string) {
    const r = await this.prisma.messageBuilderSend.updateMany({ where: { id: sendId, status: 'QUEUED', mode: 'BOT' }, data: { status: 'SENDING', startedAt: new Date() } });
    if (!r.count) return { proceed: false as const };
    const s = await this.prisma.messageBuilderSend.findUniqueOrThrow({ where: { id: sendId }, include: { items: { orderBy: { position: 'asc' } } } });
    return { proceed: true as const, guildId: s.guildId, channelId: s.channelId, items: s.items.map((i) => ({ position: i.position, payload: i.payload })) };
  }
  async itemResult(sendId: string, position: number, b: z.infer<typeof itemResultSchema>) {
    await this.prisma.messageBuilderSendItem.updateMany({
      where: { sendId, position, status: 'PENDING' },
      data: b.ok ? { status: 'SENT', messageId: b.messageId ?? null, sentAt: new Date(), error: null, payload: Prisma.DbNull } : { status: 'FAILED', error: ERR(b.error) ?? 'Unbekannter Fehler.', payload: Prisma.DbNull },
    });
  }
  /** Abschluss: nicht gesendete Nachrichten → übersprungen; Gesamtstatus aus den Einzelstatus (nie „gesendet“, wenn etwas fehlte). */
  async finish(sendId: string, b: z.infer<typeof finishSchema>) {
    await this.prisma.messageBuilderSendItem.updateMany({ where: { sendId, status: 'PENDING' }, data: { status: 'SKIPPED', error: ERR(b.error) ?? 'Nicht gesendet.', payload: Prisma.DbNull } });
    const items = await this.prisma.messageBuilderSendItem.findMany({ where: { sendId }, select: { status: true, error: true } });
    const sent = items.filter((i) => i.status === 'SENT').length;
    const status = items.length && sent === items.length ? 'SENT' : sent ? 'PARTIAL' : 'FAILED';
    const firstError = items.find((i) => i.status === 'FAILED')?.error ?? (status === 'SENT' ? null : ERR(b.error));
    await this.prisma.messageBuilderSend.updateMany({ where: { id: sendId, status: { in: ['QUEUED', 'SENDING'] } }, data: { status, error: firstError, finishedAt: new Date() } });
  }

  /** Aufträge, die der Bot nie abgeholt bzw. nie abgeschlossen hat, ehrlich als fehlgeschlagen markieren. */
  async expireStale(now = Date.now()) {
    const queued = await this.prisma.messageBuilderSend.findMany({ where: { status: 'QUEUED', mode: 'BOT', createdAt: { lt: new Date(now - QUEUE_TIMEOUT_MS) } }, select: { id: true } });
    for (const { id } of queued) {
      const r = await this.prisma.messageBuilderSend.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'FAILED', error: 'Der Bot hat den Auftrag nicht innerhalb von 10 Minuten abgeholt (Bot offline?). Es wurde nichts gesendet.', finishedAt: new Date(now) } });
      if (!r.count) continue; // inzwischen abgeholt
      await this.prisma.messageBuilderSendItem.updateMany({ where: { sendId: id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Nicht gesendet (Bot hat den Auftrag nicht abgeholt).', payload: Prisma.DbNull } });
      await this.prisma.discordOutbox.updateMany({ where: { type: 'mb.send', sentAt: null, payload: { path: ['sendId'], equals: id } }, data: { sentAt: new Date(now), lastError: 'abgelaufen' } });
    }
    const stuck = await this.prisma.messageBuilderSend.findMany({ where: { status: 'SENDING', startedAt: { lt: new Date(now - SENDING_TIMEOUT_MS) } }, select: { id: true } });
    for (const { id } of stuck) {
      await this.prisma.messageBuilderSendItem.updateMany({ where: { sendId: id, status: 'PENDING' }, data: { status: 'FAILED', error: 'Keine Rückmeldung vom Versand – ob diese Nachricht in Discord angekommen ist, ist unbekannt. Bitte im Kanal prüfen.', payload: Prisma.DbNull } });
      await this.finish(id, {});
    }
  }

  // ───────────── Historie ─────────────

  private view(s: Prisma.MessageBuilderSendGetPayload<{ include: { items: true } }>) {
    return {
      id: s.id, documentId: s.documentId, documentName: s.documentName, mode: s.mode, channelId: s.channelId, channelName: s.channelName, webhookId: s.webhookId,
      status: s.status, error: s.error, createdById: s.createdById, createdByName: s.createdByName, createdAt: s.createdAt, startedAt: s.startedAt, finishedAt: s.finishedAt,
      items: s.items.sort((a, b) => a.position - b.position).map((i) => ({ position: i.position, summary: i.summary, status: i.status, messageId: i.messageId, error: i.error, sentAt: i.sentAt })),
    };
  }
  /** Einzelner Versand: wer gesendet hat, sieht den Status immer; sonst Recht „Versandhistorie“. */
  async get(actor: Actor, id: string) {
    await this.expireStale();
    const s = await this.prisma.messageBuilderSend.findFirst({ where: { id, guildId: requireGuild() }, include: { items: true } });
    if (!s) throw new AppError('NOT_FOUND', 'Versand nicht gefunden.');
    if (s.createdById !== actor.userId) await this.perms.assert(actor.userId!, 'messagebuilder.history');
    return { ...this.view(s), guildId: s.guildId };
  }
  async history(q: z.infer<typeof historyQuery>) {
    await this.expireStale();
    const guildId = requireGuild();
    const where = { guildId, ...(q.status ? { status: q.status } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.messageBuilderSend.count({ where }),
      this.prisma.messageBuilderSend.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page: q.page, pageSize: q.pageSize, guildId };
  }

  // ───────────── Interaktive Komponenten (Bot fragt beim Klick nach) ─────────────

  async interaction(b: z.infer<typeof interactionSchema>): Promise<MbAction | { type: 'gone' }> {
    // Buttons/Menüs wirken nur auf dem Server, für den sie gesendet wurden (kopierte Nachricht auf anderem Server → „gone“)
    const a = await unscoped(() => this.prisma.messageBuilderAction.findUnique({ where: { id: b.actionId } }));
    if (!a || !b.guildId || a.guildId !== b.guildId) return { type: 'gone' };
    const cfg = a.config as { action?: MbAction; options?: Record<string, MbAction> };
    const action = a.kind === 'select' ? cfg.options?.[b.value ?? ''] : cfg.action;
    if (!action) return { type: 'gone' };
    if (action.type === 'role') {
      const server = await this.mb.serverInfo(b.guildId);
      if (!server.guild || !server.roles.some((r) => r.id === action.roleId)) return { type: 'gone' };
    }
    return action;
  }

  // ───────────── Webhooks (optional) ─────────────

  async listWebhooks() {
    const server = await this.mb.serverInfo();
    const rows = await this.prisma.messageBuilderWebhook.findMany({ where: { guildId: requireGuild(), archivedAt: null }, orderBy: { name: 'asc' } });
    // Die URL (enthält das Token) verlässt die API nie
    return rows.map((w) => ({ id: w.id, name: w.name, webhookId: w.webhookId, channelId: w.channelId, channelName: server.channels.find((c) => c.id === w.channelId)?.name ?? null, readable: decryptSecret(w.secret) !== null, createdAt: w.createdAt }));
  }
  async createWebhook(actor: Actor, b: z.infer<typeof webhookCreateSchema>) {
    const home = requireGuild();
    let info: Awaited<ReturnType<WebhookClient['info']>>;
    try { info = await this.webhooks.info(b.url); } catch (e) { throw new AppError('VALIDATION_FAILED', `Webhook konnte nicht geprüft werden: ${e instanceof DiscordHttpError ? e.message : 'unbekannter Fehler'}`); }
    if (info.guildId !== home) throw new AppError('VALIDATION_FAILED', 'Dieser Webhook gehört zu einem anderen Discord-Server als dem gewählten.');
    const w = await this.prisma.$transaction(async (tx) => {
      const w = await tx.messageBuilderWebhook.create({ data: { name: b.name, secret: encryptSecret(b.url), webhookId: info.id, channelId: info.channelId, guildId: info.guildId, createdById: actor.userId } });
      await this.audit.record(actor, { action: 'messagebuilder.webhook_create', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: w.id, after: { name: w.name, webhookId: info.id, channelId: info.channelId } }, tx);
      return w;
    });
    return (await this.listWebhooks()).find((x) => x.id === w.id)!;
  }
  async removeWebhook(actor: Actor, id: string) {
    const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id, guildId: requireGuild(), archivedAt: null } });
    if (!w) throw new AppError('NOT_FOUND', 'Webhook nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      // Das Geheimnis wird beim Entfernen gelöscht – es soll nicht unnötig gespeichert bleiben
      await tx.messageBuilderWebhook.update({ where: { id }, data: { archivedAt: new Date(), secret: '' } });
      await this.audit.record(actor, { action: 'messagebuilder.webhook_delete', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: id, before: { name: w.name } }, tx);
    });
  }
}
