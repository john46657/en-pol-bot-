import { ChannelPerm, createChannelMessage, createGuildTextChannel, deleteChannel, getCurrentBotUserId, listChannelMessages, sendDirectMessage, setChannelMemberAccess, type MessagePayload } from '@nexus/discord';
import { assertGuildId, auditRepository, guildRepository, prisma, type Prisma } from '@nexus/database';

/**
 * Ticket-System: Kategorien, Erstellung (privater Kanal), Übernahme durch einen Bearbeiter, Priorität, Mitglieder
 * hinzufügen/entfernen, Schließen mit Transkript, Archiv (geschlossene Tickets bleiben samt Transkript durchsuchbar).
 * Discord wird über `TicketDiscord` angesprochen (REST im Betrieb, Attrappe in Tests).
 */
type Json = Prisma.InputJsonValue;
const ID = /^\d{5,25}$/;
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };
export const formatNumber = (n: number) => `#${String(n).padStart(4, '0')}`;

export class TicketError extends Error {
  constructor(public readonly code: 'invalid' | 'not-found' | 'conflict' | 'forbidden', message: string) {
    super(message);
    this.name = 'TicketError';
  }
}

export interface TranscriptMessage {
  id: string;
  authorId: string;
  author: string;
  bot: boolean;
  content: string;
  at: string;
  attachments: { name: string; url: string }[];
  embeds: number;
}

export interface TicketDiscord {
  /** Legt den privaten Ticket-Kanal an. */
  createChannel(i: { guildId: string; name: string; parentId: string | null; topic: string; userIds: string[]; roleIds: string[] }): Promise<string>;
  deleteChannel(channelId: string): Promise<void>;
  fetchMessages(channelId: string): Promise<TranscriptMessage[]>;
  send(channelId: string, payload: MessagePayload): Promise<void>;
  sendDm(userId: string, payload: MessagePayload): Promise<void>;
  setMemberAccess(channelId: string, userId: string, allowed: boolean): Promise<void>;
}

export function restTicketDiscord(botToken: string): TicketDiscord {
  const member = ChannelPerm.VIEW | ChannelPerm.SEND | ChannelPerm.HISTORY | ChannelPerm.ATTACH | ChannelPerm.EMBED;
  return {
    async createChannel(i) {
      const bot = await getCurrentBotUserId(botToken);
      const ch = await createGuildTextChannel(botToken, i.guildId, {
        name: i.name,
        parentId: i.parentId,
        topic: i.topic,
        overwrites: [
          { id: i.guildId, type: 'role', deny: ChannelPerm.VIEW },
          { id: bot, type: 'member', allow: member },
          ...i.userIds.map((id) => ({ id, type: 'member' as const, allow: member })),
          ...i.roleIds.map((id) => ({ id, type: 'role' as const, allow: member })),
        ],
      });
      return ch.id;
    },
    deleteChannel: (id) => deleteChannel(botToken, id),
    async fetchMessages(channelId) {
      return (await listChannelMessages(botToken, channelId)).map((m) => ({ id: m.id, authorId: m.author.id, author: m.author.global_name ?? m.author.username, bot: !!m.author.bot, content: m.content, at: m.timestamp, attachments: m.attachments.map((a) => ({ name: a.filename, url: a.url })), embeds: m.embeds.length }));
    },
    send: async (id, payload) => void (await createChannelMessage(botToken, id, payload)),
    sendDm: (userId, payload) => sendDirectMessage(botToken, userId, payload),
    setMemberAccess: (channelId, userId, allowed) => setChannelMemberAccess(botToken, channelId, userId, allowed ? { allow: member } : null),
  };
}

async function event(guildId: string, ticketId: string, type: string, actorId: string | null, data?: unknown) {
  await prisma.ticketEvent.create({ data: { guildId, ticketId, type, actorId, ...(data !== undefined ? { data: data as Json } : {}) } });
  if (type !== 'closed') await auditRepository.mirrorEvent({ guildId, area: 'ticket', resourceType: 'Ticket', resourceId: ticketId, type, actorId, data }); // Schließen hat einen eigenen Eintrag
}

// --- Kategorien ---------------------------------------------------------------------------------------

