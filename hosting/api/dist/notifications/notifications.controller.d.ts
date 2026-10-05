import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/request-context';
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
    filter?: "unread" | "read" | "archived" | "all" | undefined;
    type?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
/** Jeder Benutzer sieht ausschließlich eigene Benachrichtigungen (immer per userId gefiltert). */
export declare class NotificationsController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    list(u: AuthUser, f: z.infer<typeof q>): Promise<{
        unread: number;
        items: {
            id: string;
            userId: string;
            createdAt: Date;
            entityType: string | null;
            entityId: string | null;
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
