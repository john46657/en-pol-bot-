import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { SystemStatusService } from './system-status.service';
declare const q: z.ZodObject<{
    deep: z.ZodOptional<z.ZodEnum<["0", "1"]>>;
}, "strip", z.ZodTypeAny, {
    deep?: "1" | "0" | undefined;
}, {
    deep?: "1" | "0" | undefined;
}>;
/**
 * Systemstatus für Dashboard, MDT und Leitstelle (`settings.view`). Die Diagnose (`deep=1`: Konfiguration, Speicher,
 * Administratorzugang) nur für globale Systemadministratoren – für alle anderen wird sie still weggelassen.
 */
export declare class SystemStatusController {
    private readonly s;
    private readonly perms;
    constructor(s: SystemStatusService, perms: PermissionService);
    status(a: Actor, query: z.infer<typeof q>): Promise<{
        canDiagnose: boolean;
        overall: "warn" | "error" | "ok";
        checkedAt: string;
        deep: boolean;
        checks: import("./system-status.service").StatusCheck[];
    }>;
}
export {};
