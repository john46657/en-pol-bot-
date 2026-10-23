import { z } from 'zod';
import { type FormField } from '@enrp/shared';
/** Eine Bewerbungsfrage wie bei Appy: Text, Auswahl oder Rollen-Auswahl – mit Prüf-Einstellungen. */
export declare const formFieldSchema: z.ZodEffects<z.ZodObject<{
    key: z.ZodString;
    label: z.ZodString;
    required: z.ZodBoolean;
    type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
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
    type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
    key: string;
    label: string;
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>, {
    type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
    key: string;
    label: string;
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
    type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
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
    type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
    key: string;
    label: string;
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>, {
    type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
    key: string;
    label: string;
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}, {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}>, "many">, {
    type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
    key: string;
    label: string;
    options: {
        label: string;
        roleId?: string | undefined;
    }[];
    required: boolean;
    minLength: number;
    maxLength: number;
    multiple: boolean;
}[], {
    key: string;
    label: string;
    required: boolean;
    type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
    options?: {
        label: string;
        roleId?: string | undefined;
    }[] | undefined;
    minLength?: number | undefined;
    maxLength?: number | undefined;
    multiple?: boolean | undefined;
}[]>;
/** Texte, Rollen und Sonstiges je Bewerbung (wie Appy: Embed Customization, Role Config, Other). */
export declare const appSettingsSchema: z.ZodDefault<z.ZodObject<{
    messages: z.ZodDefault<z.ZodObject<{
        accepted: z.ZodDefault<z.ZodString>;
        denied: z.ZodDefault<z.ZodString>;
        confirmation: z.ZodDefault<z.ZodString>;
        completion: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        denied: string;
        accepted: string;
        confirmation: string;
        completion: string;
    }, {
        denied?: string | undefined;
        accepted?: string | undefined;
        confirmation?: string | undefined;
        completion?: string | undefined;
    }>>;
    roles: z.ZodDefault<z.ZodObject<{
        restricted: z.ZodDefault<z.ZodObject<{
            ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "ALL" | "ANY";
            ids: string[];
        }, {
            mode?: "ALL" | "ANY" | undefined;
            ids?: string[] | undefined;
        }>>;
        required: z.ZodDefault<z.ZodObject<{
            ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "ALL" | "ANY";
            ids: string[];
        }, {
            mode?: "ALL" | "ANY" | undefined;
            ids?: string[] | undefined;
        }>>;
        accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
        managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        denied: string[];
        required: {
            mode: "ALL" | "ANY";
            ids: string[];
        };
        accepted: string[];
        restricted: {
            mode: "ALL" | "ANY";
            ids: string[];
        };
        acceptedRemove: string[];
        deniedRemove: string[];
        pending: string[];
        removeOnSubmit: string[];
        managers: string[];
    }, {
        denied?: string[] | undefined;
        required?: {
            mode?: "ALL" | "ANY" | undefined;
            ids?: string[] | undefined;
        } | undefined;
        accepted?: string[] | undefined;
        restricted?: {
            mode?: "ALL" | "ANY" | undefined;
            ids?: string[] | undefined;
        } | undefined;
        acceptedRemove?: string[] | undefined;
        deniedRemove?: string[] | undefined;
        pending?: string[] | undefined;
        removeOnSubmit?: string[] | undefined;
        managers?: string[] | undefined;
    }>>;
    staffThreads: z.ZodDefault<z.ZodBoolean>;
    cooldownMinutes: z.ZodDefault<z.ZodNumber>;
    timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
    /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
    onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
    /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
    mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
}, "strip", z.ZodTypeAny, {
    mode: "DM" | "WEB";
    messages: {
        denied: string;
        accepted: string;
        confirmation: string;
        completion: string;
    };
    cooldownMinutes: number;
    roles: {
        denied: string[];
        required: {
            mode: "ALL" | "ANY";
            ids: string[];
        };
        accepted: string[];
        restricted: {
            mode: "ALL" | "ANY";
            ids: string[];
        };
        acceptedRemove: string[];
        deniedRemove: string[];
        pending: string[];
        removeOnSubmit: string[];
        managers: string[];
    };
    staffThreads: boolean;
    timeLimitMinutes: number;
    onLeave: "DENY" | "NONE" | "WITHDRAW";
}, {
    mode?: "DM" | "WEB" | undefined;
    messages?: {
        denied?: string | undefined;
        accepted?: string | undefined;
        confirmation?: string | undefined;
        completion?: string | undefined;
    } | undefined;
    cooldownMinutes?: number | undefined;
    roles?: {
        denied?: string[] | undefined;
        required?: {
            mode?: "ALL" | "ANY" | undefined;
            ids?: string[] | undefined;
        } | undefined;
        accepted?: string[] | undefined;
        restricted?: {
            mode?: "ALL" | "ANY" | undefined;
            ids?: string[] | undefined;
        } | undefined;
        acceptedRemove?: string[] | undefined;
        deniedRemove?: string[] | undefined;
        pending?: string[] | undefined;
        removeOnSubmit?: string[] | undefined;
        managers?: string[] | undefined;
    } | undefined;
    staffThreads?: boolean | undefined;
    timeLimitMinutes?: number | undefined;
    onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
}>>;
export type AppSettings = z.infer<typeof appSettingsSchema>;
/** Eine Einheit/Qualifikation, für die man sich über das Discord-Panel bewerben kann. */
export declare const unitSchema: z.ZodObject<{
    questions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
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
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        key: string;
        label: string;
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, {
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        key: string;
        label: string;
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
    /** In welchem Panel die Einheit steht: Qualifikations-Panel oder (als weitere Bewerbungsart) Bewerbungs-Panel. */
    panel: z.ZodDefault<z.ZodEnum<["quali", "apply"]>>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    acceptedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    deniedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    settings: z.ZodDefault<z.ZodObject<{
        messages: z.ZodDefault<z.ZodObject<{
            accepted: z.ZodDefault<z.ZodString>;
            denied: z.ZodDefault<z.ZodString>;
            confirmation: z.ZodDefault<z.ZodString>;
            completion: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            denied: string;
            accepted: string;
            confirmation: string;
            completion: string;
        }, {
            denied?: string | undefined;
            accepted?: string | undefined;
            confirmation?: string | undefined;
            completion?: string | undefined;
        }>>;
        roles: z.ZodDefault<z.ZodObject<{
            restricted: z.ZodDefault<z.ZodObject<{
                ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
            }, "strip", z.ZodTypeAny, {
                mode: "ALL" | "ANY";
                ids: string[];
            }, {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            }>>;
            required: z.ZodDefault<z.ZodObject<{
                ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
            }, "strip", z.ZodTypeAny, {
                mode: "ALL" | "ANY";
                ids: string[];
            }, {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            }>>;
            accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
            managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            denied: string[];
            required: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            accepted: string[];
            restricted: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            acceptedRemove: string[];
            deniedRemove: string[];
            pending: string[];
            removeOnSubmit: string[];
            managers: string[];
        }, {
            denied?: string[] | undefined;
            required?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            accepted?: string[] | undefined;
            restricted?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            acceptedRemove?: string[] | undefined;
            deniedRemove?: string[] | undefined;
            pending?: string[] | undefined;
            removeOnSubmit?: string[] | undefined;
            managers?: string[] | undefined;
        }>>;
        staffThreads: z.ZodDefault<z.ZodBoolean>;
        cooldownMinutes: z.ZodDefault<z.ZodNumber>;
        timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
        /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
        onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
        /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
        mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
    }, "strip", z.ZodTypeAny, {
        mode: "DM" | "WEB";
        messages: {
            denied: string;
            accepted: string;
            confirmation: string;
            completion: string;
        };
        cooldownMinutes: number;
        roles: {
            denied: string[];
            required: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            accepted: string[];
            restricted: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            acceptedRemove: string[];
            deniedRemove: string[];
            pending: string[];
            removeOnSubmit: string[];
            managers: string[];
        };
        staffThreads: boolean;
        timeLimitMinutes: number;
        onLeave: "DENY" | "NONE" | "WITHDRAW";
    }, {
        mode?: "DM" | "WEB" | undefined;
        messages?: {
            denied?: string | undefined;
            accepted?: string | undefined;
            confirmation?: string | undefined;
            completion?: string | undefined;
        } | undefined;
        cooldownMinutes?: number | undefined;
        roles?: {
            denied?: string[] | undefined;
            required?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            accepted?: string[] | undefined;
            restricted?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            acceptedRemove?: string[] | undefined;
            deniedRemove?: string[] | undefined;
            pending?: string[] | undefined;
            removeOnSubmit?: string[] | undefined;
            managers?: string[] | undefined;
        } | undefined;
        staffThreads?: boolean | undefined;
        timeLimitMinutes?: number | undefined;
        onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
    }>>;
    key: z.ZodString;
    name: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
    roleId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
    channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
}, "strip", z.ZodTypeAny, {
    description: string;
    name: string;
    questions: FormField[];
    enabled: boolean;
    settings: {
        mode: "DM" | "WEB";
        messages: {
            denied: string;
            accepted: string;
            confirmation: string;
            completion: string;
        };
        cooldownMinutes: number;
        roles: {
            denied: string[];
            required: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            accepted: string[];
            restricted: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            acceptedRemove: string[];
            deniedRemove: string[];
            pending: string[];
            removeOnSubmit: string[];
            managers: string[];
        };
        staffThreads: boolean;
        timeLimitMinutes: number;
        onLeave: "DENY" | "NONE" | "WITHDRAW";
    };
    key: string;
    pingRoleIds: string[];
    panel: "quali" | "apply";
    channelId?: string | undefined;
    roleId?: string | undefined;
    acceptedChannelId?: string | undefined;
    deniedChannelId?: string | undefined;
}, {
    name: string;
    questions: (string | {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    })[];
    key: string;
    description?: string | undefined;
    enabled?: boolean | undefined;
    settings?: {
        mode?: "DM" | "WEB" | undefined;
        messages?: {
            denied?: string | undefined;
            accepted?: string | undefined;
            confirmation?: string | undefined;
            completion?: string | undefined;
        } | undefined;
        cooldownMinutes?: number | undefined;
        roles?: {
            denied?: string[] | undefined;
            required?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            accepted?: string[] | undefined;
            restricted?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            acceptedRemove?: string[] | undefined;
            deniedRemove?: string[] | undefined;
            pending?: string[] | undefined;
            removeOnSubmit?: string[] | undefined;
            managers?: string[] | undefined;
        } | undefined;
        staffThreads?: boolean | undefined;
        timeLimitMinutes?: number | undefined;
        onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
    } | undefined;
    channelId?: string | undefined;
    roleId?: string | undefined;
    pingRoleIds?: string[] | undefined;
    panel?: "quali" | "apply" | undefined;
    acceptedChannelId?: string | undefined;
    deniedChannelId?: string | undefined;
}>;
/** Texte des Panels für die normale Bewerbung bei EN Polizei (/bewerbungspanel); die Fragen sind das Bewerbungsformular (`application.form`). */
export declare const policeSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
    /** Channel für neue Bewerbungen (sonst der Applications-Channel aus den Einstellungen). */
    channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    /** Kanal, in den das Panel aus dem Dashboard gesendet wird. */
    panelChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    title: z.ZodDefault<z.ZodString>;
    description: z.ZodDefault<z.ZodString>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    acceptedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    deniedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    settings: z.ZodDefault<z.ZodObject<{
        messages: z.ZodDefault<z.ZodObject<{
            accepted: z.ZodDefault<z.ZodString>;
            denied: z.ZodDefault<z.ZodString>;
            confirmation: z.ZodDefault<z.ZodString>;
            completion: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            denied: string;
            accepted: string;
            confirmation: string;
            completion: string;
        }, {
            denied?: string | undefined;
            accepted?: string | undefined;
            confirmation?: string | undefined;
            completion?: string | undefined;
        }>>;
        roles: z.ZodDefault<z.ZodObject<{
            restricted: z.ZodDefault<z.ZodObject<{
                ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
            }, "strip", z.ZodTypeAny, {
                mode: "ALL" | "ANY";
                ids: string[];
            }, {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            }>>;
            required: z.ZodDefault<z.ZodObject<{
                ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
            }, "strip", z.ZodTypeAny, {
                mode: "ALL" | "ANY";
                ids: string[];
            }, {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            }>>;
            accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
            managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            denied: string[];
            required: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            accepted: string[];
            restricted: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            acceptedRemove: string[];
            deniedRemove: string[];
            pending: string[];
            removeOnSubmit: string[];
            managers: string[];
        }, {
            denied?: string[] | undefined;
            required?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            accepted?: string[] | undefined;
            restricted?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            acceptedRemove?: string[] | undefined;
            deniedRemove?: string[] | undefined;
            pending?: string[] | undefined;
            removeOnSubmit?: string[] | undefined;
            managers?: string[] | undefined;
        }>>;
        staffThreads: z.ZodDefault<z.ZodBoolean>;
        cooldownMinutes: z.ZodDefault<z.ZodNumber>;
        timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
        /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
        onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
        /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
        mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
    }, "strip", z.ZodTypeAny, {
        mode: "DM" | "WEB";
        messages: {
            denied: string;
            accepted: string;
            confirmation: string;
            completion: string;
        };
        cooldownMinutes: number;
        roles: {
            denied: string[];
            required: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            accepted: string[];
            restricted: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            acceptedRemove: string[];
            deniedRemove: string[];
            pending: string[];
            removeOnSubmit: string[];
            managers: string[];
        };
        staffThreads: boolean;
        timeLimitMinutes: number;
        onLeave: "DENY" | "NONE" | "WITHDRAW";
    }, {
        mode?: "DM" | "WEB" | undefined;
        messages?: {
            denied?: string | undefined;
            accepted?: string | undefined;
            confirmation?: string | undefined;
            completion?: string | undefined;
        } | undefined;
        cooldownMinutes?: number | undefined;
        roles?: {
            denied?: string[] | undefined;
            required?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            accepted?: string[] | undefined;
            restricted?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            acceptedRemove?: string[] | undefined;
            deniedRemove?: string[] | undefined;
            pending?: string[] | undefined;
            removeOnSubmit?: string[] | undefined;
            managers?: string[] | undefined;
        } | undefined;
        staffThreads?: boolean | undefined;
        timeLimitMinutes?: number | undefined;
        onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string;
    name: string;
    enabled: boolean;
    settings: {
        mode: "DM" | "WEB";
        messages: {
            denied: string;
            accepted: string;
            confirmation: string;
            completion: string;
        };
        cooldownMinutes: number;
        roles: {
            denied: string[];
            required: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            accepted: string[];
            restricted: {
                mode: "ALL" | "ANY";
                ids: string[];
            };
            acceptedRemove: string[];
            deniedRemove: string[];
            pending: string[];
            removeOnSubmit: string[];
            managers: string[];
        };
        staffThreads: boolean;
        timeLimitMinutes: number;
        onLeave: "DENY" | "NONE" | "WITHDRAW";
    };
    pingRoleIds: string[];
    channelId?: string | undefined;
    acceptedChannelId?: string | undefined;
    deniedChannelId?: string | undefined;
    panelChannelId?: string | undefined;
}, {
    title?: string | undefined;
    description?: string | undefined;
    name?: string | undefined;
    enabled?: boolean | undefined;
    settings?: {
        mode?: "DM" | "WEB" | undefined;
        messages?: {
            denied?: string | undefined;
            accepted?: string | undefined;
            confirmation?: string | undefined;
            completion?: string | undefined;
        } | undefined;
        cooldownMinutes?: number | undefined;
        roles?: {
            denied?: string[] | undefined;
            required?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            accepted?: string[] | undefined;
            restricted?: {
                mode?: "ALL" | "ANY" | undefined;
                ids?: string[] | undefined;
            } | undefined;
            acceptedRemove?: string[] | undefined;
            deniedRemove?: string[] | undefined;
            pending?: string[] | undefined;
            removeOnSubmit?: string[] | undefined;
            managers?: string[] | undefined;
        } | undefined;
        staffThreads?: boolean | undefined;
        timeLimitMinutes?: number | undefined;
        onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
    } | undefined;
    channelId?: string | undefined;
    pingRoleIds?: string[] | undefined;
    acceptedChannelId?: string | undefined;
    deniedChannelId?: string | undefined;
    panelChannelId?: string | undefined;
}>;
export declare const configSchema: z.ZodObject<{
    title: z.ZodDefault<z.ZodString>;
    /** Kanal, in den das Qualifikations-Panel aus dem Dashboard gesendet wird. */
    panelChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    intro: z.ZodDefault<z.ZodString>;
    units: z.ZodEffects<z.ZodArray<z.ZodObject<{
        questions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            required: z.ZodBoolean;
            type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
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
            type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
            key: string;
            label: string;
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        }>, {
            type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
            key: string;
            label: string;
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
        /** In welchem Panel die Einheit steht: Qualifikations-Panel oder (als weitere Bewerbungsart) Bewerbungs-Panel. */
        panel: z.ZodDefault<z.ZodEnum<["quali", "apply"]>>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        acceptedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        deniedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        settings: z.ZodDefault<z.ZodObject<{
            messages: z.ZodDefault<z.ZodObject<{
                accepted: z.ZodDefault<z.ZodString>;
                denied: z.ZodDefault<z.ZodString>;
                confirmation: z.ZodDefault<z.ZodString>;
                completion: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            }, {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            }>>;
            roles: z.ZodDefault<z.ZodObject<{
                restricted: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                required: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
                managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            }, {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            }>>;
            staffThreads: z.ZodDefault<z.ZodBoolean>;
            cooldownMinutes: z.ZodDefault<z.ZodNumber>;
            timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
            /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
            onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
            /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
            mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        }, {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        }>>;
        key: z.ZodString;
        name: z.ZodString;
        description: z.ZodDefault<z.ZodString>;
        /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
        roleId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
        channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        name: string;
        questions: FormField[];
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        key: string;
        pingRoleIds: string[];
        panel: "quali" | "apply";
        channelId?: string | undefined;
        roleId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }, {
        name: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        key: string;
        description?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        roleId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        panel?: "quali" | "apply" | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }>, "many">, {
        description: string;
        name: string;
        questions: FormField[];
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        key: string;
        pingRoleIds: string[];
        panel: "quali" | "apply";
        channelId?: string | undefined;
        roleId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[], {
        name: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        key: string;
        description?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        roleId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        panel?: "quali" | "apply" | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[]>;
    police: z.ZodDefault<z.ZodObject<{
        name: z.ZodDefault<z.ZodString>;
        /** Channel für neue Bewerbungen (sonst der Applications-Channel aus den Einstellungen). */
        channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Kanal, in den das Panel aus dem Dashboard gesendet wird. */
        panelChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        title: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        acceptedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        deniedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        settings: z.ZodDefault<z.ZodObject<{
            messages: z.ZodDefault<z.ZodObject<{
                accepted: z.ZodDefault<z.ZodString>;
                denied: z.ZodDefault<z.ZodString>;
                confirmation: z.ZodDefault<z.ZodString>;
                completion: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            }, {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            }>>;
            roles: z.ZodDefault<z.ZodObject<{
                restricted: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                required: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
                managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            }, {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            }>>;
            staffThreads: z.ZodDefault<z.ZodBoolean>;
            cooldownMinutes: z.ZodDefault<z.ZodNumber>;
            timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
            /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
            onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
            /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
            mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        }, {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description: string;
        name: string;
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        pingRoleIds: string[];
        channelId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    }, {
        title?: string | undefined;
        description?: string | undefined;
        name?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    units: {
        description: string;
        name: string;
        questions: FormField[];
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        key: string;
        pingRoleIds: string[];
        panel: "quali" | "apply";
        channelId?: string | undefined;
        roleId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[];
    police: {
        title: string;
        description: string;
        name: string;
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        pingRoleIds: string[];
        channelId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    };
    intro: string;
    panelChannelId?: string | undefined;
}, {
    units: {
        name: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        key: string;
        description?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        roleId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        panel?: "quali" | "apply" | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[];
    title?: string | undefined;
    police?: {
        title?: string | undefined;
        description?: string | undefined;
        name?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    } | undefined;
    panelChannelId?: string | undefined;
    intro?: string | undefined;
}>;
/** Speichern aus „Qualifications → Setup“: Panels + Einheiten und optional die Fragen der Polizei-Bewerbung. */
export declare const saveSchema: z.ZodObject<{
    title: z.ZodDefault<z.ZodString>;
    /** Kanal, in den das Qualifikations-Panel aus dem Dashboard gesendet wird. */
    panelChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    intro: z.ZodDefault<z.ZodString>;
    units: z.ZodEffects<z.ZodArray<z.ZodObject<{
        questions: z.ZodEffects<z.ZodEffects<z.ZodArray<z.ZodUnion<[z.ZodString, z.ZodEffects<z.ZodObject<{
            key: z.ZodString;
            label: z.ZodString;
            required: z.ZodBoolean;
            type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
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
            type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
            key: string;
            label: string;
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        }>, {
            type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
            key: string;
            label: string;
            options: {
                label: string;
                roleId?: string | undefined;
            }[];
            required: boolean;
            minLength: number;
            maxLength: number;
            multiple: boolean;
        }, {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
        /** In welchem Panel die Einheit steht: Qualifikations-Panel oder (als weitere Bewerbungsart) Bewerbungs-Panel. */
        panel: z.ZodDefault<z.ZodEnum<["quali", "apply"]>>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        acceptedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        deniedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        settings: z.ZodDefault<z.ZodObject<{
            messages: z.ZodDefault<z.ZodObject<{
                accepted: z.ZodDefault<z.ZodString>;
                denied: z.ZodDefault<z.ZodString>;
                confirmation: z.ZodDefault<z.ZodString>;
                completion: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            }, {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            }>>;
            roles: z.ZodDefault<z.ZodObject<{
                restricted: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                required: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
                managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            }, {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            }>>;
            staffThreads: z.ZodDefault<z.ZodBoolean>;
            cooldownMinutes: z.ZodDefault<z.ZodNumber>;
            timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
            /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
            onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
            /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
            mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        }, {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        }>>;
        key: z.ZodString;
        name: z.ZodString;
        description: z.ZodDefault<z.ZodString>;
        /** Discord-Rolle, die bei Annahme vergeben wird (optional). */
        roleId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        /** Eigener Discord-Channel für eingehende Bewerbungen dieser Einheit (sonst der allgemeine Qualifications-Channel). */
        channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    }, "strip", z.ZodTypeAny, {
        description: string;
        name: string;
        questions: FormField[];
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        key: string;
        pingRoleIds: string[];
        panel: "quali" | "apply";
        channelId?: string | undefined;
        roleId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }, {
        name: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        key: string;
        description?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        roleId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        panel?: "quali" | "apply" | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }>, "many">, {
        description: string;
        name: string;
        questions: FormField[];
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        key: string;
        pingRoleIds: string[];
        panel: "quali" | "apply";
        channelId?: string | undefined;
        roleId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[], {
        name: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        key: string;
        description?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        roleId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        panel?: "quali" | "apply" | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[]>;
    police: z.ZodDefault<z.ZodObject<{
        name: z.ZodDefault<z.ZodString>;
        /** Channel für neue Bewerbungen (sonst der Applications-Channel aus den Einstellungen). */
        channelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        pingRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        /** Kanal, in den das Panel aus dem Dashboard gesendet wird. */
        panelChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        title: z.ZodDefault<z.ZodString>;
        description: z.ZodDefault<z.ZodString>;
        enabled: z.ZodDefault<z.ZodBoolean>;
        acceptedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        deniedChannelId: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
        settings: z.ZodDefault<z.ZodObject<{
            messages: z.ZodDefault<z.ZodObject<{
                accepted: z.ZodDefault<z.ZodString>;
                denied: z.ZodDefault<z.ZodString>;
                confirmation: z.ZodDefault<z.ZodString>;
                completion: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            }, {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            }>>;
            roles: z.ZodDefault<z.ZodObject<{
                restricted: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                required: z.ZodDefault<z.ZodObject<{
                    ids: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                    mode: z.ZodDefault<z.ZodEnum<["ALL", "ANY"]>>;
                }, "strip", z.ZodTypeAny, {
                    mode: "ALL" | "ANY";
                    ids: string[];
                }, {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                }>>;
                accepted: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                acceptedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                deniedRemove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                pending: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                removeOnSubmit: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
                /** Wer im Discord annehmen/ablehnen darf (reicht dort auch ohne Recht im System); leer = alle mit dem Recht. */
                managers: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            }, "strip", z.ZodTypeAny, {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            }, {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            }>>;
            staffThreads: z.ZodDefault<z.ZodBoolean>;
            cooldownMinutes: z.ZodDefault<z.ZodNumber>;
            timeLimitMinutes: z.ZodDefault<z.ZodNumber>;
            /** Wie bei Appy „Action On User Leave“: offene Bewerbung, wenn die Person den Discord-Server verlässt (braucht den Server Members Intent). */
            onLeave: z.ZodDefault<z.ZodEnum<["NONE", "DENY", "WITHDRAW"]>>;
            /** Art der Bewerbung: Fragen per Direktnachricht oder als Formular im Browser (Link vom Bot). */
            mode: z.ZodDefault<z.ZodEnum<["DM", "WEB"]>>;
        }, "strip", z.ZodTypeAny, {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        }, {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        title: string;
        description: string;
        name: string;
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        pingRoleIds: string[];
        channelId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    }, {
        title?: string | undefined;
        description?: string | undefined;
        name?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    }>>;
} & {
    policeForm: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodEffects<z.ZodObject<{
        key: z.ZodString;
        label: z.ZodString;
        required: z.ZodBoolean;
        type: z.ZodDefault<z.ZodEnum<["TEXT" | "CHOICE" | "ROLE" | "ROBLOX", ...("TEXT" | "CHOICE" | "ROLE" | "ROBLOX")[]]>>;
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
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        key: string;
        label: string;
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, {
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        key: string;
        label: string;
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }, {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
        options?: {
            label: string;
            roleId?: string | undefined;
        }[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        multiple?: boolean | undefined;
    }>, "many">, {
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        key: string;
        label: string;
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }[], {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
        description: string;
        name: string;
        questions: FormField[];
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        key: string;
        pingRoleIds: string[];
        panel: "quali" | "apply";
        channelId?: string | undefined;
        roleId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[];
    police: {
        title: string;
        description: string;
        name: string;
        enabled: boolean;
        settings: {
            mode: "DM" | "WEB";
            messages: {
                denied: string;
                accepted: string;
                confirmation: string;
                completion: string;
            };
            cooldownMinutes: number;
            roles: {
                denied: string[];
                required: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                accepted: string[];
                restricted: {
                    mode: "ALL" | "ANY";
                    ids: string[];
                };
                acceptedRemove: string[];
                deniedRemove: string[];
                pending: string[];
                removeOnSubmit: string[];
                managers: string[];
            };
            staffThreads: boolean;
            timeLimitMinutes: number;
            onLeave: "DENY" | "NONE" | "WITHDRAW";
        };
        pingRoleIds: string[];
        channelId?: string | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    };
    intro: string;
    panelChannelId?: string | undefined;
    policeForm?: {
        type: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX";
        key: string;
        label: string;
        options: {
            label: string;
            roleId?: string | undefined;
        }[];
        required: boolean;
        minLength: number;
        maxLength: number;
        multiple: boolean;
    }[] | undefined;
}, {
    units: {
        name: string;
        questions: (string | {
            key: string;
            label: string;
            required: boolean;
            type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
            options?: {
                label: string;
                roleId?: string | undefined;
            }[] | undefined;
            minLength?: number | undefined;
            maxLength?: number | undefined;
            multiple?: boolean | undefined;
        })[];
        key: string;
        description?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        roleId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        panel?: "quali" | "apply" | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
    }[];
    title?: string | undefined;
    police?: {
        title?: string | undefined;
        description?: string | undefined;
        name?: string | undefined;
        enabled?: boolean | undefined;
        settings?: {
            mode?: "DM" | "WEB" | undefined;
            messages?: {
                denied?: string | undefined;
                accepted?: string | undefined;
                confirmation?: string | undefined;
                completion?: string | undefined;
            } | undefined;
            cooldownMinutes?: number | undefined;
            roles?: {
                denied?: string[] | undefined;
                required?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                accepted?: string[] | undefined;
                restricted?: {
                    mode?: "ALL" | "ANY" | undefined;
                    ids?: string[] | undefined;
                } | undefined;
                acceptedRemove?: string[] | undefined;
                deniedRemove?: string[] | undefined;
                pending?: string[] | undefined;
                removeOnSubmit?: string[] | undefined;
                managers?: string[] | undefined;
            } | undefined;
            staffThreads?: boolean | undefined;
            timeLimitMinutes?: number | undefined;
            onLeave?: "DENY" | "NONE" | "WITHDRAW" | undefined;
        } | undefined;
        channelId?: string | undefined;
        pingRoleIds?: string[] | undefined;
        acceptedChannelId?: string | undefined;
        deniedChannelId?: string | undefined;
        panelChannelId?: string | undefined;
    } | undefined;
    panelChannelId?: string | undefined;
    intro?: string | undefined;
    policeForm?: {
        key: string;
        label: string;
        required: boolean;
        type?: "TEXT" | "CHOICE" | "ROLE" | "ROBLOX" | undefined;
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
