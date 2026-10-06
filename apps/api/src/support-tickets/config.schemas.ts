import { z } from 'zod';
import { TICKET_ACTION_KEYS, QUESTION_TYPES, CLAIM_MODES, CLOSE_REASON_MODES, CLOSE_REASON_SOURCES, STATUS_KINDS } from '@enrp/shared';

const snowflake = z.string().regex(/^\d{15,25}$/, 'Discord ID (15–25 digits)');
const ids = z.array(snowflake).max(50).default([]);
const color = z.number().int().min(0).max(0xffffff);
const url = z.union([z.string().trim().url().max(500), z.literal(''), z.null()]).optional().transform((v) => v || null);
/** Discord-ID oder leer ("" / null = keine). */
const optId = z.union([snowflake, z.literal(''), z.null()]).optional().transform((v) => v || null);
const emoji = z.string().trim().max(64).nullish().transform((v) => v || null);
const style = z.enum(['primary', 'secondary', 'success', 'danger']);
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);

export const questionSchema = z.object({
  id: z.string().trim().min(1).max(40), label: z.string().trim().min(2).max(300), type: enumOf(QUESTION_TYPES), required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(100)).max(25).default([]), placeholder: z.string().trim().max(100).optional(),
  description: z.string().trim().max(200).optional(),
  minLength: z.number().int().min(0).max(4000).optional(), maxLength: z.number().int().min(1).max(4000).optional(),
}).refine((q) => !['SELECT', 'MULTI'].includes(q.type) || q.options.length >= 2, 'Selection questions need at least 2 options.')
  .refine((q) => q.minLength === undefined || q.maxLength === undefined || q.minLength <= q.maxLength, { message: 'Minimum length must not exceed the maximum.', path: ['minLength'] });

export const buttonSchema = z.object({
  action: z.enum(TICKET_ACTION_KEYS as [string, ...string[]]), label: z.string().trim().min(1).max(80), emoji: z.string().trim().max(64).optional(), style, enabled: z.boolean(),
});

