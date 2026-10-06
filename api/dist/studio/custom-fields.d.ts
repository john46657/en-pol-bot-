import { z } from 'zod';
export declare const ENTITIES: readonly ["persons", "vehicles"];
export type CustomEntity = (typeof ENTITIES)[number];
export declare const customFieldDef: z.ZodEffects<z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<["text", "number", "select", "date"]>;
    required: z.ZodDefault<z.ZodBoolean>;
    options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    key: string;
    type: "number" | "select" | "text" | "date";
    label: string;
    required: boolean;
    options?: string[] | undefined;
}, {
    key: string;
    type: "number" | "select" | "text" | "date";
    label: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
}>, {
    key: string;
    type: "number" | "select" | "text" | "date";
    label: string;
    required: boolean;
    options?: string[] | undefined;
}, {
    key: string;
    type: "number" | "select" | "text" | "date";
    label: string;
    options?: string[] | undefined;
    required?: boolean | undefined;
}>;
export type CustomFieldDef = z.infer<typeof customFieldDef>;
export declare const customFieldsConfig: z.ZodEffects<z.ZodObject<{
    persons: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["text", "number", "select", "date"]>;
        required: z.ZodDefault<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }>, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }>, "many">>;
    vehicles: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["text", "number", "select", "date"]>;
        required: z.ZodDefault<z.ZodBoolean>;
        options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }>, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }, {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    persons: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }[];
    vehicles: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }[];
}, {
    persons?: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }[] | undefined;
    vehicles?: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }[] | undefined;
}>, {
    persons: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }[];
    vehicles: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        required: boolean;
        options?: string[] | undefined;
    }[];
}, {
    persons?: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }[] | undefined;
    vehicles?: {
        key: string;
        type: "number" | "select" | "text" | "date";
        label: string;
        options?: string[] | undefined;
        required?: boolean | undefined;
    }[] | undefined;
}>;
export type CustomFieldsConfig = z.infer<typeof customFieldsConfig>;
/** Validiert Werte strikt gegen die Definition: unbekannte Keys → Fehler, Typen werden geprüft, Pflichtfelder erzwungen. */
export declare function validateCustom(defs: CustomFieldDef[], values: Record<string, unknown> | undefined, existing?: Record<string, unknown> | null): {
    ok: true;
    value: Record<string, string | number>;
} | {
    ok: false;
    errors: string[];
};