export interface CategoryInput {
  id?: string | undefined;
  name: string;
  description?: string | undefined;
  emoji?: string | undefined;
  discordCategoryId?: string | undefined;
  staffRoleIds?: string[] | undefined;
  defaultPriority?: string | undefined;
  maxOpenPerUser?: number | undefined;
  active?: boolean | undefined;
}

export const listCategories = (guildId: string, onlyActive = false) => prisma.ticketCategory.findMany({ where: { guildId: assertGuildId(guildId), ...(onlyActive ? { active: true } : {}) }, orderBy: { name: 'asc' } });

export async function saveCategory(guildId: string, i: CategoryInput, actorId: string) {
  const gid = assertGuildId(guildId);
  const name = i.name?.trim();
  if (!name || name.length > 50) throw new TicketError('invalid', 'Der Name fehlt oder ist zu lang (max. 50 Zeichen).');
  if (i.defaultPriority && !(PRIORITIES as readonly string[]).includes(i.defaultPriority)) throw new TicketError('invalid', 'Unbekannte Priorität.');
  const roles = [...new Set(i.staffRoleIds ?? [])];
  if (roles.length > 20 || roles.some((r) => !ID.test(r))) throw new TicketError('invalid', 'Ungültige Rollenauswahl.');
  if (i.discordCategoryId && !ID.test(i.discordCategoryId)) throw new TicketError('invalid', 'Ungültige Discord-Kategorie.');
  const max = i.maxOpenPerUser ?? 1;
  if (!Number.isInteger(max) || max < 1 || max > 10) throw new TicketError('invalid', 'Die Anzahl offener Tickets muss zwischen 1 und 10 liegen.');
  if ((i.description?.length ?? 0) > 300) throw new TicketError('invalid', 'Die Beschreibung ist zu lang (max. 300 Zeichen).');
  const data = { name, description: i.description?.trim() || null, emoji: i.emoji?.trim() || null, discordCategoryId: i.discordCategoryId || null, staffRoleIds: roles, defaultPriority: i.defaultPriority ?? 'NORMAL', maxOpenPerUser: max, active: i.active ?? true };
  try {
    const row = i.id ? await prisma.ticketCategory.update({ where: { id: i.id, guildId: gid }, data }) : await prisma.ticketCategory.create({ data: { ...data, guildId: gid } });
    await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: i.id ? 'ticket.category.updated' : 'ticket.category.created', resourceType: 'TicketCategory', resourceId: row.id, after: data as Json, permission: 'tickets.manage', result: 'success' } });
    return row;
  } catch (e) {
    if (e instanceof Error && /Unique constraint/i.test(e.message)) throw new TicketError('conflict', 'Eine Kategorie mit diesem Namen gibt es schon.');
    if (e instanceof Error && /not found|No record/i.test(e.message)) throw new TicketError('not-found', 'Kategorie nicht gefunden.');
    throw e;
  }
}

export async function deleteCategory(guildId: string, id: string, actorId: string) {
  const gid = assertGuildId(guildId);
  const c = await prisma.ticketCategory.findFirst({ where: { id, guildId: gid }, include: { _count: { select: { tickets: true } } } });
  if (!c) throw new TicketError('not-found', 'Kategorie nicht gefunden.');
  if (c._count.tickets > 0) throw new TicketError('conflict', `Zu dieser Kategorie gibt es ${c._count.tickets} Ticket(s) – bitte deaktivieren statt löschen.`);
  await prisma.ticketCategory.delete({ where: { id } });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'ticket.category.deleted', resourceType: 'TicketCategory', resourceId: id, before: { name: c.name } as Json, permission: 'tickets.manage', result: 'success' } });
}

// --- Tickets ------------------------------------------------------------------------------------------------

const include = { category: true } satisfies Prisma.TicketInclude;

