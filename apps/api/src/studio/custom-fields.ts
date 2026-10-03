import { z } from 'zod';

export const ENTITIES = ['persons', 'vehicles'] as const;
export type CustomEntity = (typeof ENTITIES)[number];

export const customFieldDef = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9]{0,31}$/, 'key must start with a lowercase letter, letters/digits only'),
  label: z.string().min(1).max(60),
  type: z.enum(['text', 'number', 'select', 'date']),
  required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(60)).max(30).optional(),
}).refine((f) => f.type !== 'select' || !!f.options?.length, { message: 'select fields need options' });
export type CustomFieldDef = z.infer<typeof customFieldDef>;

export const customFieldsConfig = z.object({ persons: z.array(customFieldDef).max(30).default([]), vehicles: z.array(customFieldDef).max(30).default([]) })
  .superRefine((cfg, ctx) => {
    for (const e of ENTITIES) {
      const keys = cfg[e].map((f) => f.key);
      if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: `duplicate key in ${e}`, path: [e] });
    }
  });
export type CustomFieldsConfig = z.infer<typeof customFieldsConfig>;

/** Validiert Werte strikt gegen die Definition: unbekannte Keys → Fehler, Typen werden geprüft, Pflichtfelder erzwungen. */
export function validateCustom(defs: CustomFieldDef[], values: Record<string, unknown> | undefined, existing?: Record<string, unknown> | null): { ok: true; value: Record<string, string | number> } | { ok: false; errors: string[] } {
  const input = values ?? {};
  const errors: string[] = [];
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(input)) if (!defs.some((d) => d.key === k)) errors.push(`Unknown custom field "${k}".`);
  for (const d of defs) {
    const raw = d.key in input ? input[d.key] : existing?.[d.key];
    if (raw === undefined || raw === null || raw === '') { if (d.required) errors.push(`"${d.label}" is required.`); continue; }
    if (d.type === 'number') { const n = typeof raw === 'number' ? raw : Number(raw); if (!Number.isFinite(n)) errors.push(`"${d.label}" must be a number.`); else out[d.key] = n; }
    else if (d.type === 'select') { if (typeof raw !== 'string' || !d.options!.includes(raw)) errors.push(`"${d.label}" must be one of: ${d.options!.join(', ')}.`); else out[d.key] = raw; }
    else if (d.type === 'date') { if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) errors.push(`"${d.label}" must be a date (YYYY-MM-DD).`); else out[d.key] = raw; }
    else { if (typeof raw !== 'string' || raw.length > 500) errors.push(`"${d.label}" must be text (max 500 chars).`); else out[d.key] = raw; }
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: out };
}