const guildOpt = optId;
export const categorySchema = z.object({
  /** Discord-Server, auf dem es diese Ticket-Art gibt (leer = alle Server). */
  guildId: guildOpt,
  name: z.string().trim().min(1).max(80), description: z.string().trim().max(500).default(''), emoji, color: color.default(0x3b82f6), buttonStyle: style.default('secondary'),
  position: z.number().int().min(0).max(1000).default(0), active: z.boolean().default(true),
  discordCategoryId: optId,
  channelNameFormat: z.string().trim().min(1).max(90).default('ticket-{username}'),
  staffRoleIds: ids, extraRoleIds: ids, requiredRoleIds: ids, allowedUserIds: ids,
  accessRoleNames: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  maxOpen: z.number().int().min(0).max(100).default(1), cooldownMinutes: z.number().int().min(0).max(60 * 24 * 30).default(0),
  defaultPriorityId: z.string().uuid().nullable().optional(),
  questions: z.array(questionSchema).max(25).default([]).refine((q) => new Set(q.map((x) => x.id)).size === q.length, 'Question ids must be unique.'),
  welcomeTitle: z.string().trim().max(256).default('🎫 {category}'), welcomeMessage: z.string().trim().max(4000).default(''),
  mentionStaff: z.boolean().default(true), mentionText: z.string().trim().max(1000).default(''),
  buttons: z.array(buttonSchema).max(20).default([]),
  claimMode: enumOf(CLAIM_MODES).default('SINGLE'), claimMessage: z.string().trim().max(1000).default('👤 Bearbeiter: {staff}'), claimNotifyStaff: z.boolean().default(false),
  creatorCanClose: z.boolean().default(true), closeReasonMode: enumOf(CLOSE_REASON_MODES).default('OPTIONAL'), closeReasonSource: enumOf(CLOSE_REASON_SOURCES).default('BOTH'),
  closeRemovesAccess: z.boolean().default(true), allowReopen: z.boolean().default(true),
  transcriptOnClose: z.boolean().default(true), transcriptChannelId: optId, transcriptToUser: z.boolean().default(false),
  ratingEnabled: z.boolean().default(true), ratingQuestion: z.string().trim().max(300).default('Wie zufrieden warst du mit dem Support?'),
  autoCloseMinutes: z.number().int().min(0).max(60 * 24 * 90).default(0), autoCloseWarnMinutes: z.number().int().min(0).max(60 * 24 * 30).default(0),
  autoCloseMessage: z.string().trim().max(1000).default(''),
  deleteAfterMinutes: z.number().int().min(-1).max(60 * 24 * 365).default(-1),
  escalationRoleIds: ids, escalationPriorityId: z.string().uuid().nullable().optional(), escalationMessage: z.string().trim().max(1000).default(''),
  // wie GalaxyBot
  welcomeImageUrl: url, capacity: z.number().int().min(0).max(1000).default(0), creatorCanAddUsers: z.boolean().default(false),
  claimDiscordCategoryId: optId, claimLocksChat: z.boolean().default(false),
  autoClaimOnMessage: z.boolean().default(false), autoUnclaimMinutes: z.number().int().min(0).max(60 * 24 * 30).default(0),
  staffAlertMinutes: z.number().int().min(0).max(60 * 24 * 30).default(0), closeRequestCloses: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const panelSchema = z.object({
  guildId: guildOpt,
  name: z.string().trim().min(1).max(80), title: z.string().trim().max(256).default(''), description: z.string().trim().max(4000).default(''), emoji,
  color: color.default(0x3b82f6), thumbnailUrl: url, imageUrl: url, bannerUrl: url, footer: z.string().trim().max(2048).nullish().transform((v) => v || null), footerIconUrl: url,
  authorName: z.string().trim().max(256).nullish().transform((v) => v || null), authorIconUrl: url,
  style: z.enum(['BUTTONS', 'DROPDOWN']).default('BUTTONS'), placeholder: z.string().trim().min(1).max(150).default('Wähle eine Kategorie …'),
  channelId: optId,
  categoryIds: z.array(z.string().uuid()).max(25).default([]), allowedRoleIds: ids, showLoad: z.boolean().default(false), position: z.number().int().min(0).max(1000).default(0),
});
export type PanelInput = z.infer<typeof panelSchema>;

export const statusSchema = z.object({
  name: z.string().trim().min(1).max(60), emoji: z.string().trim().max(64).default(''), color: color.default(0x3b82f6), position: z.number().int().min(0).max(1000).default(0),
  kind: enumOf(STATUS_KINDS).default('OPEN'), isDefault: z.boolean().default(false), isClaimed: z.boolean().default(false), isEscalation: z.boolean().default(false), isClose: z.boolean().default(false),
});
export const prioritySchema = z.object({
  name: z.string().trim().min(1).max(60), emoji: z.string().trim().max(64).default(''), color: color.default(0x3b82f6), position: z.number().int().min(0).max(1000).default(0),
  isDefault: z.boolean().default(false), allowedRoleNames: z.array(z.string().trim().min(1).max(64)).max(30).default([]), notifyRoleIds: ids,
});
export const reasonSchema = z.object({ text: z.string().trim().min(1).max(200), position: z.number().int().min(0).max(1000).default(0) });

/** Allgemeine Einstellungen (CLOSED-Anzeige, Log-Channel, Texte). */
export const settingsSchema = z.object({
  logChannelId: optId,
  transcriptChannelId: optId,
  closedTitle: z.string().trim().min(1).max(256).default('🔒 CLOSED'),
  closedMessage: z.string().trim().max(4000).default('Dieses Ticket wurde geschlossen.\n\n**Grund:** {reason}\n**Geschlossen von:** {closed_by}\n**Zeit:** {closed_at}'),
  closedColor: color.default(0x64748b),
  reopenedMessage: z.string().trim().max(1000).default('🔓 Ticket wieder geöffnet von {actor}.'),
  ratingMessage: z.string().trim().max(1000).default('Dein Ticket **#{ticket_id}** ({category}) wurde geschlossen. {reason}'),
  ratingThanks: z.string().trim().max(500).default('Danke für deine Bewertung! ⭐'),
  transcriptRetentionDays: z.number().int().min(0).max(3650).default(0),
  /** Bewertungen: Team-Channel (alles) und öffentlicher Channel (nur die gewählten Werte). */
  ratingChannelId: optId,
  ratingPublicChannelId: optId,
  ratingPublicFields: z.array(z.enum(['creator', 'category', 'staff', 'duration', 'comment'])).max(5).default(['creator', 'category', 'duration']),
});
export type TicketSettings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: TicketSettings = settingsSchema.parse({});
