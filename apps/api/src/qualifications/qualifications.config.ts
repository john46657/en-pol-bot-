import { z } from 'zod';

/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
export const unitSchema = z.object({
  key: z.string().trim().regex(/^[a-z0-9_-]{2,24}$/, 'Key: 2–24 characters a-z, 0-9, - or _'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(600).default(''),
  /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
  roleId: z.union([z.string().regex(/^\d{15,25}$/), z.literal('')]).optional(),
  questions: z.array(z.string().trim().min(3).max(300)).min(1).max(15),
});
export const configSchema = z.object({
  title: z.string().trim().min(2).max(100).default('Qualifikationen'),
  intro: z.string().trim().max(1500).default(''),
  units: z.array(unitSchema).min(1).max(10).refine((u) => new Set(u.map((x) => x.key)).size === u.length, 'Unit keys must be unique.'),
});
export type QualificationUnit = z.infer<typeof unitSchema>;
export type QualificationConfig = z.infer<typeof configSchema>;

const Q1 = 'Wie ist dein Roblox-Username und dein Discord-Username?';
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
export const DEFAULT_CONFIG: QualificationConfig = {
  title: 'Qualifikationen',
  intro: 'Streife fahren und Einsätze abarbeiten – das sind nicht alle unsere Möglichkeiten, jeden Tag spannende Einsätze zu haben! Daher bieten wir unseren Beamten ab einem bestimmten Dienstgrad an, sich weiterzubilden: als Teil des **SEK**, der **Flugstaffel** oder als **Ausbilder**!',
  units: [
    { key: 'flugstaffel', name: 'Flugstaffel', description: 'Bereit für spannende Einsätze aus einer anderen Perspektive? Dann gib unseren Einsatzkräften immer die wichtigsten Informationen aus der Luft!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zur Flugstaffel?', 'Hast du schon Erfahrung mit Hubschraubern oder Flugzeugen in ER:LC?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Was ist bei einer Verfolgung aus der Luft am wichtigsten?'] },
    { key: 'sek', name: 'SEK', description: 'Dir gefallen Einsätze, bei denen du dein Fachwissen und professionelles Vorgehen einsetzen kannst? Dann werde Teil des SEK – einer kleinen Gruppe, die sich für keinen Einsatz zu scheu ist!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zum SEK?', 'Welche besondere Erfahrung oder Qualifikation bringst du mit?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie gehst du bei einer Geiselnahme vor?'] },
    { key: 'ausbilder', name: 'Ausbilder', description: 'Du möchtest dein Wissen an neue Personen bei uns weitergeben und bist auch aktiv, dich dafür einzusetzen? Dann ist dies deine Chance!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du Ausbilder werden?', 'Hast du schon Erfahrung als Ausbilder oder Lehrer?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie würdest du einem Rekruten eine Verkehrskontrolle erklären?'] },
  ],
};
