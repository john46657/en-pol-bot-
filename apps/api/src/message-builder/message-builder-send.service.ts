import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cloneWithNewIds, hasErrors, interactiveComponents, mbDocumentDataSchema, mbSummary, missingBotPerms, toDiscordPayload, validateMbDocument, type MbAction, type MbDocumentData } from '@enrp/shared';
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
  /** optional: in einen bestehenden Thread bzw. Forum-Beitrag senden */
  threadId: sf.nullable().default(null),
  /** nur Forum: Titel eines neuen Beitrags (die erste Nachricht eröffnet ihn) */
  threadName: z.string().trim().min(1).max(100).nullable().default(null),
  /** Bestätigung im Dialog („Jetzt senden“) */
  confirm: z.literal(true, { errorMap: () => ({ message: 'Versand bitte bestätigen.' }) }),
});
export const itemResultSchema = z.object({ ok: z.boolean(), messageId: sf.optional(), error: z.string().max(500).optional(), /** Kanal/Thread, in dem die Nachricht liegt (z. B. neuer Forum-Beitrag) */ channelId: sf.optional() });
export const finishSchema = z.object({ error: z.string().max(500).optional() });
export const interactionSchema = z.object({ actionId: z.string().uuid(), value: z.string().max(100).optional(), values: z.array(z.string().max(100)).max(25).optional(), guildId: sf.nullable().default(null), discordId: sf });
const profileName = z.string().trim().max(80).refine((v) => !/clyde|discord/i.test(v), 'Discord verbietet „clyde“ und „discord“ im Webhook-Namen.').nullable().default(null);
const profileAvatar = z.string().trim().max(2048).refine((v) => !v || /^https:\/\/\S+$/.test(v), 'Profilbild: https-URL').nullable().default(null);
export const webhookCreateSchema = z.object({ name: z.string().trim().min(1).max(60), url: z.string().trim().max(400).regex(WEBHOOK_URL, 'Keine gültige Discord-Webhook-URL (https://discord.com/api/webhooks/<id>/<token>).'), username: profileName, avatarUrl: profileAvatar });
export const webhookUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60), username: profileName, avatarUrl: profileAvatar,
  /** zusätzlich den Namen des Webhooks in Discord ändern (Discord erlaubt das mit dem Webhook-Token) */
  discordName: z.string().trim().min(1).max(80).refine((v) => !/clyde|discord/i.test(v), 'Discord verbietet „clyde“ und „discord“ im Webhook-Namen.').nullable().default(null),
});
export const historyQuery = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25), status: z.string().max(20).optional(), kind: z.enum(['SEND', 'EDIT']).optional() });

