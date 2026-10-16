import { z } from 'zod';
import { RadioCodesService } from './radio-codes.service';
import type { Actor } from '../audit/audit.service';
declare const create: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    meaning: z.ZodString;
    category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    meaning: string;
    category?: string | null | undefined;
    description?: string | null | undefined;
    guildId?: string | null | undefined;
}, {
    code: string;
    meaning: string;
    category?: string | null | undefined;
    description?: string | null | undefined;
    guildId?: string | null | undefined;
}>;
declare const update: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    meaning: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    category?: string | null | undefined;
    description?: string | null | undefined;
    code?: string | undefined;
    meaning?: string | undefined;
}, {
    category?: string | null | undefined;
    description?: string | null | undefined;
    code?: string | undefined;
    meaning?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    q?: string | undefined;
}, {
    q?: string | undefined;
}>;
declare const discordCfg: z.ZodObject<{
    channelId: z.ZodNullable<z.ZodString>;
    title: z.ZodString;
    description: z.ZodString;
    color: z.ZodString;
    groupByCategory: z.ZodBoolean;
    showDescription: z.ZodBoolean;
    autoUpdate: z.ZodBoolean;
    layout: z.ZodDefault<z.ZodEnum<["fields", "list"]>>;
    rules: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    color: string;
    title: string;
    description: string;
    channelId: string | null;
    groupByCategory: boolean;
    showDescription: boolean;
    autoUpdate: boolean;
    layout: "list" | "fields";
    rules: string;
}, {
    color: string;
    title: string;
    description: string;
    channelId: string | null;
    groupByCategory: boolean;
    showDescription: boolean;
    autoUpdate: boolean;
    layout?: "list" | "fields" | undefined;
    rules?: string | undefined;
}>;
declare const defaultsQ: z.ZodDefault<z.ZodObject<{
    set: z.ZodDefault<z.ZodEnum<["ten", "status"]>>;
}, "strip", z.ZodTypeAny, {
    set: "status" | "ten";
}, {
    set?: "status" | "ten" | undefined;
}>>;
declare const order: z.ZodObject<{
    ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    ids: string[];
}, {
    ids: string[];
}>;
export declare class RadioCodesController {
    private readonly s;
    constructor(s: RadioCodesService);
    list(q: z.infer<typeof listQ>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }[]>;
    discord(): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        channelId: string | null;
        title: string;
        description: string;
        color: string;
        groupByCategory: boolean;
        showDescription: boolean;
        autoUpdate: boolean;
        layout: "fields" | "list";
        rules: string;
    }>;
    saveDiscord(a: Actor, b: z.infer<typeof discordCfg>): Promise<{
        posted: {
            channelId: string;
            messageId: string;
        } | null;
        channelId: string | null;
        title: string;
        description: string;
        color: string;
        groupByCategory: boolean;
        showDescription: boolean;
        autoUpdate: boolean;
        layout: "fields" | "list";
        rules: string;
    }>;
    send(a: Actor, b: {
        mode: 'update' | 'new';
    }): Promise<{
        queued: boolean;
    }>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }>;
    defaults(a: Actor, b: z.infer<typeof defaultsQ>): Promise<{
        added: number;
    }>;
    reorder(a: Actor, b: z.infer<typeof order>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }[]>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        category: string | null;
        description: string | null;
        code: string;
        guildId: string | null;
        position: number;
        meaning: string;
    }>;
    remove(a: Actor, id: string): Promise<void>;
}
export {};
