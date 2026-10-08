import { z } from 'zod';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { HrCoreService } from './hr-core.service';
export declare const announcementSchema: z.ZodObject<{
    title: z.ZodString;
    body: z.ZodString;
    priority: z.ZodDefault<z.ZodEnum<["LOW", "NORMAL", "HIGH", "CRITICAL"]>>;
    audienceRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    publishAt: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    requireAck: z.ZodDefault<z.ZodBoolean>;
    discordChannelId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    attachments: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    priority: "LOW" | "HIGH" | "CRITICAL" | "NORMAL";
    body: string;
    audienceRoleIds: string[];
    requireAck: boolean;
    discordChannelId: string | null;
    attachments: string[];
    expiresAt?: string | null | undefined;
    publishAt?: string | undefined;
}, {
    title: string;
    body: string;
    priority?: "LOW" | "HIGH" | "CRITICAL" | "NORMAL" | undefined;
    expiresAt?: string | null | undefined;
    audienceRoleIds?: string[] | undefined;
    publishAt?: string | undefined;
    requireAck?: boolean | undefined;
    discordChannelId?: string | null | undefined;
    attachments?: string[] | undefined;
}>;
export declare const pollSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    options: z.ZodArray<z.ZodString, "many">;
    audienceRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    startsAt: z.ZodOptional<z.ZodString>;
    endsAt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    anonymous: z.ZodDefault<z.ZodBoolean>;
    multiple: z.ZodDefault<z.ZodBoolean>;
    showResults: z.ZodDefault<z.ZodEnum<["ALWAYS", "AFTER_VOTE", "AFTER_END", "NEVER"]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string | null;
    audienceRoleIds: string[];
    options: string[];
    anonymous: boolean;
    multiple: boolean;
    showResults: "ALWAYS" | "AFTER_VOTE" | "AFTER_END" | "NEVER";
    startsAt?: string | undefined;
    endsAt?: string | null | undefined;
}, {
    title: string;
    options: string[];
    description?: string | null | undefined;
    startsAt?: string | undefined;
    audienceRoleIds?: string[] | undefined;
    endsAt?: string | null | undefined;
    anonymous?: boolean | undefined;
    multiple?: boolean | undefined;
    showResults?: "ALWAYS" | "AFTER_VOTE" | "AFTER_END" | "NEVER" | undefined;
}>;
/** Interne Meldungen (Zielgruppe, Priorität, Zeitraum, Lesebestätigung, Discord) und Abstimmungen. */
export declare class HrCommsService {
    private readonly core;
    private readonly perms;
    constructor(core: HrCoreService, perms: PermissionService);
    private get prisma();
    /** Gehört der Benutzer zur Zielgruppe (Dashboard-Rollen; leer = alle)? */
    private inAudience;
    /** Alle aktiven Benutzer der Zielgruppe (für „47 von 52 gelesen“). */
    private audience;
    announcements(actor: Actor, all?: boolean): Promise<{
        author: string;
        readAt: Date | null;
        readCount: number;
        audienceCount: number | null;
        serverId: string | null;
        id: string;
        title: string;
        createdAt: Date;
        updatedAt: Date;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
        body: string;
        audienceRoleIds: string[];
        publishAt: Date;
        requireAck: boolean;
        discordChannelId: string | null;
        attachments: string[];
    }[]>;
    saveAnnouncement(actor: Actor, d: z.infer<typeof announcementSchema>, id?: string): Promise<{
        serverId: string | null;
        id: string;
        title: string;
        createdAt: Date;
        updatedAt: Date;
        priority: string;
        createdById: string;
        expiresAt: Date | null;
        body: string;
        audienceRoleIds: string[];
        publishAt: Date;
        requireAck: boolean;
        discordChannelId: string | null;
        attachments: string[];
    }>;
    deleteAnnouncement(actor: Actor, id: string): Promise<void>;
    ack(actor: Actor, id: string): Promise<{
        readAt: Date;
    }>;
    /** Wer hat gelesen / wer noch nicht (announcements.manage oder Verfasser). */
    readers(actor: Actor, id: string): Promise<{
        total: number;
        read: number;
        people: {
            userId: string;
            name: string;
            readAt: Date | null;
        }[];
    }>;
    polls(actor: Actor): Promise<{
        ended: boolean;
        open: boolean;
        myVote: string[] | null;
        totalVotes: number;
        canManage: boolean;
        results: {
            id: string;
            label: string;
            count: number;
            voters: string[] | null;
        }[] | null;
        serverId: string | null;
        id: string;
        title: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        createdById: string;
        startsAt: Date;
        audienceRoleIds: string[];
        options: import("@prisma/client/runtime/library").JsonValue;
        endsAt: Date | null;
        anonymous: boolean;
        multiple: boolean;
        showResults: string;
    }[]>;
    savePoll(actor: Actor, d: z.infer<typeof pollSchema>, id?: string): Promise<{
        serverId: string | null;
        id: string;
        title: string;
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        createdById: string;
        startsAt: Date;
        audienceRoleIds: string[];
        options: import("@prisma/client/runtime/library").JsonValue;
        endsAt: Date | null;
        anonymous: boolean;
        multiple: boolean;
        showResults: string;
    }>;
    deletePoll(actor: Actor, id: string): Promise<void>;
    vote(actor: Actor, id: string, optionIds: string[]): Promise<{
        voted: boolean;
    }>;
}
