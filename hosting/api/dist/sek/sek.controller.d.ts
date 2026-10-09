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
declare const list: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
}, {
    limit?: number | undefined;
}>;
export declare class SekController {
    private readonly s;
    constructor(s: SekService);
    /** Eigener Stand: Mitglied? (für Web und Bot) */
    me(a: Actor): Promise<{
        member: boolean;
    }>;
    members(): Promise<{
        since: Date;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        userId: string;
    }[]>;
    candidates(): Promise<{
        userId: string;
        name: string;
        username: string;
        callsign: string | null;
        rank: string | null;
        discordLinked: boolean;
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
        authorId: string;
        createdAt: Date;
        description: string;
        occurredAt: Date;
        missionType: string;
    }[]>;
    createReport(a: Actor, b: z.infer<typeof report>): Promise<{
        number: string;
        id: string;
        authorId: string;
        createdAt: Date;
        description: string;
        occurredAt: Date;
        missionType: string;
    }>;
}
export {};
