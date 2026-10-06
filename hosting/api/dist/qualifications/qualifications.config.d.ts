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
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
export declare const policeSchema: z.ZodObject<{
    title: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    title: string;
}, {
    description?: string | undefined;
    title?: string | undefined;
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
    police: z.ZodDefault<z.ZodObject<{
        title: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        title: string;
    }, {
        description?: string | undefined;
        title?: string | undefined;
    }>>;
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
    police: {
        description: string;
        title: string;
    };
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
    police?: {
        description?: string | undefined;
        title?: string | undefined;
    } | undefined;
}>;
/** Feld des Bewerbungsformulars (gleiche Regeln wie Studio → Application form). */
export declare const formFieldSchema: z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    required: z.ZodBoolean;
    maxLength: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    key: string;
    label: string;
    required: boolean;
    maxLength: number;
}, {
    key: string;
    label: string;
    required: boolean;
    maxLength: number;
}>;
/** Speichern aus „Qualifications → Setup“: Panels + Einheiten und optional die Fragen der Polizei-Bewerbung. */
export declare const saveSchema: z.ZodObject<{
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
    police: z.ZodDefault<z.ZodObject<{
        title: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        title: string;
    }, {
        description?: string | undefined;
        title?: string | undefined;
    }>>;
} & {
    policeForm: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        maxLength: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        key: string;
        label: string;
        required: boolean;
        maxLength: number;
    }, {
        key: string;
        label: string;
        required: boolean;
        maxLength: number;
    }>, "many">, {
        key: string;
        label: string;
        required: boolean;
        maxLength: number;
    }[], {
        key: string;
        label: string;
        required: boolean;
        maxLength: number;
    }[]>>;
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
    police: {
        description: string;
        title: string;
    };
    policeForm?: {
        key: string;
        label: string;
        required: boolean;
        maxLength: number;
    }[] | undefined;
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
    police?: {
        description?: string | undefined;
        title?: string | undefined;
    } | undefined;
    policeForm?: {
        key: string;
        label: string;
        required: boolean;
        maxLength: number;
    }[] | undefined;
}>;
export type QualificationUnit = z.infer<typeof unitSchema>;
export type QualificationConfig = z.infer<typeof configSchema>;
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
export declare const DEFAULT_CONFIG: QualificationConfig;
