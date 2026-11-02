import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { DiscordService } from '../discord/discord.service';
/** Einstellungen der Schichtplanung (je Server). */
export declare const shiftplanConfigSchema: z.ZodObject<{
    /** Kanal für veröffentlichte Schichtpläne (optional, nur Name/Zeit/Besetzung – keine Namen von Abwesenden) */
    channelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** Mitglieder dürfen sich selbst an-/abmelden */
    selfSignup: z.ZodDefault<z.ZodBoolean>;
    /** Erinnerung an Zugewiesene so viele Minuten vor Schichtbeginn (0 = aus) */
    reminderMinutes: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    selfSignup: boolean;
    reminderMinutes: number;
    channelId?: string | null | undefined;
}, {
    channelId?: string | null | undefined;
    selfSignup?: boolean | undefined;
    reminderMinutes?: number | undefined;
}>;
export type ShiftplanConfig = z.infer<typeof shiftplanConfigSchema>;
export declare const shiftInput: z.ZodObject<{
    name: z.ZodString;
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    leaderId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    unit: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    minStaff: z.ZodDefault<z.ZodNumber>;
    maxStaff: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
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
export declare const createShiftBody: z.ZodObject<{
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
    assigneeIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    publish: z.ZodDefault<z.ZodBoolean>;
    recurrence: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        freq: z.ZodEnum<["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"]>;
        count: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        count: number;
        freq: "WEEKLY" | "DAILY" | "BIWEEKLY" | "MONTHLY";
    }, {
        count: number;
        freq: "WEEKLY" | "DAILY" | "BIWEEKLY" | "MONTHLY";
    }>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    startsAt: Date;
    endsAt: Date;
    minStaff: number;
    publish: boolean;
    assigneeIds: string[];
    unit?: string | null | undefined;
    description?: string | null | undefined;
    department?: string | null | undefined;
    leaderId?: string | null | undefined;
    maxStaff?: number | null | undefined;
    recurrence?: {
        count: number;
        freq: "WEEKLY" | "DAILY" | "BIWEEKLY" | "MONTHLY";
    } | null | undefined;
}, {
    name: string;
    startsAt: Date;
    endsAt: Date;
    unit?: string | null | undefined;
    description?: string | null | undefined;
    department?: string | null | undefined;
    leaderId?: string | null | undefined;
    minStaff?: number | undefined;
    maxStaff?: number | null | undefined;
    recurrence?: {
        count: number;
        freq: "WEEKLY" | "DAILY" | "BIWEEKLY" | "MONTHLY";
    } | null | undefined;
    publish?: boolean | undefined;
    assigneeIds?: string[] | undefined;
}>;
export type ShiftInput = z.infer<typeof shiftInput>;
/**
 * Schichtplanung (Dienstplan). Plan und tatsächlicher Dienst sind getrennt: die Stempeluhr (DutySession) bleibt unverändert,
 * die Leitstelle vergleicht beides. Regeln: keine doppelten Anmeldungen (Unique + Status), keine überlappenden Schichten je Person,
 * keine Anmeldung während einer genehmigten Abwesenheit, nichts mit Nachweisen wird gelöscht (nur abgesagt), jede Änderung im Audit.
 */
