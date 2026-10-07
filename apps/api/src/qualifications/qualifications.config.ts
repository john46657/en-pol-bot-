import { z } from 'zod';
import { DEFAULT_APPLICATION_MESSAGES, FORM_QUESTION_TYPES, MAX_FORM_OPTIONS, MAX_FORM_QUESTIONS, type FormField } from '@enrp/shared';

const roleIdOpt = z.union([z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)'), z.literal('')]).optional().transform((v) => v || undefined);
/** Eine Bewerbungsfrage wie bei Appy: Text, Auswahl oder Rollen-Auswahl – mit Prüf-Einstellungen. */
export const formFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][\w]{0,40}$/), label: z.string().trim().min(1).max(300), required: z.boolean(),
  type: z.enum(Object.keys(FORM_QUESTION_TYPES) as [keyof typeof FORM_QUESTION_TYPES, ...(keyof typeof FORM_QUESTION_TYPES)[]]).default('TEXT'),
  minLength: z.number().int().min(0).max(5000).default(0), maxLength: z.number().int().min(1).max(5000).default(1000),
  options: z.array(z.object({ label: z.string().trim().min(1).max(100), roleId: roleIdOpt })).max(MAX_FORM_OPTIONS).default([]),
  multiple: z.boolean().default(false),
}).superRefine((f, ctx) => {
  if (f.minLength > f.maxLength) ctx.addIssue({ code: 'custom', path: ['minLength'], message: 'Die Mindestlänge ist größer als die Höchstlänge.' });
  if (f.type !== 'TEXT' && f.type !== 'ROBLOX' && f.options.length < 1) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Füge mindestens eine Option hinzu.' });
  if (f.type === 'ROLE' && f.options.some((o) => !o.roleId)) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Jede Option einer Rollenauswahl braucht eine Discord-Rollen-ID.' });
  if (new Set(f.options.map((o) => o.label)).size !== f.options.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'Die Optionen müssen eindeutig sein.' });
});
export const formSchema = z.array(formFieldSchema).min(1).max(MAX_FORM_QUESTIONS).refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Die Schlüssel der Fragen müssen eindeutig sein.');
/** Fragen einer Einheit: früher nur Text (eine Zeile pro Frage) – alte Einträge werden zu Text-Fragen. */
const unitQuestions = z.array(z.union([z.string().trim().min(3).max(300), formFieldSchema])).min(1).max(MAX_FORM_QUESTIONS)
  .transform((qs): FormField[] => qs.map((q, i) => (typeof q === 'string' ? { key: `q${i + 1}`, label: q, required: true, type: 'TEXT' as const, minLength: 0, maxLength: 1000, options: [], multiple: false } : q)))
  .refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Die Schlüssel der Fragen müssen eindeutig sein.');


