"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.settingsSchema = exports.reasonSchema = exports.prioritySchema = exports.statusSchema = exports.panelSchema = exports.categorySchema = exports.buttonSchema = exports.questionSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const snowflake = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord ID (15–25 digits)');
const ids = zod_1.z.array(snowflake).max(50).default([]);
const color = zod_1.z.number().int().min(0).max(0xffffff);
const url = zod_1.z.union([zod_1.z.string().trim().url().max(500), zod_1.z.literal('')]).optional().transform((v) => v || null);
const emoji = zod_1.z.string().trim().max(64).optional().transform((v) => v || null);
const style = zod_1.z.enum(['primary', 'secondary', 'success', 'danger']);
const enumOf = (o) => zod_1.z.enum(Object.keys(o));
exports.questionSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1).max(40), label: zod_1.z.string().trim().min(2).max(300), type: enumOf(shared_1.QUESTION_TYPES), required: zod_1.z.boolean(),
    options: zod_1.z.array(zod_1.z.string().trim().min(1).max(100)).max(25).default([]), placeholder: zod_1.z.string().trim().max(100).optional(),
}).refine((q) => !['SELECT', 'MULTI'].includes(q.type) || q.options.length >= 2, 'Selection questions need at least 2 options.');
exports.buttonSchema = zod_1.z.object({
    action: zod_1.z.enum(shared_1.TICKET_ACTION_KEYS), label: zod_1.z.string().trim().min(1).max(80), emoji: zod_1.z.string().trim().max(64).optional(), style, enabled: zod_1.z.boolean(),
});
const guildOpt = zod_1.z.union([snowflake, zod_1.z.literal('')]).optional().transform((v) => v || null);
exports.categorySchema = zod_1.z.object({
    /** Discord-Server, auf dem es diese Ticket-Art gibt (leer = alle Server). */
    guildId: guildOpt,
    name: zod_1.z.string().trim().min(1).max(80), description: zod_1.z.string().trim().max(500).default(''), emoji, color: color.default(0x3b82f6), buttonStyle: style.default('secondary'),
    position: zod_1.z.number().int().min(0).max(1000).default(0), active: zod_1.z.boolean().default(true),
    discordCategoryId: zod_1.z.union([snowflake, zod_1.z.literal('')]).optional().transform((v) => v || null),
    channelNameFormat: zod_1.z.string().trim().min(1).max(90).default('ticket-{username}'),
    staffRoleIds: ids, extraRoleIds: ids, requiredRoleIds: ids, allowedUserIds: ids,
    accessRoleNames: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(30).default([]),
    maxOpen: zod_1.z.number().int().min(0).max(100).default(1), cooldownMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0),
    defaultPriorityId: zod_1.z.string().uuid().nullable().optional(),
    questions: zod_1.z.array(exports.questionSchema).max(25).default([]).refine((q) => new Set(q.map((x) => x.id)).size === q.length, 'Question ids must be unique.'),
    welcomeTitle: zod_1.z.string().trim().max(256).default('🎫 {category}'), welcomeMessage: zod_1.z.string().trim().max(4000).default(''),
    mentionStaff: zod_1.z.boolean().default(true), mentionText: zod_1.z.string().trim().max(1000).default(''),
    buttons: zod_1.z.array(exports.buttonSchema).max(20).default([]),
    claimMode: enumOf(shared_1.CLAIM_MODES).default('SINGLE'), claimMessage: zod_1.z.string().trim().max(1000).default('👤 Bearbeiter: {staff}'), claimNotifyStaff: zod_1.z.boolean().default(false),
    creatorCanClose: zod_1.z.boolean().default(true), closeReasonMode: enumOf(shared_1.CLOSE_REASON_MODES).default('OPTIONAL'), closeReasonSource: enumOf(shared_1.CLOSE_REASON_SOURCES).default('BOTH'),
    closeRemovesAccess: zod_1.z.boolean().default(true), allowReopen: zod_1.z.boolean().default(true),
    transcriptOnClose: zod_1.z.boolean().default(true), transcriptChannelId: zod_1.z.union([snowflake, zod_1.z.literal('')]).optional().transform((v) => v || null), transcriptToUser: zod_1.z.boolean().default(false),
    ratingEnabled: zod_1.z.boolean().default(true), ratingQuestion: zod_1.z.string().trim().max(300).default('Wie zufrieden warst du mit dem Support?'),
    autoCloseMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 90).default(0), autoCloseWarnMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0),
    autoCloseMessage: zod_1.z.string().trim().max(1000).default(''),
    deleteAfterMinutes: zod_1.z.number().int().min(-1).max(60 * 24 * 365).default(-1),
    escalationRoleIds: ids, escalationPriorityId: zod_1.z.string().uuid().nullable().optional(), escalationMessage: zod_1.z.string().trim().max(1000).default(''),
});
exports.panelSchema = zod_1.z.object({
    guildId: guildOpt,
    name: zod_1.z.string().trim().min(1).max(80), title: zod_1.z.string().trim().max(256).default(''), description: zod_1.z.string().trim().max(4000).default(''), emoji,
    color: color.default(0x3b82f6), thumbnailUrl: url, imageUrl: url, bannerUrl: url, footer: zod_1.z.string().trim().max(2048).optional().transform((v) => v || null), footerIconUrl: url,
    authorName: zod_1.z.string().trim().max(256).optional().transform((v) => v || null), authorIconUrl: url,
    style: zod_1.z.enum(['BUTTONS', 'DROPDOWN']).default('BUTTONS'), placeholder: zod_1.z.string().trim().min(1).max(150).default('Wähle eine Kategorie …'),
    channelId: zod_1.z.union([snowflake, zod_1.z.literal('')]).optional().transform((v) => v || null),
    categoryIds: zod_1.z.array(zod_1.z.string().uuid()).max(25).default([]), allowedRoleIds: ids, position: zod_1.z.number().int().min(0).max(1000).default(0),
});
exports.statusSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60), emoji: zod_1.z.string().trim().max(64).default(''), color: color.default(0x3b82f6), position: zod_1.z.number().int().min(0).max(1000).default(0),
    kind: enumOf(shared_1.STATUS_KINDS).default('OPEN'), isDefault: zod_1.z.boolean().default(false), isClaimed: zod_1.z.boolean().default(false), isEscalation: zod_1.z.boolean().default(false), isClose: zod_1.z.boolean().default(false),
});
exports.prioritySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60), emoji: zod_1.z.string().trim().max(64).default(''), color: color.default(0x3b82f6), position: zod_1.z.number().int().min(0).max(1000).default(0),
    isDefault: zod_1.z.boolean().default(false), allowedRoleNames: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(30).default([]), notifyRoleIds: ids,
});
exports.reasonSchema = zod_1.z.object({ text: zod_1.z.string().trim().min(1).max(200), position: zod_1.z.number().int().min(0).max(1000).default(0) });
/** Allgemeine Einstellungen (CLOSED-Anzeige, Log-Channel, Texte). */
exports.settingsSchema = zod_1.z.object({
    logChannelId: zod_1.z.union([snowflake, zod_1.z.literal('')]).optional().transform((v) => v || null),
    transcriptChannelId: zod_1.z.union([snowflake, zod_1.z.literal('')]).optional().transform((v) => v || null),
    closedTitle: zod_1.z.string().trim().min(1).max(256).default('🔒 CLOSED'),
    closedMessage: zod_1.z.string().trim().max(4000).default('Dieses Ticket wurde geschlossen.\n\n**Grund:** {reason}\n**Geschlossen von:** {closed_by}\n**Zeit:** {closed_at}'),
    closedColor: color.default(0x64748b),
    reopenedMessage: zod_1.z.string().trim().max(1000).default('🔓 Ticket wieder geöffnet von {actor}.'),
    ratingMessage: zod_1.z.string().trim().max(1000).default('Dein Ticket **#{ticket_id}** ({category}) wurde geschlossen. {reason}'),
    ratingThanks: zod_1.z.string().trim().max(500).default('Danke für deine Bewertung! ⭐'),
    transcriptRetentionDays: zod_1.z.number().int().min(0).max(3650).default(0),
});
exports.DEFAULT_SETTINGS = exports.settingsSchema.parse({});
//# sourceMappingURL=config.schemas.js.map