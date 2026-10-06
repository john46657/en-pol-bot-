import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../audit/audit.service';
import { AuditService } from '../audit/audit.service';
import { NotifyService } from './notify.service';
import type { AuthUser } from '../common/request-context';
declare const systemBody: z.ZodObject<{
    title: z.ZodString;
    body: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title: string;
    body?: string | undefined;
}, {
    title: string;
    body?: string | undefined;
}>;
declare const q: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    q: z.ZodOptional<z.ZodString>;
} & {
    filter: z.ZodDefault<z.ZodEnum<["unread", "read", "archived", "all"]>>;
    type: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    filter: "unread" | "read" | "archived" | "all";
    page: number;
    pageSize: number;
    type?: string | undefined;
    q?: string | undefined;
}, {
    type?: string | undefined;
    filter?: "unread" | "read" | "archived" | "all" | undefined;
    q?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
/** Jeder Benutzer sieht ausschließlich eigene Benachrichtigungen (immer per userId gefiltert). */
export declare class NotificationsController {
    private readonly prisma;
    private readonly notify;
    private readonly audit;
    constructor(prisma: PrismaService, notify: NotifyService, audit: AuditService);
    /** ⚠️ Systemhinweis an alle Dashboard-Benutzer (des gewählten Servers). */
    system(a: Actor, b: z.infer<typeof systemBody>): Promise<{
        recipients: number;
    }>;
    list(u: AuthUser, f: z.infer<typeof q>): Promise<{
        unread: number;
        items: {
            id: string;
            entityType: string | null;
            entityId: string | null;
            createdAt: Date;
            userId: string;
            type: string;
            title: string;
            body: string | null;
            readAt: Date | null;
            archivedAt: Date | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    readAll(u: AuthUser): Promise<{
        updated: number;
    }>;
    read(u: AuthUser, id: string): Promise<{
        updated: number;
    }>;
    archive(u: AuthUser, id: string): Promise<{
        updated: number;
    }>;
}
export {};
