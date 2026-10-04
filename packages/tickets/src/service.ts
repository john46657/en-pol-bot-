import { ChannelPerm, createChannelMessage, createGuildTextChannel, deleteChannel, getCurrentBotUserId, listChannelMessages, sendDirectMessage, setChannelMemberAccess, type MessagePayload } from '@nexus/discord';
import { assertGuildId, auditRepository, guildRepository, prisma, type Prisma } from '@nexus/database';
import { DiscordApiError, createChannelMessageWithFile, editChannelMessage, sendDirectMessageWithFile } from '@nexus/discord';
import { renderTranscriptHtml } from './html.js';
import { refreshPanel, loads } from './panel.js';
import { getSettings } from './settings.js';

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

export { TicketError } from './errors.js';
import { TicketError } from './errors.js';
import { blockedMessage, getActive } from '@nexus/restrictions';

export interface TranscriptMessage {
  id: string;
  authorId: string;
  author: string;
  bot: boolean;
  content: string;
  at: string;
  attachments: { name: string; url: string; contentType?: string | undefined }[];
  embeds: number;
  /** Nachricht, auf die geantwortet wurde. */
  replyTo?: string | undefined;
}

export interface TicketDiscord {
  /** Legt den privaten Ticket-Kanal an. */
  /** `roleIds` = Team (sehen, schreiben, Nachrichten verwalten); `userIds` = Beteiligte (sehen, schreiben). */
  createChannel(i: { guildId: string; name: string; parentId: string | null; topic: string; userIds: string[]; roleIds: string[] }): Promise<string>;
  /** Sendet eine Nachricht und liefert deren ID (für das Panel). */
  post(channelId: string, payload: MessagePayload): Promise<string>;
  edit(channelId: string, messageId: string, payload: MessagePayload): Promise<void>;
  sendFile(channelId: string, payload: MessagePayload, file: { name: string; content: string; contentType: string }): Promise<void>;
  sendDmFile(userId: string, payload: MessagePayload, file: { name: string; content: string; contentType: string }): Promise<void>;
  deleteChannel(channelId: string): Promise<void>;
  fetchMessages(channelId: string): Promise<TranscriptMessage[]>;
  send(channelId: string, payload: MessagePayload): Promise<void>;
  sendDm(userId: string, payload: MessagePayload): Promise<void>;
  setMemberAccess(channelId: string, userId: string, allowed: boolean): Promise<void>;
}

export function restTicketDiscord(botToken: string): TicketDiscord {
  const member = ChannelPerm.VIEW | ChannelPerm.SEND | ChannelPerm.HISTORY | ChannelPerm.ATTACH | ChannelPerm.EMBED;
  const team = member | ChannelPerm.MANAGE_MESSAGES;
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
          ...i.roleIds.map((id) => ({ id, type: 'role' as const, allow: team })),
        ],
      });
      return ch.id;
    },
    deleteChannel: (id) => deleteChannel(botToken, id),
    post: async (id, payload) => (await createChannelMessage(botToken, id, payload)).id,
    edit: (id, messageId, payload) => editChannelMessage(botToken, id, messageId, payload),
    sendFile: async (id, payload, file) => void (await createChannelMessageWithFile(botToken, id, payload, file)),
    sendDmFile: (userId, payload, file) => sendDirectMessageWithFile(botToken, userId, payload, file),
    async fetchMessages(channelId) {
      return (await listChannelMessages(botToken, channelId)).map((m) => ({ id: m.id, authorId: m.author.id, author: m.author.global_name ?? m.author.username, bot: !!m.author.bot, content: m.content, at: m.timestamp, attachments: m.attachments.map((a) => ({ name: a.filename, url: a.url, contentType: a.content_type })), embeds: m.embeds.length, replyTo: m.message_reference?.message_id }));
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
  color?: number | null | undefined;
  maxOpenTotal?: number | undefined;
  requiredRoleIds?: string[] | undefined;
  nameTemplate?: string | null | undefined;
  formFields?: FormField[] | null | undefined;
  transcriptEnabled?: boolean | null | undefined;
}

