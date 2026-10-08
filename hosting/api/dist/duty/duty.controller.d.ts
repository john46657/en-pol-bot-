import { z } from 'zod';
import { DutyService } from './duty.service';
import type { Actor } from '../audit/audit.service';
declare const hoursQuery: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    days: number;
}, {
    days?: number | undefined;
}>;
declare const logQuery: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodString>;
    shiftType: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    days: number;
    userId?: string | undefined;
    shiftType?: string | undefined;
}, {
    userId?: string | undefined;
    shiftType?: string | undefined;
    days?: number | undefined;
}>;
declare const body: z.ZodObject<{
    status: z.ZodEnum<["OFF_DUTY", "ON_DUTY", "BREAK", "TRAINING", "ADMINISTRATIVE"]>;
    unitId: z.ZodOptional<z.ZodString>;
    callsign: z.ZodOptional<z.ZodString>;
    shiftType: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "OFF_DUTY" | "BREAK" | "ON_DUTY" | "TRAINING" | "ADMINISTRATIVE";
    unitId?: string | undefined;
    callsign?: string | undefined;
    shiftType?: string | undefined;
}, {
    status: "OFF_DUTY" | "BREAK" | "ON_DUTY" | "TRAINING" | "ADMINISTRATIVE";
    unitId?: string | undefined;
    callsign?: string | undefined;
    shiftType?: string | undefined;
}>;
export declare class DutyController {
    private readonly d;
    constructor(d: DutyService);
    team(): import("@prisma/client").Prisma.PrismaPromise<({
        user: {
            personnel: {
                callsign: string | null;
                rank: string | null;
            }[];
            id: string;
            displayName: string;
        };
    } & {
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    })[]>;
    overview(): Promise<{
        userId: string;
        personnelId: string;
        name: string;
        rank: string | null;
        callsign: string | null;
        team: string | null;
        dutyStatus: string;
        onDutySince: Date | null;
        lastActivityAt: Date | null;
        reminded: boolean;
        shiftType: string | null;
        lastStatusChange: Date | null;
        unit: {
            id: string;
            callsign: string;
            status: string;
        } | null;
        currentIncident: {
            number: string;
            id: string;
            title: string;
            status: string;
            priority: string;
        } | null;
    }[]>;
    mine(a: Actor): import("@prisma/client").Prisma.Prisma__DutySessionClient<{
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | null, null, import("@prisma/client/runtime/library").DefaultArgs, import("@prisma/client").Prisma.PrismaClientOptions>;
    /** Eigene Dienststunden. */
    myHours(a: Actor, f: z.infer<typeof hoursQuery>): Promise<{
        days: number;
        since: Date;
        users: {
            minutes: number;
            byStatus: {
                [k: string]: number;
            };
        }[];
    }>;
    /** Dienststunden aller Beamten (Schichtleitung). */
    hours(f: z.infer<typeof hoursQuery>): Promise<{
        days: number;
        since: Date;
        users: {
            minutes: number;
            byStatus: {
                [k: string]: number;
            };
        }[];
    }>;
    /** Schicht-Logs: wer wann welche Schicht gestartet/beendet hat (Schichtleitung). */
    shiftLog(f: z.infer<typeof logQuery>): Promise<{
        days: number;
        since: Date;
        items: {
            id: string;
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            shiftType: string | null;
            shiftTypeNames: string[];
            startedAt: Date;
            endedAt: Date | null;
            active: boolean;
            status: string;
            minutes: number;
            breakMinutes: number;
            breaks: number;
            startedBy: string | null;
            endedBy: string | null;
        }[];
    }>;
    /** „Bin noch im Dienst“ (Erinnerung) bzw. echte Aktivität im Dashboard/MDT. */
    active(a: Actor): Promise<{
        onDuty: boolean;
        status: string;
    }>;
    set(a: Actor, b: z.infer<typeof body>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | {
        status: string;
    }>;
    /** Muss NACH `me/status` stehen, sonst würde `:userId` den Pfad `me` verschlucken. */
    setFor(a: Actor, userId: string, b: z.infer<typeof body>): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | {
        status: string;
    }>;
}
export {};
