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
    event: z.ZodOptional<z.ZodString>;
    group: z.ZodOptional<z.ZodString>;
    important: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
}, "strip", z.ZodTypeAny, {
    filter: "all" | "archived" | "unread" | "read";
    page: number;
    pageSize: number;
    group?: string | undefined;
    type?: string | undefined;
    event?: string | undefined;
    important?: "true" | "false" | undefined;
    q?: string | undefined;
}, {
    group?: string | undefined;
    type?: string | undefined;
    event?: string | undefined;
    important?: "true" | "false" | undefined;
    filter?: "all" | "archived" | "unread" | "read" | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
}>;
declare const prefsBody: z.ZodObject<{
    muted: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    important: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    dm: z.ZodDefault<z.ZodBoolean>;
    dmEvents: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    reminders: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    reminders: boolean;
    dm: boolean;
    important: string[];
    muted: string[];
    dmEvents: string[];
}, {
    reminders?: boolean | undefined;
    dm?: boolean | undefined;
    important?: string[] | undefined;
    muted?: string[] | undefined;
    dmEvents?: string[] | undefined;
}>;
declare const rulesBody: z.ZodObject<{
    disabled: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
}, "strip", z.ZodTypeAny, {
    disabled: string[];
}, {
    disabled: string[];
}>;
declare const feedQ: z.ZodObject<{
    scope: z.ZodEnum<["mdt", "cad"]>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    scope: "cad" | "mdt";
    limit: number;
}, {
    scope: "cad" | "mdt";
    limit?: number | undefined;
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
    /** Ereigniskatalog (für Einstellungen und Filter). */
    events(): readonly import("@enrp/shared").NotificationEventDef[];
    /** Eigene Einstellungen: stumm, wichtig, Discord-DMs (nur mit Zustimmung), Erinnerungen. */
    preferences(u: AuthUser): Promise<{
        muted: string[];
        important: string[];
        dm: boolean;
        dmEvents: string[];
        reminders: boolean;
        discordLinked: boolean;
    }>;
    savePreferences(a: Actor, b: z.infer<typeof prefsBody>): Promise<{
        reminders: boolean;
        dm: boolean;
        important: string[];
        muted: string[];
        dmEvents: string[];
    }>;
    /** Zustellregeln: Ereignisse systemweit abschalten (z. B. bei Störungen). */
    rules(): Promise<{
        disabled: string[];
    }>;
    saveRules(a: Actor, b: z.infer<typeof rulesBody>): Promise<{
        disabled: string[];
    }>;
    /** Dienstliche Benachrichtigungen für MDT bzw. Leitstelle (nur eigene, ungelesene, Ereignisse mit diesem Kanal). */
    feed(u: AuthUser, f: z.infer<typeof feedQ>): Promise<{
        items: {
            link: string | null;
            id: string;
            createdAt: Date;
            type: string;
            title: string;
            userId: string;
            entityId: string | null;
            archivedAt: Date | null;
            body: string | null;
            entityType: string | null;
            event: string | null;
            important: boolean;
            dedupeKey: string | null;
            readAt: Date | null;
        }[];
        unread: number;
    }>;
    list(u: AuthUser, f: z.infer<typeof q>): Promise<{
        unread: number;
        items: {
            link: string | null;
            id: string;
            createdAt: Date;
            type: string;
            title: string;
            userId: string;
            entityId: string | null;
            archivedAt: Date | null;
            body: string | null;
            entityType: string | null;
            event: string | null;
            important: boolean;
            dedupeKey: string | null;
            readAt: Date | null;
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
