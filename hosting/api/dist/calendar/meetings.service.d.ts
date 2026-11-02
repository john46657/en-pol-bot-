import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { type ParticipantStatus } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { CalendarService } from './calendar.service';
export declare const meetingBody: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    startsAt: z.ZodDate;
    endsAt: z.ZodDate;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    department: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    discordChannelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    mandatory: z.ZodDefault<z.ZodBoolean>;
    private: z.ZodDefault<z.ZodBoolean>;
    participantIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    reminders: z.ZodDefault<z.ZodArray<z.ZodEffects<z.ZodNumber, number, number>, "many">>;
    agenda: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    idempotencyKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    startsAt: Date;
    endsAt: Date;
    reminders: number[];
    mandatory: boolean;
    private: boolean;
    participantIds: string[];
    description?: string | null | undefined;
    location?: string | null | undefined;
    department?: string | null | undefined;
    idempotencyKey?: string | null | undefined;
    discordChannelId?: string | null | undefined;
    agenda?: string | null | undefined;
}, {
    title: string;
    startsAt: Date;
    endsAt: Date;
    description?: string | null | undefined;
    location?: string | null | undefined;
    department?: string | null | undefined;
    reminders?: number[] | undefined;
    idempotencyKey?: string | null | undefined;
    discordChannelId?: string | null | undefined;
    mandatory?: boolean | undefined;
    private?: boolean | undefined;
    agenda?: string | null | undefined;
    participantIds?: string[] | undefined;
}>;
export declare const minutesBody: z.ZodObject<{
    agenda: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    decisions: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    followUp: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    version: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    version: number;
    notes?: string | null | undefined;
    agenda?: string | null | undefined;
    decisions?: string | null | undefined;
    followUp?: string | null | undefined;
}, {
    version: number;
    notes?: string | null | undefined;
    agenda?: string | null | undefined;
    decisions?: string | null | undefined;
    followUp?: string | null | undefined;
}>;
export declare const taskBody: z.ZodObject<{
    title: z.ZodString;
    assigneeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    dueAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    dueAt?: Date | null | undefined;
    assigneeId?: string | null | undefined;
}, {
    title: string;
    dueAt?: Date | null | undefined;
    assigneeId?: string | null | undefined;
}>;
/**
 * Besprechungsmanager: Besprechung = Kalendertermin (Kategorie MEETING) + Protokoll, Aufgaben, Discord-Kanal, Teilnahmepflicht.
 * Private Protokolle sehen nur Organisator, Protokollführer, Anwesende und `meetings.view_private`.
 */
export declare class MeetingsService {
    private readonly cal;
    private readonly discord;
    constructor(cal: CalendarService, discord: DiscordService);
    private get prisma();
    private get perms();
    private load;
    private mayOrganize;
    /** Protokoll lesen: öffentlich mit meetings.view; privat nur Organisator, Protokollführer, Anwesende, view_private. */
    private mayReadMinutes;
    private mayWriteMinutes;
    private discordText;
    /** Ankündigung bzw. Änderung im Discord-Kanal der Besprechung (Buttons Zusagen/Absagen; Antworten laufen über die API). */
    private post;
    create(actor: Actor, d: z.infer<typeof meetingBody>): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    list(actor: Actor, f: {
        scope: 'upcoming' | 'past';
    }): Promise<{
        canOrganize: boolean;
        items: {
            id: string;
            eventId: string;
            title: string;
            startsAt: Date;
            endsAt: Date;
            location: string | null;
            department: string | null;
            status: string;
            organizerName: string;
            mandatory: boolean;
            private: boolean;
            conductedAt: Date | null;
            hasMinutes: boolean;
            openTasks: number;
            myStatus: string | null;
            counts: {
                invited: number;
                accepted: number;
                attended: number;
            };
        }[];
    }>;
    get(actor: Actor, id: string): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    update(actor: Actor, id: string, d: z.infer<typeof meetingBody> & {
        version: number;
    }): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    cancel(actor: Actor, id: string, reason: string): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    /** Protokoll: Tagesordnung, Notizen, Entscheidungen, Nachbereitung (Versionsprüfung, Audit ohne Inhalt). */
    saveMinutes(actor: Actor, id: string, d: z.infer<typeof minutesBody>): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    /** „Besprechung durchgeführt“: Zeitpunkt + Termin abgeschlossen; Anwesenheit kommt aus der Teilnehmerliste. */
    conduct(actor: Actor, id: string): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    addTask(actor: Actor, id: string, d: z.infer<typeof taskBody>): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    setTask(actor: Actor, taskId: string, status: 'OPEN' | 'DONE' | 'CANCELLED'): Promise<{
        id: string;
        eventId: string;
        event: {
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
        };
        discordChannelId: string | null;
        mandatory: boolean;
        private: boolean;
        conductedAt: Date | null;
        version: number;
        minutes: {
            agenda: string | null;
            notes: string | null;
            decisions: string | null;
            followUp: string | null;
            hidden?: undefined;
        } | {
            agenda: string | null;
            notes: null;
            decisions: null;
            followUp: null;
            hidden: boolean;
        };
        tasks: {
            id: string;
            title: string;
            assigneeId: string | null;
            assigneeName: string | null;
            dueAt: Date | null;
            status: string;
            doneAt: Date | null;
        }[];
        can: {
            minutes: boolean;
            organize: boolean;
            readMinutes: boolean;
        };
    }>;
    /** Offene Aufgaben: eigene; mit meetings.organize alle. */
    openTasks(actor: Actor): Promise<{
        id: string;
        title: string;
        meetingId: string;
        meetingTitle: string;
        assigneeName: string | null;
        dueAt: Date | null;
        overdue: boolean;
    }[]>;
    exportParticipants(actor: Actor, id: string): Promise<string>;
}
export type MeetingWithEvent = Prisma.MeetingGetPayload<{
    include: {
        event: true;
    };
}>;
