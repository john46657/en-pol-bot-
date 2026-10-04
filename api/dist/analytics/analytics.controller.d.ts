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
}
export {};