export declare class ShiftPlanService {
    private readonly prisma;
    private readonly audit;
    private readonly perms;
    private readonly notify;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, notify: NotifyService, discord: DiscordService);
    config(): Promise<ShiftplanConfig>;
    saveConfig(actor: Actor, c: ShiftplanConfig): Promise<{
        selfSignup: boolean;
        reminderMinutes: number;
        channelId?: string | null | undefined;
    }>;
    private departments;
    private names;
    private manager;
    private validate;
    private checkRefs;
    /**
     * Konflikte einer Person im Zeitraum: andere aktive Schichten (überlappend) und genehmigte bzw. geprüfte Abwesenheiten.
     * Abwesenheitsgründe werden nie zurückgegeben.
     */
    conflictsFor(userId: string, startsAt: Date, endsAt: Date, exceptShiftId?: string): Promise<{
        shifts: {
            id: string;
            name: string;
            startsAt: Date;
            endsAt: Date;
        }[];
        leave: {
            number: string;
            approved: boolean;
        } | null;
    }>;
    private conflictText;
    /** Darstellung: Besetzung, Namen, Konflikte mit genehmigten Abwesenheiten (ohne Grund). */
    private view;
    list(actor: Actor, f: {
        from?: Date;
        to?: Date;
        department?: string;
        status?: string;
        mine?: boolean;
    }): Promise<{
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
    private load;
    get(actor: Actor, id: string): Promise<{
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
    create(actor: Actor, d: z.infer<typeof createShiftBody>): Promise<{
        created: number;
        ids: string[];
        seriesId: `${string}-${string}-${string}-${string}-${string}` | null;
    }>;
    private announceAssigned;
    update(actor: Actor, id: string, d: ShiftInput & {
        version: number;
    }): Promise<{
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
    publish(actor: Actor, id: string): Promise<{
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
    cancel(actor: Actor, id: string, reason: string): Promise<{
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
    /** Löschen nur ohne Nachweise: Entwurf, in der Zukunft, nie jemand zugewiesen. Sonst absagen. */
    remove(actor: Actor, id: string): Promise<{
        deleted: boolean;
    }>;
    /** Kopieren: gleiche Angaben als Entwurf, neuer Beginn (Dauer bleibt), ohne Zuweisungen. */
    copy(actor: Actor, id: string, startsAt: Date): Promise<{
        created: number;
        ids: string[];
        seriesId: `${string}-${string}-${string}-${string}-${string}` | null;
    }>;
    /** Zuweisen (Planung) bzw. selbst anmelden. Doppelte Anmeldung → Konflikt; frühere Abmeldung wird wieder aktiv. */
    private join;
    assign(actor: Actor, id: string, userIds: string[]): Promise<{
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
    signup(actor: Actor, id: string): Promise<{
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
    /** Abmelden (selbst) bzw. austragen (Planung). Die Zuweisung bleibt als WITHDRAWN erhalten. */
    leave(actor: Actor, id: string, userId: string, reason?: string): Promise<{
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
    /** „Schichtänderung melden“ (z. B. später da, Tausch gewünscht): geht an Leiter und Planer, im Audit protokolliert. */
    report(actor: Actor, id: string, message: string): Promise<{
        delivered: number;
    }>;
    /** Eigene kommende Schichten (Discord „Meine Schichten“, MDT). */
    mine(actor: Actor, days?: number): Promise<{
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
    /** MDT: aktuelle bzw. nächste eigene Schicht mit Leiter, Einheit, Abteilung und Dienstzeiten. */
    current(actor: Actor): Promise<{
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
    /**
     * Leitstelle: Besetzung der laufenden und heutigen Schichten – geplant vs. tatsächlich im Dienst (Stempeluhr) vs. abwesend.
     * Abwesenheitsgründe erscheinen nie.
     */
    staffing(_actor: Actor, at?: Date): Promise<{
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
    /** Auswahlliste für Zuweisungen/Leitung: aktive Personen mit Personalakte auf diesem Server (nur Name, Rang, Abteilung). */
    people(): Promise<{
        userId: string;
        name: string;
        rank: string | null;
        department: string | null;
        callsign: string | null;
    }[]>;
    exportCsv(actor: Actor, f: {
        from?: Date;
        to?: Date;
        department?: string;
    }): Promise<string>;
    /**
     * Jede Minute: vergangene veröffentlichte Schichten abschließen und Zugewiesene vor Beginn erinnern.
     * Genau einmal je Schicht und Person (Dubletten-Schutz der Benachrichtigung) – übersteht Neustarts und mehrere Instanzen.
     */
    tick(now?: Date): Promise<{
        completed: number;
        reminded: number;
    }>;
}
