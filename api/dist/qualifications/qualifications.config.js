"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = exports.saveSchema = exports.formFieldSchema = exports.configSchema = exports.policeSchema = exports.unitSchema = void 0;
const zod_1 = require("zod");
/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
exports.unitSchema = zod_1.z.object({
    key: zod_1.z.string().trim().regex(/^[a-z0-9_-]{2,24}$/, 'Key: 2–24 characters a-z, 0-9, - or _'),
    name: zod_1.z.string().trim().min(2).max(60),
    description: zod_1.z.string().trim().max(600).default(''),
    /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
    roleId: zod_1.z.union([zod_1.z.string().regex(/^\d{15,25}$/), zod_1.z.literal('')]).optional(),
    questions: zod_1.z.array(zod_1.z.string().trim().min(3).max(300)).min(1).max(15),
});
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
exports.policeSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(2).max(100).default('📋 Bewerbung bei EN Polizei'),
    description: zod_1.z.string().trim().max(1500).default('Du möchtest Teil der **EN Polizei** werden? Klicke auf **Jetzt bewerben** – der Bot stellt dir die Fragen nacheinander per **Direktnachricht**.\n\nDu brauchst deinen **Roblox-Namen** und etwa 10 Minuten Zeit. Die Entscheidung bekommst du ebenfalls per Direktnachricht.'),
});
exports.configSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(2).max(100).default('Qualifikationen'),
    intro: zod_1.z.string().trim().max(1500).default(''),
    units: zod_1.z.array(exports.unitSchema).min(1).max(10).refine((u) => new Set(u.map((x) => x.key)).size === u.length, 'Unit keys must be unique.'),
    police: exports.policeSchema.default({}),
});
/** Feld des Bewerbungsformulars (gleiche Regeln wie Studio → Application form). */
exports.formFieldSchema = zod_1.z.object({ key: zod_1.z.string().regex(/^[a-zA-Z][\w]{0,40}$/), label: zod_1.z.string().trim().min(1).max(300), required: zod_1.z.boolean(), maxLength: zod_1.z.number().int().min(1).max(5000) });
/** Speichern aus „Qualifications → Setup“: Panels + Einheiten und optional die Fragen der Polizei-Bewerbung. */
exports.saveSchema = exports.configSchema.extend({
    policeForm: zod_1.z.array(exports.formFieldSchema).min(1).max(30).refine((f) => new Set(f.map((x) => x.key)).size === f.length, 'Question keys must be unique.').optional(),
});
const Q1 = 'Wie ist dein Roblox-Username und dein Discord-Username?';
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
exports.DEFAULT_CONFIG = {
    police: exports.policeSchema.parse({}),
    title: 'Qualifikationen',
    intro: 'Streife fahren und Einsätze abarbeiten – das sind nicht alle unsere Möglichkeiten, jeden Tag spannende Einsätze zu haben! Daher bieten wir unseren Beamten ab einem bestimmten Dienstgrad an, sich weiterzubilden: als Teil des **SEK**, der **Flugstaffel** oder als **Ausbilder**!',
    units: [
        { key: 'flugstaffel', name: 'Flugstaffel', description: 'Bereit für spannende Einsätze aus einer anderen Perspektive? Dann gib unseren Einsatzkräften immer die wichtigsten Informationen aus der Luft!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zur Flugstaffel?', 'Hast du schon Erfahrung mit Hubschraubern oder Flugzeugen in ER:LC?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Was ist bei einer Verfolgung aus der Luft am wichtigsten?'] },
        { key: 'sek', name: 'SEK', description: 'Dir gefallen Einsätze, bei denen du dein Fachwissen und professionelles Vorgehen einsetzen kannst? Dann werde Teil des SEK – einer kleinen Gruppe, die sich für keinen Einsatz zu scheu ist!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du zum SEK?', 'Welche besondere Erfahrung oder Qualifikation bringst du mit?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie gehst du bei einer Geiselnahme vor?'] },
        { key: 'ausbilder', name: 'Ausbilder', description: 'Du möchtest dein Wissen an neue Personen bei uns weitergeben und bist auch aktiv, dich dafür einzusetzen? Dann ist dies deine Chance!', questions: [Q1, 'Welchen Dienstgrad hast du und wie lange bist du schon im Polizeidienst?', 'Warum möchtest du Ausbilder werden?', 'Hast du schon Erfahrung als Ausbilder oder Lehrer?', 'Wie viele Stunden pro Woche kannst du aktiv sein?', 'Wie würdest du einem Rekruten eine Verkehrskontrolle erklären?'] },
    ],
};
//# sourceMappingURL=qualifications.config.js.map