"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = exports.settingsSchema = exports.reasonSchema = exports.notifySchema = exports.NOTIFY_EVENTS = exports.departmentSchema = exports.prioritySchema = exports.statusSchema = exports.panelSchema = exports.categorySchema = exports.buttonSchema = exports.questionSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const snowflake = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const ids = zod_1.z.array(snowflake).max(50).default([]);
const color = zod_1.z.number().int().min(0).max(0xffffff);
const url = zod_1.z.union([zod_1.z.string().trim().url().max(500), zod_1.z.literal(''), zod_1.z.null()]).optional().transform((v) => v || null);
/** Discord-ID oder leer ("" / null = keine). */
const optId = zod_1.z.union([snowflake, zod_1.z.literal(''), zod_1.z.null()]).optional().transform((v) => v || null);
const emoji = zod_1.z.string().trim().max(64).nullish().transform((v) => v || null);
const style = zod_1.z.enum(['primary', 'secondary', 'success', 'danger']);
const enumOf = (o) => zod_1.z.enum(Object.keys(o));
exports.questionSchema = zod_1.z.object({
    id: zod_1.z.string().trim().min(1).max(40), label: zod_1.z.string().trim().min(2).max(300), type: enumOf(shared_1.QUESTION_TYPES), required: zod_1.z.boolean(),
    options: zod_1.z.array(zod_1.z.string().trim().min(1).max(100)).max(25).default([]), placeholder: zod_1.z.string().trim().max(100).optional(),
    description: zod_1.z.string().trim().max(200).optional(),
    minLength: zod_1.z.number().int().min(0).max(4000).optional(), maxLength: zod_1.z.number().int().min(1).max(4000).optional(),
    min: zod_1.z.number().min(-1e12).max(1e12).optional(), max: zod_1.z.number().min(-1e12).max(1e12).optional(), enabled: zod_1.z.boolean().optional(),
}).refine((q) => !['SELECT', 'MULTI'].includes(q.type) || q.options.length >= 2, 'Auswahlfragen brauchen mindestens 2 Optionen.')
    .refine((q) => new Set(q.options).size === q.options.length, 'Die Optionen müssen eindeutig sein.')
    .refine((q) => q.type !== 'FILE' || q.max === undefined || (Number.isInteger(q.max) && q.max >= 1 && q.max <= 10), { message: 'Anhänge: höchstens 1–10 Dateien.', path: ['max'] })
    .refine((q) => q.min === undefined || q.max === undefined || q.min <= q.max, { message: 'Der kleinste Wert darf nicht größer als der größte sein.', path: ['min'] })
    .refine((q) => q.minLength === undefined || q.maxLength === undefined || q.minLength <= q.maxLength, { message: 'Die Mindestlänge darf nicht größer als die Höchstlänge sein.', path: ['minLength'] });
