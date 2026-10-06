import { z } from 'zod';
import { SekService } from './sek.service';
import type { Actor } from '../audit/audit.service';
declare const target: z.ZodEffects<z.ZodObject<{
    userId: z.ZodOptional<z.ZodString>;
    discordId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    discordId?: string | undefined;
}>, {
    userId?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    discordId?: string | undefined;
}>;
declare const report: z.ZodObject<{
    occurredAt: z.ZodOptional<z.ZodDate>;
    missionType: z.ZodString;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    description: string;
    missionType: string;
    occurredAt?: Date | undefined;
}, {
    description: string;
    missionType: string;
    occurredAt?: Date | undefined;
}>;
declare const application: z.ZodObject<{
    serviceTime: z.ZodString;
    motivation: z.ZodString;
    experience: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    motivation: string;
    serviceTime: string;
    experience?: string | undefined;
}, {
    motivation: string;
    serviceTime: string;
    experience?: string | undefined;
}>;
declare const decision: z.ZodObject<{
    status: z.ZodEnum<["ACCEPTED", "REJECTED"]>;
}, "strip", z.ZodTypeAny, {
    status: "REJECTED" | "ACCEPTED";
}, {
    status: "REJECTED" | "ACCEPTED";
}>;
declare const list: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
declare const appList: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["OPEN", "ACCEPTED", "REJECTED"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "REJECTED" | "OPEN" | "ACCEPTED" | undefined;
}, {
    status?: "REJECTED" | "OPEN" | "ACCEPTED" | undefined;
}>;
export declare class SekController {
    private readonly s;
    constructor(s: SekService);
    /** Eigener Stand: Mitglied? offene Bewerbung? (für Web und Bot) */
    me(a: Actor): Promise<{
        member: boolean;
        openApplication: {
            number: string;
            createdAt: Date;
        } | null;
    }>;
    members(): Promise<{
        since: Date;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        userId: string;
    }[]>;
    add(a: Actor, b: z.infer<typeof target>): Promise<{
        userId: string;
        displayName: string;
        member: boolean;
    }>;
    remove(a: Actor, b: z.infer<typeof target>): Promise<{
        userId: string;
        displayName: string;
        member: boolean;
    }>;
    reports(q: z.infer<typeof list>): Promise<{
        authorName: string;
        authorCallsign: string | null;
        number: string;
        id: string;
        createdAt: Date;
        description: string;
        authorId: string;
        occurredAt: Date;
        missionType: string;
    }[]>;
    createReport(a: Actor, b: z.infer<typeof report>): Promise<{
        number: string;
        id: string;
        createdAt: Date;
        description: string;
        authorId: string;
        occurredAt: Date;
        missionType: string;
    }>;
    /** Bewerben darf jeder Polizeibenutzer. */
    apply(a: Actor, b: z.infer<typeof application>): Promise<{
        number: string;
        status: string;
    }>;
    applications(q: z.infer<typeof appList>): Promise<{
        applicant: {
            displayName: string;
            callsign: string | null;
            rank: string | null;
        };
        decidedByName: string | null;
        number: string;
        id: string;
        userId: string;
        createdAt: Date;
        status: string;
        experience: string | null;
        motivation: string;
        decidedById: string | null;
        serviceTime: string;
        decidedAt: Date | null;
    }[]>;
    decide(a: Actor, id: string, b: z.infer<typeof decision>): Promise<{
        id: string;
        number: string;
        status: "REJECTED" | "ACCEPTED";
    }>;
}
export {};
