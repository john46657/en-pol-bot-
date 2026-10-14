import { z } from 'zod';
import { QualificationsService } from './qualifications.service';
import { saveSchema } from './qualifications.config';
import { WebApplyService } from './web-apply.service';
import type { Actor } from '../audit/audit.service';
declare const list: z.ZodObject<{
    unit: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "ACCEPTED", "REJECTED", "WITHDRAWN"]>>;
}, "strip", z.ZodTypeAny, {
    unit?: string | undefined;
    status?: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "OPEN" | undefined;
}, {
    unit?: string | undefined;
    status?: "ACCEPTED" | "REJECTED" | "WITHDRAWN" | "OPEN" | undefined;
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
        question: string;
        answer: string | string[] | null;
    }, {
        question: string;
        answer: string | string[] | null;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    unit: string;
    discordId: string;
    discordName: string;
    answers: {
        question: string;
        answer: string | string[] | null;
    }[];
    guildId?: string | undefined;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}, {
    unit: string;
    discordId: string;
    discordName: string;
    answers: {
        question: string;
        answer: string | string[] | null;
    }[];
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
export declare class QualificationsController {
    private readonly q;
    constructor(q: QualificationsService);
    /** Panels, Einheiten und die Fragen der Polizei-Bewerbung (`policeForm`). */
    config(): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        title: string;
        units: {
            name: string;
            settings: {
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
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            key: string;
            description: string;
            enabled: boolean;
            pingRoleIds: string[];
            questions: import("@enrp/shared").FormField[];
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            name: string;
            settings: {
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
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            description: string;
            enabled: boolean;
            title: string;
            pingRoleIds: string[];
            channelId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        };
        intro: string;
    }>;
    save(a: Actor, b: z.infer<typeof saveSchema>): Promise<{
        policeForm: import("@enrp/shared").FormField[];
        title: string;
        units: {
            name: string;
            settings: {
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
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            key: string;
            description: string;
            enabled: boolean;
            pingRoleIds: string[];
            questions: import("@enrp/shared").FormField[];
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            name: string;
            settings: {
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
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            description: string;
            enabled: boolean;
            title: string;
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
        number: string;
        unit: string;
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string;
        guildId: string | null;
        unitName: string;
        status: string;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        discordName: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        durationSec: number | null;
        joinedAt: Date | null;
    }[]>;
    history(q: z.infer<typeof historyQ>): import("@prisma/client").Prisma.PrismaPromise<{
        number: string;
        id: string;
        createdAt: Date;
        unitName: string;
        status: string;
        decisionReason: string | null;
    }[]>;
    get(id: string): Promise<{
        number: string;
        unit: string;
        id: string;
        createdAt: Date;
        userId: string | null;
        discordId: string;
        guildId: string | null;
        unitName: string;
        status: string;
        decidedById: string | null;
        decidedAt: Date | null;
        decisionReason: string | null;
        discordName: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
        grantRoleIds: string[];
        durationSec: number | null;
        joinedAt: Date | null;
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
    remove(a: Actor, id: string): Promise<void>;
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
    config(): Promise<{
        title: string;
        units: {
            name: string;
            settings: {
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
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            key: string;
            description: string;
            enabled: boolean;
            pingRoleIds: string[];
            questions: import("@enrp/shared").FormField[];
            channelId?: string | undefined;
            roleId?: string | undefined;
            acceptedChannelId?: string | undefined;
            deniedChannelId?: string | undefined;
        }[];
        police: {
            name: string;
            settings: {
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
                messages: {
                    denied: string;
                    accepted: string;
                    confirmation: string;
                    completion: string;
                };
                staffThreads: boolean;
                cooldownMinutes: number;
                timeLimitMinutes: number;
                onLeave: "DENY" | "NONE" | "WITHDRAW";
            };
            description: string;
            enabled: boolean;
            title: string;
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
