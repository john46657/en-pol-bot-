import { z } from 'zod';
import { QualificationsService } from './qualifications.service';
import { saveSchema } from './qualifications.config';
import type { Actor } from '../audit/audit.service';
declare const list: z.ZodObject<{
    unit: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["OPEN", "ACCEPTED", "REJECTED"]>>;
}, "strip", z.ZodTypeAny, {
    unit?: string | undefined;
    status?: "REJECTED" | "OPEN" | "ACCEPTED" | undefined;
}, {
    unit?: string | undefined;
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
    unit: z.ZodString;
    discordId: z.ZodString;
    discordName: z.ZodString;
    durationSec: z.ZodOptional<z.ZodNumber>;
    joinedAt: z.ZodOptional<z.ZodDate>;
    answers: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        answer: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        question: string;
        answer: string;
    }, {
        question: string;
        answer: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    unit: string;
    discordId: string;
    answers: {
        question: string;
        answer: string;
    }[];
    discordName: string;
    durationSec?: number | undefined;
    joinedAt?: Date | undefined;
}, {
    unit: string;
    discordId: string;
    answers: {
        question: string;
        answer: string;
    }[];
    discordName: string;
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
export declare class QualificationsController {
    private readonly q;
    constructor(q: QualificationsService);
    /** Panels, Einheiten und die Fragen der Polizei-Bewerbung (`policeForm`). */
    config(): Promise<{
        policeForm: import("../applications/applications.service").FormField[];
        title: string;
        units: {
            name: string;
            description: string;
            key: string;
            questions: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
        }[];
        intro: string;
        police: {
            description: string;
            title: string;
        };
    }>;
    save(a: Actor, b: z.infer<typeof saveSchema>): Promise<{
        policeForm: import("../applications/applications.service").FormField[];
        title: string;
        units: {
            name: string;
            description: string;
            key: string;
            questions: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
        }[];
        intro: string;
        police: {
            description: string;
            title: string;
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
        status: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
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
        status: string;
        answers: import("@prisma/client/runtime/library").JsonValue;
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
    config(): Promise<{
        title: string;
        units: {
            name: string;
            description: string;
            key: string;
            questions: string[];
            roleId?: string | undefined;
            channelId?: string | undefined;
        }[];
        intro: string;
        police: {
            description: string;
            title: string;
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
