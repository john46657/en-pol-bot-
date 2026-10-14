"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.saveSchema = exports.configSchema = exports.policeSchema = exports.unitSchema = exports.appSettingsSchema = exports.formSchema = exports.formFieldSchema = void 0;
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const roleIdOpt = zod_1.z.union([zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)'), zod_1.z.literal('')]).optional().transform((v) => v || undefined);
/** Eine Bewerbungsfrage wie bei Appy: Text, Auswahl oder Rollen-Auswahl – mit Prüf-Einstellungen. */
exports.formFieldSchema = zod_1.z.object({
    key: zod_1.z.string().regex(/^[a-zA-Z][\w]{0,40}$/), label: zod_1.z.string().trim().min(1).max(300), required: zod_1.z.boolean(),
    type: zod_1.z.enum(Object.keys(shared_1.FORM_QUESTION_TYPES)).default('TEXT'),
    minLength: zod_1.z.number().int().min(0).max(5000).default(0), maxLength: zod_1.z.number().int().min(1).max(5000).default(1000),
    options: zod_1.z.array(zod_1.z.object({ label: zod_1.z.string().trim().min(1).max(100), roleId: roleIdOpt })).max(shared_1.MAX_FORM_OPTIONS).default([]),
    multiple: zod_1.z.boolean().default(false),
}).superRefine((f, ctx) => {
    if (f.minLength > f.maxLength)
        ctx.addIssue({ code: 'custom', path: ['minLength'], message: 'Die Mindestlänge ist größer als die Höchstlänge.' });
    if (f.type !== 'TEXT' && f.type !== 'ROBLOX' && f.options.length < 1)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Füge mindestens eine Option hinzu.' });
    if (f.type === 'ROLE' && f.options.some((o) => !o.roleId))
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Jede Option einer Rollenauswahl braucht eine Discord-Rollen-ID.' });
    if (new Set(f.options.map((o) => o.label)).size !== f.options.length)
        ctx.addIssue({ code: 'custom', path: ['options'], message: 'Die Optionen müssen eindeutig sein.' });
});
exports.formSchema = zod_1.z.array(exports.formFieldSchema).min(1).max(shared_1.MAX_FORM_QUESTIONS).refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Die Schlüssel der Fragen müssen eindeutig sein.');
/** Fragen einer Einheit: früher nur Text (eine Zeile pro Frage) – alte Einträge werden zu Text-Fragen. */
const unitQuestions = zod_1.z.array(zod_1.z.union([zod_1.z.string().trim().min(3).max(300), exports.formFieldSchema])).min(1).max(shared_1.MAX_FORM_QUESTIONS)
    .transform((qs) => qs.map((q, i) => (typeof q === 'string' ? { key: `q${i + 1}`, label: q, required: true, type: 'TEXT', minLength: 0, maxLength: 1000, options: [], multiple: false } : q)))
    .refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Die Schlüssel der Fragen müssen eindeutig sein.');
/** Wie bei Appy: Bewerbung offen/geschlossen, Channels für angenommene/abgelehnte Bewerbungen. */
const channelOpt = zod_1.z.union([zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Kanal-ID (15–25 Ziffern)'), zod_1.z.literal('')]).optional();
const roleList = zod_1.z.array(zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(25).default([]);
const roleRule = zod_1.z.object({ ids: roleList, mode: zod_1.z.enum(['ALL', 'ANY']).default('ANY') }).default({});
/** Texte, Rollen und Sonstiges je Bewerbung (wie Appy: Embed Customization, Role Config, Other). */
exports.appSettingsSchema = zod_1.z.object({
    messages: zod_1.z.object({
        accepted: zod_1.z.string().trim().min(1).max(2000).default(shared_1.DEFAULT_APPLICATION_MESSAGES.accepted),
        denied: zod_1.z.string().trim().min(1).max(2000).default(shared_1.DEFAULT_APPLICATION_MESSAGES.denied),
        confirmation: zod_1.z.string().trim().min(1).max(2000).default(shared_1.DEFAULT_APPLICATION_MESSAGES.confirmation),
        completion: zod_1.z.string().trim().min(1).max(2000).default(shared_1.DEFAULT_APPLICATION_MESSAGES.completion),
    }).default({}),
    roles: zod_1.z.object({
        restricted: roleRule, required: roleRule,
        accepted: roleList, denied: roleList, acceptedRemove: roleList, deniedRemove: roleList, pending: roleList, removeOnSubmit: roleList,
        /** Wer im Discord annehmen/ablehnen darf (zusätzlich zum Recht im System); leer = alle mit dem Recht. */
        managers: roleList,
    }).default({}),
    staffThreads: zod_1.z.boolean().default(false),
    cooldownMinutes: zod_1.z.number().int().min(0).max(60 * 24 * 365).default(0),
    timeLimitMinutes: zod_1.z.number().int().min(5).max(60 * 24 * 7).default(180),
    /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
    onLeave: zod_1.z.enum(['NONE', 'DENY', 'WITHDRAW']).default('NONE'),
    /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
    mode: zod_1.z.enum(['DM', 'WEB']).default('DM'),
}).default({});
const requirements = { enabled: zod_1.z.boolean().default(true), acceptedChannelId: channelOpt, deniedChannelId: channelOpt, settings: exports.appSettingsSchema };
/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
exports.unitSchema = zod_1.z.object({
    key: zod_1.z.string().trim().regex(/^[a-z0-9_-]{2,24}$/, 'Schlüssel: 2–24 Zeichen a-z, 0-9, - oder _'),
    name: zod_1.z.string().trim().min(2).max(60),
    description: zod_1.z.string().trim().max(600).default(''),
    /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
    roleId: zod_1.z.union([zod_1.z.string().regex(/^\d{15,25}$/), zod_1.z.literal('')]).optional(),
    /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
    channelId: zod_1.z.union([zod_1.z.string().regex(/^\d{15,25}$/), zod_1.z.literal('')]).optional(),
    ...requirements,
    questions: unitQuestions,
    /** Discord-Rolle(n), die bei einer neuen Bewerbung im Channel erwähnt werden (z. B. @Staffelkommandant). */
    pingRoleIds: zod_1.z.array(zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(10).default([]),
});
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
exports.policeSchema = zod_1.z.object({
    ...requirements,
    name: zod_1.z.string().trim().min(2).max(60).default('Polizeianwärter'),
    /** Channel für neue Bewerbungen (sonst der Applications-Channel aus den Einstellungen). */
    channelId: channelOpt,
    pingRoleIds: zod_1.z.array(zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(10).default([]),
    title: zod_1.z.string().trim().min(2).max(100).default('📋 Bewerbung bei EN Polizei'),
    description: zod_1.z.string().trim().max(1500).default('Du möchtest Teil der **EN Polizei** werden? Klicke auf **Jetzt bewerben** – der Bot stellt dir die Fragen nacheinander per **Direktnachricht**.\n\nDu brauchst deinen **Roblox-Namen** und etwa 10 Minuten Zeit. Die Entscheidung bekommst du ebenfalls per Direktnachricht.'),
});
exports.configSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(2).max(100).default('Qualifikationen'),
    intro: zod_1.z.string().trim().max(1500).default(''),
    units: zod_1.z.array(exports.unitSchema).min(1).max(10).refine((u) => new Set(u.map((x) => x.key)).size === u.length, 'Die Schlüssel der Einheiten müssen eindeutig sein.'),
    police: exports.policeSchema.default({}),
});
/** Speichern aus „Qualifications → Setup“: Panels + Einheiten und optional die Fragen der Polizei-Bewerbung. */
exports.saveSchema = exports.configSchema.extend({
    policeForm: exports.formSchema.optional(),
});
const Q1 = 'Wie ist dein Roblox-Username und dein Discord-Username?';
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
exports.DEFAULT_CONFIG = exports.configSchema.parse({
    police: {},
    title: 'Qualifikationen',
    intro: 'Streife fahren und Einsätze abarbeiten – das sind nicht alle unsere Möglichkeiten, jeden Tag spannende Einsätze zu haben! Daher bieten wir unseren Beamten ab einem bestimmten Dienstgrad an, sich weiterzubilden: als Teil des **SEK**, der **Flugstaffel** oder als **Ausbilder**!',
    units: [
        { key: 'flugstaffel', name: 'Flugstaffel', description: 'Bereit für spannende Einsätze aus einer anderen Perspektive? Dann gib unseren Einsatzkräften immer die wichtigsten Informationen aus der Luft!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zur Flugstaffel?', 'Hast du schon Erfahrung mit Hubschraubern oder Flugzeugen in ER:LC?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Was ist bei einer Verfolgung aus der Luft am wichtigsten?'] },
        { key: 'sek', name: 'SEK', description: 'Dir gefallen Einsätze, bei denen du dein Fachwissen und professionelles Vorgehen einsetzen kannst? Dann werde Teil des SEK – einer kleinen Gruppe, die sich für keinen Einsatz zu scheu ist!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zum SEK?', 'Welche besondere Erfahrung oder Qualifikation bringst du mit?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie gehst du bei einer Geiselnahme vor?'] },
        { key: 'ausbilder', name: 'Ausbilder', description: 'Du möchtest dein Wissen an neue Personen bei uns weitergeben und bist auch aktiv, dich dafür einzusetzen? Dann ist dies deine Chance!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du Ausbilder werden?', 'Hast du schon Erfahrung als Ausbilder oder Lehrer?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie würdest du einem Rekruten eine Verkehrskontrolle erklären?'] },
    ],
});
//# sourceMappingURL=qualifications.config.js.map