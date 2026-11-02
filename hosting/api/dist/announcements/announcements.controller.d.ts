import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { announceConfigSchema, announcementBody, AnnouncementsService } from './announcements.service';
declare const listQ: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "SCHEDULED", "PUBLISHED", "RETRACTED", "FAILED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "FAILED" | "DRAFT" | "PUBLISHED" | "SCHEDULED" | "RETRACTED" | undefined;
}, {
    status?: "FAILED" | "DRAFT" | "PUBLISHED" | "SCHEDULED" | "RETRACTED" | undefined;
}>;
declare const previewBody: z.ZodObject<Pick<{
    type: z.ZodEnum<["GENERAL", "DIRECTIVE", "TRAINING", "MEETING", "MAINTENANCE", "SYSTEM"]>;
    content: z.ZodObject<{
        title: z.ZodString;
        description: z.ZodString;
        color: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageUrl: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
        thumbnailUrl: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
        footer: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        timestamp: z.ZodDefault<z.ZodBoolean>;
        fields: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            value: z.ZodString;
            inline: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            value: string;
            inline: boolean;
        }, {
            name: string;
            value: string;
            inline?: boolean | undefined;
        }>, "many">>;
        links: z.ZodDefault<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            url: z.ZodEffects<z.ZodString, string, string>;
        }, "strip", z.ZodTypeAny, {
            label: string;
            url: string;
        }, {
            label: string;
            url: string;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        links: {
            label: string;
            url: string;
        }[];
        title: string;
        description: string;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
        timestamp: boolean;
        color?: string | null | undefined;
        thumbnailUrl?: string | null | undefined;
        imageUrl?: string | null | undefined;
        footer?: string | null | undefined;
    }, {
        title: string;
        description: string;
        links?: {
            label: string;
            url: string;
        }[] | undefined;
        color?: string | null | undefined;
        thumbnailUrl?: string | null | undefined;
        imageUrl?: string | null | undefined;
        footer?: string | null | undefined;
        fields?: {
            name: string;
            value: string;
            inline?: boolean | undefined;
        }[] | undefined;
        timestamp?: boolean | undefined;
    }>;
    channelId: z.ZodString;
    audience: z.ZodDefault<z.ZodEnum<["SERVER", "ROLES", "DEPARTMENTS"]>>;
    audienceRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    audienceDepartments: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    mentionRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    scheduledAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    recurrence: z.ZodDefault<z.ZodEnum<["NONE", "DAILY", "WEEKLY", "MONTHLY"]>>;
    templateName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "type" | "content" | "mentionRoleIds">, "strip", z.ZodTypeAny, {
    type: "GENERAL" | "TRAINING" | "SYSTEM" | "MEETING" | "DIRECTIVE" | "MAINTENANCE";
    content: {
        links: {
            label: string;
            url: string;
        }[];
        title: string;
        description: string;
        fields: {
            name: string;
            value: string;
            inline: boolean;
        }[];
        timestamp: boolean;
        color?: string | null | undefined;
        thumbnailUrl?: string | null | undefined;
        imageUrl?: string | null | undefined;
        footer?: string | null | undefined;
    };
    mentionRoleIds: string[];
}, {
    type: "GENERAL" | "TRAINING" | "SYSTEM" | "MEETING" | "DIRECTIVE" | "MAINTENANCE";
    content: {
        title: string;
        description: string;
        links?: {
            label: string;
            url: string;
        }[] | undefined;
        color?: string | null | undefined;
        thumbnailUrl?: string | null | undefined;
        imageUrl?: string | null | undefined;
        footer?: string | null | undefined;
        fields?: {
            name: string;
            value: string;
            inline?: boolean | undefined;
        }[] | undefined;
        timestamp?: boolean | undefined;
    };
    mentionRoleIds?: string[] | undefined;
}>;
declare const reasonBody: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
/** Ankündigungen. Ansehen: announce.view · Entwürfe: announce.create · veröffentlichen/planen/zurückziehen: announce.publish · Rollen erwähnen: announce.mention. */
export declare class AnnouncementsController {
    private readonly s;
    constructor(s: AnnouncementsService);
    list(q: z.infer<typeof listQ>): Promise<{
        typeLabel: string;
        deliveries: {
            kind: string;
            createdAt: Date;
            slot: Date | null;
        }[] | undefined;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        audience: string;
        audienceRoleIds: string[];
        publishedAt: Date | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }[]>;
    templates(): {
        type: "GENERAL" | "TRAINING" | "SYSTEM" | "MEETING" | "DIRECTIVE" | "MAINTENANCE";
        name: string;
        content: {
            title: string;
            description: string;
            color: string;
            fields: never[];
            links: never[];
            timestamp: boolean;
        };
    }[];
    config(): Promise<{
        channelIds: string[];
    }>;
    saveConfig(a: Actor, b: z.infer<typeof announceConfigSchema>): Promise<{
        channelIds: string[];
    }>;
    preview(b: z.infer<typeof previewBody>): {
        buttons?: {
            id: string;
            label: string;
            style: "secondary";
            url: string;
        }[] | undefined;
        embeds: {
            timestamp?: string | undefined;
            footer: string;
            fields?: {
                name: string;
                value: string;
                inline: boolean;
            }[] | undefined;
            thumbnail?: string | undefined;
            image?: string | undefined;
            title: string;
            description: string;
            color: number;
        }[];
        content?: string | undefined;
        mentionRoles?: string[] | undefined;
    };
    get(id: string): Promise<{
        createdByName: string;
        deliveries: {
            kind: string;
            at: Date;
            slot: Date | null;
            by: string;
        }[];
        typeLabel: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        audience: string;
        audienceRoleIds: string[];
        publishedAt: Date | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    create(a: Actor, b: z.infer<typeof announcementBody>): Promise<{
        createdByName: string;
        deliveries: {
            kind: string;
            at: Date;
            slot: Date | null;
            by: string;
        }[];
        typeLabel: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        audience: string;
        audienceRoleIds: string[];
        publishedAt: Date | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof announcementBody> & {
        version: number;
    }): Promise<{
        createdByName: string;
        deliveries: {
            kind: string;
            at: Date;
            slot: Date | null;
            by: string;
        }[];
        typeLabel: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        audience: string;
        audienceRoleIds: string[];
        publishedAt: Date | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    publish(a: Actor, id: string): Promise<{
        createdByName: string;
        deliveries: {
            kind: string;
            at: Date;
            slot: Date | null;
            by: string;
        }[];
        typeLabel: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        audience: string;
        audienceRoleIds: string[];
        publishedAt: Date | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    retract(a: Actor, id: string, b: z.infer<typeof reasonBody>): Promise<{
        createdByName: string;
        deliveries: {
            kind: string;
            at: Date;
            slot: Date | null;
            by: string;
        }[];
        typeLabel: string;
        serverId: string | null;
        id: string;
        status: string;
        createdById: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        type: string;
        title: string;
        audience: string;
        audienceRoleIds: string[];
        publishedAt: Date | null;
        content: import("@prisma/client/runtime/library").JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
}
export {};
