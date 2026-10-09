import { z } from 'zod';
import { QualificationsService } from './qualifications.service';
import { saveSchema } from './qualifications.config';
import { WebApplyService } from './web-apply.service';
import type { Actor } from '../audit/audit.service';
declare const list: z.ZodObject<{
    unit: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "ACCEPTED", "REJECTED", "WITHDRAWN"]>>;
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    unit?: string | undefined;
    status?: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "OPEN" | undefined;
    guildId?: string | undefined;
}, {
    unit?: string | undefined;
    status?: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "OPEN" | undefined;
    guildId?: string | undefined;
}>;
declare const decision: z.ZodObject<{
    status: z.ZodEnum<["ACCEPTED", "REJECTED"]>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "ACCEPTED" | "REJECTED";
    reason?: string | undefined;
}, {
    status: "ACCEPTED" | "REJECTED";
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
        answer: string | string[] | null;
        question: string;
    }, {
        answer: string | string[] | null;
        question: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    unit: string;
    answers: {
        answer: string | string[] | null;
        question: string;
    }[];
    discordId: string;
    discordName: string;
    guildId?: string | undefined;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}, {
    unit: string;
    answers: {
        answer: string | string[] | null;
        question: string;
    }[];
    discordId: string;
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
declare const webLink: z.ZodObject<{
    unit: z.ZodString;
    discordId: z.ZodString;
    discordName: z.ZodString;
    guildId: z.ZodOptional<z.ZodString>;
    joinedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    unit: string;
    discordId: string;
    discordName: string;
    guildId?: string | undefined;
    joinedAt?: Date | undefined;
}, {
    unit: string;
    discordId: string;
    discordName: string;
    guildId?: string | undefined;
    joinedAt?: Date | undefined;
}>;
declare const webSubmit: z.ZodObject<{
    robloxUsername: z.ZodOptional<z.ZodString>;
    answers: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, "strip", z.ZodTypeAny, {
    answers: Record<string, string | string[]>;
    robloxUsername?: string | undefined;
}, {
    answers: Record<string, string | string[]>;
    robloxUsername?: string | undefined;
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
            description: string;
            name: string;
            key: string;
            questions: import("@enrp/shared").FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
    }>;
    save(a: Actor, q: z.infer<typeof guildQ>, b: z.infer<typeof saveSchema>): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        own: boolean;
        title: string;
        units: {
            description: string;
            name: string;
            key: string;
            questions: import("@enrp/shared").FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
    }>;
    /** Eigene Einstellungen eines Servers entfernen (zurück zur gemeinsamen Grundeinstellung). */
    reset(a: Actor, q: z.infer<typeof guildRequired>): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        own: boolean;
        title: string;
        units: {
            description: string;
            name: string;
            key: string;
            questions: import("@enrp/shared").FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
    }>;
    list(f: z.infer<typeof list>): Promise<{
        linkedName: string | null;
        decidedByName: string | null;
        avatar: string | null;
        number: string;
        unit: string;
        id: string;
        status: string;
        createdAt: Date;
        userId: string | null;
        guildId: string | null;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        discordId: string;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        unitName: string;
    }[]>;
    history(q: z.infer<typeof historyQ>): import("@prisma/client").Prisma.PrismaPromise<{
        number: string;
        id: string;
        status: string;
        createdAt: Date;
        decisionReason: string | null;
        unitName: string;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        id: string;
        status: string;
        createdAt: Date;
        userId: string | null;
        guildId: string | null;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        discordId: string;
        discordName: string;
        durationSec: number | null;
        joinedAt: Date | null;
        unitName: string;
    }>;
    /** Auch vom Bot (Button im Team-Channel) mit den Rechten des klickenden Benutzers. */
    decide(a: Actor, id: string, b: z.infer<typeof decision>): Promise<{
        id: string;
        number: string;
        unitName: string;
        status: "ACCEPTED" | "REJECTED";
        addedToSek: boolean;
        decidedByName: string | null;
        reason: string | null;
    }>;
    /** „Ticket mit Bewerber öffnen“ (wie der Discord-Button). */
    ticket(a: Actor, id: string): Promise<{
        queued: boolean;
        linked: boolean;
    }>;
}
/** Dienst-Endpunkte für das Discord-Panel – Bewerben geht auch ohne verknüpftes Konto. */
export declare class BotQualificationsController {
    private readonly q;
    private readonly web;
    constructor(q: QualificationsService, web: WebApplyService);
    config(q: z.infer<typeof guildQ>): Promise<{
        title: string;
        units: {
            description: string;
            name: string;
            key: string;
            questions: import("@enrp/shared").FormField[];
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            title: string;
            description: string;
            name: string;
            settings: {
                cooldownMinutes: number;
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                roles: {
                    denied: string[];
                    accepted: string[];
                    required: {
                        mode: "ALL" | "ANY";
                        ids: string[];
                    };
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
                mode: "DM" | "WEB";
                staffThreads: boolean;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            enabled: boolean;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
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
    /** Bewerbungsart „Web“: persönlicher, signierter Link zum Formular im Browser. */
    webLink(b: z.infer<typeof webLink>): Promise<{
        url: string;
        expiresAt: string;
        timeLimit: string;
    }>;
}
/** Öffentliches Bewerbungsformular zu einem Link aus dem Bot (Bewerbungsart „Web“) – ohne Konto. */
export declare class WebApplyController {
    private readonly web;
    constructor(web: WebApplyService);
    open(t: string): Promise<{
        title: string;
        name: string;
        discordName: string;
        expiresAt: string;
        questions: import("@enrp/shared").FormField[];
        robloxField: boolean;
    }>;
    submit(t: string, b: z.infer<typeof webSubmit>): Promise<{
        number: string;
        message: string;
    }>;
}
export {};