/** Ein Feld des optionalen Ticket-Formulars (Discord erlaubt höchstens 5 Felder je Formular). */
export interface FormField {
  id: string;
  label: string;
  style: 'short' | 'paragraph';
  required: boolean;
  placeholder?: string | undefined;
}
export function parseFormFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((f, n) => {
    const o = f as Partial<FormField> | null;
    return o && typeof o.label === 'string' && o.label ? [{ id: typeof o.id === 'string' && o.id ? o.id : `f${n}`, label: o.label.slice(0, 45), style: o.style === 'paragraph' ? ('paragraph' as const) : ('short' as const), required: o.required !== false, ...(typeof o.placeholder === 'string' && o.placeholder ? { placeholder: o.placeholder.slice(0, 100) } : {}) }] : [];
  }).slice(0, 5);
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
  const total = i.maxOpenTotal ?? 20;
  if (!Number.isInteger(total) || total < 1 || total > 1000) throw new TicketError('invalid', 'Die Kapazität muss zwischen 1 und 1000 liegen.');
  if (i.color != null && (!Number.isInteger(i.color) || i.color < 0 || i.color > 0xffffff)) throw new TicketError('invalid', 'Ungültige Farbe.');
  const required = [...new Set(i.requiredRoleIds ?? [])];
  if (required.length > 20 || required.some((r) => !ID.test(r))) throw new TicketError('invalid', 'Ungültige Rollenauswahl (benötigte Rollen).');
  if (i.nameTemplate && (i.nameTemplate.length > 80 || !/\{(number|user|category)\}/.test(i.nameTemplate))) throw new TicketError('invalid', 'Die Kanalnamen-Vorlage braucht {number}, {user} oder {category}.');
  const form = i.formFields == null ? null : parseFormFields(i.formFields);
  const extra = { color: i.color ?? null, maxOpenTotal: total, requiredRoleIds: required, nameTemplate: i.nameTemplate?.trim() || null, formFields: (form && form.length ? form : null) as never, transcriptEnabled: i.transcriptEnabled ?? null };
  const data = { ...extra, name, description: i.description?.trim() || null, emoji: i.emoji?.trim() || null, discordCategoryId: i.discordCategoryId || null, staffRoleIds: roles, defaultPriority: i.defaultPriority ?? 'NORMAL', maxOpenPerUser: max, active: i.active ?? true };
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
  /** Betreff; ohne Angabe gilt der Kategoriename (Ticket entsteht direkt nach der Kategorie-Auswahl). */
  subject?: string | undefined;
  description?: string | undefined;
  /** Rollen des Eröffnenden (für „benötigte Rollen“ der Kategorie). */
  roleIds?: readonly string[] | undefined;
  /** Antworten des Kategorie-Formulars. */
  formAnswers?: { label: string; value: string }[] | undefined;
  /** Ticket gehört zu dieser Bewerbung (Bewerbungsgespräch). */
  submission?: { id: string; name: string } | undefined;
  /** Wer das Ticket für jemanden eröffnet (z. B. Teammitglied bei „Ticket mit User“). */
  openedBy?: string | undefined;
}

const fill = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);
/** Kanalname aus der Vorlage: Discord-konform (klein, a–z, 0–9, Bindestrich, max. 100 Zeichen). */
export function channelName(template: string, v: { number: number; user: string; category: string }): string {
  const name = fill(template, { number: String(v.number).padStart(4, '0'), user: slug(v.user), category: slug(v.category) })
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return name || `ticket-${String(v.number).padStart(4, '0')}`;
}

/** Wer darf überall mitmachen? Teamrollen der Kategorie plus Admin-Rollen des Servers. */
const teamRoles = (cat: { staffRoleIds: string[] }, admin: string[]) => [...new Set([...cat.staffRoleIds, ...admin])];

