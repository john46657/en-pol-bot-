import { z } from 'zod';
/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
export declare const unitSchema: z.ZodObject<{
    key: z.ZodString;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
    roleId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    questions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    key: string;
    questions: string[];
    roleId?: string | undefined;
}, {
    name: string;
    key: string;
    questions: string[];
    roleId?: string | undefined;
    description?: string | undefined;
}>;
export declare const configSchema: z.ZodObject<{
    title: z.ZodDefault<z.ZodString>;
    intro: z.ZodDefault<z.ZodString>;
    units: z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        name: z.ZodString;
        description: z.ZodDefault<z.ZodString>;
        /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
        roleId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        questions: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        key: string;
        questions: string[];
        roleId?: string | undefined;
    }, {
        name: string;
        key: string;
        questions: string[];
        roleId?: string | undefined;
        description?: string | undefined;
    }>, "many">, {
        name: string;
        description: string;
        key: string;
        questions: string[];
        roleId?: string | undefined;
    }[], {
        name: string;
        key: string;
        questions: string[];
        roleId?: string | undefined;
        description?: string | undefined;
    }[]>;
}, "strip", z.ZodTypeAny, {
    title: string;
    units: {
        name: string;
        description: string;
        key: string;
        questions: string[];
        roleId?: string | undefined;
    }[];
    intro: string;
}, {
    units: {
        name: string;
        key: string;
        questions: string[];
        roleId?: string | undefined;
        description?: string | undefined;
    }[];
    title?: string | undefined;
    intro?: string | undefined;
}>;
export type QualificationUnit = z.infer<typeof unitSchema>;
export type QualificationConfig = z.infer<typeof configSchema>;
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
export declare const DEFAULT_CONFIG: QualificationConfig;