export async function getTicket(guildId: string, id: string) {
  const t = await prisma.ticket.findFirst({ where: { id, guildId: assertGuildId(guildId) }, include });
  if (!t) throw new TicketError('not-found', 'Ticket nicht gefunden.');
  return t;
}
export async function getByNumber(guildId: string, number: number) {
  const t = await prisma.ticket.findUnique({ where: { guildId_number: { guildId: assertGuildId(guildId), number } }, include });
  if (!t) throw new TicketError('not-found', `Ticket ${formatNumber(number)} nicht gefunden.`);
  return t;
}
export async function getByChannel(guildId: string, channelId: string) {
  return prisma.ticket.findFirst({ where: { guildId: assertGuildId(guildId), channelId, status: { not: 'CLOSED' } }, include });
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'user';

export interface OpenInput {
  guildId: string;
  userId: string;
  username: string;
  categoryId: string;
  subject: string;
  description?: string | undefined;
}

export async function openTicket(i: OpenInput, discord: TicketDiscord) {
  const gid = assertGuildId(i.guildId);
  const cat = await prisma.ticketCategory.findFirst({ where: { id: i.categoryId, guildId: gid } });
  if (!cat || !cat.active) throw new TicketError('not-found', 'Diese Ticket-Kategorie gibt es nicht oder sie ist deaktiviert.');
  const subject = i.subject?.trim();
  if (!subject || subject.length < 3 || subject.length > 100) throw new TicketError('invalid', 'Der Betreff muss 3 bis 100 Zeichen lang sein.');
  if ((i.description?.length ?? 0) > 1500) throw new TicketError('invalid', 'Die Beschreibung ist zu lang (max. 1500 Zeichen).');
  const open = await prisma.ticket.count({ where: { guildId: gid, userId: i.userId, categoryId: cat.id, status: { not: 'CLOSED' } } });
  if (open >= cat.maxOpenPerUser) throw new TicketError('conflict', `Du hast in „${cat.name}“ bereits ${open} offene(s) Ticket(s) (erlaubt: ${cat.maxOpenPerUser}).`);
  const ticket = await prisma.$transaction(async (tx) => {
    const c = await tx.ticketCounter.upsert({ where: { guildId: gid }, create: { guildId: gid, last: 1 }, update: { last: { increment: 1 } } });
    return tx.ticket.create({ data: { guildId: gid, number: c.last, categoryId: cat.id, userId: i.userId, subject, description: i.description?.trim() || null, priority: cat.defaultPriority }, include });
  });
  let channelId: string;
  try {
    channelId = await discord.createChannel({ guildId: gid, name: `ticket-${String(ticket.number).padStart(4, '0')}-${slug(i.username)}`, parentId: cat.discordCategoryId, topic: `${cat.name}: ${subject}`.slice(0, 200), userIds: [i.userId], roleIds: cat.staffRoleIds });
  } catch (e) {
    // Ohne Kanal ist das Ticket nutzlos – zurückrollen, damit die Nummer nicht „leer“ im Archiv steht
    await prisma.ticket.delete({ where: { id: ticket.id } });
    throw new TicketError('conflict', 'Der Ticket-Kanal konnte nicht angelegt werden (Bot-Rechte „Kanäle verwalten“ und Kategorie prüfen).');
  }
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { channelId }, include });
  await event(gid, ticket.id, 'opened', i.userId, { category: cat.name, subject });
  await discord
    .send(channelId, {
      content: `<@${i.userId}>${cat.staffRoleIds.length ? ` ${cat.staffRoleIds.map((r) => `<@&${r}>`).join(' ')}` : ''}`,
      embeds: [{ title: `${cat.emoji ?? '🎫'} Ticket ${formatNumber(ticket.number)} – ${subject}`, description: i.description?.trim() || 'Bitte schildere dein Anliegen. Ein Teammitglied übernimmt das Ticket in Kürze.', color: 0x5865f2, fields: [{ name: 'Kategorie', value: cat.name, inline: true }, { name: 'Priorität', value: PRIORITY_LABEL[cat.defaultPriority as TicketPriority] ?? cat.defaultPriority, inline: true }] }],
      components: ticketButtons(ticket.id, false),
      // @ts-expect-error allowed_mentions ist Teil der Discord-Nachricht, aber nicht des schmalen MessagePayload-Typs
      allowed_mentions: { users: [i.userId], roles: cat.staffRoleIds },
    })
    .catch(() => undefined);
  return updated;
}

/** Buttons im Ticket-Kanal (Übernehmen/Schließen); Custom-IDs werden vom Bot-Handler ausgewertet. */
export function ticketButtons(ticketId: string, claimed: boolean): NonNullable<MessagePayload['components']> {
  return [{ type: 1, components: [{ type: 2, style: 3, label: claimed ? 'Freigeben' : 'Übernehmen', custom_id: `nexus:${claimed ? 'ticket:release' : 'ticket:claim'}:${ticketId}` }, { type: 2, style: 4, label: 'Schließen', custom_id: `nexus:ticket:close:${ticketId}` }] }] as never;
}

