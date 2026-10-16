import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import type { AuthUser } from '../common/request-context';
declare const q: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    days: number;
}, {
    days?: number | undefined;
}>;
/** Jede Kennzahl wird nur ausgeliefert, wenn der Benutzer die zugehörige Fachpermission besitzt. */
export declare class AnalyticsController {
    private readonly prisma;
    private readonly perms;
    constructor(prisma: PrismaService, perms: PermissionService);
    overview(u: AuthUser, f: z.infer<typeof q>): Promise<Record<string, unknown>>;
    /**
     * Tagesverlauf für Diagramme (Tage in Europe/Berlin). Gleiche Rechte wie die Übersicht – je Reihe die Fachpermission.
     * Über Prisma-Abfragen (nicht SQL), damit die Server-Trennung automatisch greift.
     */
    trend(u: AuthUser, f: z.infer<typeof q>): Promise<{
        days: string[];
        series: {
            key: string;
            label: string;
            unit: string;
            values: number[];
        }[];
    }>;
}
export {};
