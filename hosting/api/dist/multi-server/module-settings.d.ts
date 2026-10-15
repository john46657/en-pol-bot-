import { z } from 'zod';
/** Wochen-Reset der Shift Logs je Server (Rangliste dieses Servers bzw. seiner gemeinsamen Shift-Log-Gruppe). */
export declare const serverWeeklyResetSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    channelId: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodString>>, string | null, string | null | undefined>;
    topN: z.ZodDefault<z.ZodNumber>;
    mention: z.ZodDefault<z.ZodBoolean>;
}, "strict", z.ZodTypeAny, {
    enabled: boolean;
    channelId: string | null;
    topN: number;
    mention: boolean;
}, {
    enabled?: boolean | undefined;
    channelId?: string | null | undefined;
    topN?: number | undefined;
    mention?: boolean | undefined;
}>;
/**
 * Einstellungen je Modul: NUR hier definierte Felder sind erlaubt (`strict`). Sie steuern Verhalten (Kanäle, Wochen-Reset …),
 * aber nie Berechtigungen – die prüft immer der AuthorizationService.
 */
export declare const MODULE_SETTINGS_SCHEMAS: Record<string, z.ZodTypeAny>;
export declare function parseModuleSettings(moduleKey: string, value: unknown): Record<string, unknown>;
