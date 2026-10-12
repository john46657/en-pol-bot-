"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODULE_SETTINGS_SCHEMAS = exports.serverWeeklyResetSchema = void 0;
exports.parseModuleSettings = parseModuleSettings;
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const errors_1 = require("../common/errors");
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
/** Wochen-Reset der Shift Logs je Server (Rangliste dieses Servers bzw. seiner gemeinsamen Shift-Log-Gruppe). */
exports.serverWeeklyResetSchema = zod_1.z.object({
    enabled: zod_1.z.boolean().default(false),
    channelId: sf.nullish().transform((v) => v ?? null),
    topN: zod_1.z.number().int().min(1).max(25).default(10),
    mention: zod_1.z.boolean().default(true),
}).strict();
/**
 * Einstellungen je Modul: NUR hier definierte Felder sind erlaubt (`strict`). Sie steuern Verhalten (Kanäle, Wochen-Reset …),
 * aber nie Berechtigungen – die prüft immer der AuthorizationService.
 */
exports.MODULE_SETTINGS_SCHEMAS = {
    shift_logs: zod_1.z.object({ weeklyReset: exports.serverWeeklyResetSchema.default({}) }).strict(),
};
function parseModuleSettings(moduleKey, value) {
    if (!shared_1.MODULE_KEYS.includes(moduleKey))
        throw new errors_1.AppError('NOT_FOUND', 'Unbekanntes Modul.');
    const schema = exports.MODULE_SETTINGS_SCHEMAS[moduleKey] ?? zod_1.z.object({}).strict();
    const r = schema.safeParse(value ?? {});
    if (!r.success)
        throw new errors_1.AppError('VALIDATION_FAILED', `Ungültige Einstellungen für „${moduleKey}“: ${r.error.issues.map((i) => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`).join('; ')}`);
    return r.data;
}
//# sourceMappingURL=module-settings.js.map