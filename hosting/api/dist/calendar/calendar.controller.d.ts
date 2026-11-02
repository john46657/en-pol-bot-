import type { Response } from 'express';
import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { CalendarService, createEventBody, eventInput } from './calendar.service';
import { MeetingsService, meetingBody, minutesBody, taskBody } from './meetings.service';
declare const listQ: z.ZodObject<{
    from: z.ZodDate;
    to: z.ZodDate;
    category: z.ZodOptional<z.ZodEnum<["MEETING", "TRAINING", "EXAM", "SHIFT", "EVENT", "INTERNAL", "DEADLINE"]>>;
    department: z.ZodOptional<z.ZodString>;
    mine: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
}, "strip", z.ZodTypeAny, {
    from: Date;
    to: Date;
    category?: "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "SHIFT" | "EVENT" | "DEADLINE" | undefined;
    department?: string | undefined;
    mine?: "true" | "false" | undefined;
}, {
    from: Date;
    to: Date;
    category?: "INTERNAL" | "TRAINING" | "MEETING" | "EXAM" | "SHIFT" | "EVENT" | "DEADLINE" | undefined;
    department?: string | undefined;
    mine?: "true" | "false" | undefined;
}>;
declare const upcomingQ: z.ZodObject<{
    days: z.ZodDefault<z.ZodNumber>;
    scope: z.ZodDefault<z.ZodEnum<["mine", "all"]>>;
}, "strip", z.ZodTypeAny, {
    scope: "mine" | "all";
    days: number;
}, {
    scope?: "mine" | "all" | undefined;
    days?: number | undefined;
}>;
declare const reasonBody: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
declare const respondBody: z.ZodObject<{
    status: z.ZodEnum<["ACCEPTED", "DECLINED", "EXCUSED"]>;
    note: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "ACCEPTED" | "DECLINED" | "EXCUSED";
    note?: string | undefined;
}, {
    status: "ACCEPTED" | "DECLINED" | "EXCUSED";
    note?: string | undefined;
}>;
declare const inviteBody: z.ZodObject<{
    userIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    userIds: string[];
}, {
    userIds: string[];
}>;
declare const attendanceBody: z.ZodObject<{
    entries: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        status: z.ZodEnum<["ATTENDED", "ABSENT", "EXCUSED"]>;
    }, "strip", z.ZodTypeAny, {
        status: "ATTENDED" | "EXCUSED" | "ABSENT";
        userId: string;
    }, {
        status: "ATTENDED" | "EXCUSED" | "ABSENT";
        userId: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    entries: {
        status: "ATTENDED" | "EXCUSED" | "ABSENT";
        userId: string;
    }[];
}, {
    entries: {
        status: "ATTENDED" | "EXCUSED" | "ABSENT";
        userId: string;
    }[];
}>;
declare const meetingsQ: z.ZodObject<{
    scope: z.ZodDefault<z.ZodEnum<["upcoming", "past"]>>;
}, "strip", z.ZodTypeAny, {
    scope: "upcoming" | "past";
}, {
    scope?: "upcoming" | "past" | undefined;
}>;
declare const taskStatus: z.ZodObject<{
    status: z.ZodEnum<["OPEN", "DONE", "CANCELLED"]>;
}, "strip", z.ZodTypeAny, {
    status: "CANCELLED" | "OPEN" | "DONE";
}, {
    status: "CANCELLED" | "OPEN" | "DONE";
}>;
/** Zentraler Kalender. Ansehen/teilnehmen: calendar.view · anlegen/ändern/absagen: calendar.manage (Besprechungen: Organisator). */
export declare class CalendarController {
    private readonly s;
    constructor(s: CalendarService);
    list(a: Actor, q: z.infer<typeof listQ>): Promise<{
        items: unknown[];
        canManage: boolean;
        departments: string[];
    }>;
    upcoming(a: Actor, q: z.infer<typeof upcomingQ>): Promise<unknown[]>;
    get(a: Actor, id: string): Promise<{
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
        myStatus: import("@enrp/shared").ParticipantStatus | null;
    }>;
    create(a: Actor, b: z.infer<typeof createEventBody>): Promise<{
        created: number;
        ids: string[];
        seriesId: string | null;
        duplicate: boolean;
    }>;
    /** Ändern/Verschieben: Recht im Service (Kalenderverwaltung oder Organisator der Besprechung) */
    update(a: Actor, id: string, b: z.infer<typeof eventInput> & {
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
        myStatus: import("@enrp/shared").ParticipantStatus | null;
    }>;
    cancel(a: Actor, id: string, b: z.infer<typeof reasonBody>): Promise<{
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
        myStatus: import("@enrp/shared").ParticipantStatus | null;
    }>;
    invite(a: Actor, id: string, b: z.infer<typeof inviteBody>): Promise<{
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
        myStatus: import("@enrp/shared").ParticipantStatus | null;
    }>;
    respond(a: Actor, id: string, b: z.infer<typeof respondBody>): Promise<{
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
        myStatus: import("@enrp/shared").ParticipantStatus | null;
    }>;
    attendance(a: Actor, id: string, b: z.infer<typeof attendanceBody>): Promise<{
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
        myStatus: import("@enrp/shared").ParticipantStatus | null;
    }>;
}
/** Besprechungsmanager. Ansehen: meetings.view · anlegen: meetings.organize · Protokoll: Organisator/meetings.minutes · privat: meetings.view_private. */
export declare class MeetingsController {
    private readonly s;
    constructor(s: MeetingsService);
    list(a: Actor, q: z.infer<typeof meetingsQ>): Promise<{
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
    tasks(a: Actor): Promise<{
        id: string;
        title: string;
        meetingId: string;
        meetingTitle: string;
        assigneeName: string | null;
        dueAt: Date | null;
        overdue: boolean;
    }[]>;
    get(a: Actor, id: string): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    csv(a: Actor, id: string, res: Response): Promise<void>;
    create(a: Actor, b: z.infer<typeof meetingBody>): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    update(a: Actor, id: string, b: z.infer<typeof meetingBody> & {
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    cancel(a: Actor, id: string, b: z.infer<typeof reasonBody>): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    minutes(a: Actor, id: string, b: z.infer<typeof minutesBody>): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    conduct(a: Actor, id: string): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    addTask(a: Actor, id: string, b: z.infer<typeof taskBody>): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
    setTask(a: Actor, id: string, b: z.infer<typeof taskStatus>): Promise<{
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
            myStatus: import("@enrp/shared").ParticipantStatus | null;
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
}
export {};