/** Wie bei Appy: Bewerbung offen/geschlossen, Channels für angenommene/abgelehnte Bewerbungen. */
const channelOpt = z.union([z.string().regex(/^\d{15,25}$/, 'Discord-Kanal-ID (15–25 Ziffern)'), z.literal('')]).optional();
const roleList = z.array(z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(25).default([]);
const roleRule = z.object({ ids: roleList, mode: z.enum(['ALL', 'ANY']).default('ANY') }).default({});
/** Texte, Rollen und Sonstiges je Bewerbung (wie Appy: Embed Customization, Role Config, Other). */
export const appSettingsSchema = z.object({
  messages: z.object({
    accepted: z.string().trim().min(1).max(2000).default(DEFAULT_APPLICATION_MESSAGES.accepted),
    denied: z.string().trim().min(1).max(2000).default(DEFAULT_APPLICATION_MESSAGES.denied),
    confirmation: z.string().trim().min(1).max(2000).default(DEFAULT_APPLICATION_MESSAGES.confirmation),
    completion: z.string().trim().min(1).max(2000).default(DEFAULT_APPLICATION_MESSAGES.completion),
  }).default({}),
  roles: z.object({
    restricted: roleRule, required: roleRule,
    accepted: roleList, denied: roleList, acceptedRemove: roleList, deniedRemove: roleList, pending: roleList, removeOnSubmit: roleList,
    /** Wer im Discord annehmen/ablehnen darf (zusätzlich zum Recht im System); leer = alle mit dem Recht. */
    managers: roleList,
  }).default({}),
  staffThreads: z.boolean().default(false),
  cooldownMinutes: z.number().int().min(0).max(60 * 24 * 365).default(0),
  timeLimitMinutes: z.number().int().min(5).max(60 * 24 * 7).default(180),
  /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
  onLeave: z.enum(['NONE', 'DENY', 'WITHDRAW']).default('NONE'),
}).default({});
export type AppSettings = z.infer<typeof appSettingsSchema>;
const requirements = { enabled: z.boolean().default(true), acceptedChannelId: channelOpt, deniedChannelId: channelOpt, settings: appSettingsSchema };
/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
export const unitSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_-]{2,24}$/, 'Schlüssel: 2–24 Zeichen a-z, 0-9, - oder _'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(600).default(''),
  /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
  roleId: z.union([z.string().regex(/^\d{15,25}$/), z.literal('')]).optional(),
  /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
  channelId: z.union([z.string().regex(/^\d{15,25}$/), z.literal('')]).optional(),
  ...requirements,
  questions: unitQuestions,
  /** Discord-Rolle(n), die bei einer neuen Bewerbung im Channel erwähnt werden (z. B. @Staffelkommandant). */
  pingRoleIds: z.array(z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(10).default([]),
});
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
export const policeSchema = z.object({
  ...requirements,
  name: z.string().trim().min(2).max(60).default('Polizeianwärter'),
  /** Channel für neue Bewerbungen (sonst der Applications-Channel aus den Einstellungen). */
  channelId: channelOpt,
  pingRoleIds: z.array(z.string().regex(/^\d{15,25}$/, 'Discord-Rollen-ID (15–25 Ziffern)')).max(10).default([]),
  title: z.string().trim().min(2).max(100).default('📋 Bewerbung bei EN Polizei'),
  description: z.string().trim().max(1500).default('Du möchtest Teil der **EN Polizei** werden? Klicke auf **Jetzt bewerben** – der Bot stellt dir die Fragen nacheinander per **Direktnachricht**.\n\nDu brauchst deinen **Roblox-Namen** und etwa 10 Minuten Zeit. Die Entscheidung bekommst du ebenfalls per Direktnachricht.'),
});
export const configSchema = z.object({
  title: z.string().trim().min(2).max(100).default('Qualifikationen'),
  intro: z.string().trim().max(1500).default(''),
  units: z.array(unitSchema).min(1).max(10).refine((u) => new Set(u.map((x) => x.key)).size === u.length, 'Die Schlüssel der Einheiten müssen eindeutig sein.'),
  police: policeSchema.default({}),
});
/** Speichern aus „Qualifications → Setup“: Panels + Einheiten und optional die Fragen der Polizei-Bewerbung. */
export const saveSchema = configSchema.extend({
  policeForm: formSchema.optional(),
});
export type QualificationUnit = z.infer<typeof unitSchema>;
export type QualificationConfig = z.infer<typeof configSchema>;

const Q1 = 'Wie ist dein Roblox-Username und dein Discord-Username?';
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
export const DEFAULT_CONFIG: QualificationConfig = configSchema.parse({
  police: {},
  title: 'Qualifikationen',
  intro: 'Streife fahren und Einsätze abarbeiten – das sind nicht alle unsere Möglichkeiten, jeden Tag spannende Einsätze zu haben! Daher bieten wir unseren Beamten ab einem bestimmten Dienstgrad an, sich weiterzubilden: als Teil des **SEK**, der **Flugstaffel** oder als **Ausbilder**!',
  units: [
    { key: 'flugstaffel', name: 'Flugstaffel', description: 'Bereit für spannende Einsätze aus einer anderen Perspektive? Dann gib unseren Einsatzkräften immer die wichtigsten Informationen aus der Luft!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zur Flugstaffel?', 'Hast du schon Erfahrung mit Hubschraubern oder Flugzeugen in ER:LC?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Was ist bei einer Verfolgung aus der Luft am wichtigsten?'] },
    { key: 'sek', name: 'SEK', description: 'Dir gefallen Einsätze, bei denen du dein Fachwissen und professionelles Vorgehen einsetzen kannst? Dann werde Teil des SEK – einer kleinen Gruppe, die sich für keinen Einsatz zu scheu ist!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zum SEK?', 'Welche besondere Erfahrung oder Qualifikation bringst du mit?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie gehst du bei einer Geiselnahme vor?'] },
    { key: 'ausbilder', name: 'Ausbilder', description: 'Du möchtest dein Wissen an neue Personen bei uns weitergeben und bist auch aktiv, dich dafür einzusetzen? Dann ist dies deine Chance!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du Ausbilder werden?', 'Hast du schon Erfahrung als Ausbilder oder Lehrer?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie würdest du einem Rekruten eine Verkehrskontrolle erklären?'] },
  ],
});
