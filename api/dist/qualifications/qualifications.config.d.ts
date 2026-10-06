import { z } from 'zod';
import { type FormField } from '@enrp/shared';
/** Eine Bewerbungsfrage wie bei Appy: Text, Auswahl oder Rollen-Auswahl – mit Prüf-Einstellungen. */
export declare const formFieldSchema: z.ZodEffects<z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    required: z.ZodBoolean;
    type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE", ...("TEXT" | "CHOICE" | "ROLE")[]]>>;
    minLength: z.ZodDefault<z.ZodNumber>;
    maxLength: z.ZodDefault<z.ZodNumber>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        roleId?: string | undefined;
    }, {
        label: string;
        roleId?: string | undefined;
    }>, "many">>;
    multiple: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    key: string;
    type: "TEXT" | "CHOICE" | "ROLE";
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    label: string;
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>, {
    key: string;
    type: "TEXT" | "CHOICE" | "ROLE";
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    label: string;
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>;
export declare const formSchema: z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    required: z.ZodBoolean;
    type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE", ...("TEXT" | "CHOICE" | "ROLE")[]]>>;
    minLength: z.ZodDefault<z.ZodNumber>;
    maxLength: z.ZodDefault<z.ZodNumber>;
    options: z.ZodDefault<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
    }, "strip", z.ZodTypeAny, {
        label: string;
        roleId?: string | undefined;
    }, {
        label: string;
        roleId?: string | undefined;
    }>, "many">>;
    multiple: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    key: string;
    type: "TEXT" | "CHOICE" | "ROLE";
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    label: string;
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>, {
    key: string;
    type: "TEXT" | "CHOICE" | "ROLE";
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    label: string;
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>, "many">, {
    key: string;
    type: "TEXT" | "CHOICE" | "ROLE";
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    label: string;
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}[], {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}[]>;
/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
export declare const unitSchema: z.ZodObject<{
    key: z.ZodString;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
    roleId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
    channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    questions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE", ...("TEXT" | "CHOICE" | "ROLE")[]]>>;
        minLength: z.ZodDefault<z.ZodNumber>;
        maxLength: z.ZodDefault<z.ZodNumber>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
        }, "strip", z.ZodTypeAny, {
            label: string;
            roleId?: string | undefined;
        }, {
            label: string;
            roleId?: string | undefined;
        }>, "many">>;
        multiple: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>]>, "many">, FormField[], (string | {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    })[]>, FormField[], (string | {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    })[]>;
    /** Discord-Rolle(n), die bei einer neuen Bewerbung im Channel erwähnt werden (z. B. @Staffelkommandant). */
    pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description: string;
    key: string;
    pingRoleIds: string[];
    questions: FormField[];
    roleId?: string | undefined;
    channelId?: string | undefined;
}, {
    name: string;
    key: string;
    questions: (string | {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    })[];
    roleId?: string | undefined;
    description?: string | undefined;
    pingRoleIds?: string[] | undefined;
    channelId?: string | undefined;
}>;
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
export declare const policeSchema: z.ZodObject<{
    pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    title: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    description: string;
    title: string;
    pingRoleIds: string[];
}, {
    description?: string | undefined;
    title?: string | undefined;
    pingRoleIds?: string[] | undefined;
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
        /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
        channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        questions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            required: z.ZodBoolean;
            type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE", ...("TEXT" | "CHOICE" | "ROLE")[]]>>;
            minLength: z.ZodDefault<z.ZodNumber>;
            maxLength: z.ZodDefault<z.ZodNumber>;
            options: z.ZodDefault<z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
            }, "strip", z.ZodTypeAny, {
                label: string;
                roleId?: string | undefined;
            }, {
                label: string;
                roleId?: string | undefined;
            }>, "many">>;
            multiple: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            key: string;
            type: "TEXT" | "CHOICE" | "ROLE";
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            label: string;
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        }>, {
            key: string;
            type: "TEXT" | "CHOICE" | "ROLE";
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            label: string;
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        }>]>, "many">, FormField[], (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[]>, FormField[], (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[]>;
        /** Discord-Rolle(n), die bei einer neuen Bewerbung im Channel erwähnt werden (z. B. @Staffelkommandant). */
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        key: string;
        pingRoleIds: string[];
        questions: FormField[];
        roleId?: string | undefined;
        channelId?: string | undefined;
    }, {
        name: string;
        key: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        roleId?: string | undefined;
        description?: string | undefined;
        pingRoleIds?: string[] | undefined;
        channelId?: string | undefined;
    }>, "many">, {
        name: string;
        description: string;
        key: string;
        pingRoleIds: string[];
        questions: FormField[];
        roleId?: string | undefined;
        channelId?: string | undefined;
    }[], {
        name: string;
        key: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        roleId?: string | undefined;
        description?: string | undefined;
        pingRoleIds?: string[] | undefined;
        channelId?: string | undefined;
    }[]>;
    police: z.ZodDefault<z.ZodObject<{
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        title: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        title: string;
        pingRoleIds: string[];
    }, {
        description?: string | undefined;
        title?: string | undefined;
        pingRoleIds?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    units: {
        name: string;
        description: string;
        key: string;
        pingRoleIds: string[];
        questions: FormField[];
        roleId?: string | undefined;
        channelId?: string | undefined;
    }[];
    intro: string;
    police: {
        description: string;
        title: string;
        pingRoleIds: string[];
    };
}, {
    units: {
        name: string;
        key: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        roleId?: string | undefined;
        description?: string | undefined;
        pingRoleIds?: string[] | undefined;
        channelId?: string | undefined;
    }[];
    title?: string | undefined;
    intro?: string | undefined;
    police?: {
        description?: string | undefined;
        title?: string | undefined;
        pingRoleIds?: string[] | undefined;
    } | undefined;
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
        /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
        channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        questions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            required: z.ZodBoolean;
            type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE", ...("TEXT" | "CHOICE" | "ROLE")[]]>>;
            minLength: z.ZodDefault<z.ZodNumber>;
            maxLength: z.ZodDefault<z.ZodNumber>;
            options: z.ZodDefault<z.ZodArray<z.ZodObject<{
                label: z.ZodString;
                roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
            }, "strip", z.ZodTypeAny, {
                label: string;
                roleId?: string | undefined;
            }, {
                label: string;
                roleId?: string | undefined;
            }>, "many">>;
            multiple: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            key: string;
            type: "TEXT" | "CHOICE" | "ROLE";
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            label: string;
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        }>, {
            key: string;
            type: "TEXT" | "CHOICE" | "ROLE";
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            label: string;
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        }>]>, "many">, FormField[], (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[]>, FormField[], (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[]>;
        /** Discord-Rolle(n), die bei einer neuen Bewerbung im Channel erwähnt werden (z. B. @Staffelkommandant). */
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description: string;
        key: string;
        pingRoleIds: string[];
        questions: FormField[];
        roleId?: string | undefined;
        channelId?: string | undefined;
    }, {
        name: string;
        key: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        roleId?: string | undefined;
        description?: string | undefined;
        pingRoleIds?: string[] | undefined;
        channelId?: string | undefined;
    }>, "many">, {
        name: string;
        description: string;
        key: string;
        pingRoleIds: string[];
        questions: FormField[];
        roleId?: string | undefined;
        channelId?: string | undefined;
    }[], {
        name: string;
        key: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        roleId?: string | undefined;
        description?: string | undefined;
        pingRoleIds?: string[] | undefined;
        channelId?: string | undefined;
    }[]>;
    police: z.ZodDefault<z.ZodObject<{
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        title: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        title: string;
        pingRoleIds: string[];
    }, {
        description?: string | undefined;
        title?: string | undefined;
        pingRoleIds?: string[] | undefined;
    }>>;
} & {
    policeForm: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE", ...("TEXT" | "CHOICE" | "ROLE")[]]>>;
        minLength: z.ZodDefault<z.ZodNumber>;
        maxLength: z.ZodDefault<z.ZodNumber>;
        options: z.ZodDefault<z.ZodArray<z.ZodObject<{
            label: z.ZodString;
            roleId: z.ZodEffects<z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>, string | undefined, string | undefined>;
        }, "strip", z.ZodTypeAny, {
            label: string;
            roleId?: string | undefined;
        }, {
            label: string;
            roleId?: string | undefined;
        }>, "many">>;
        multiple: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, "many">, {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }[], {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }[]>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    units: {
        name: string;
        description: string;
        key: string;
        pingRoleIds: string[];
        questions: FormField[];
        roleId?: string | undefined;
        channelId?: string | undefined;
    }[];
    intro: string;
    police: {
        description: string;
        title: string;
        pingRoleIds: string[];
    };
    policeForm?: {
        key: string;
        type: "TEXT" | "CHOICE" | "ROLE";
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        label: string;
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }[] | undefined;
}, {
    units: {
        name: string;
        key: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        roleId?: string | undefined;
        description?: string | undefined;
        pingRoleIds?: string[] | undefined;
        channelId?: string | undefined;
    }[];
    title?: string | undefined;
    intro?: string | undefined;
    police?: {
        description?: string | undefined;
        title?: string | undefined;
        pingRoleIds?: string[] | undefined;
    } | undefined;
    policeForm?: {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }[] | undefined;
}>;
export type QualificationUnit = z.infer<typeof unitSchema>;
export type QualificationConfig = z.infer<typeof configSchema>;
/** Startkonfiguration – im Web unter „Qualifications → Setup“ änderbar. */
export declare const DEFAULT_CONFIG: QualificationConfig;
