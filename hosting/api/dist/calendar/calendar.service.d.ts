import { Prisma, type CalendarEvent, type CalendarParticipant } from '@prisma/client';
import { z } from 'zod';
import { type ParticipantStatus } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { NotifyService } from '../notifications/notify.service';
import { DiscordService } from '../discord/discord.service';
export declare const eventInput: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category: z.ZodEffects<z.ZodEnum<["MEETING", "TRAINING", "EXAM", "SHIFT", "EVENT", "INTERNAL", "DEADLINE"]>, "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "EVENT" | "DEADLINE", "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "SHIFT" | "EVENT" | "DEADLINE">;
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    allDay: z.ZodDefault<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reminders: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodNumber, number, number>, "many">>;
    maxParticipants: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    openSignup: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    title: string;
    category: "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "EVENT" | "DEADLINE";
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    reminders: number[];
    openSignup: boolean;
    description?: string | null | undefined;
    location?: string | null | undefined;
    department?: string | null | undefined;
    maxParticipants?: number | null | undefined;
}, {
    title: string;
    category: "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "SHIFT" | "EVENT" | "DEADLINE";
    startsAt: Date;
    endsAt: Date;
    description?: string | null | undefined;
    location?: string | null | undefined;
    department?: string | null | undefined;
    allDay?: boolean | undefined;
    reminders?: number[] | undefined;
    maxParticipants?: number | null | undefined;
    openSignup?: boolean | undefined;
}>;
export declare const createEventBody: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category: z.ZodEffects<z.ZodEnum<["MEETING", "TRAINING", "EXAM", "SHIFT", "EVENT", "INTERNAL", "DEADLINE"]>, "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "EVENT" | "DEADLINE", "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "SHIFT" | "EVENT" | "DEADLINE">;
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    allDay: z.ZodDefault<z.ZodBoolean>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reminders: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodNumber, number, number>, "many">>;
    maxParticipants: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    openSignup: z.ZodDefault<z.ZodBoolean>;
} & {
    participantIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
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
    /** Gleiche Anlage aus mehreren Systemen (Doppelklick, Discord + Dashboard) → genau ein Termin */
    idempotencyKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    category: "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "EVENT" | "DEADLINE";
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    reminders: number[];
    openSignup: boolean;
    participantIds: string[];
    description?: string | null | undefined;
    location?: string | null | undefined;
    department?: string | null | undefined;
    maxParticipants?: number | null | undefined;
    idempotencyKey?: string | null | undefined;
    recurrence?: {
        count: number;
        freq: "WEEKLY" | "DAILY" | "BIWEEKLY" | "MONTHLY";
    } | null | undefined;
}, {
    title: string;
    category: "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "SHIFT" | "EVENT" | "DEADLINE";
    startsAt: Date;
    endsAt: Date;
    description?: string | null | undefined;
    location?: string | null | undefined;
    department?: string | null | undefined;
    allDay?: boolean | undefined;
    reminders?: number[] | undefined;
    maxParticipants?: number | null | undefined;
    openSignup?: boolean | undefined;
    idempotencyKey?: string | null | undefined;
    recurrence?: {
        count: number;
        freq: "WEEKLY" | "DAILY" | "BIWEEKLY" | "MONTHLY";
    } | null | undefined;
    participantIds?: string[] | undefined;
}>;
export type EventInput = z.infer<typeof eventInput>;
type Row = CalendarEvent & {
    participants: CalendarParticipant[];
    meeting?: {
        id: string;
        private: boolean;
        mandatory: boolean;
    } | null;
};
/**
 * Zentraler Kalender. Schichten kommen virtuell aus dem Schichtplan (keine Kopie → keine Doppeleinträge),
 * Besprechungen sind Kalendertermine mit Besprechungsdaten. Teilnahme: Einladung, Zusage, Absage, Abwesenheit melden; Anwesenheit
 * erfasst der Organisator. Erinnerungen genau einmal je Termin, Beginn und Vorlaufzeit.
 */
