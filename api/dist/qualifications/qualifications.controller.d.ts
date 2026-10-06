import { z } from 'zod';
import { QualificationsService } from './qualifications.service';
import { saveSchema } from './qualifications.config';
import type { Actor } from '../audit/audit.service';
declare const list: z.ZodObject<{
    unit: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "ACCEPTED", "REJECTED"]>>;
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    unit?: string | undefined;
    guildId?: string | undefined;
    status?: "REJECTED" | "OPEN" | "ACCEPTED" | undefined;
}, {
    unit?: string | undefined;
    guildId?: string | undefined;
    status?: "REJECTED" | "OPEN" | "ACCEPTED" | undefined;
}>;
declare const decision: z.ZodObject<{
    status: z.ZodEnum<["ACCEPTED", "REJECTED"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "REJECTED" | "ACCEPTED";
    reason?: string | undefined;
}, {
    status: "REJECTED" | "ACCEPTED";
    reason?: string | undefined;
}>;
declare const historyQ: z.ZodObject<{
    discordId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    discordId: string;
}, {
    discordId: string;
}>;
declare const submit: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
    unit: z.ZodString;
    discordId: z.ZodString;
    discordName: z.ZodString;
    durationSec: z.ZodOptional<z.ZodNumber>;
    joinedAt: z.ZodOptional<z.ZodDate>;
    answers: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        answer: z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    }, "strip", z.ZodTypeAny, {
        question: string;
        answer: string | string[] | null;
    }, {
        question: string;
        answer: string | string[] | null;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    unit: string;
    discordId: string;
    answers: {
        question: string;
        answer: string | string[] | null;
    }[];
    discordName: string;
    guildId?: string | undefined;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}, {
    unit: string;
    discordId: string;
    answers: {
        question: string;
        answer: string | string[] | null;
    }[];
    discordName: string;
    guildId?: string | undefined;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}>;
declare const openQ: z.ZodObject<{
    discordId: z.ZodString;
    unit: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    unit?: string | undefined;
}, {
    discordId: string;
    unit?: string | undefined;
}>;
declare const guildQ: z.ZodObject<{
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId?: string | undefined;
}, {
    guildId?: string | undefined;
}>;
declare const guildRequired: z.ZodObject<{
    guildId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    guildId: string;
}, {
    guildId: string;
}>;
export declare class QualificationsController {
    private readonly q;
    constructor(q: QualificationsService);
    /** Panels, Einheiten und die Fragen der Polizei-Bewerbung (`policeForm`). */
    /** `?guildId=` – Einstellungen eines Servers (ohne eigene: die gemeinsamen, `own: false`). */
    config(q: z.infer<typeof guildQ>): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        own: boolean;
        title: string;
        units: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            key: string;
            questions: import("@enrp/shared").FormField[];
            pingRoleIds: string[];
            enabled: boolean;
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            title: string;
            pingRoleIds: string[];
            enabled: boolean;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
    }>;
    save(a: Actor, q: z.infer<typeof guildQ>, b: z.infer<typeof saveSchema>): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        own: boolean;
        title: string;
        units: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            key: string;
            questions: import("@enrp/shared").FormField[];
            pingRoleIds: string[];
            enabled: boolean;
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            title: string;
            pingRoleIds: string[];
            enabled: boolean;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
    }>;
    /** Eigene Einstellungen eines Servers entfernen (zurück zur gemeinsamen Grundeinstellung). */
    reset(a: Actor, q: z.infer<typeof guildRequired>): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        own: boolean;
        title: string;
        units: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            key: string;
            questions: import("@enrp/shared").FormField[];
            pingRoleIds: string[];
            enabled: boolean;
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            title: string;
            pingRoleIds: string[];
            enabled: boolean;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
    }>;
    list(f: z.infer<typeof list>): Promise<{
        linkedName: string | null;
        decidedByName: string | null;
        number: string;
        unit: string;
        id: string;
        userId: string | null;
        createdAt: Date;
        discordId: string;
        guildId: string | null;
        status: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        decidedById: string | null;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
        unitName: string;
        decidedAt: Date | null;
    }[]>;
    history(q: z.infer<typeof historyQ>): import("@prisma/client").Prisma.PrismaPromise<{
        number: string;
        id: string;
        createdAt: Date;
        status: string;
        decisionReason: string | null;
        unitName: string;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        id: string;
        userId: string | null;
        createdAt: Date;
        discordId: string;
        guildId: string | null;
        status: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        decidedById: string | null;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        decisionReason: string | null;
        unitName: string;
        decidedAt: Date | null;
    }>;
    /** Auch vom Bot (Button im Team-Channel) mit den Rechten des klickenden Benutzers. */
    decide(a: Actor, id: string, b: z.infer<typeof decision>): Promise<{
        id: string;
        number: string;
        unitName: string;
        status: "REJECTED" | "ACCEPTED";
        addedToSek: boolean;
        decidedByName: string | null;
        reason: string | null;
    }>;
}
/** Dienst-Endpunkte für das Discord-Panel – Bewerben geht auch ohne verknüpftes Konto. */
export declare class BotQualificationsController {
    private readonly q;
    constructor(q: QualificationsService);
    config(q: z.infer<typeof guildQ>): Promise<{
        title: string;
        units: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            key: string;
            questions: import("@enrp/shared").FormField[];
            pingRoleIds: string[];
            enabled: boolean;
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        intro: string;
        police: {
            name: string;
            description: string;
            settings: {
                roles: {
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
                    accepted: string[];
                    denied: string[];
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
                messages: {
                    accepted: string;
                    denied: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
            };
            title: string;
            pingRoleIds: string[];
            enabled: boolean;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
    }>;
    open(f: z.infer<typeof openQ>): Promise<{
        open: boolean;
        number: string | null;
        unitName: string | null;
    }>;
    submit(b: z.infer<typeof submit>): Promise<{
        id: string;
        number: string;
        unitName: string;
    }>;
}
export {};
