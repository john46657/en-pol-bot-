import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { DiscordService } from '../discord/discord.service';
export declare const contentSchema: z.ZodObject<{
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
export declare const announcementBody: z.ZodObject<{
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
}, "strip", z.ZodTypeAny, {
    type: "SYSTEM" | "GENERAL" | "TRAINING" | "MEETING" | "DIRECTIVE" | "MAINTENANCE";
    audience: "SERVER" | "ROLES" | "DEPARTMENTS";
    audienceRoleIds: string[];
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
    channelId: string;
    audienceDepartments: string[];
    mentionRoleIds: string[];
    recurrence: "NONE" | "WEEKLY" | "DAILY" | "MONTHLY";
    scheduledAt?: Date | null | undefined;
    templateName?: string | null | undefined;
}, {
    type: "SYSTEM" | "GENERAL" | "TRAINING" | "MEETING" | "DIRECTIVE" | "MAINTENANCE";
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
    channelId: string;
    audience?: "SERVER" | "ROLES" | "DEPARTMENTS" | undefined;
    audienceRoleIds?: string[] | undefined;
    audienceDepartments?: string[] | undefined;
    mentionRoleIds?: string[] | undefined;
    scheduledAt?: Date | null | undefined;
    recurrence?: "NONE" | "WEEKLY" | "DAILY" | "MONTHLY" | undefined;
    templateName?: string | null | undefined;
}>;
export declare const announceConfigSchema: z.ZodObject<{
    channelIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    channelIds: string[];
}, {
    channelIds?: string[] | undefined;
}>;
export type AnnouncementInput = z.infer<typeof announcementBody>;
/** Vorlagen je Art (Startwerte im Editor) – keine Lesebestätigung, keine Abstimmung. */
export declare const ANNOUNCEMENT_TEMPLATES: {
    type: "SYSTEM" | "GENERAL" | "TRAINING" | "MEETING" | "DIRECTIVE" | "MAINTENANCE";
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
/**
 * Ankündigungsmanager: Discord-Ankündigungen über den vorhandenen Bot (gleiche Strecke wie der Embed Builder: `message.post`).
 * Erwähnungen nur ausgewählter Rollen (Recht announce.mention, max. 3), nie @everyone/@here. Zurückgezogene bleiben erhalten
 * (Nachricht wird in Discord als zurückgezogen markiert). Planen und Wiederholen genau einmal je Termin (Versandhistorie mit Zeitpunkt).
 */
export declare class AnnouncementsService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly notify;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, notify: NotifyService, discord: DiscordService);
    config(): Promise<{
        channelIds: string[];
    }>;
    saveConfig(actor: Actor, c: z.infer<typeof announceConfigSchema>): Promise<{
        channelIds: string[];
    }>;
    private check;
    preview(d: Pick<AnnouncementInput, 'type' | 'content' | 'mentionRoleIds'>): {
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
    private view;
    list(f: {
        status?: string;
    }): Promise<{
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
        content: Prisma.JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }[]>;
    private load;
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
        content: Prisma.JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    create(actor: Actor, d: AnnouncementInput): Promise<{
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
        content: Prisma.JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    update(actor: Actor, id: string, d: AnnouncementInput & {
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
        content: Prisma.JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    /** Jetzt veröffentlichen (Entwurf/geplant/fehlgeschlagen) bzw. planen, falls `scheduledAt` in der Zukunft liegt. */
    publish(actor: Actor, id: string): Promise<{
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
        content: Prisma.JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    /** Senden genau einmal je Zeitpunkt (`slot`): Zeile in der Versandhistorie ist der Riegel (übersteht Neustarts, mehrere Instanzen). */
    private send;
    /** Dashboard/MDT/Leitstelle: Hinweis an die Zielgruppe (ohne DM, ohne Inhalt außer Titel). */
    private notifyAudience;
    /** Zurückziehen: bleibt in der Historie; die Discord-Nachricht(en) werden als zurückgezogen markiert (kein Löschen, kein Ping). */
    retract(actor: Actor, id: string, reason: string): Promise<{
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
        content: Prisma.JsonValue;
        channelId: string;
        audienceDepartments: string[];
        mentionRoleIds: string[];
        scheduledAt: Date | null;
        recurrence: string;
        retractedAt: Date | null;
        retractReason: string | null;
        templateName: string | null;
    }>;
    /** Jede Minute: geplante und wiederkehrende Ankündigungen veröffentlichen (je Zeitpunkt genau einmal). */
    tick(now?: Date): Promise<{
        published: number;
    }>;
}