export declare class CalendarService {
    readonly prisma: PrismaService;
    readonly audit: AuditService;
    readonly perms: PermissionService;
    readonly notify: NotifyService;
    private readonly discord;
    constructor(prisma: PrismaService, audit: AuditService, perms: PermissionService, notify: NotifyService, discord: DiscordService);
    names(ids: string[]): Promise<Map<string, string>>;
    private departments;
    validate(d: {
        startsAt: Date;
        endsAt: Date;
    }): void;
    checkDepartment(dep?: string | null): Promise<void>;
    /** Darf der Benutzer diesen Termin ändern? Kalenderverwaltung immer; Organisator bei Besprechungen mit meetings.organize. */
    mayEdit(userId: string, e: {
        organizerId: string;
        category: string;
    }): Promise<boolean>;
    private when;
    view(e: Row, me: string, names: Map<string, string>, full?: boolean): {
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    };
    /**
     * Termine im Zeitraum (+ Schichten aus dem Schichtplan, falls sichtbar). `mine`: nur eigene (eingeladen/zugesagt/Organisator).
     */
    list(actor: Actor, f: {
        from: Date;
        to: Date;
        category?: string;
        mine?: boolean;
        department?: string;
    }): Promise<{
        items: unknown[];
        canManage: boolean;
        departments: string[];
    }>;
    load(id: string): Promise<Row>;
    get(actor: Actor, id: string): Promise<{
        canEdit: boolean;
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    }>;
    /** Anlegen (auch als Serie). Mit `idempotencyKey` entsteht bei doppelter Anlage genau ein Termin (vorhandener wird geliefert). */
    create(actor: Actor, d: z.infer<typeof createEventBody>, opts?: {
        tx?: Prisma.TransactionClient;
        skipPermission?: boolean;
    }): Promise<{
        created: number;
        ids: string[];
        seriesId: string | null;
        duplicate: boolean;
    }>;
    /** Ändern/Verschieben (Versionsprüfung). Teilnehmer werden über Änderungen informiert. */
    update(actor: Actor, id: string, d: EventInput & {
        version: number;
    }): Promise<{
        canEdit: boolean;
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    }>;
    private announceChange;
    cancel(actor: Actor, id: string, reason: string): Promise<{
        canEdit: boolean;
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    }>;
    /** Teilnehmer zuweisen (einladen). Bestehende Antworten bleiben unverändert. */
    invite(actor: Actor, id: string, userIds: string[]): Promise<{
        canEdit: boolean;
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    }>;
    /**
     * Eigene Antwort: zusagen, absagen, Abwesenheit melden. Offene Termine: jeder mit calendar.view;
     * geschlossene nur Eingeladene. Höchstzahl wird unter Zeilensperre geprüft.
     */
    respond(actor: Actor, id: string, status: 'ACCEPTED' | 'DECLINED' | 'EXCUSED', note?: string): Promise<{
        canEdit: boolean;
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    }>;
    /** Anwesenheit erfassen (nach Beginn): Organisator, Kalenderverwaltung oder meetings.organize bei Besprechungen. */
    attendance(actor: Actor, id: string, entries: {
        userId: string;
        status: 'ATTENDED' | 'ABSENT' | 'EXCUSED';
    }[]): Promise<{
        canEdit: boolean;
        participants?: {
            userId: string;
            name: string;
            status: string;
            statusLabel: string;
            note: string | null;
            respondedAt: Date | null;
        }[] | undefined;
        id: string;
        title: string;
        description: string | null;
        category: string;
        categoryLabel: string;
        startsAt: Date;
        endsAt: Date;
        allDay: boolean;
        location: string | null;
        department: string | null;
        status: string;
        cancelReason: string | null;
        organizerId: string;
        organizerName: string;
        reminders: number[];
        maxParticipants: number | null;
        openSignup: boolean;
        seriesId: string | null;
        version: number;
        meetingId: string | null;
        mandatory: boolean;
        counts: {
            invited: number;
            accepted: number;
            declined: number;
            excused: number;
            attended: number;
            absent: number;
        };
        myStatus: ParticipantStatus | null;
    }>;
    /** Kommende Termine für Discord/MDT/Leitstelle: eigene und offene, die nächsten `days` Tage. */
    upcoming(actor: Actor, days?: number, scope?: 'mine' | 'all'): Promise<unknown[]>;
    /** Jede Minute: fällige Erinnerungen genau einmal je Termin/Beginn/Vorlaufzeit; vergangene Termine abschließen. */
    tick(now?: Date): Promise<{
        completed: number;
        reminded: number;
    }>;
}
export {};
