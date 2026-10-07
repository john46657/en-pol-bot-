"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customFieldsConfig = exports.customFieldDef = exports.ENTITIES = void 0;
exports.validateCustom = validateCustom;
const zod_1 = require("zod");
exports.ENTITIES = ['persons', 'vehicles'];
exports.customFieldDef = zod_1.z.object({
    key: zod_1.z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/, 'Der Schlüssel muss mit einem Kleinbuchstaben beginnen und darf nur Buchstaben und Ziffern enthalten.'),
    label: zod_1.z.string().min(1).max(60),
    type: zod_1.z.enum(['text', 'number', 'select', 'date']),
    required: zod_1.z.boolean().default(false),
    options: zod_1.z.array(zod_1.z.string().min(1).max(60)).max(30).optional(),
}).refine((f) => f.type !== 'select' || !!f.options?.length, { message: 'Auswahlfelder brauchen Optionen.' });
exports.customFieldsConfig = zod_1.z.object({ persons: zod_1.z.array(exports.customFieldDef).max(30).default([]), vehicles: zod_1.z.array(exports.customFieldDef).max(30).default([]) })
    .superRefine((cfg, ctx) => {
    for (const e of exports.ENTITIES) {
        const keys = cfg[e].map((f) => f.key);
        if (new Set(keys).size !== keys.length)
            ctx.addIssue({ code: 'custom', message: `Doppelter Schlüssel in ${e === 'persons' ? 'Personen' : 'Fahrzeuge'}.`, path: [e] });
    }
});
/** Validiert Werte strikt gegen die Definition: unbekannte Keys → Fehler, Typen werden geprüft, Pflichtfelder erzwungen. */
function validateCustom(defs, values, existing) {
    const input = values ?? {};
    const errors = [];
    const out = {};
    for (const k of Object.keys(input))
        if (!defs.some((d) => d.key === k))
            errors.push(`Unbekanntes Zusatzfeld „${k}“.`);
    for (const d of defs) {
        const raw = d.key in input ? input[d.key] : existing?.[d.key];
        if (raw === undefined || raw === null || raw === '') {
            if (d.required)
                errors.push(`„${d.label}“ ist ein Pflichtfeld.`);
            continue;
        }
        if (d.type === 'number') {
            const n = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(n))
                errors.push(`„${d.label}“ muss eine Zahl sein.`);
            else
                out[d.key] = n;
        }
        else if (d.type === 'select') {
            if (typeof raw !== 'string' || !d.options.includes(raw))
                errors.push(`„${d.label}“ muss eins davon sein: ${d.options.join(', ')}.`);
            else
                out[d.key] = raw;
        }
        else if (d.type === 'date') {
            if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw)))
                errors.push(`„${d.label}“ muss ein Datum sein (JJJJ-MM-TT).`);
            else
                out[d.key] = raw;
        }
        else {
            if (typeof raw !== 'string' || raw.length > 500)
                errors.push(`"${d.label}" must be text (max 500 chars).`);
            else
                out[d.key] = raw;
        }
    }
    return errors.length ? { ok: false, errors } : { ok: true, value: out };
}
//# sourceMappingURL=custom-fields.js.map