export interface Actor {
  userId: string;
  roleIds: readonly string[];
  /** `tickets.manage` / Administrator */
  manage: boolean;
  /** `tickets.handle` */
  handle: boolean;
}

/** Darf der Handelnde dieses Ticket bearbeiten (Bearbeiter-Rolle der Kategorie oder Verwaltung)? */
export function isStaff(t: { category: { staffRoleIds: string[] } }, a: Actor): boolean {
  return a.manage || (a.handle && (t.category.staffRoleIds.length === 0 || t.category.staffRoleIds.some((r) => a.roleIds.includes(r))));
}

async function openTicketOf(guildId: string, id: string) {
  const t = await getTicket(guildId, id);
  if (t.status === 'CLOSED') throw new TicketError('conflict', 'Dieses Ticket ist bereits geschlossen.');
  return t;
}

/** Übernahme: genau ein Bearbeiter; bereits übernommene Tickets nur mit Verwaltungsrecht neu zuweisen. */
export async function claim(guildId: string, id: string, actor: Actor, discord?: TicketDiscord, now = new Date()) {
  const gid = assertGuildId(guildId);
  const t = await openTicketOf(gid, id);
  if (!isStaff(t, actor)) throw new TicketError('forbidden', 'Nur Bearbeiter dieser Kategorie können Tickets übernehmen.');
  if (t.claimedBy === actor.userId) throw new TicketError('conflict', 'Du bearbeitest dieses Ticket bereits.');
  if (t.claimedBy && !actor.manage) throw new TicketError('conflict', `Das Ticket wird bereits von <@${t.claimedBy}> bearbeitet.`);
  const r = await prisma.ticket.updateMany({ where: { id, status: { not: 'CLOSED' }, claimedBy: t.claimedBy }, data: { status: 'CLAIMED', claimedBy: actor.userId, claimedAt: now } });
  if (r.count === 0) throw new TicketError('conflict', 'Das Ticket wurde gerade geändert – bitte erneut versuchen.');
  await event(gid, id, 'claimed', actor.userId, { previous: t.claimedBy });
  if (t.channelId && discord) await discord.send(t.channelId, { content: `🙋 <@${actor.userId}> hat das Ticket übernommen.` }).catch(() => undefined);
  return getTicket(gid, id);
}

export async function release(guildId: string, id: string, actor: Actor, discord?: TicketDiscord) {
  const gid = assertGuildId(guildId);
  const t = await openTicketOf(gid, id);
  if (!t.claimedBy) throw new TicketError('conflict', 'Das Ticket ist niemandem zugewiesen.');
  if (t.claimedBy !== actor.userId && !actor.manage) throw new TicketError('forbidden', 'Nur der Bearbeiter oder die Verwaltung kann das Ticket freigeben.');
  await prisma.ticket.update({ where: { id }, data: { status: 'OPEN', claimedBy: null, claimedAt: null } });
  await event(gid, id, 'released', actor.userId, { previous: t.claimedBy });
  if (t.channelId && discord) await discord.send(t.channelId, { content: `↩️ <@${t.claimedBy}> hat das Ticket freigegeben.` }).catch(() => undefined);
  return getTicket(gid, id);
}

export async function setPriority(guildId: string, id: string, priority: string, actor: Actor) {
  const gid = assertGuildId(guildId);
  if (!(PRIORITIES as readonly string[]).includes(priority)) throw new TicketError('invalid', 'Unbekannte Priorität.');
  const t = await openTicketOf(gid, id);
  if (!isStaff(t, actor)) throw new TicketError('forbidden', 'Nur Bearbeiter können die Priorität ändern.');
  if (t.priority === priority) return t;
  await prisma.ticket.update({ where: { id }, data: { priority } });
  await event(gid, id, 'priority', actor.userId, { from: t.priority, to: priority });
  return getTicket(gid, id);
}

