import { z } from 'zod';
import { type ReportTemplate } from '@enrp/shared';
import { DutyReportsService } from './duty-reports.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    templateId: z.ZodString;
    periodStart: z.ZodOptional<z.ZodString>;
    values: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    guildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    source: z.ZodOptional<z.ZodEnum<["WEB", "DISCORD"]>>;
}, "strip", z.ZodTypeAny, {
    values: Record<string, string | number>;
    templateId: string;
    guildId?: string | null | undefined;
    source?: "DISCORD" | "WEB" | undefined;
    periodStart?: string | undefined;
}, {
    values: Record<string, string | number>;
    templateId: string;
    guildId?: string | null | undefined;
    source?: "DISCORD" | "WEB" | undefined;
    periodStart?: string | undefined;
}>;
declare const edit: z.ZodObject<{
    values: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    values: Record<string, string | number>;
    version?: number | undefined;
}, {
    values: Record<string, string | number>;
    version?: number | undefined;
}>;
declare const listQ: z.ZodObject<{
    templateId: z.ZodOptional<z.ZodString>;
    authorId: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    q: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["SUBMITTED", "REVIEWED"]>>;
    mine: z.ZodOptional<z.ZodBoolean>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    status?: "SUBMITTED" | "REVIEWED" | undefined;
    mine?: boolean | undefined;
    q?: string | undefined;
    authorId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    templateId?: string | undefined;
}, {
    status?: "SUBMITTED" | "REVIEWED" | undefined;
    mine?: boolean | undefined;
    q?: string | undefined;
    authorId?: string | undefined;
    from?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    to?: string | undefined;
    templateId?: string | undefined;
}>;
/** 🗓️ Tages-/Wochenberichte (auch vom Discord-Bot im Namen des verknüpften Benutzers benutzt). */
export declare class DutyReportsController {
    private readonly s;
    constructor(s: DutyReportsService);
    templates(active?: string): Promise<{
        description: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        active: boolean;
        fields: {
            options: string[];
            label: string;
            required: boolean;
            maxLength: number;
            type: "number" | "select" | "long" | "short";
            id: string;
            placeholder: string;
            inline: boolean;
        }[];
        pingRoleIds: string[];
        emoji: string;
        period: "DAILY" | "WEEKLY" | "FREE";
        onePerPeriod: boolean;
        authorCanEdit: boolean;
    }[]>;
    saveTemplate(a: Actor, id: string, b: ReportTemplate): Promise<{
        description: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        active: boolean;
        fields: {
            options: string[];
            label: string;
            required: boolean;
            maxLength: number;
            type: "number" | "select" | "long" | "short";
            id: string;
            placeholder: string;
            inline: boolean;
        }[];
        pingRoleIds: string[];
        emoji: string;
        period: "DAILY" | "WEEKLY" | "FREE";
        onePerPeriod: boolean;
        authorCanEdit: boolean;
    }>;
    dup(a: Actor, id: string): Promise<{
        description: string;
        id: string;
        name: string;
        guildId: string | null;
        channelId: string | null;
        color: string;
        active: boolean;
        fields: {
            options: string[];
            label: string;
            required: boolean;
            maxLength: number;
            type: "number" | "select" | "long" | "short";
            id: string;
            placeholder: string;
            inline: boolean;
        }[];
        pingRoleIds: string[];
        emoji: string;
        period: "DAILY" | "WEEKLY" | "FREE";
        onePerPeriod: boolean;
        authorCanEdit: boolean;
    }>;
    removeTemplate(a: Actor, id: string): Promise<void>;
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        items: ({
            author: {
                id: string;
                displayName: string;
            };
        } & {
            number: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            version: number;
            guildId: string | null;
            values: import("@prisma/client/runtime/library").JsonValue;
            status: string;
            source: string;
            authorId: string;
            templateId: string;
            templateName: string;
            period: string;
            periodStart: Date;
            reviewedById: string | null;
            reviewedAt: Date | null;
            editedById: string | null;
        })[];
        total: number;
        page: number;
        pageSize: number;
        seeAll: boolean;
    }>;
    get(a: Actor, id: string): Promise<{
        template: {
            description: string;
            id: string;
            name: string;
            guildId: string | null;
            channelId: string | null;
            color: string;
            active: boolean;
            fields: {
                options: string[];
                label: string;
                required: boolean;
                maxLength: number;
                type: "number" | "select" | "long" | "short";
                id: string;
                placeholder: string;
                inline: boolean;
            }[];
            pingRoleIds: string[];
            emoji: string;
            period: "DAILY" | "WEEKLY" | "FREE";
            onePerPeriod: boolean;
            authorCanEdit: boolean;
        } | null;
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        canEdit: boolean;
        author: {
            id: string;
            displayName: string;
        };
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        values: import("@prisma/client/runtime/library").JsonValue;
        status: string;
        source: string;
        authorId: string;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        editedById: string | null;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        merged: boolean;
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        values: import("@prisma/client/runtime/library").JsonValue;
        status: string;
        source: string;
        authorId: string;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        editedById: string | null;
    }>;
    edit(a: Actor, id: string, b: z.infer<typeof edit>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        values: import("@prisma/client/runtime/library").JsonValue;
        status: string;
        source: string;
        authorId: string;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        editedById: string | null;
    }>;
    review(a: Actor, id: string): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        version: number;
        guildId: string | null;
        values: import("@prisma/client/runtime/library").JsonValue;
        status: string;
        source: string;
        authorId: string;
        templateId: string;
        templateName: string;
        period: string;
        periodStart: Date;
        reviewedById: string | null;
        reviewedAt: Date | null;
        editedById: string | null;
    }>;
    remove(a: Actor, id: string): Promise<void>;
}
export {};
