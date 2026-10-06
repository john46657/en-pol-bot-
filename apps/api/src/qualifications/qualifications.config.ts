import { z } from 'zod';

/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
export const unitSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_-]{2,24}$/, 'Key: 2–24 characters a-z, 0-9, - or _'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(600).default(''),
  /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
  roleId: z.union([z.string().regex(/^\d{15,25}$/), z.literal('')]).optional(),
  /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
  channelId: z.union([z.string().regex(/^\d{15,25}$/), z.literal('')]).optional(),
  questions: z.array(z.string().trim().min(3).max(300)).min(1).max(50),
});
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
export const policeSchema = z.object({
  title: z.string().trim().min(2).max(100).default('📋 Bewerbung bei EN Polizei'),
  description: z.string().trim().max(1500).default('Du möchtest Teil der **EN Polizei** werden? Klicke auf **Jetzt bewerben** – der Bot stellt dir die Fragen nacheinander per **Direktnachricht**.\n\nDu brauchst deinen **Roblox-Namen** und etwa 10 Minuten Zeit. Die Entscheidung bekommst du ebenfalls per Direktnachricht.'),
});
export const configSchema = z.object({
  title: z.string().trim().min(2).max(100).default('Qualifikationen'),
  intro: z.string().trim().max(1500).default(''),
  units: z.array(unitSchema).min(1).max(10).refine((u) => new Set(u.map((x) => x.key)).size === u.length, 'Unit keys must be unique.'),
  police: policeSchema.default({}),
});
/** Feld des Bewerbungsformulars (gleiche Regeln wie Studio → Application form). */
export const formFieldSchema = z.object({ key: z.string().regex(/^[a-zA-Z][\w]{0,40}$/), label: z.string().trim().min(1).max(300), required: z.boolean(), maxLength: z.number().int().min(1).max(5000) });
/** Speichern aus „Qualifications → Setup“: Panels + Einheiten und optional die Fragen der Polizei-Bewerbung. */
export const saveSchema = configSchema.extend({
  policeForm: z.array(formFieldSchema).min(1).max(50).refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Question keys must be unique.').optional(),
});
export type QualificationUnit = z.infer<typeof unitSchema>;
export type QualificationConfig = z.infer<typeof configSchema>;

const Q1 = 'Wie ist dein Roblox-Username und dein Discord-Username?';
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
export const DEFAULT_CONFIG: QualificationConfig = {
  police: policeSchema.parse({}),
  title: 'Qualifikationen',
  intro: 'Streife fahren und Einsätze abarbeiten – das sind nicht alle unsere Möglichkeiten, jeden Tag spannende Einsätze zu haben! Daher bieten wir unseren Beamten ab einem bestimmten Dienstgrad an, sich weiterzubilden: als Teil des **SEK**, der **Flugstaffel** oder als **Ausbilder**!',
  units: [
    { key: 'flugstaffel', name: 'Flugstaffel', description: 'Bereit für spannende Einsätze aus einer anderen Perspektive? Dann gib unseren Einsatzkräften immer die wichtigsten Informationen aus der Luft!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zur Flugstaffel?', 'Hast du schon Erfahrung mit Hubschraubern oder Flugzeugen in ER:LC?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Was ist bei einer Verfolgung aus der Luft am wichtigsten?'] },
    { key: 'sek', name: 'SEK', description: 'Dir gefallen Einsätze, bei denen du dein Fachwissen und professionelles Vorgehen einsetzen kannst? Dann werde Teil des SEK – einer kleinen Gruppe, die sich für keinen Einsatz zu scheu ist!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zum SEK?', 'Welche besondere Erfahrung oder Qualifikation bringst du mit?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie gehst du bei einer Geiselnahme vor?'] },
    { key: 'ausbilder', name: 'Ausbilder', description: 'Du möchtest dein Wissen an neue Personen bei uns weitergeben und bist auch aktiv, dich dafür einzusetzen? Dann ist dies deine Chance!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du Ausbilder werden?', 'Hast du schon Erfahrung als Ausbilder oder Lehrer?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie würdest du einem Rekruten eine Verkehrskontrolle erklären?'] },
  ],
};