/** Mitglied zum Ticket hinzufügen bzw. entfernen (Kanalrecht wird gesetzt). */
export async function setParticipant(guildId: string, id: string, userId: string, add: boolean, actor: Actor, discord: TicketDiscord) {
  const gid = assertGuildId(guildId);
  if (!ID.test(userId)) throw new TicketError('invalid', 'Ungültige Discord-ID.');
  const t = await openTicketOf(gid, id);
  if (!isStaff(t, actor) && t.userId !== actor.userId) throw new TicketError('forbidden', 'Nur der Ersteller oder Bearbeiter kann Mitglieder hinzufügen.');
  if (userId === t.userId) throw new TicketError('invalid', 'Der Ersteller hat immer Zugriff.');
  const has = t.participantIds.includes(userId);
  if (add === has) throw new TicketError('conflict', add ? 'Das Mitglied ist schon im Ticket.' : 'Das Mitglied ist nicht im Ticket.');
  if (t.channelId) await discord.setMemberAccess(t.channelId, userId, add).catch(() => { throw new TicketError('conflict', 'Der Kanalzugriff konnte nicht geändert werden (Bot-Rechte prüfen).'); });
  await prisma.ticket.update({ where: { id }, data: { participantIds: add ? [...t.participantIds, userId] : t.participantIds.filter((x) => x !== userId) } });
  await event(gid, id, add ? 'participant.added' : 'participant.removed', actor.userId, { userId });
  return getTicket(gid, id);
}

export interface CloseResult {
  ticket: Awaited<ReturnType<typeof getTicket>>;
  transcriptMessages: number;
  /** Nachrichteninhalte waren lesbar (Message-Content-Intent). */
  contentAvailable: boolean;
  logged: boolean;
  dmDelivered: boolean;
  channelDeleted: boolean;
}

/** Schließt das Ticket: Transkript sichern, Log im Kanal „ticket-log-channel“, Ersteller benachrichtigen, Kanal löschen. */
export async function closeTicket(guildId: string, id: string, reason: string | undefined, actor: Actor, discord: TicketDiscord, opts: { deleteChannel?: boolean; now?: Date } = {}): Promise<CloseResult> {
  const gid = assertGuildId(guildId);
  const t = await openTicketOf(gid, id);
  const isCreator = t.userId === actor.userId;
  if (!isStaff(t, actor) && !isCreator) throw new TicketError('forbidden', 'Nur der Ersteller oder ein Bearbeiter kann das Ticket schließen.');
  const why = reason?.trim() || null;
  if (why && why.length > 300) throw new TicketError('invalid', 'Der Grund ist zu lang (max. 300 Zeichen).');
  const now = opts.now ?? new Date();
  let messages: TranscriptMessage[] = [];
  if (t.channelId) messages = await discord.fetchMessages(t.channelId).catch(() => []);
  // Ohne Message-Content-Intent liefert Discord leere Inhalte – das wird festgehalten, nicht verschwiegen
  const humans = messages.filter((m) => !m.bot);
  const contentAvailable = humans.length === 0 || humans.some((m) => m.content.length > 0 || m.attachments.length > 0);
  const r = await prisma.ticket.updateMany({ where: { id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED', closedBy: actor.userId, closedAt: now, closeReason: why, transcript: messages as unknown as Json, transcriptContent: contentAvailable } });
  if (r.count === 0) throw new TicketError('conflict', 'Das Ticket wurde gerade geschlossen.');
  await event(gid, id, 'closed', actor.userId, { reason: why, messages: messages.length, contentAvailable });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId: actor.userId, action: 'ticket.closed', resourceType: 'Ticket', resourceId: id, before: { number: t.number, status: t.status } as Json, after: { status: 'CLOSED', messages: messages.length } as Json, reason: why, permission: isStaff(t, actor) ? 'tickets.handle' : 'tickets.create', result: 'success' } });
  const summary: MessagePayload = { embeds: [{ title: `🔒 Ticket ${formatNumber(t.number)} geschlossen – ${t.subject}`, color: 0x6b7280, fields: [{ name: 'Kategorie', value: t.category.name, inline: true }, { name: 'Ersteller', value: `<@${t.userId}>`, inline: true }, { name: 'Bearbeiter', value: t.claimedBy ? `<@${t.claimedBy}>` : '–', inline: true }, { name: 'Geschlossen von', value: `<@${actor.userId}>`, inline: true }, { name: 'Nachrichten', value: String(messages.length), inline: true }, ...(why ? [{ name: 'Grund', value: why }] : []), ...(contentAvailable ? [] : [{ name: 'Hinweis', value: 'Nachrichteninhalte waren nicht lesbar (Message-Content-Intent im Developer-Portal aktivieren).' }])] }], allowed_mentions: { parse: [] } } as never;
  let logged = false;
  const logChannel = (await guildRepository.getSelections(gid))['ticket-log-channel'];
  if (logChannel) logged = await discord.send(logChannel, summary).then(() => true, () => false);
  const dmDelivered = await discord.sendDm(t.userId, { content: `🎫 Dein Ticket ${formatNumber(t.number)} („${t.subject}“) wurde geschlossen.${why ? `\nGrund: ${why}` : ''}` }).then(() => true, () => false);
  let channelDeleted = false;
  if (t.channelId && opts.deleteChannel !== false) channelDeleted = await discord.deleteChannel(t.channelId).then(() => true, () => false);
  return { ticket: await getTicket(gid, id), transcriptMessages: messages.length, contentAvailable, logged, dmDelivered, channelDeleted };
}

