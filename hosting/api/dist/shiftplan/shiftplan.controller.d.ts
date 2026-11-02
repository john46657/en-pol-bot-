import type { Response } from 'express';
import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { createShiftBody, ShiftPlanService, type ShiftplanConfig } from './shiftplan.service';
declare const listQ: z.ZodObject<{
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    department: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"]>>;
    mine: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "CANCELLED" | "DRAFT" | "PUBLISHED" | "COMPLETED" | undefined;
    department?: string | undefined;
    mine?: "true" | "false" | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}, {
    status?: "CANCELLED" | "DRAFT" | "PUBLISHED" | "COMPLETED" | undefined;
    department?: string | undefined;
    mine?: "true" | "false" | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}>;
declare const updateBody: z.ZodObject<{
    name: z.ZodString;
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    leaderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    unit: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    minStaff: z.ZodDefault<z.ZodNumber>;
    maxStaff: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
} & {
    version: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: number;
    name: string;
    startsAt: Date;
    endsAt: Date;
    minStaff: number;
    unit?: string | null | undefined;
    description?: string | null | undefined;
    department?: string | null | undefined;
    leaderId?: string | null | undefined;
    maxStaff?: number | null | undefined;
}, {
    version: number;
    name: string;
    startsAt: Date;
    endsAt: Date;
    unit?: string | null | undefined;
    description?: string | null | undefined;
    department?: string | null | undefined;
    leaderId?: string | null | undefined;
    minStaff?: number | undefined;
    maxStaff?: number | null | undefined;
}>;
declare const reasonBody: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
declare const optReason: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
declare const copyBody: z.ZodObject<{
    startsAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    startsAt: Date;
}, {
    startsAt: Date;
}>;
declare const assignBody: z.ZodObject<{
    userIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    userIds: string[];
}, {
    userIds: string[];
}>;
declare const unassignBody: z.ZodObject<{
    userId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    reason?: string | undefined;
}, {
    userId: string;
    reason?: string | undefined;
}>;
declare const reportBody: z.ZodObject<{
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    message: string;
}, {
    message: string;
}>;
declare const daysQ: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    days: number;
}, {
    days?: number | undefined;
}>;
/** Schichtplanung. Ansehen: shiftplan.view · selbst an-/abmelden: shiftplan.signup · planen: shiftplan.manage. */
export declare class ShiftPlanController {
    private readonly s;
    constructor(s: ShiftPlanService);
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        manager: boolean;
        items: {
            id: string;
            name: string;
            startsAt: Date;
            endsAt: Date;
            timezone: string;
            department: string | null;
            description: string | null;
            unit: string | null;
            leaderId: string | null;
            leaderName: string | null;
            minStaff: number;
            maxStaff: number | null;
            status: string;
            statusLabel: string;
            cancelReason: string | null;
            seriesId: string | null;
            version: number;
            publishedAt: Date | null;
            coverage: {
                assigned: number;
                min: number;
                max: number | null;
                state: "UNDER" | "OK" | "FULL";
                missing: number;
                free: number | null;
            };
            assignees: {
                userId: string;
                name: string;
                source: string;
                absent: boolean;
            }[];
            mine: boolean;
        }[];
        departments: string[];
    }>;
    config(): Promise<{
        selfSignup: boolean;
        reminderMinutes: number;
        channelId?: string | null | undefined;
    }>;
    saveConfig(a: Actor, b: ShiftplanConfig): Promise<{
        selfSignup: boolean;
        reminderMinutes: number;
        channelId?: string | null | undefined;
    }>;
    mine(a: Actor, q: z.infer<typeof daysQ>): Promise<{
        id: string;
        name: string;
        startsAt: Date;
        endsAt: Date;
        timezone: string;
        department: string | null;
        description: string | null;
        unit: string | null;
        leaderId: string | null;
        leaderName: string | null;
        minStaff: number;
        maxStaff: number | null;
        status: string;
        statusLabel: string;
        cancelReason: string | null;
        seriesId: string | null;
        version: number;
        publishedAt: Date | null;
        coverage: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        };
        assignees: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[];
        mine: boolean;
    }[]>;
    /** MDT: aktuelle/nächste eigene Schicht */
    current(a: Actor): Promise<{
        current: {
            id: string;
            name: string;
            startsAt: Date;
            endsAt: Date;
            timezone: string;
            department: string | null;
            description: string | null;
            unit: string | null;
            leaderId: string | null;
            leaderName: string | null;
            minStaff: number;
            maxStaff: number | null;
            status: string;
            statusLabel: string;
            cancelReason: string | null;
            seriesId: string | null;
            version: number;
            publishedAt: Date | null;
            coverage: {
                assigned: number;
                min: number;
                max: number | null;
                state: "UNDER" | "OK" | "FULL";
                missing: number;
                free: number | null;
            };
            assignees: {
                userId: string;
                name: string;
                source: string;
                absent: boolean;
            }[];
            mine: boolean;
        } | null;
        next: {
            id: string;
            name: string;
            startsAt: Date;
            endsAt: Date;
            timezone: string;
            department: string | null;
            description: string | null;
            unit: string | null;
            leaderId: string | null;
            leaderName: string | null;
            minStaff: number;
            maxStaff: number | null;
            status: string;
            statusLabel: string;
            cancelReason: string | null;
            seriesId: string | null;
            version: number;
            publishedAt: Date | null;
            coverage: {
                assigned: number;
                min: number;
                max: number | null;
                state: "UNDER" | "OK" | "FULL";
                missing: number;
                free: number | null;
            };
            assignees: {
                userId: string;
                name: string;
                source: string;
                absent: boolean;
            }[];
            mine: boolean;
        } | null;
        upcoming: {
            id: string;
            name: string;
            startsAt: Date;
            endsAt: Date;
            timezone: string;
            department: string | null;
            description: string | null;
            unit: string | null;
            leaderId: string | null;
            leaderName: string | null;
            minStaff: number;
            maxStaff: number | null;
            status: string;
            statusLabel: string;
            cancelReason: string | null;
            seriesId: string | null;
            version: number;
            publishedAt: Date | null;
            coverage: {
                assigned: number;
                min: number;
                max: number | null;
                state: "UNDER" | "OK" | "FULL";
                missing: number;
                free: number | null;
            };
            assignees: {
                userId: string;
                name: string;
                source: string;
                absent: boolean;
            }[];
            mine: boolean;
        }[];
    }>;
    /** Leitstelle: geplante vs. tatsächliche Besetzung */
    staffing(a: Actor): Promise<{
        at: Date;
        shifts: {
            id: string;
            name: string;
            startsAt: Date;
            endsAt: Date;
            department: string | null;
            unit: string | null;
            running: boolean;
            leaderName: string | null;
            coverage: {
                assigned: number;
                min: number;
                max: number | null;
                state: "UNDER" | "OK" | "FULL";
                missing: number;
                free: number | null;
            };
            presentCount: number;
            plannedPresent: {
                userId: string;
                name: string;
                status: string | null;
                callsign: string | null;
            }[];
            plannedMissing: {
                userId: string;
                name: string;
                status: string | null;
                callsign: string | null;
            }[];
            plannedAbsent: {
                userId: string;
                name: string;
            }[];
        }[];
        unplannedOnDuty: {
            userId: string;
            name: string;
            status: string | null;
            callsign: string | null;
        }[];
        totals: {
            onDuty: number;
            plannedNow: number;
            absentNow: number;
        };
    }>;
    /** Personen für Zuweisung/Leitung (nur für die Planung) */
    people(): Promise<{
        userId: string;
        name: string;
        rank: string | null;
        department: string | null;
        callsign: string | null;
    }[]>;
    export(a: Actor, q: z.infer<typeof listQ>, res: Response): Promise<void>;
    get(a: Actor, id: string): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    create(a: Actor, b: z.infer<typeof createShiftBody>): Promise<{
        created: number;
        ids: string[];
        seriesId: `${string}-${string}-${string}-${string}-${string}` | null;
    }>;
    update(a: Actor, id: string, b: z.infer<typeof updateBody>): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    publish(a: Actor, id: string): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    cancel(a: Actor, id: string, b: z.infer<typeof reasonBody>): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    copy(a: Actor, id: string, b: z.infer<typeof copyBody>): Promise<{
        created: number;
        ids: string[];
        seriesId: `${string}-${string}-${string}-${string}-${string}` | null;
    }>;
    remove(a: Actor, id: string): Promise<{
        deleted: boolean;
    }>;
    assign(a: Actor, id: string, b: z.infer<typeof assignBody>): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    unassign(a: Actor, id: string, b: z.infer<typeof unassignBody>): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    signup(a: Actor, id: string): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    withdraw(a: Actor, id: string, b: z.infer<typeof optReason>): Promise<{
        history: {
            action: string;
            at: Date;
            by: string;
        }[];
        id?: string | undefined;
        name?: string | undefined;
        startsAt?: Date | undefined;
        endsAt?: Date | undefined;
        timezone?: string | undefined;
        department?: string | null | undefined;
        description?: string | null | undefined;
        unit?: string | null | undefined;
        leaderId?: string | null | undefined;
        leaderName?: string | null | undefined;
        minStaff?: number | undefined;
        maxStaff?: number | null | undefined;
        status?: string | undefined;
        statusLabel?: string | undefined;
        cancelReason?: string | null | undefined;
        seriesId?: string | null | undefined;
        version?: number | undefined;
        publishedAt?: Date | null | undefined;
        coverage?: {
            assigned: number;
            min: number;
            max: number | null;
            state: "UNDER" | "OK" | "FULL";
            missing: number;
            free: number | null;
        } | undefined;
        assignees?: {
            userId: string;
            name: string;
            source: string;
            absent: boolean;
        }[] | undefined;
        mine?: boolean | undefined;
    }>;
    report(a: Actor, id: string, b: z.infer<typeof reportBody>): Promise<{
        delivered: number;
    }>;
}
export {};