export async function openTicket(i: OpenInput, discord: TicketDiscord) {
  const gid = assertGuildId(i.guildId);
  // Ticketsperre (nicht, wenn das Team das Ticket für jemanden eröffnet, z. B. Bewerbungsgespräch)
  if (!i.openedBy) {
    const ban = await getActive(gid, i.userId, 'TICKET');
    if (ban) throw new TicketError('forbidden', blockedMessage(ban));
  }
  const cat = await prisma.ticketCategory.findFirst({ where: { id: i.categoryId, guildId: gid } });
  if (!cat || !cat.active) throw new TicketError('not-found', 'Diese Ticket-Kategorie gibt es nicht oder sie ist deaktiviert.');
  const settings = await getSettings(gid);
  const subject = (i.subject?.trim() || cat.name).slice(0, 100);
  if (i.subject !== undefined && i.subject.trim() && (subject.length < 3)) throw new TicketError('invalid', 'Der Betreff muss mindestens 3 Zeichen lang sein.');
  if ((i.description?.length ?? 0) > 1500) throw new TicketError('invalid', 'Die Beschreibung ist zu lang (max. 1500 Zeichen).');
  if (cat.requiredRoleIds.length > 0 && i.roleIds && !cat.requiredRoleIds.some((r) => i.roleIds!.includes(r))) throw new TicketError('forbidden', `Für „${cat.name}“ brauchst du eine bestimmte Rolle.`);
  const open = await prisma.ticket.count({ where: { guildId: gid, userId: i.userId, categoryId: cat.id, status: { not: 'CLOSED' } } });
  if (open >= cat.maxOpenPerUser) throw new TicketError('conflict', open === 1 && cat.maxOpenPerUser === 1 ? `Du hast bereits ein offenes Ticket in „${cat.name}“.` : `Du hast in „${cat.name}“ bereits ${open} offene(s) Ticket(s) (erlaubt: ${cat.maxOpenPerUser}).`);
  const ticket = await prisma.$transaction(async (tx) => {
    // Kapazität unter Sperre prüfen, damit gleichzeitige Eröffnungen die Grenze nicht überschreiten
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'ticket-cap:' + cat.id}))`;
    const total = await tx.ticket.count({ where: { guildId: gid, categoryId: cat.id, status: { in: ['OPEN', 'CLAIMED'] } } });
    if (total >= cat.maxOpenTotal) throw new TicketError('conflict', `„${cat.name}“ ist aktuell voll (${total}/${cat.maxOpenTotal}). Bitte versuche es später erneut.`);
    const c = await tx.ticketCounter.upsert({ where: { guildId: gid }, create: { guildId: gid, last: 1 }, update: { last: { increment: 1 } } });
    return tx.ticket.create({ data: { guildId: gid, number: c.last, categoryId: cat.id, userId: i.userId, subject, description: i.description?.trim() || null, priority: cat.defaultPriority, ...(i.formAnswers?.length ? { formAnswers: i.formAnswers as never } : {}), ...(i.submission ? { submissionId: i.submission.id } : {}) }, include });
  });
  const staff = teamRoles(cat, settings.adminRoleIds);
  const creatorMember = i.username;
  let channelId: string;
  try {
    channelId = await discord.createChannel({ guildId: gid, name: channelName(cat.nameTemplate ?? settings.nameTemplate, { number: ticket.number, user: creatorMember, category: cat.name }), parentId: cat.discordCategoryId, topic: `${cat.name}: ${subject}`.slice(0, 1000), userIds: [i.userId], roleIds: staff });
  } catch {
    // Ohne Kanal ist das Ticket nutzlos – zurückrollen, damit die Nummer nicht „leer“ im Archiv steht
    await prisma.ticket.delete({ where: { id: ticket.id } });
    throw new TicketError('conflict', 'Der Ticket-Kanal konnte nicht angelegt werden (Bot-Rechte „Kanäle verwalten“ und Kategorie prüfen).');
  }
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { channelId }, include });
  await event(gid, ticket.id, 'opened', i.openedBy ?? i.userId, { category: cat.name, subject, ...(i.submission ? { submissionId: i.submission.id } : {}) });
  const intro = i.submission
    ? { title: '🎫 Bewerbungsgespräch', description: `**Bewerber:**\n<@${i.userId}>\n\n**Bewerbung:**\n${i.submission.name}${i.openedBy ? `\n\n**Eröffnet von:**\n<@${i.openedBy}>` : ''}` }
    : { title: settings.openTitle, description: fill(settings.openText, { user: `<@${i.userId}>`, category: cat.name, number: formatNumber(ticket.number) }) };
  const fields = (i.formAnswers ?? []).slice(0, 5).map((a) => ({ name: a.label.slice(0, 256), value: a.value.slice(0, 1000) || '–', inline: false }));
  await discord
    .send(channelId, {
      content: `<@${i.userId}>${staff.length ? ` ${staff.map((r) => `<@&${r}>`).join(' ')}` : ''}`,
      embeds: [{ title: `${intro.title}`, description: [intro.description, i.description?.trim()].filter(Boolean).join('\n\n').slice(0, 4000), color: cat.color ?? settings.color, fields: [{ name: 'Kategorie', value: `${cat.emoji ? `${cat.emoji} ` : ''}${cat.name}`, inline: true }, { name: 'Ticket', value: formatNumber(ticket.number), inline: true }, ...fields], footer: { text: `Ticket-ID ${ticket.id}` } }],
      components: ticketButtons(ticket.id, settings, i.submission ? true : false),
      // @ts-expect-error allowed_mentions ist Teil der Discord-Nachricht, aber nicht des schmalen MessagePayload-Typs
      allowed_mentions: { users: [i.userId], roles: staff },
    })
    .catch(() => undefined);
  void refreshPanel(gid, discord).catch(() => undefined);
  return updated;
}


/** Buttons im Ticket-Kanal; Custom-IDs werden vom Bot-Handler ausgewertet. Anzeige richtet sich nach den Server-Einstellungen. */
export function ticketButtons(ticketId: string, s: { claimEnabled: boolean; closeWithReason: boolean }, withApplication = false): NonNullable<MessagePayload['components']> {
  const b = (style: number, label: string, emoji: string, action: string) => ({ type: 2, style, label, emoji: { name: emoji }, custom_id: `nexus:ticket:${action}:${ticketId}` });
  const row1 = [b(4, 'Ticket schließen', '🔒', 'close'), ...(s.closeWithReason ? [b(2, 'Schließen mit Grund', '📝', 'closer')] : []), ...(s.claimEnabled ? [b(1, 'Claim / Übernehmen', '👤', 'claim')] : []), b(2, 'Benachrichtigung', '🔔', 'ping'), b(2, 'Informationen', '📋', 'info')];
  const rows = [{ type: 1, components: row1 }];
  if (withApplication) rows.push({ type: 1, components: [b(2, 'View Applicants Application', '📄', 'app')] });
  return rows as never;
}

export interface Actor {
  userId: string;
  roleIds: readonly string[];
  /** `tickets.manage` / Administrator */
  manage: boolean;
  /** `tickets.handle` */
  handle: boolean;
}

type WithCat = { category: { staffRoleIds: string[] } };

/** Darf der Handelnde dieses Ticket bearbeiten (Bearbeiter-Rolle der Kategorie oder Verwaltung)? */
export function isStaff(t: WithCat, a: Actor): boolean {
  return a.manage || (a.handle && (t.category.staffRoleIds.length === 0 || t.category.staffRoleIds.some((r) => a.roleIds.includes(r))));
}

/** Admin-Rollen des Servers zählen wie Verwaltung (alles in allen Tickets). */
async function withAdmin(gid: string, a: Actor): Promise<{ actor: Actor; settings: Awaited<ReturnType<typeof getSettings>> }> {
  const settings = await getSettings(gid);
  const admin = settings.adminRoleIds.some((r) => a.roleIds.includes(r));
  return { settings, actor: admin ? { ...a, manage: true, handle: true } : a };
}

/** „Nur der Bearbeiter“: bei aktiviertem Claim-Zwang darf nur der Bearbeiter (oder die Verwaltung) ein übernommenes Ticket verändern. */
function assertExclusive(t: { claimedBy: string | null }, a: Actor, settings: { claimEnabled: boolean; claimExclusive: boolean }): void {
  if (settings.claimEnabled && settings.claimExclusive && t.claimedBy && t.claimedBy !== a.userId && !a.manage) throw new TicketError('forbidden', `Dieses Ticket wird von <@${t.claimedBy}> bearbeitet – nur diese Person (oder die Verwaltung) kann es ändern.`);
}

async function openTicketOf(guildId: string, id: string) {
  const t = await getTicket(guildId, id);
  if (t.status === 'CLOSED') throw new TicketError('conflict', 'Dieses Ticket ist bereits geschlossen.');
  return t;
}

/** Übernahme: genau ein Bearbeiter; bereits übernommene Tickets nur mit Verwaltungsrecht neu zuweisen. */
export async function claim(guildId: string, id: string, rawActor: Actor, discord?: TicketDiscord, now = new Date()) {
  const gid = assertGuildId(guildId);
  const { actor, settings } = await withAdmin(gid, rawActor);
  if (!settings.claimEnabled) throw new TicketError('conflict', 'Die Übernahme von Tickets ist auf diesem Server deaktiviert.');
  const t = await openTicketOf(gid, id);
  if (!isStaff(t, actor)) throw new TicketError('forbidden', 'Nur Bearbeiter dieser Kategorie können Tickets übernehmen.');
  if (t.claimedBy === actor.userId) throw new TicketError('conflict', 'Du bearbeitest dieses Ticket bereits.');
  if (t.claimedBy && !actor.manage) throw new TicketError('conflict', `Das Ticket wird bereits von <@${t.claimedBy}> bearbeitet.`);
  const r = await prisma.ticket.updateMany({ where: { id, status: { not: 'CLOSED' }, claimedBy: t.claimedBy }, data: { status: 'CLAIMED', claimedBy: actor.userId, claimedAt: now } });
  if (r.count === 0) throw new TicketError('conflict', 'Das Ticket wurde gerade geändert – bitte erneut versuchen.');
  await event(gid, id, 'claimed', actor.userId, { previous: t.claimedBy });
  if (t.channelId && discord)
    await discord
      .send(t.channelId, { embeds: [{ title: '🎫 Ticket übernommen', description: `Dieses Ticket wird aktuell von <@${actor.userId}> bearbeitet.`, color: t.category.color ?? settings.color }], allowed_mentions: { parse: [] } } as never)
      .catch(() => undefined);
  return getTicket(gid, id);
}

export async function release(guildId: string, id: string, rawActor: Actor, discord?: TicketDiscord) {
  const gid = assertGuildId(guildId);
  const { actor } = await withAdmin(gid, rawActor);
  const t = await openTicketOf(gid, id);
  if (!t.claimedBy) throw new TicketError('conflict', 'Das Ticket ist niemandem zugewiesen.');
  if (t.claimedBy !== actor.userId && !actor.manage) throw new TicketError('forbidden', 'Nur der Bearbeiter oder die Verwaltung kann das Ticket freigeben.');
  await prisma.ticket.update({ where: { id }, data: { status: 'OPEN', claimedBy: null, claimedAt: null } });
  await event(gid, id, 'released', actor.userId, { previous: t.claimedBy });
  if (t.channelId && discord) await discord.send(t.channelId, { content: `↩️ <@${t.claimedBy}> hat das Ticket freigegeben.`, allowed_mentions: { parse: [] } } as never).catch(() => undefined);
  return getTicket(gid, id);
}

export async function setPriority(guildId: string, id: string, priority: string, rawActor: Actor) {
  const gid = assertGuildId(guildId);
  if (!(PRIORITIES as readonly string[]).includes(priority)) throw new TicketError('invalid', 'Unbekannte Priorität.');
  const { actor, settings } = await withAdmin(gid, rawActor);
  const t = await openTicketOf(gid, id);
  if (!isStaff(t, actor)) throw new TicketError('forbidden', 'Nur Bearbeiter können die Priorität ändern.');
  assertExclusive(t, actor, settings);
  if (t.priority === priority) return t;
  await prisma.ticket.update({ where: { id }, data: { priority } });
  await event(gid, id, 'priority', actor.userId, { from: t.priority, to: priority });
  return getTicket(gid, id);
}

/** Mitglied zum Ticket hinzufügen bzw. entfernen (Kanalrecht wird gesetzt). */
export async function setParticipant(guildId: string, id: string, userId: string, add: boolean, rawActor: Actor, discord: TicketDiscord) {
  const gid = assertGuildId(guildId);
  if (!ID.test(userId)) throw new TicketError('invalid', 'Ungültige Discord-ID.');
  const { actor, settings } = await withAdmin(gid, rawActor);
  const t = await openTicketOf(gid, id);
  if (!isStaff(t, actor) && t.userId !== actor.userId) throw new TicketError('forbidden', 'Nur der Ersteller oder Bearbeiter kann Mitglieder hinzufügen.');
  if (isStaff(t, actor)) assertExclusive(t, actor, settings);
  if (userId === t.userId) throw new TicketError('invalid', 'Der Ersteller hat immer Zugriff.');
  const has = t.participantIds.includes(userId);
  if (add === has) throw new TicketError('conflict', add ? 'Das Mitglied ist schon im Ticket.' : 'Das Mitglied ist nicht im Ticket.');
  if (t.channelId) await discord.setMemberAccess(t.channelId, userId, add).catch(() => { throw new TicketError('conflict', 'Der Kanalzugriff konnte nicht geändert werden (Bot-Rechte prüfen).'); });
  await prisma.ticket.update({ where: { id }, data: { participantIds: add ? [...t.participantIds, userId] : t.participantIds.filter((x) => x !== userId) } });
  await event(gid, id, add ? 'participant.added' : 'participant.removed', actor.userId, { userId });
  return getTicket(gid, id);
}

const PING_COOLDOWN_MS = 5 * 60_000;
/** 🔔 Benachrichtigung: weist das Team (oder den Bearbeiter) auf das Ticket hin – höchstens alle 5 Minuten. */
export async function pingStaff(guildId: string, id: string, rawActor: Actor, discord: TicketDiscord, now = new Date()) {
  const gid = assertGuildId(guildId);
  const { actor, settings } = await withAdmin(gid, rawActor);
  const t = await openTicketOf(gid, id);
  if (t.userId !== actor.userId && !isStaff(t, actor) && !t.participantIds.includes(actor.userId)) throw new TicketError('forbidden', 'Nur Beteiligte können das Team benachrichtigen.');
  if (t.lastPingAt && now.getTime() - t.lastPingAt.getTime() < PING_COOLDOWN_MS) throw new TicketError('conflict', `Das Team wurde gerade erst benachrichtigt. Bitte warte ${Math.ceil((PING_COOLDOWN_MS - (now.getTime() - t.lastPingAt.getTime())) / 60_000)} Minute(n).`);
  const roles = teamRoles(t.category, settings.adminRoleIds);
  const target = t.claimedBy ? `<@${t.claimedBy}>` : roles.map((r) => `<@&${r}>`).join(' ') || 'Team';
  await prisma.ticket.update({ where: { id }, data: { lastPingAt: now } });
  await event(gid, id, 'ping', actor.userId);
  if (t.channelId) await discord.send(t.channelId, { content: `🔔 ${target} – <@${actor.userId}> bittet um Aufmerksamkeit in diesem Ticket.`, allowed_mentions: t.claimedBy ? { users: [t.claimedBy] } : { roles } } as never);
  return getTicket(gid, id);
}

export interface CloseResult {
  ticket: Awaited<ReturnType<typeof getTicket>>;
  transcriptMessages: number;
  /** Nachrichteninhalte waren lesbar (Message-Content-Intent). */
  contentAvailable: boolean;
  /** Transcript wurde in den Transcript-Kanal gesendet. */
  logged: boolean;
  dmDelivered: boolean;
  /** Kanal wurde sofort gelöscht. */
  channelDeleted: boolean;
  /** Löschzeitpunkt des Kanals (bei Löschfrist > 0). */
  deleteAt: Date | null;
}

export const transcriptFileName = (t: { number: number }, username: string) => `ticket-${String(t.number).padStart(4, '0')}-${slug(username)}.html`;

/**
 * Schließt das Ticket (Ablauf): Status + Grund sichern → Nachrichten lesen → HTML-Transcript erzeugen und speichern →
 * Ersteller/Beteiligte verlieren den Zugriff (Team behält ihn) → Hinweis im Ticket → Transcript in den Transcript-Kanal
 * (und optional per DM) → Kanal nach der Löschfrist entfernen → Panel-Auslastung aktualisieren.
 */
export async function closeTicket(
  guildId: string,
  id: string,
  reason: string | undefined,
  rawActor: Actor,
  discord: TicketDiscord,
  opts: { deleteChannel?: boolean; now?: Date; dashboardUrl?: string | undefined; names?: Record<string, string> } = {},
): Promise<CloseResult> {
  const gid = assertGuildId(guildId);
  const { actor, settings } = await withAdmin(gid, rawActor);
  const t = await openTicketOf(gid, id);
  const isCreator = t.userId === actor.userId;
  if (!isStaff(t, actor) && !isCreator) throw new TicketError('forbidden', 'Nur der Ersteller oder ein Bearbeiter kann das Ticket schließen.');
  if (!isCreator) assertExclusive(t, actor, settings);
  const why = reason?.trim() || null;
  if (why && why.length > 300) throw new TicketError('invalid', 'Der Grund ist zu lang (max. 300 Zeichen).');
  const now = opts.now ?? new Date();
  let messages: TranscriptMessage[] = [];
  if (t.channelId) messages = await discord.fetchMessages(t.channelId).catch(() => []);
  // Ohne Message-Content-Intent liefert Discord leere Inhalte – das wird festgehalten, nicht verschwiegen
  const humans = messages.filter((m) => !m.bot);
  const contentAvailable = humans.length === 0 || humans.some((m) => m.content.length > 0 || m.attachments.length > 0);
  const wantTranscript = t.category.transcriptEnabled ?? settings.transcriptEnabled;
  const deleteNow = opts.deleteChannel !== false && settings.deleteAfterMinutes === 0;
  const deleteAt = opts.deleteChannel !== false && settings.deleteAfterMinutes > 0 ? new Date(now.getTime() + settings.deleteAfterMinutes * 60_000) : null;

  const guild = await prisma.guild.findUnique({ where: { id: gid }, select: { name: true, iconUrl: true } });
  const creatorName = opts.names?.[t.userId] ?? messages.find((m) => m.authorId === t.userId)?.author ?? t.userId;
  const events = await prisma.ticketEvent.findMany({ where: { ticketId: id, type: { in: ['claimed', 'released', 'priority', 'participant.added', 'participant.removed'] } }, orderBy: { at: 'asc' } });
  const sysText = (e: (typeof events)[number]) => {
    const who = opts.names?.[e.actorId ?? ''] ?? e.actorId ?? 'System';
    return e.type === 'claimed' ? `${who} hat das Ticket übernommen` : e.type === 'released' ? `${who} hat das Ticket freigegeben` : e.type === 'priority' ? `${who} änderte die Priorität` : e.type === 'participant.added' ? `${who} fügte ein Mitglied hinzu` : `${who} entfernte ein Mitglied`;
  };
  const html = wantTranscript
    ? renderTranscriptHtml(
        { guildName: guild?.name ?? gid, guildIconUrl: guild?.iconUrl ?? null, ticketName: `ticket-${String(t.number).padStart(4, '0')}`, ticketId: t.id, number: formatNumber(t.number), category: t.category.name, creatorTag: creatorName, creatorId: t.userId, createdAt: t.createdAt, closedAt: now, closedBy: actor.userId, claimedBy: t.claimedBy, reason: why, names: { ...opts.names, [t.userId]: creatorName }, systemEvents: events.map((e) => ({ at: e.at.toISOString(), text: sysText(e) })) },
        messages,
      )
    : null;

  const r = await prisma.ticket.updateMany({ where: { id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED', closedBy: actor.userId, closedAt: now, closeReason: why, transcript: messages as unknown as Json, transcriptContent: contentAvailable, transcriptHtml: html, deleteAt } });
  if (r.count === 0) throw new TicketError('conflict', 'Das Ticket wurde gerade geschlossen.');
  await event(gid, id, 'closed', actor.userId, { reason: why, messages: messages.length, contentAvailable });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId: actor.userId, action: 'ticket.closed', resourceType: 'Ticket', resourceId: id, before: { number: t.number, status: t.status } as Json, after: { status: 'CLOSED', messages: messages.length } as Json, reason: why, permission: isStaff(t, actor) ? 'tickets.handle' : 'tickets.create', result: 'success' } });

  // Ersteller und Beteiligte verlieren den Zugriff, das Team behält ihn
  if (t.channelId && !deleteNow) for (const uid of [t.userId, ...t.participantIds]) await discord.setMemberAccess(t.channelId, uid, false).catch(() => undefined);
  if (t.channelId && !deleteNow)
    await discord
      .send(t.channelId, { embeds: [{ title: '🔒 Ticket geschlossen', description: `Dieses Ticket wurde von <@${actor.userId}> geschlossen.${why ? `\n\n**Grund:**\n${why}` : ''}${deleteAt ? `\n\nDer Kanal wird <t:${Math.floor(deleteAt.getTime() / 1000)}:R> gelöscht.` : ''}`, color: 0x6b7280 }], allowed_mentions: { parse: [] } } as never)
      .catch(() => undefined);

  const file = html ? { name: transcriptFileName(t, creatorName), content: html, contentType: 'text/html; charset=utf-8' } : null;
  const summary: MessagePayload = {
    embeds: [{ title: '📄 Ticket Transcript', color: t.category.color ?? settings.color, fields: [{ name: 'Ticket', value: `#${`ticket-${String(t.number).padStart(4, '0')}`}`, inline: true }, { name: 'Kategorie', value: t.category.name, inline: true }, { name: 'Ersteller', value: `<@${t.userId}>`, inline: true }, { name: 'Geschlossen von', value: `<@${actor.userId}>`, inline: true }, { name: 'Bearbeiter', value: t.claimedBy ? `<@${t.claimedBy}>` : '–', inline: true }, { name: 'Nachrichten', value: String(messages.length), inline: true }, { name: 'Grund', value: why ?? '–', inline: false }], footer: { text: `Ticket-ID ${t.id}` }, timestamp: now.toISOString() }],
    ...(opts.dashboardUrl ? { components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Transcript öffnen', emoji: { name: '📄' }, url: `${opts.dashboardUrl}/guilds/${gid}/tickets?ticket=${t.id}` }] }] } : {}),
    allowed_mentions: { parse: [] },
  } as never;
  let logged = false;
  const transcriptChannel = settings.transcriptChannelId ?? (await guildRepository.getSelections(gid))['ticket-log-channel'];
  if (transcriptChannel) logged = await (file ? discord.sendFile(transcriptChannel, summary, file) : discord.send(transcriptChannel, summary)).then(() => true, () => false);
  const dmPayload: MessagePayload = { content: `🎫 Dein Ticket ${formatNumber(t.number)} („${t.subject}“) wurde geschlossen.${why ? `\nGrund: ${why}` : ''}` } as never;
  const dmDelivered = await (file && settings.dmTranscript ? discord.sendDmFile(t.userId, dmPayload, file) : discord.sendDm(t.userId, dmPayload)).then(() => true, () => false);

  let channelDeleted = false;
  if (t.channelId && deleteNow) {
    channelDeleted = await discord.deleteChannel(t.channelId).then(() => true, () => false);
    if (channelDeleted) await prisma.ticket.update({ where: { id }, data: { channelDeletedAt: now } });
  }
  void refreshPanel(gid, discord).catch(() => undefined);
  return { ticket: await getTicket(gid, id), transcriptMessages: messages.length, contentAvailable, logged, dmDelivered, channelDeleted, deleteAt };
}