exports.buttonSchema = zod_1.z.object({
    action: zod_1.z.enum(shared_1.TICKET_ACTION_KEYS), label: zod_1.z.string().trim().min(1).max(80), emoji: zod_1.z.string().trim().max(64).optional(), style, enabled: zod_1.z.boolean(),
});
const guildOpt = optId;
exports.categorySchema = zod_1.z.object({
    /** Discord-Server, auf dem es diese Ticket-Art gibt (leer = alle Server). */
    guildId: guildOpt,
    name: zod_1.z.string().trim().min(1).max(80), description: zod_1.z.string().trim().max(500).default(''), emoji, color: color.default(0x3b82f6), buttonStyle: style.default('secondary'),
    position: zod_1.z.number().int().min(0).max(1000).default(0), active: zod_1.z.boolean().default(true),
    discordCategoryId: optId,
    channelNameFormat: zod_1.z.string().trim().min(1).max(90).default('ticket-{username}'),
    staffRoleIds: ids, extraRoleIds: ids, requiredRoleIds: ids, allowedUserIds: ids,
    accessRoleNames: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(30).default([]),
    maxOpen: zod_1.z.number().int().min(0).max(100).default(1), cooldownMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0),
    defaultPriorityId: zod_1.z.string().uuid().nullable().optional(),
    questions: zod_1.z.array(exports.questionSchema).max(25).default([]).refine((q) => new Set(q.map((x) => x.id)).size === q.length, 'Die IDs der Fragen müssen eindeutig sein.'),
    welcomeTitle: zod_1.z.string().trim().max(256).default('🎫 {category}'), welcomeMessage: zod_1.z.string().trim().max(4000).default(''),
    mentionStaff: zod_1.z.boolean().default(true), mentionText: zod_1.z.string().trim().max(1000).default(''),
    buttons: zod_1.z.array(exports.buttonSchema).max(20).default([]),
    claimMode: enumOf(shared_1.CLAIM_MODES).default('SINGLE'), claimMessage: zod_1.z.string().trim().max(1000).default('👤 Bearbeiter: {staff}'), claimNotifyStaff: zod_1.z.boolean().default(false),
    creatorCanClose: zod_1.z.boolean().default(true), closeReasonMode: enumOf(shared_1.CLOSE_REASON_MODES).default('OPTIONAL'), closeReasonSource: enumOf(shared_1.CLOSE_REASON_SOURCES).default('BOTH'),
    closeRemovesAccess: zod_1.z.boolean().default(true), allowReopen: zod_1.z.boolean().default(true),
    transcriptOnClose: zod_1.z.boolean().default(true), transcriptChannelId: optId, transcriptToUser: zod_1.z.boolean().default(false),
    ratingEnabled: zod_1.z.boolean().default(true), ratingQuestion: zod_1.z.string().trim().max(300).default('Wie zufrieden warst du mit dem Support?'),
    autoCloseMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 90).default(0), autoCloseWarnMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0),
    autoCloseMessage: zod_1.z.string().trim().max(1000).default(''),
    deleteAfterMinutes: zod_1.z.number().int().min(-1).max(60 * 24 * 365).default(-1),
    escalationRoleIds: ids, escalationPriorityId: zod_1.z.string().uuid().nullable().optional(), escalationMessage: zod_1.z.string().trim().max(1000).default(''),
    // wie GalaxyBot
    welcomeImageUrl: url, capacity: zod_1.z.number().int().min(0).max(1000).default(0), creatorCanAddUsers: zod_1.z.boolean().default(false),
    claimDiscordCategoryId: optId, claimLocksChat: zod_1.z.boolean().default(false),
    autoClaimOnMessage: zod_1.z.boolean().default(false), autoUnclaimMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0),
    staffAlertMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0), closeRequestCloses: zod_1.z.boolean().default(true),
    // Premium: Abteilung, Vertraulichkeit, Formular vor dem Erstellen, Eskalation unzugewiesener Tickets
    departmentId: zod_1.z.string().uuid().nullable().optional().transform((v) => v ?? null), confidential: zod_1.z.boolean().default(false),
    formMode: zod_1.z.enum(['CHANNEL', 'MODAL']).default('CHANNEL'), escalateUnassignedMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 30).default(0),
});
exports.panelSchema = zod_1.z.object({
    guildId: guildOpt,
    name: zod_1.z.string().trim().min(1).max(80), title: zod_1.z.string().trim().max(256).default(''), description: zod_1.z.string().trim().max(4000).default(''), emoji,
    color: color.default(0x3b82f6), thumbnailUrl: url, imageUrl: url, bannerUrl: url, footer: zod_1.z.string().trim().max(2048).nullish().transform((v) => v || null), footerIconUrl: url,
    authorName: zod_1.z.string().trim().max(256).nullish().transform((v) => v || null), authorIconUrl: url,
    style: zod_1.z.enum(['BUTTONS', 'DROPDOWN']).default('BUTTONS'), placeholder: zod_1.z.string().trim().min(1).max(150).default('Wähle eine Kategorie …'),
    channelId: optId,
    // Discord: höchstens 25 Buttons; Dropdown: je Menü 25 Einträge, bis zu 4 Menüs
    categoryIds: zod_1.z.array(zod_1.z.string().uuid()).max(100).default([]), allowedRoleIds: ids, showLoad: zod_1.z.boolean().default(false), position: zod_1.z.number().int().min(0).max(1000).default(0),
}).refine((p) => p.style !== 'BUTTONS' || p.categoryIds.length <= 25, { message: 'Discord erlaubt höchstens 25 Buttons – nutze bei mehr Kategorien ein Dropdown (bis 100).', path: ['categoryIds'] });
exports.statusSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60), emoji: zod_1.z.string().trim().max(64).default(''), color: color.default(0x3b82f6), position: zod_1.z.number().int().min(0).max(1000).default(0),
    kind: enumOf(shared_1.STATUS_KINDS).default('OPEN'), isDefault: zod_1.z.boolean().default(false), isClaimed: zod_1.z.boolean().default(false), isEscalation: zod_1.z.boolean().default(false), isClose: zod_1.z.boolean().default(false),
    /** feste Bedeutung im Lebenszyklus (je Bedeutung höchstens ein Status) */
    key: zod_1.z.union([enumOf(shared_1.TICKET_STATUS_KEYS), zod_1.z.null()]).optional().transform((v) => v ?? null),
}).refine((s) => !s.key || (s.key === 'CLOSED' ? s.kind === 'CLOSED' : s.key === 'ARCHIVED' ? s.kind === 'ARCHIVED' : s.kind === 'OPEN'), { message: 'Die Bedeutung passt nicht zur Art des Status.', path: ['key'] });
exports.prioritySchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60), emoji: zod_1.z.string().trim().max(64).default(''), color: color.default(0x3b82f6), position: zod_1.z.number().int().min(0).max(1000).default(0),
    isDefault: zod_1.z.boolean().default(false), allowedRoleNames: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(30).default([]), notifyRoleIds: ids,
    /** SLA-Zielzeiten (Minuten); leer = keine Frist */
    firstResponseMinutes: zod_1.z.number().int().min(1).max(60 * 24 * 90).nullable().optional().transform((v) => v ?? null),
    resolutionMinutes: zod_1.z.number().int().min(1).max(60 * 24 * 365).nullable().optional().transform((v) => v ?? null),
});
exports.departmentSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(80), description: zod_1.z.string().trim().max(500).default(''), emoji,
    staffRoleIds: ids, leadRoleIds: ids, accessRoleNames: zod_1.z.array(zod_1.z.string().trim().min(1).max(64)).max(30).default([]),
    notifyChannelId: optId, active: zod_1.z.boolean().default(true), position: zod_1.z.number().int().min(0).max(1000).default(0),
});
/** Ereignisse mit einstellbaren Benachrichtigungen. */
exports.NOTIFY_EVENTS = {
    created: 'Neues Ticket', claimed: 'Ticket übernommen', assigned: 'Zuständigkeit geändert', user_message: 'Neue Nachricht des Nutzers', info_requested: 'Rückfrage an den Nutzer',
    priority: 'Priorität geändert', escalated: 'Eskalation (auch SLA / unzugewiesen)', closed: 'Ticket geschlossen', reopened: 'Ticket wieder geöffnet',
    transcript_ready: 'Transkript erstellt', transcript_failed: 'Transkript fehlgeschlagen',
};
/** channel = interner Kanal der Abteilung · dm = Discord-DM an die Bearbeiter · dashboard = Benachrichtigung im Dashboard an verknüpfte Bearbeiter. */
const rule = (channel, dm, dashboard) => zod_1.z.object({ channel: zod_1.z.boolean().default(channel), dm: zod_1.z.boolean().default(dm), dashboard: zod_1.z.boolean().default(dashboard) }).default({});
exports.notifySchema = zod_1.z.object({
    created: rule(true, false, false), claimed: rule(false, false, true), assigned: rule(true, true, true), user_message: rule(false, false, true), info_requested: rule(false, false, false),
    priority: rule(true, false, true), escalated: rule(true, true, true), closed: rule(false, false, false), reopened: rule(true, false, true),
    transcript_ready: rule(false, false, false), transcript_failed: rule(true, false, true),
}).default({});
exports.reasonSchema = zod_1.z.object({ text: zod_1.z.string().trim().min(1).max(200), position: zod_1.z.number().int().min(0).max(1000).default(0) });
/** Allgemeine Einstellungen (CLOSED-Anzeige, Log-Channel, Texte). */
exports.settingsSchema = zod_1.z.object({
    logChannelId: optId,
    transcriptChannelId: optId,
    closedTitle: zod_1.z.string().trim().min(1).max(256).default('🔒 CLOSED'),
    closedMessage: zod_1.z.string().trim().max(4000).default('Dieses Ticket wurde geschlossen.\n\n**Grund:** {reason}\n**Geschlossen von:** {closed_by}\n**Zeit:** {closed_at}'),
    closedColor: color.default(0x64748b),
    reopenedMessage: zod_1.z.string().trim().max(1000).default('🔓 Ticket wieder geöffnet von {actor}.'),
    ratingMessage: zod_1.z.string().trim().max(1000).default('Dein Ticket **#{ticket_id}** ({category}) wurde geschlossen. {reason}'),
    ratingThanks: zod_1.z.string().trim().max(500).default('Danke für deine Bewertung! ⭐'),
    transcriptRetentionDays: zod_1.z.number().int().min(0).max(3650).default(0),
    /** Bewertungen: Team-Channel (alles) und öffentlicher Channel (nur die gewählten Werte). */
    ratingChannelId: optId,
    ratingPublicChannelId: optId,
    ratingPublicFields: zod_1.z.array(zod_1.z.enum(['creator', 'category', 'staff', 'duration', 'comment'])).max(5).default(['creator', 'category', 'duration']),
    /** Ersteller verlässt den Discord-Server: offene Tickets schließen (braucht den Server Members Intent). */
    memberLeaveAction: zod_1.z.enum(['NONE', 'CLOSE']).default('NONE'),
    memberLeaveReason: zod_1.z.string().trim().min(1).max(300).default('Ersteller hat den Server verlassen'),
    // ---- Premium ----
    /** Präfix der dauerhaften Ticket-ID (EMD-000123) */
    refPrefix: zod_1.z.string().trim().regex(/^[A-Z]{2,8}$/, '2–8 Großbuchstaben').default('EMD'),
    /** offene Tickets je Nutzer über alle Kategorien (0 = unbegrenzt); Recht ticket.bypass_limits hebt es auf */
    maxOpenPerUser: zod_1.z.number().int().min(0).max(100).default(0),
    /** Discord-Server, auf dem Tickets geöffnet werden dürfen (leer = keine Einschränkung) */
    guildId: optId,
    /** vertrauliche Tickets ohne eingerichtete Abteilung: nur diese Rollen (z. B. Leitung) – nie die allgemeine Staff-Rolle */
    confidentialFallbackRoleIds: ids,
    /** Leitung für Eskalationen, wenn die Abteilung keine eigene hat (bekommt dadurch keinen Zugriff) */
    leadRoleIds: ids,
    /** Erinnerungen bei SLA-Überschreitung wiederholen (Minuten, 0 = nur einmal) und Eskalation an die Leitung nach … Minuten Überschreitung (0 = sofort) */
    slaReminderMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 7).default(60),
    slaEscalateAfterMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 7).default(30),
    /** Benachrichtigung „neue Nachricht des Nutzers“ höchstens alle … Minuten je Ticket */
    userMessageNotifyMinutes: zod_1.z.number().int().min(1).max(60 * 24).default(10),
    notifications: exports.notifySchema,
});
exports.DEFAULT_SETTINGS = exports.settingsSchema.parse({});
//# sourceMappingURL=config.schemas.js.map