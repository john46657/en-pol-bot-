"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.germanZodErrorMap = void 0;
exports.installGermanZodErrors = installGermanZodErrors;
const zod_1 = require("zod");
const TYPES = {
    string: 'Text', number: 'Zahl', integer: 'Ganzzahl', bigint: 'Ganzzahl', boolean: 'Ja/Nein-Wert', date: 'Datum',
    array: 'Liste', object: 'Objekt', undefined: 'nichts', null: 'leer', nan: 'keine Zahl',
};
const t = (x) => TYPES[x] ?? x;
const num = (v) => String(v);
/**
 * Deutsche Standardmeldungen für Zod (Details in VALIDATION_FAILED-Antworten).
 * Eigene Meldungen aus `.refine(…, 'Text')`, `.min(1, 'Text')` usw. haben weiterhin Vorrang.
 */
const germanZodErrorMap = (issue, ctx) => {
    switch (issue.code) {
        case zod_1.ZodIssueCode.invalid_type:
            if (issue.received === 'undefined')
                return { message: 'Pflichtfeld.' };
            return { message: `Erwartet: ${t(issue.expected)}, erhalten: ${t(issue.received)}.` };
        case zod_1.ZodIssueCode.invalid_literal: return { message: `Ungültiger Wert, erwartet: ${JSON.stringify(issue.expected)}.` };
        case zod_1.ZodIssueCode.unrecognized_keys: return { message: `Unbekannte Felder: ${issue.keys.join(', ')}.` };
        case zod_1.ZodIssueCode.invalid_union: return { message: 'Ungültige Eingabe.' };
        case zod_1.ZodIssueCode.invalid_union_discriminator: return { message: `Ungültiger Typ, erlaubt: ${issue.options.map(String).join(', ')}.` };
        case zod_1.ZodIssueCode.invalid_enum_value: return { message: `Ungültiger Wert. Erlaubt: ${issue.options.map(String).join(', ')}.` };
        case zod_1.ZodIssueCode.invalid_arguments: return { message: 'Ungültige Argumente.' };
        case zod_1.ZodIssueCode.invalid_return_type: return { message: 'Ungültiger Rückgabewert.' };
        case zod_1.ZodIssueCode.invalid_date: return { message: 'Ungültiges Datum.' };
        case zod_1.ZodIssueCode.invalid_string:
            if (typeof issue.validation === 'object') {
                if ('startsWith' in issue.validation)
                    return { message: `Muss mit „${issue.validation.startsWith}“ beginnen.` };
                if ('endsWith' in issue.validation)
                    return { message: `Muss mit „${issue.validation.endsWith}“ enden.` };
                if ('includes' in issue.validation)
                    return { message: `Muss „${issue.validation.includes}“ enthalten.` };
                return { message: 'Ungültiges Format.' };
            }
            switch (issue.validation) {
                case 'email': return { message: 'Ungültige E-Mail-Adresse.' };
                case 'url': return { message: 'Ungültige URL.' };
                case 'uuid':
                case 'cuid':
                case 'cuid2':
                case 'ulid':
                case 'nanoid': return { message: 'Ungültige ID.' };
                case 'datetime': return { message: 'Ungültiges Datum/Uhrzeit.' };
                case 'date': return { message: 'Ungültiges Datum.' };
                case 'time': return { message: 'Ungültige Uhrzeit.' };
                case 'regex': return { message: 'Ungültiges Format.' };
                default: return { message: 'Ungültiges Format.' };
            }
        case zod_1.ZodIssueCode.too_small: {
            const n = num(issue.minimum), excl = !issue.inclusive;
            if (issue.type === 'string')
                return { message: issue.exact ? `Genau ${n} Zeichen.` : n === '1' && !excl ? 'Darf nicht leer sein.' : `Mindestens ${n} Zeichen.` };
            if (issue.type === 'array' || issue.type === 'set')
                return { message: issue.exact ? `Genau ${n} Einträge.` : `Mindestens ${n} ${n === '1' ? 'Eintrag' : 'Einträge'}.` };
            if (issue.type === 'number' || issue.type === 'bigint')
                return { message: excl ? `Muss größer als ${n} sein.` : `Muss mindestens ${n} sein.` };
            if (issue.type === 'date')
                return { message: `Darf nicht vor dem ${new Date(Number(issue.minimum)).toLocaleDateString('de-DE')} liegen.` };
            return { message: 'Zu klein.' };
        }
        case zod_1.ZodIssueCode.too_big: {
            const n = num(issue.maximum), excl = !issue.inclusive;
            if (issue.type === 'string')
                return { message: issue.exact ? `Genau ${n} Zeichen.` : `Höchstens ${n} Zeichen.` };
            if (issue.type === 'array' || issue.type === 'set')
                return { message: issue.exact ? `Genau ${n} Einträge.` : `Höchstens ${n} ${n === '1' ? 'Eintrag' : 'Einträge'}.` };
            if (issue.type === 'number' || issue.type === 'bigint')
                return { message: excl ? `Muss kleiner als ${n} sein.` : `Darf höchstens ${n} sein.` };
            if (issue.type === 'date')
                return { message: `Darf nicht nach dem ${new Date(Number(issue.maximum)).toLocaleDateString('de-DE')} liegen.` };
            return { message: 'Zu groß.' };
        }
        case zod_1.ZodIssueCode.custom: return { message: 'Ungültige Eingabe.' };
        case zod_1.ZodIssueCode.invalid_intersection_types: return { message: 'Ungültige Eingabe.' };
        case zod_1.ZodIssueCode.not_multiple_of: return { message: `Muss ein Vielfaches von ${num(issue.multipleOf)} sein.` };
        case zod_1.ZodIssueCode.not_finite: return { message: 'Muss eine endliche Zahl sein.' };
        default: return { message: ctx.defaultError };
    }
};
exports.germanZodErrorMap = germanZodErrorMap;
let installed = false;
/** Einmalig global setzen (betrifft nur diesen API-Prozess). */
function installGermanZodErrors() {
    if (installed)
        return;
    installed = true;
    zod_1.z.setErrorMap(exports.germanZodErrorMap);
}
//# sourceMappingURL=zod-de.js.map