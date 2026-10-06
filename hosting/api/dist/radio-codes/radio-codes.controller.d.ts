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
    guildId?: string | null | undefined;
    description?: string | null | undefined;
}, {
    code: string;
    meaning: string;
    category?: string | null | undefined;
    guildId?: string | null | undefined;
    description?: string | null | undefined;
}>;
declare const update: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    meaning: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    category?: string | null | undefined;
    description?: string | null | undefined;
    meaning?: string | undefined;
}, {
    code?: string | undefined;
    category?: string | null | undefined;
    description?: string | null | undefined;
    meaning?: string | undefined;
}>;
declare const listQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    q?: string | undefined;
}, {
    q?: string | undefined;
}>;
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
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }[]>;
    create(a: Actor, b: z.infer<typeof create>): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }>;
    defaults(a: Actor): Promise<{
        added: number;
    }>;
    reorder(a: Actor, b: z.infer<typeof order>): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }[]>;
    update(a: Actor, id: string, b: z.infer<typeof update>): Promise<{
        id: string;
        createdAt: Date;
        code: string;
        category: string | null;
        updatedAt: Date;
        guildId: string | null;
        description: string | null;
        position: number;
        meaning: string;
    }>;
    remove(a: Actor, id: string): Promise<void>;
}
export {};