// --- Abfragen, Archiv, Transkript -----------------------------------------------------------------------------

export interface TicketFilter {
  guildId: string;
  status?: string | undefined;
  open?: boolean | undefined;
  closed?: boolean | undefined;
  categoryId?: string | undefined;
  userId?: string | undefined;
  claimedBy?: string | undefined;
  priority?: string | undefined;
  query?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

export async function listTickets(f: TicketFilter) {
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200);
  const q = f.query?.trim();
  const num = q && /^#?(\d{1,6})$/.exec(q);
  const rows = await prisma.ticket.findMany({
    where: {
      guildId: assertGuildId(f.guildId),
      ...(f.open ? { status: { in: ['OPEN', 'CLAIMED'] as ('OPEN' | 'CLAIMED')[] } } : f.closed ? { status: 'CLOSED' } : ['OPEN', 'CLAIMED', 'CLOSED'].includes(f.status ?? '') ? { status: f.status as 'OPEN' } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
      ...(f.userId ? { userId: f.userId } : {}),
      ...(f.claimedBy ? { claimedBy: f.claimedBy } : {}),
      ...(f.priority ? { priority: f.priority } : {}),
      ...(q ? { OR: [...(num ? [{ number: Number(num[1]) }] : []), { subject: { contains: q, mode: 'insensitive' as const } }, { description: { contains: q, mode: 'insensitive' as const } }] } : {}),
    },
    orderBy: { number: 'desc' },
    take: limit + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    include,
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
}

export const ticketHistory = (guildId: string, id: string) => prisma.ticketEvent.findMany({ where: { guildId: assertGuildId(guildId), ticketId: id }, orderBy: { at: 'asc' } });

/** Transkript als Klartext (Download/Anzeige). */
export function renderTranscript(t: { number: number; subject: string; userId: string; category: { name: string }; createdAt: Date; closedAt: Date | null; closeReason: string | null; transcript: unknown; transcriptContent: boolean }): string {
  const msgs = (t.transcript as TranscriptMessage[] | null) ?? [];
  const head = [`Ticket ${formatNumber(t.number)} – ${t.subject}`, `Kategorie: ${t.category.name}`, `Ersteller: ${t.userId}`, `Eröffnet: ${t.createdAt.toISOString()}`, `Geschlossen: ${t.closedAt?.toISOString() ?? '–'}${t.closeReason ? ` (${t.closeReason})` : ''}`, ...(t.transcriptContent ? [] : ['HINWEIS: Nachrichteninhalte waren nicht lesbar (Message-Content-Intent fehlte).']), ''];
  return [...head, ...msgs.map((m) => `[${m.at}] ${m.author}${m.bot ? ' (Bot)' : ''}: ${m.content}${m.attachments.length ? ` ${m.attachments.map((a) => `[Anhang: ${a.name} ${a.url}]`).join(' ')}` : ''}${m.embeds ? ` [${m.embeds} Embed(s)]` : ''}`)].join('\n');
}

export async function stats(guildId: string) {
  const gid = assertGuildId(guildId);
  const [byStatus, byCategory] = await Promise.all([prisma.ticket.groupBy({ by: ['status'], where: { guildId: gid }, _count: { _all: true } }), prisma.ticket.groupBy({ by: ['categoryId'], where: { guildId: gid }, _count: { _all: true } })]);
  return { byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])), byCategory: Object.fromEntries(byCategory.map((g) => [g.categoryId, g._count._all])) };
}
