import type { Response } from 'express';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { AuditService, Actor } from '../audit/audit.service';
declare const q: z.ZodObject<{
    format: z.ZodDefault<z.ZodEnum<["csv", "json", "pdf"]>>;
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    format: "csv" | "json" | "pdf";
    q?: string | undefined;
}, {
    q?: string | undefined;
    format?: "csv" | "json" | "pdf" | undefined;
}>;
type Row = Record<string, string | number | boolean | null>;
export declare const toCsv: (rows: Row[]) => string;
export declare class ExportController {
    private readonly prisma;
    private readonly perms;
    private readonly audit;
    constructor(prisma: PrismaService, perms: PermissionService, audit: AuditService);
    export(actor: Actor, entity: string, f: z.infer<typeof q>, res: Response): Promise<void>;
}
export {};