/** Löscht die Kanäle geschlossener Tickets, deren Löschfrist abgelaufen ist (Worker-Job). Bereits fehlende Kanäle gelten als gelöscht. */
export async function deleteDueChannels(discord: TicketDiscord, now = new Date()): Promise<{ deleted: number; failed: number }> {
  const due = await prisma.ticket.findMany({ where: { status: 'CLOSED', deleteAt: { lte: now }, channelDeletedAt: null, channelId: { not: null } }, take: 50, orderBy: { deleteAt: 'asc' } });
  const r = { deleted: 0, failed: 0 };
  for (const t of due) {
    try {
      await discord.deleteChannel(t.channelId!);
    } catch (e) {
      if (!(e instanceof DiscordApiError && e.status === 404)) {
        r.failed++;
        continue;
      }
    }
    await prisma.ticket.update({ where: { id: t.id }, data: { channelDeletedAt: now } });
    await event(t.guildId, t.id, 'channel.deleted', null);
    r.deleted++;
  }
  return r;
}

/** Aktualisiert die Panels aller Server mit Panel (nur bei Änderung wird Discord angefragt). */
export async function refreshAllPanels(discord: TicketDiscord): Promise<number> {
  const all = await prisma.ticketSettings.findMany({ where: { panelMessageId: { not: null } }, select: { guildId: true } });
  let n = 0;
  for (const g of all) if ((await refreshPanel(g.guildId, discord).catch(() => 'none')) === 'updated') n++;
  return n;
}

export { loads };

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