const QUEUE_TIMEOUT_MS = 10 * 60_000;
const SENDING_TIMEOUT_MS = 15 * 60_000;
const ERR = (s: string | undefined | null) => (s ?? '').replace(/https?:\/\/\S*webhooks\S*/gi, '[Webhook-URL]').slice(0, 500) || null;
type Payload = ReturnType<typeof toDiscordPayload>;
/** Ziel einer Bearbeitung (gespeicherte Discord-Nachricht). */
export interface EditTarget { id: string; guildId: string | null; channelId: string; channelName: string | null; threadId: string | null; messageId: string; mode: string; webhookId: string | null; keptCustomIds: string[]; name: string }
const WEBHOOK_CDN = (id: string, hash: string | null) => (hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=64` : null);

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
    let templateName: string | null = null;
    if (b.documentId) {
      const doc = await this.mb.get(actor, b.documentId); // eigener Entwurf bzw. Vorlage dieses Servers (sonst 404)
      if (doc.kind === 'TEMPLATE') templateName = doc.name;
      else if (doc.sourceTemplateId) templateName = (await this.prisma.messageBuilderDocument.findFirst({ where: { id: doc.sourceTemplateId, guildId }, select: { name: true } }))?.name ?? null;
    }

    const server = await this.mb.serverInfo();
    const issues = validateMbDocument(b.data, { target: b.mode === 'webhook' ? 'webhook' : 'bot', allowRoleActions: await this.perms.has(uid, 'messagebuilder.roles'), ...(server.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) });
    if (hasErrors(issues)) throw new AppError('VALIDATION_FAILED', `Die Nachrichten sind so nicht sendbar: ${issues.find((i) => i.level === 'error')!.where} – ${issues.find((i) => i.level === 'error')!.message}`, { issues });

    let channelId: string | null = b.channelId, channelName: string | null = null, webhook: { id: string; url: string } | null = null;
    let profile = b.data.webhookProfile;
    if (b.mode === 'webhook') {
      if (!b.webhookId) throw new AppError('VALIDATION_FAILED', 'Webhook wählen.');
      const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id: b.webhookId, guildId, archivedAt: null } });
      if (!w) throw new AppError('NOT_FOUND', 'Webhook nicht gefunden.');
      const url = decryptSecret(w.secret);
      if (!url) throw new AppError('VALIDATION_FAILED', 'Die Webhook-URL lässt sich nicht mehr entschlüsseln (Schlüssel geändert?) – Webhook neu anlegen.');
      webhook = { id: w.id, url };
      channelId = w.channelId;
      const wch = server.channels.find((c) => c.id === w.channelId);
      channelName = wch?.name ?? null;
      this.checkThread(server, wch?.type ?? 'text', w.channelId, b.threadId, b.threadName, wch?.name ?? 'dem Kanal des Webhooks');
      // Absenderprofil: je Nachricht gesetztes Profil, sonst Standard des Webhooks
      profile = { username: profile.username.trim() || w.username || '', avatarUrl: profile.avatarUrl || w.avatarUrl || '' };
    } else {
      if (!channelId) throw new AppError('VALIDATION_FAILED', 'Kanal wählen.');
      if (!server.guild) throw new AppError('CAPABILITY_UNAVAILABLE', 'Die Kanäle dieses Discord-Servers sind noch nicht bekannt – ist der Bot dort und läuft er?');
      const ch = server.channels.find((c) => c.id === channelId);
      if (!ch) throw new AppError('VALIDATION_FAILED', 'Diesen Textkanal gibt es auf diesem Discord-Server nicht.');
      if (!ch.allowed) throw new AppError('PERMISSION_DENIED', `In #${ch.name} darf über den Embed Builder nicht gesendet werden (erlaubte Kanäle festgelegt).`);
      this.checkThread(server, ch.type, ch.id, b.threadId, b.threadName, `#${ch.name}`);
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
        threadId: b.threadId, threadName: b.threadId ? null : b.threadName, templateName, data: { ...b.data, webhookProfile: profile } as unknown as Prisma.InputJsonValue,
        status: test ? 'TEST' : 'QUEUED', createdById: uid, createdByName: userName, ...(test ? { startedAt: now, finishedAt: now } : {}),
        items: { create: items.map((i) => ({ position: i.position, summary: i.summary, status: test ? 'TEST' : 'PENDING', payload: test ? Prisma.DbNull : (i.payload as unknown as Prisma.InputJsonValue) })) },
      } });
      if (actions.length) await tx.messageBuilderAction.createMany({ data: actions.map((a) => ({ id: a.id, guildId, sendId, kind: a.kind, config: a.config as Prisma.InputJsonValue, createdById: uid })) });
      if (b.mode === 'bot') await tx.discordOutbox.create({ data: { type: 'mb.send', channelKey: 'announcements', payload: { sendId } } });
      await this.audit.record(actor, { action: test ? 'messagebuilder.test' : 'messagebuilder.send', module: 'messagebuilder', entityType: 'MessageBuilderSend', entityId: sendId, after: { mode: b.mode, channelId, threadId: b.threadId, messages: items.length, document: b.name, template: templateName } }, tx);
    });
    if (webhook) this.track(this.runWebhook(sendId, webhook.url, profile, items.map((i) => i.payload), { threadId: b.threadId, threadName: b.threadId ? null : b.threadName }));
    return { ...(await this.get(actor, sendId)), warnings: issues.filter((i) => i.level === 'warning'), ...(test ? { payloads: items.map((i) => i.payload) } : {}) };
  }

  private track(p: Promise<void>) { this.running.add(p); void p.finally(() => this.running.delete(p)); }
  async waitIdle() { await Promise.all([...this.running]); }

  /** Webhook-Versand: Nachricht für Nachricht; bei einem Fehler werden die restlichen nicht gesendet (Reihenfolge bleibt erhalten). */
  private async runWebhook(sendId: string, url: string, webhookProfile: MbDocumentData['webhookProfile'], payloads: Payload[], thread: { threadId: string | null; threadName: string | null }) {
    try {
      await this.prisma.messageBuilderSend.update({ where: { id: sendId }, data: { status: 'SENDING', startedAt: new Date() } });
      const profile = { ...(webhookProfile.username.trim() ? { username: webhookProfile.username.trim() } : {}), ...(webhookProfile.avatarUrl ? { avatar_url: webhookProfile.avatarUrl } : {}) };
      let failed: string | null = null;
      // Forum: die erste Nachricht eröffnet den Beitrag (thread_name), die weiteren gehen in diesen Beitrag
      let threadId = thread.threadId;
      for (const [position, p] of payloads.entries()) {
        try {
          const first = position === 0 && !threadId && thread.threadName;
          const r = await this.webhooks.execute(url, { ...p, ...profile, ...(first ? { thread_name: thread.threadName } : {}) }, { threadId });
          if (first && r.channelId) threadId = r.channelId;
          await this.itemResult(sendId, position, { ok: true, ...(r.messageId ? { messageId: r.messageId } : {}), ...(threadId ? { channelId: threadId } : {}) });
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
    const target = s.kind === 'EDIT' && s.targetId ? await unscoped(() => this.prisma.messageBuilderMessage.findUnique({ where: { id: s.targetId! } })) : null;
    return {
      proceed: true as const, kind: s.kind as 'SEND' | 'EDIT', guildId: s.guildId, channelId: s.channelId, threadId: s.threadId, threadName: s.threadName,
      ...(target ? { messageId: target.messageId } : {}),
      items: s.items.map((i) => ({ position: i.position, payload: i.payload })),
    };
  }
  async itemResult(sendId: string, position: number, b: z.infer<typeof itemResultSchema>) {
    const r = await this.prisma.messageBuilderSendItem.updateMany({
      where: { sendId, position, status: 'PENDING' },
      data: b.ok ? { status: 'SENT', messageId: b.messageId ?? null, channelId: b.channelId ?? null, sentAt: new Date(), error: null, payload: Prisma.DbNull } : { status: 'FAILED', error: ERR(b.error) ?? 'Unbekannter Fehler.', payload: Prisma.DbNull },
    });
    if (r.count && b.ok && b.messageId) await this.remember(sendId, position, b.messageId, b.channelId ?? null).catch((e) => this.log.warn(`could not save message link: ${e instanceof Error ? e.message : e}`));
  }

  /** Gesendete Nachricht als „gespeicherte Nachricht“ merken (Link, Inhalt) bzw. nach dem Bearbeiten aktualisieren. */
  private async remember(sendId: string, position: number, messageId: string, landedIn: string | null) {
    const s = await unscoped(() => this.prisma.messageBuilderSend.findUnique({ where: { id: sendId } }));
    if (!s || s.mode === 'TEST') return;
    const data = mbDocumentDataSchema.safeParse(s.data);
    const one = data.success ? data.data.messages[position] : undefined;
    const content = one ? ({ messages: [one], webhookProfile: data.success ? data.data.webhookProfile : { username: '', avatarUrl: '' } } as unknown as Prisma.InputJsonValue) : Prisma.DbNull;
    if (s.kind === 'EDIT') {
      if (s.targetId) await unscoped(() => this.prisma.messageBuilderMessage.update({ where: { id: s.targetId! }, data: { data: content, lastEditedAt: new Date(), lastEditedById: s.createdById } }));
      return;
    }
    const n = data.success ? data.data.messages.length : 1;
    const threadId = landedIn && landedIn !== s.channelId ? landedIn : s.threadId;
    await unscoped(() => this.prisma.messageBuilderMessage.create({ data: {
      guildId: s.guildId, name: `${s.documentName}${n > 1 ? ` (${position + 1}/${n})` : ''}`.slice(0, 100), channelId: threadId ?? s.channelId ?? '', channelName: s.channelName, threadId,
      messageId, mode: s.mode, webhookId: s.webhookId, sendId, position, data: content, sentById: s.createdById, createdById: s.createdById, createdByName: s.createdByName,
    } }));
  }

  /** Thread/Forum-Angaben prüfen (soweit der Bot Threads gemeldet hat; unbekannte Thread-IDs prüft der Bot beim Senden). */
  private checkThread(server: Awaited<ReturnType<MessageBuilderService['serverInfo']>>, type: 'text' | 'forum', channelId: string | null, threadId: string | null, threadName: string | null, label: string) {
    if (threadId && threadName) throw new AppError('VALIDATION_FAILED', 'Entweder einen bestehenden Thread wählen oder einen neuen Forum-Beitrag benennen – nicht beides.');
    if (type === 'forum' && !threadId && !threadName) throw new AppError('VALIDATION_FAILED', `${label} ist ein Forum: bestehenden Beitrag wählen oder einen Titel für einen neuen Beitrag angeben.`);
    if (type !== 'forum' && threadName) throw new AppError('VALIDATION_FAILED', 'Einen neuen Beitrag mit Titel gibt es nur in Forum-Kanälen – für Textkanäle einen bestehenden Thread wählen.');
    if (threadId) {
      const t = server.threads.find((x) => x.id === threadId);
      if (t && t.parentId !== channelId) throw new AppError('VALIDATION_FAILED', `Dieser Thread gehört nicht zu ${label}.`);
    }
  }

  // ───────────── Bestehende Discord-Nachricht bearbeiten ─────────────

  /**
   * Bearbeitung einer gespeicherten Nachricht einreihen: über den Bot (Outbox, der Bot bearbeitet nur eigene Nachrichten)
   * bzw. direkt über den Webhook, der sie gesendet hat. Rechte prüft der Aufrufer (MessageBuilderMessagesService).
   */
  async queueEdit(actor: Actor, userName: string, t: EditTarget, data: MbDocumentData) {
    const uid = actor.userId!;
    const guildId = requireGuild();
    const server = await this.mb.serverInfo();
    const target = t.mode === 'WEBHOOK' ? 'webhook' : 'bot';
    const issues = validateMbDocument(data, { target, keptCustomIds: t.keptCustomIds, allowRoleActions: await this.perms.has(uid, 'messagebuilder.roles'), ...(server.guild ? { roleIds: server.roles.map((r) => r.id) } : {}) });
    if (data.messages.length !== 1) issues.push({ level: 'error', where: 'Nachricht', path: ['messages'], message: 'Beim Bearbeiten genau eine Nachricht.' });
    if (hasErrors(issues)) throw new AppError('VALIDATION_FAILED', `So nicht speicherbar: ${issues.find((i) => i.level === 'error')!.where} – ${issues.find((i) => i.level === 'error')!.message}`, { issues });
    let url: string | null = null;
    if (t.mode === 'WEBHOOK') {
      const w = t.webhookId ? await this.prisma.messageBuilderWebhook.findFirst({ where: { id: t.webhookId, guildId, archivedAt: null } }) : null;
      url = w ? decryptSecret(w.secret) : null;
      if (!url) throw new AppError('VALIDATION_FAILED', 'Der Webhook, der diese Nachricht gesendet hat, ist nicht (mehr) eingerichtet – Bearbeiten ist nur über diesen Webhook möglich.');
    }
    const m = data.messages[0]!;
    const sendId = randomUUID();
    const actions: { id: string; kind: string; config: unknown }[] = [];
    const ids = new Map<string, string>();
    if (t.mode === 'BOT') for (const c of interactiveComponents(m)) {
      const id = randomUUID();
      ids.set(c.componentId, `mb:${id}`);
      actions.push({ id, kind: c.kind, config: c.kind === 'button' ? { action: c.action } : { options: c.options } });
    }
    const payload = toDiscordPayload(m, { customIdOf: (cid) => ids.get(cid) });
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderSend.create({ data: {
        id: sendId, guildId, kind: 'EDIT', targetId: t.id, documentId: null, documentName: t.name, mode: t.mode, channelId: t.channelId, channelName: t.channelName, webhookId: t.webhookId,
        threadId: t.threadId, data: data as unknown as Prisma.InputJsonValue, status: 'QUEUED', createdById: uid, createdByName: userName,
        items: { create: [{ position: 0, summary: mbSummary(m), status: 'PENDING', payload: payload as unknown as Prisma.InputJsonValue }] },
      } });
      if (actions.length) await tx.messageBuilderAction.createMany({ data: actions.map((a) => ({ id: a.id, guildId, sendId, kind: a.kind, config: a.config as Prisma.InputJsonValue, createdById: uid })) });
      if (t.mode === 'BOT') await tx.discordOutbox.create({ data: { type: 'mb.send', channelKey: 'announcements', payload: { sendId } } });
      await this.audit.record(actor, { action: 'messagebuilder.edit', module: 'messagebuilder', entityType: 'MessageBuilderMessage', entityId: t.id, after: { messageId: t.messageId, channelId: t.channelId, mode: t.mode } }, tx);
    });
    if (url) this.track(this.runWebhookEdit(sendId, url, t, payload, data.webhookProfile));
    return { ...(await this.get(actor, sendId)), warnings: issues.filter((i) => i.level === 'warning') };
  }

  private async runWebhookEdit(sendId: string, url: string, t: EditTarget, p: Payload, _profile: MbDocumentData['webhookProfile']) {
    try {
      await this.prisma.messageBuilderSend.update({ where: { id: sendId }, data: { status: 'SENDING', startedAt: new Date() } });
      try {
        // Name/Profilbild lassen sich bei bestehenden Webhook-Nachrichten in Discord nicht ändern
        const r = await this.webhooks.edit(url, t.messageId, { ...p }, t.threadId);
        await this.itemResult(sendId, 0, { ok: true, messageId: r.messageId });
      } catch (e) {
        await this.itemResult(sendId, 0, { ok: false, error: e instanceof DiscordHttpError ? e.message : 'Unbekannter Fehler beim Bearbeiten.' });
      }
      await this.finish(sendId, {});
    } catch (e) {
      this.log.error(`webhook edit ${sendId} failed: ${e instanceof Error ? e.message : e}`);
      await this.finish(sendId, { error: 'Interner Fehler beim Bearbeiten.' }).catch(() => undefined);
    }
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
      id: s.id, kind: s.kind, documentId: s.documentId, documentName: s.documentName, templateName: s.templateName, mode: s.mode, channelId: s.channelId, channelName: s.channelName, webhookId: s.webhookId,
      threadId: s.threadId, threadName: s.threadName, targetId: s.targetId, hasData: s.data !== null,
      status: s.status, error: s.error, createdById: s.createdById, createdByName: s.createdByName, createdAt: s.createdAt, startedAt: s.startedAt, finishedAt: s.finishedAt,
      items: s.items.sort((a, b) => a.position - b.position).map((i) => ({ position: i.position, summary: i.summary, status: i.status, messageId: i.messageId, channelId: i.channelId ?? s.threadId ?? s.channelId, error: i.error, sentAt: i.sentAt })),
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
    const where = { guildId, ...(q.status ? { status: q.status } : {}), ...(q.kind ? { kind: q.kind } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.messageBuilderSend.count({ where }),
      this.prisma.messageBuilderSend.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    ]);
    return { items: rows.map((r) => this.view(r)), total, page: q.page, pageSize: q.pageSize, guildId };
  }

  /** Inhalt eines früheren Versands wieder als neuen Entwurf öffnen (eigener Versand oder Recht „Versandhistorie“). */
  async toDraft(actor: Actor, id: string) {
    await this.perms.assert(actor.userId!, 'messagebuilder.create');
    await this.get(actor, id);
    const s = await this.prisma.messageBuilderSend.findFirstOrThrow({ where: { id, guildId: requireGuild() } });
    const p = mbDocumentDataSchema.safeParse(s.data);
    if (!p.success) throw new AppError('VALIDATION_FAILED', 'Für diesen (älteren) Versand ist kein Inhalt gespeichert.');
    return this.mb.create(actor, { kind: 'DRAFT', name: `${s.documentName}`.slice(0, 100), categoryId: null, data: cloneWithNewIds(p.data) });
  }

  // ───────────── Interaktive Komponenten (Bot fragt beim Klick nach) ─────────────

  async interaction(b: z.infer<typeof interactionSchema>): Promise<MbAction | { type: 'gone' } | { type: 'multi'; actions: MbAction[] }> {
    // Buttons/Menüs wirken nur auf dem Server, für den sie gesendet wurden (kopierte Nachricht auf anderem Server → „gone“)
    const a = await unscoped(() => this.prisma.messageBuilderAction.findUnique({ where: { id: b.actionId } }));
    if (!a || !b.guildId || a.guildId !== b.guildId) return { type: 'gone' };
    const cfg = a.config as { action?: MbAction; options?: Record<string, MbAction> };
    const guildId = b.guildId;
    let server: Awaited<ReturnType<MessageBuilderService['serverInfo']>> | null = null;
    const valid = async (action: MbAction | undefined) => {
      if (!action) return false;
      if (action.type !== 'role') return true;
      server ??= await this.mb.serverInfo(guildId);
      return !!server.guild && server.roles.some((r) => r.id === action.roleId);
    };
    if (a.kind !== 'select') return (await valid(cfg.action)) ? cfg.action! : { type: 'gone' };
    // Auswahlmenü: eine oder mehrere Optionen (Mindest-/Höchstanzahl); alles abgewählt → kurze Bestätigung
    const values = b.values ?? (b.value !== undefined ? [b.value] : []);
    if (!values.length) return { type: 'reply', text: 'Deine Auswahl wurde entfernt.' };
    const actions: MbAction[] = [];
    for (const v of values) { const x = cfg.options?.[v]; if (await valid(x)) actions.push(x!); }
    if (!actions.length) return { type: 'gone' };
    return actions.length === 1 ? actions[0]! : { type: 'multi', actions };
  }

  // ───────────── Webhooks (optional) ─────────────

  async listWebhooks() {
    const server = await this.mb.serverInfo();
    const rows = await this.prisma.messageBuilderWebhook.findMany({ where: { guildId: requireGuild(), archivedAt: null }, orderBy: { name: 'asc' } });
    // Die URL (enthält das Token) verlässt die API nie
    return rows.map((w) => ({
      id: w.id, name: w.name, webhookId: w.webhookId, channelId: w.channelId, channelName: server.channels.find((c) => c.id === w.channelId)?.name ?? null,
      channelType: server.channels.find((c) => c.id === w.channelId)?.type ?? null, readable: decryptSecret(w.secret) !== null, createdAt: w.createdAt,
      username: w.username, avatarUrl: w.avatarUrl, discordName: w.discordName, discordAvatarUrl: WEBHOOK_CDN(w.webhookId, w.discordAvatar),
      lastCheckAt: w.lastCheckAt, lastCheckOk: w.lastCheckOk, lastCheckError: w.lastCheckError,
    }));
  }
  private async webhookRow(id: string) {
    const w = await this.prisma.messageBuilderWebhook.findFirst({ where: { id, guildId: requireGuild(), archivedAt: null } });
    if (!w) throw new AppError('NOT_FOUND', 'Webhook nicht gefunden.');
    return w;
  }
  /** Name/Standardprofil ändern; optional auch den Namen in Discord (geht mit dem Webhook-Token). */
  async updateWebhook(actor: Actor, id: string, b: z.infer<typeof webhookUpdateSchema>) {
    const w = await this.webhookRow(id);
    let discordName = w.discordName;
    if (b.discordName && b.discordName !== w.discordName) {
      const url = decryptSecret(w.secret);
      if (!url) throw new AppError('VALIDATION_FAILED', 'Die Webhook-URL lässt sich nicht mehr entschlüsseln – Webhook neu anlegen.');
      try { discordName = (await this.webhooks.rename(url, b.discordName)).name; } catch (e) { throw new AppError('VALIDATION_FAILED', `Discord hat die Änderung abgelehnt: ${e instanceof DiscordHttpError ? e.message : 'unbekannter Fehler'}`); }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderWebhook.update({ where: { id }, data: { name: b.name, username: b.username || null, avatarUrl: b.avatarUrl || null, discordName } });
      await this.audit.record(actor, { action: 'messagebuilder.webhook_update', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: id, before: { name: w.name, username: w.username, discordName: w.discordName }, after: { name: b.name, username: b.username, discordName } }, tx);
    });
    return (await this.listWebhooks()).find((x) => x.id === id)!;
  }
  /** Verbindung testen: Webhook bei Discord abfragen (ohne etwas zu senden); Name, Avatar und Kanal aktualisieren. */
  async testWebhook(actor: Actor, id: string) {
    const w = await this.webhookRow(id);
    const url = decryptSecret(w.secret);
    let ok = false, error: string | null = null;
    if (!url) error = 'Die Webhook-URL lässt sich nicht mehr entschlüsseln (Schlüssel geändert?) – Webhook neu anlegen.';
    else {
      try {
        const info = await this.webhooks.info(url);
        if (info.guildId && info.guildId !== w.guildId) error = 'Der Webhook gehört inzwischen zu einem anderen Discord-Server.';
        else {
          ok = true;
          await this.prisma.messageBuilderWebhook.update({ where: { id }, data: { discordName: info.name, discordAvatar: info.avatar, channelId: info.channelId ?? w.channelId } });
        }
      } catch (e) { error = e instanceof DiscordHttpError ? e.message : 'Unbekannter Fehler.'; }
    }
    await this.prisma.messageBuilderWebhook.update({ where: { id }, data: { lastCheckAt: new Date(), lastCheckOk: ok, lastCheckError: ERR(error) } });
    await this.audit.record(actor, { action: 'messagebuilder.webhook_test', module: 'messagebuilder', entityType: 'MessageBuilderWebhook', entityId: id, after: { ok } });
    return { ok, error: ERR(error), webhook: (await this.listWebhooks()).find((x) => x.id === id)! };
  }
  async createWebhook(actor: Actor, b: z.infer<typeof webhookCreateSchema>) {
    const home = requireGuild();
    let info: Awaited<ReturnType<WebhookClient['info']>>;
    try { info = await this.webhooks.info(b.url); } catch (e) { throw new AppError('VALIDATION_FAILED', `Webhook konnte nicht geprüft werden: ${e instanceof DiscordHttpError ? e.message : 'unbekannter Fehler'}`); }
    if (info.guildId !== home) throw new AppError('VALIDATION_FAILED', 'Dieser Webhook gehört zu einem anderen Discord-Server als dem gewählten.');
    const w = await this.prisma.$transaction(async (tx) => {
      const w = await tx.messageBuilderWebhook.create({ data: { name: b.name, secret: encryptSecret(b.url), webhookId: info.id, channelId: info.channelId, guildId: info.guildId, createdById: actor.userId,
        username: b.username || null, avatarUrl: b.avatarUrl || null, discordName: info.name, discordAvatar: info.avatar, lastCheckAt: new Date(), lastCheckOk: true } });
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
