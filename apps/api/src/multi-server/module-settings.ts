import { z } from 'zod';
import { MODULE_KEYS } from '@enrp/shared';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');

/** Wochen-Reset der Shift Logs je Server (Rangliste dieses Servers bzw. seiner gemeinsamen Shift-Log-Gruppe). */
export const serverWeeklyResetSchema = z.object({
  enabled: z.boolean().default(false),
  channelId: sf.nullish().transform((v) => v ?? null),
  topN: z.number().int().min(1).max(25).default(10),
  mention: z.boolean().default(true),
}).strict();

/**
 * Einstellungen je Modul: NUR hier definierte Felder sind erlaubt (`strict`). Sie steuern Verhalten (Kanäle, Wochen-Reset …),
 * aber nie Berechtigungen – die prüft immer der AuthorizationService.
 */
export const MODULE_SETTINGS_SCHEMAS: Record<string, z.ZodTypeAny> = {
  shift_logs: z.object({ weeklyReset: serverWeeklyResetSchema.default({}) }).strict(),
};

export function parseModuleSettings(moduleKey: string, value: unknown): Record<string, unknown> {
  if (!MODULE_KEYS.includes(moduleKey)) throw new AppError('NOT_FOUND', 'Unbekanntes Modul.');
  const schema = MODULE_SETTINGS_SCHEMAS[moduleKey] ?? z.object({}).strict();
  const r = schema.safeParse(value ?? {});
  if (!r.success) throw new AppError('VALIDATION_FAILED', `Ungültige Einstellungen für „${moduleKey}“: ${r.error.issues.map((i) => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`).join('; ')}`);
  return r.data as Record<string, unknown>;
}
