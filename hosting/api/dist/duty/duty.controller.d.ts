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
/** Rangliste: ohne `days` alle Zeiten (wie Trident), optional nur eine Schichtart. */
declare const boardQuery: z.ZodObject<{
    days: z.ZodOptional<z.ZodNumber>;
    shiftType: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    shiftType?: string | undefined;
    days?: number | undefined;
}, {
    shiftType?: string | undefined;
    days?: number | undefined;
}>;
declare const logQuery: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
    userId: z.ZodOptional<z.ZodString>;
    shiftType: z.ZodOptional<z.ZodString>;
    discordId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    days: number;
    userId?: string | undefined;
    shiftType?: string | undefined;
    discordId?: string | undefined;
}, {
    userId?: string | undefined;
    shiftType?: string | undefined;
    discordId?: string | undefined;
    days?: number | undefined;
}>;
declare const modifyBody: z.ZodObject<{
    action: z.ZodEnum<["add", "remove", "set"]>;
    seconds: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    action: "remove" | "add" | "set";
    seconds: number;
}, {
    action: "remove" | "add" | "set";
    seconds: number;
}>;
declare const clearQuery: z.ZodObject<{
    shiftType: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    shiftType?: string | undefined;
}, {
    shiftType?: string | undefined;
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
        shiftId: string | null;
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
            status: string;
            title: string;
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
        shiftId: string | null;
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
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            minutes: number;
            byStatus: Record<string, number>;
            sessions: number;
        }[];
    }>;
    /** Eigene Schichten (Discord: `/shift manage`). */
    myShifts(a: Actor, f: z.infer<typeof hoursQuery>): Promise<{
        days: number;
        since: Date;
        member: null;
        items: never[];
    } | {
        items: {
            id: string;
            shiftId: string | null;
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
            seconds: number;
            startedBy: string | null;
            endedBy: string | null;
        }[];
        member?: {
            userId: string;
            name: string;
        } | undefined;
        days: number;
        since: Date;
    }>;
    /** Eigene Gesamtwerte aller Schichten (Discord: `/shift manage`). */
    myShiftStats(a: Actor): Promise<{
        count: number;
        minutes: number;
        seconds: number;
        last: {
            shiftId: string | null;
            status: string;
            seconds: number;
            shiftType: string | null;
        } | null;
    }>;
    /** Rangliste nach Zeit im Dienst (ohne Pausen) – für alle sichtbar (Discord: `/shift leaderboard`). */
    leaderboard(a: Actor, f: z.infer<typeof boardQuery>): Promise<{
        days: number | null;
        shiftType: string | null;
        me: string;
        users: {
            userId: string;
            name: string;
            callsign: string | null;
            discordId: string | null;
            shifts: number;
            seconds: number;
            minutes: number;
        }[];
    }>;
    /** Laufende Schichten mit Beginn, Dauer ohne Pausen und Discord-ID (Discord: `/shift active`). */
    activeShifts(): Promise<{
        userId: string;
        name: string;
        callsign: string | null;
        discordId: string | null;
        status: string;
        shiftId: string | null;
        shiftType: string | null;
        startedAt: Date;
        seconds: number;
    }[]>;
    /** Dienststunden aller Beamten (Schichtleitung). */
    hours(f: z.infer<typeof hoursQuery>): Promise<{
        days: number;
        since: Date;
        users: {
            userId: string;
            name: string;
            rank: string | null;
            callsign: string | null;
            minutes: number;
            byStatus: Record<string, number>;
            sessions: number;
        }[];
    }>;
    /** Schicht-Logs: wer wann welche Schicht gestartet/beendet hat (Schichtleitung). */
    shiftLog(f: z.infer<typeof logQuery>): Promise<{
        days: number;
        since: Date;
        member: null;
        items: never[];
    } | {
        items: {
            id: string;
            shiftId: string | null;
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
            seconds: number;
            startedBy: string | null;
            endedBy: string | null;
        }[];
        member?: {
            userId: string;
            name: string;
        } | undefined;
        days: number;
        since: Date;
    }>;
    /** „Bin noch im Dienst“ (Erinnerung) bzw. echte Aktivität im Dashboard/MDT. */
    active(a: Actor): Promise<{
        onDuty: boolean;
        status: string;
    }>;
    set(a: Actor, b: z.infer<typeof body>, r: {
        headers: Record<string, string | string[] | undefined>;
    }): Promise<{
        serverId: string | null;
        id: string;
        status: string;
        userId: string;
        unitId: string | null;
        callsign: string | null;
        shiftType: string | null;
        shiftId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | {
        status: string;
    }>;
    /** Schichtleitung (`/shift admin`): Gesamtwerte und letzte Schicht eines Mitglieds. */
    statsFor(userId: string): Promise<{
        count: number;
        minutes: number;
        seconds: number;
        last: {
            shiftId: string | null;
            status: string;
            seconds: number;
            shiftType: string | null;
        } | null;
    }>;
    /** Schicht ändern: Zeit hinzufügen, abziehen oder setzen (Sekunden, ohne Pausen). */
    modifyShift(a: Actor, shiftId: string, b: z.infer<typeof modifyBody>): Promise<{
        shiftId: string;
        userId: string;
        seconds: number;
    }>;
    deleteShift(a: Actor, shiftId: string): Promise<{
        shiftId: string;
        deleted: boolean;
    }>;
    /** Alle beendeten Schichten eines Mitglieds löschen (optional nur eine Schichtart). */
    clearShifts(a: Actor, userId: string, q: z.infer<typeof clearQuery>): Promise<{
        deleted: number;
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
        shiftId: string | null;
        startedAt: Date;
        endedAt: Date | null;
        lastActivityAt: Date | null;
        remindedAt: Date | null;
    } | {
        status: string;
    }>;
}
export {};
