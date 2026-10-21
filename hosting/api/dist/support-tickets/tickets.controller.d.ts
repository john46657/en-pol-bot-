import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/request-context';
import { SupportTicketsService } from './tickets.service';
import { TicketConfigService } from './config.service';
import { categorySchema, departmentSchema, panelSchema, prioritySchema, reasonSchema, settingsSchema, statusSchema } from './config.schemas';
declare const actionSchema: z.ZodDiscriminatedUnion<"action", [z.ZodObject<{
    action: z.ZodLiteral<"close">;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "close";
    reason?: string | undefined;
}, {
    action: "close";
    reason?: string | undefined;
}>, z.ZodObject<{
    action: z.ZodLiteral<"close_request">;
}, "strip", z.ZodTypeAny, {
    action: "close_request";
}, {
    action: "close_request";
}>, z.ZodObject<{
    action: z.ZodLiteral<"reopen">;
}, "strip", z.ZodTypeAny, {
    action: "reopen";
}, {
    action: "reopen";
}>, z.ZodObject<{
    action: z.ZodLiteral<"claim">;
}, "strip", z.ZodTypeAny, {
    action: "claim";
}, {
    action: "claim";
}>, z.ZodObject<{
    action: z.ZodLiteral<"unclaim">;
    targetId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "unclaim";
    targetId?: string | undefined;
}, {
    action: "unclaim";
    targetId?: string | undefined;
}>, z.ZodObject<{
    action: z.ZodLiteral<"add_access">;
    targetId: z.ZodString;
    kind: z.ZodEnum<["USER", "ROLE"]>;
    minutes: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "ROLE" | "USER";
    action: "add_access";
    targetId: string;
    minutes?: number | undefined;
}, {
    kind: "ROLE" | "USER";
    action: "add_access";
    targetId: string;
    minutes?: number | undefined;
}>, z.ZodObject<{
    action: z.ZodLiteral<"remove_access">;
    targetId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "remove_access";
    targetId: string;
}, {
    action: "remove_access";
    targetId: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"priority">;
    priorityId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "priority";
    priorityId: string;
}, {
    action: "priority";
    priorityId: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"status">;
    statusId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "status";
    statusId: string;
}, {
    action: "status";
    statusId: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"category">;
    categoryId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    categoryId: string;
    action: "category";
}, {
    categoryId: string;
    action: "category";
}>, z.ZodObject<{
    action: z.ZodLiteral<"rename">;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    action: "rename";
}, {
    name: string;
    action: "rename";
}>, z.ZodObject<{
    action: z.ZodLiteral<"move">;
    parentId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "move";
    parentId: string | null;
}, {
    action: "move";
    parentId: string | null;
}>, z.ZodObject<{
    action: z.ZodLiteral<"transcript">;
}, "strip", z.ZodTypeAny, {
    action: "transcript";
}, {
    action: "transcript";
}>, z.ZodObject<{
    action: z.ZodLiteral<"lock">;
}, "strip", z.ZodTypeAny, {
    action: "lock";
}, {
    action: "lock";
}>, z.ZodObject<{
    action: z.ZodLiteral<"unlock">;
}, "strip", z.ZodTypeAny, {
    action: "unlock";
}, {
    action: "unlock";
}>, z.ZodObject<{
    action: z.ZodLiteral<"escalate">;
}, "strip", z.ZodTypeAny, {
    action: "escalate";
}, {
    action: "escalate";
}>, z.ZodObject<{
    action: z.ZodLiteral<"note">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    action: "note";
}, {
    text: string;
    action: "note";
}>, z.ZodObject<{
    action: z.ZodLiteral<"rating">;
}, "strip", z.ZodTypeAny, {
    action: "rating";
}, {
    action: "rating";
}>, z.ZodObject<{
    action: z.ZodLiteral<"delete">;
}, "strip", z.ZodTypeAny, {
    action: "delete";
}, {
    action: "delete";
}>, z.ZodObject<{
    action: z.ZodLiteral<"reply">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    action: "reply";
}, {
    text: string;
    action: "reply";
}>, z.ZodObject<{
    action: z.ZodLiteral<"assign">;
    targetId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "assign";
    targetId: string;
}, {
    action: "assign";
    targetId: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"department">;
    departmentId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "department";
    departmentId: string;
}, {
    action: "department";
    departmentId: string;
}>, z.ZodObject<{
    action: z.ZodLiteral<"request_info">;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    action: "request_info";
}, {
    text: string;
    action: "request_info";
}>, z.ZodObject<{
    action: z.ZodLiteral<"archive">;
}, "strip", z.ZodTypeAny, {
    action: "archive";
}, {
    action: "archive";
}>, z.ZodObject<{
    action: z.ZodLiteral<"transcript_retry">;
    transcriptId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    action: "transcript_retry";
    transcriptId: string;
}, {
    action: "transcript_retry";
    transcriptId: string;
}>]>;
declare const listQ: z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<["open", "closed", "archived", "escalated", "deleted", "all"]>>;
    statusId: z.ZodOptional<z.ZodString>;
    priorityId: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
    queue: z.ZodOptional<z.ZodEnum<["unassigned", "in_progress", "waiting", "overdue"]>>;
    departmentId: z.ZodOptional<z.ZodString>;
    closedFrom: z.ZodOptional<z.ZodDate>;
    closedTo: z.ZodOptional<z.ZodDate>;
    claimer: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"me">]>>;
    creator: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    q: z.ZodOptional<z.ZodString>;
    guildId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    guildId?: string | undefined;
    kind?: "all" | "open" | "closed" | "archived" | "escalated" | "deleted" | undefined;
    categoryId?: string | undefined;
    departmentId?: string | undefined;
    statusId?: string | undefined;
    priorityId?: string | undefined;
    q?: string | undefined;
    queue?: "unassigned" | "in_progress" | "waiting" | "overdue" | undefined;
    from?: Date | undefined;
    creator?: string | undefined;
    to?: Date | undefined;
    closedFrom?: Date | undefined;
    closedTo?: Date | undefined;
    claimer?: string | undefined;
}, {
    guildId?: string | undefined;
    kind?: "all" | "open" | "closed" | "archived" | "escalated" | "deleted" | undefined;
    categoryId?: string | undefined;
    departmentId?: string | undefined;
    statusId?: string | undefined;
    priorityId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    queue?: "unassigned" | "in_progress" | "waiting" | "overdue" | undefined;
    from?: Date | undefined;
    creator?: string | undefined;
    to?: Date | undefined;
    closedFrom?: Date | undefined;
    closedTo?: Date | undefined;
    claimer?: string | undefined;
}>;
declare const transcriptQ: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    categoryName: z.ZodOptional<z.ZodString>;
    creator: z.ZodOptional<z.ZodString>;
    staff: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    number: z.ZodOptional<z.ZodNumber>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    number?: number | undefined;
    status?: string | undefined;
    categoryName?: string | undefined;
    q?: string | undefined;
    staff?: string | undefined;
    from?: Date | undefined;
    creator?: string | undefined;
    to?: Date | undefined;
}, {
    number?: number | undefined;
    status?: string | undefined;
    categoryName?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    staff?: string | undefined;
    from?: Date | undefined;
    creator?: string | undefined;
    to?: Date | undefined;
}>;
declare const ratingQ: z.ZodObject<{
    stars: z.ZodOptional<z.ZodNumber>;
    categoryId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    categoryId?: string | undefined;
    stars?: number | undefined;
}, {
    categoryId?: string | undefined;
    stars?: number | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
declare const openQ: z.ZodObject<{
    categoryId: z.ZodString;
    discordId: z.ZodString;
    discordName: z.ZodOptional<z.ZodString>;
    guildId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    categoryId: string;
    guildId?: string | undefined;
    discordName?: string | undefined;
}, {
    discordId: string;
    categoryId: string;
    guildId?: string | undefined;
    discordName?: string | undefined;
}>;
declare const auditQ: z.ZodObject<{
    ticketId: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodString>;
    result: z.ZodOptional<z.ZodEnum<["SUCCESS", "DENIED", "FAILED"]>>;
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    result?: "SUCCESS" | "DENIED" | "FAILED" | undefined;
    action?: string | undefined;
    ticketId?: string | undefined;
}, {
    result?: "SUCCESS" | "DENIED" | "FAILED" | undefined;
    action?: string | undefined;
    ticketId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
}>;
declare const previewQ: z.ZodObject<{
    fields: z.ZodArray<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodEffects<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<["SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE", ...("SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE")[]]>;
        required: z.ZodBoolean;
        options: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        placeholder: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        minLength: z.ZodOptional<z.ZodNumber>;
        maxLength: z.ZodOptional<z.ZodNumber>;
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        enabled: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }, {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }>, "many">;
    values: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodBoolean, z.ZodNull]>>>;
}, "strip", z.ZodTypeAny, {
    fields: {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        options: string[];
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }[];
    values: Record<string, string | boolean | string[] | null>;
}, {
    fields: {
        id: string;
        type: "SHORT" | "LONG" | "YESNO" | "SELECT" | "MULTI" | "CHECKBOX" | "NUMBER" | "DATE" | "FILE";
        label: string;
        required: boolean;
        description?: string | undefined;
        enabled?: boolean | undefined;
        placeholder?: string | undefined;
        options?: string[] | undefined;
        minLength?: number | undefined;
        maxLength?: number | undefined;
        min?: number | undefined;
        max?: number | undefined;
    }[];
    values?: Record<string, string | boolean | string[] | null> | undefined;
}>;
/** Support-Tickets im Dashboard (Pfad `support-tickets`, weil `tickets` die Strafzettel sind). */
export declare class SupportTicketsController {
    private readonly s;
    private readonly cfg;
    constructor(s: SupportTicketsService, cfg: TicketConfigService);
    config(q: {
        guildId?: string;
    }): Promise<{
        categories: ({
            id: string;
            createdAt: Date;
            updatedAt: Date;
            color: number;
            description: string;
            active: boolean;
            guildId: string | null;
            name: string;
            position: number;
            questions: import("@prisma/client/runtime/library").JsonValue;
            archivedAt: Date | null;
            emoji: string | null;
            staffRoleIds: string[];
            accessRoleNames: string[];
            formVersion: number;
            buttonStyle: string;
            discordCategoryId: string | null;
            channelNameFormat: string;
            extraRoleIds: string[];
            requiredRoleIds: string[];
            allowedUserIds: string[];
            maxOpen: number;
            cooldownMinutes: number;
            defaultPriorityId: string | null;
            welcomeTitle: string;
            welcomeMessage: string;
            mentionStaff: boolean;
            mentionText: string;
            buttons: import("@prisma/client/runtime/library").JsonValue;
            claimMode: string;
            claimMessage: string;
            claimNotifyStaff: boolean;
            creatorCanClose: boolean;
            closeReasonMode: string;
            closeReasonSource: string;
            closeRemovesAccess: boolean;
            allowReopen: boolean;
            transcriptOnClose: boolean;
            transcriptChannelId: string | null;
            transcriptToUser: boolean;
            ratingEnabled: boolean;
            ratingQuestion: string;
            autoCloseMinutes: number;
            autoCloseWarnMinutes: number;
            autoCloseMessage: string;
            deleteAfterMinutes: number;
            escalationRoleIds: string[];
            escalationPriorityId: string | null;
            escalationMessage: string;
            welcomeImageUrl: string | null;
            capacity: number;
            creatorCanAddUsers: boolean;
            claimDiscordCategoryId: string | null;
            claimLocksChat: boolean;
            autoClaimOnMessage: boolean;
            autoUnclaimMinutes: number;
            staffAlertMinutes: number;
            closeRequestCloses: boolean;
            departmentId: string | null;
            confidential: boolean;
            formMode: string;
            escalateUnassignedMinutes: number;
        } & {
            buttons: import("@enrp/shared").TicketButtonConfig[];
            questions: import("@enrp/shared").TicketQuestion[];
        })[];
        panels: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            color: number;
            title: string;
            description: string;
            guildId: string | null;
            name: string;
            position: number;
            channelId: string | null;
            messageId: string | null;
            emoji: string | null;
            thumbnailUrl: string | null;
            imageUrl: string | null;
            bannerUrl: string | null;
            footer: string | null;
            footerIconUrl: string | null;
            authorName: string | null;
            authorIconUrl: string | null;
            style: string;
            placeholder: string;
            categoryIds: string[];
            allowedRoleIds: string[];
            showLoad: boolean;
            messageChannelId: string | null;
            publishedAt: Date | null;
            publishError: string | null;
        }[];
        statuses: {
            id: string;
            color: number;
            name: string;
            kind: string;
            position: number;
            key: string | null;
            emoji: string;
            isDefault: boolean;
            isClaimed: boolean;
            isEscalation: boolean;
            isClose: boolean;
        }[];
        priorities: {
            id: string;
            color: number;
            name: string;
            position: number;
            emoji: string;
            isDefault: boolean;
            allowedRoleNames: string[];
            notifyRoleIds: string[];
            firstResponseMinutes: number | null;
            resolutionMinutes: number | null;
        }[];
        reasons: {
            id: string;
            position: number;
            text: string;
        }[];
        settings: {
            guildId: string | null;
            notifications: {
                priority: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                created: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                closed: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                claimed: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                assigned: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                user_message: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                info_requested: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                escalated: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                reopened: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                transcript_ready: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
                transcript_failed: {
                    channel: boolean;
                    dashboard: boolean;
                    dm: boolean;
                };
            };
            leadRoleIds: string[];
            transcriptChannelId: string | null;
            logChannelId: string | null;
            closedTitle: string;
            closedMessage: string;
            closedColor: number;
            reopenedMessage: string;
            ratingMessage: string;
            ratingThanks: string;
            transcriptRetentionDays: number;
            ratingChannelId: string | null;
            ratingPublicChannelId: string | null;
            ratingPublicFields: ("category" | "duration" | "comment" | "staff" | "creator")[];
            memberLeaveAction: "NONE" | "CLOSE";
            memberLeaveReason: string;
            refPrefix: string;
            maxOpenPerUser: number;
            confidentialFallbackRoleIds: string[];
            slaReminderMinutes: number;
            slaEscalateAfterMinutes: number;
            userMessageNotifyMinutes: number;
        };
        departments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            description: string;
            active: boolean;
            name: string;
            position: number;
            emoji: string | null;
            staffRoleIds: string[];
            leadRoleIds: string[];
            accessRoleNames: string[];
            notifyChannelId: string | null;
        }[];
    }>;
    settings(u: AuthUser, b: z.infer<typeof settingsSchema>): Promise<{
        guildId: string | null;
        notifications: {
            priority: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            created: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            closed: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            claimed: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            assigned: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            user_message: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            info_requested: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            escalated: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            reopened: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            transcript_ready: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
            transcript_failed: {
                channel: boolean;
                dashboard: boolean;
                dm: boolean;
            };
        };
        leadRoleIds: string[];
        transcriptChannelId: string | null;
        logChannelId: string | null;
        closedTitle: string;
        closedMessage: string;
        closedColor: number;
        reopenedMessage: string;
        ratingMessage: string;
        ratingThanks: string;
        transcriptRetentionDays: number;
        ratingChannelId: string | null;
        ratingPublicChannelId: string | null;
        ratingPublicFields: ("category" | "duration" | "comment" | "staff" | "creator")[];
        memberLeaveAction: "NONE" | "CLOSE";
        memberLeaveReason: string;
        refPrefix: string;
        maxOpenPerUser: number;
        confidentialFallbackRoleIds: string[];
        slaReminderMinutes: number;
        slaEscalateAfterMinutes: number;
        userMessageNotifyMinutes: number;
    }>;
    createCategory(u: AuthUser, b: z.infer<typeof categorySchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        description: string;
        active: boolean;
        guildId: string | null;
        name: string;
        position: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        archivedAt: Date | null;
        emoji: string | null;
        staffRoleIds: string[];
        accessRoleNames: string[];
        formVersion: number;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        maxOpen: number;
        cooldownMinutes: number;
        defaultPriorityId: string | null;
        welcomeTitle: string;
        welcomeMessage: string;
        mentionStaff: boolean;
        mentionText: string;
        buttons: import("@prisma/client/runtime/library").JsonValue;
        claimMode: string;
        claimMessage: string;
        claimNotifyStaff: boolean;
        creatorCanClose: boolean;
        closeReasonMode: string;
        closeReasonSource: string;
        closeRemovesAccess: boolean;
        allowReopen: boolean;
        transcriptOnClose: boolean;
        transcriptChannelId: string | null;
        transcriptToUser: boolean;
        ratingEnabled: boolean;
        ratingQuestion: string;
        autoCloseMinutes: number;
        autoCloseWarnMinutes: number;
        autoCloseMessage: string;
        deleteAfterMinutes: number;
        escalationRoleIds: string[];
        escalationPriorityId: string | null;
        escalationMessage: string;
        welcomeImageUrl: string | null;
        capacity: number;
        creatorCanAddUsers: boolean;
        claimDiscordCategoryId: string | null;
        claimLocksChat: boolean;
        autoClaimOnMessage: boolean;
        autoUnclaimMinutes: number;
        staffAlertMinutes: number;
        closeRequestCloses: boolean;
        departmentId: string | null;
        confidential: boolean;
        formMode: string;
        escalateUnassignedMinutes: number;
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    updateCategory(u: AuthUser, id: string, b: z.infer<typeof categorySchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        description: string;
        active: boolean;
        guildId: string | null;
        name: string;
        position: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        archivedAt: Date | null;
        emoji: string | null;
        staffRoleIds: string[];
        accessRoleNames: string[];
        formVersion: number;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        maxOpen: number;
        cooldownMinutes: number;
        defaultPriorityId: string | null;
        welcomeTitle: string;
        welcomeMessage: string;
        mentionStaff: boolean;
        mentionText: string;
        buttons: import("@prisma/client/runtime/library").JsonValue;
        claimMode: string;
        claimMessage: string;
        claimNotifyStaff: boolean;
        creatorCanClose: boolean;
        closeReasonMode: string;
        closeReasonSource: string;
        closeRemovesAccess: boolean;
        allowReopen: boolean;
        transcriptOnClose: boolean;
        transcriptChannelId: string | null;
        transcriptToUser: boolean;
        ratingEnabled: boolean;
        ratingQuestion: string;
        autoCloseMinutes: number;
        autoCloseWarnMinutes: number;
        autoCloseMessage: string;
        deleteAfterMinutes: number;
        escalationRoleIds: string[];
        escalationPriorityId: string | null;
        escalationMessage: string;
        welcomeImageUrl: string | null;
        capacity: number;
        creatorCanAddUsers: boolean;
        claimDiscordCategoryId: string | null;
        claimLocksChat: boolean;
        autoClaimOnMessage: boolean;
        autoUnclaimMinutes: number;
        staffAlertMinutes: number;
        closeRequestCloses: boolean;
        departmentId: string | null;
        confidential: boolean;
        formMode: string;
        escalateUnassignedMinutes: number;
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    dupCategory(u: AuthUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        description: string;
        active: boolean;
        guildId: string | null;
        name: string;
        position: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        archivedAt: Date | null;
        emoji: string | null;
        staffRoleIds: string[];
        accessRoleNames: string[];
        formVersion: number;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        maxOpen: number;
        cooldownMinutes: number;
        defaultPriorityId: string | null;
        welcomeTitle: string;
        welcomeMessage: string;
        mentionStaff: boolean;
        mentionText: string;
        buttons: import("@prisma/client/runtime/library").JsonValue;
        claimMode: string;
        claimMessage: string;
        claimNotifyStaff: boolean;
        creatorCanClose: boolean;
        closeReasonMode: string;
        closeReasonSource: string;
        closeRemovesAccess: boolean;
        allowReopen: boolean;
        transcriptOnClose: boolean;
        transcriptChannelId: string | null;
        transcriptToUser: boolean;
        ratingEnabled: boolean;
        ratingQuestion: string;
        autoCloseMinutes: number;
        autoCloseWarnMinutes: number;
        autoCloseMessage: string;
        deleteAfterMinutes: number;
        escalationRoleIds: string[];
        escalationPriorityId: string | null;
        escalationMessage: string;
        welcomeImageUrl: string | null;
        capacity: number;
        creatorCanAddUsers: boolean;
        claimDiscordCategoryId: string | null;
        claimLocksChat: boolean;
        autoClaimOnMessage: boolean;
        autoUnclaimMinutes: number;
        staffAlertMinutes: number;
        closeRequestCloses: boolean;
        departmentId: string | null;
        confidential: boolean;
        formMode: string;
        escalateUnassignedMinutes: number;
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    delCategory(u: AuthUser, id: string): Promise<void>;
    createPanel(u: AuthUser, b: z.infer<typeof panelSchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        title: string;
        description: string;
        guildId: string | null;
        name: string;
        position: number;
        channelId: string | null;
        messageId: string | null;
        emoji: string | null;
        thumbnailUrl: string | null;
        imageUrl: string | null;
        bannerUrl: string | null;
        footer: string | null;
        footerIconUrl: string | null;
        authorName: string | null;
        authorIconUrl: string | null;
        style: string;
        placeholder: string;
        categoryIds: string[];
        allowedRoleIds: string[];
        showLoad: boolean;
        messageChannelId: string | null;
        publishedAt: Date | null;
        publishError: string | null;
    }>;
    updatePanel(u: AuthUser, id: string, b: z.infer<typeof panelSchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        title: string;
        description: string;
        guildId: string | null;
        name: string;
        position: number;
        channelId: string | null;
        messageId: string | null;
        emoji: string | null;
        thumbnailUrl: string | null;
        imageUrl: string | null;
        bannerUrl: string | null;
        footer: string | null;
        footerIconUrl: string | null;
        authorName: string | null;
        authorIconUrl: string | null;
        style: string;
        placeholder: string;
        categoryIds: string[];
        allowedRoleIds: string[];
        showLoad: boolean;
        messageChannelId: string | null;
        publishedAt: Date | null;
        publishError: string | null;
    }>;
    dupPanel(u: AuthUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        title: string;
        description: string;
        guildId: string | null;
        name: string;
        position: number;
        channelId: string | null;
        messageId: string | null;
        emoji: string | null;
        thumbnailUrl: string | null;
        imageUrl: string | null;
        bannerUrl: string | null;
        footer: string | null;
        footerIconUrl: string | null;
        authorName: string | null;
        authorIconUrl: string | null;
        style: string;
        placeholder: string;
        categoryIds: string[];
        allowedRoleIds: string[];
        showLoad: boolean;
        messageChannelId: string | null;
        publishedAt: Date | null;
        publishError: string | null;
    }>;
    delPanel(u: AuthUser, id: string): Promise<void>;
    preview(id: string): Promise<import("@enrp/shared").MessageSpec>;
    publish(u: AuthUser, id: string, b: {
        channelId?: string;
    }): Promise<{
        ok: boolean;
        updating: boolean;
    }>;
    createStatus(u: AuthUser, b: z.infer<typeof statusSchema>): Promise<{
        id: string;
        color: number;
        name: string;
        kind: string;
        position: number;
        key: string | null;
        emoji: string;
        isDefault: boolean;
        isClaimed: boolean;
        isEscalation: boolean;
        isClose: boolean;
    }>;
    updateStatus(u: AuthUser, id: string, b: z.infer<typeof statusSchema>): Promise<{
        id: string;
        color: number;
        name: string;
        kind: string;
        position: number;
        key: string | null;
        emoji: string;
        isDefault: boolean;
        isClaimed: boolean;
        isEscalation: boolean;
        isClose: boolean;
    }>;
    delStatus(u: AuthUser, id: string): Promise<void>;
    createPriority(u: AuthUser, b: z.infer<typeof prioritySchema>): Promise<{
        id: string;
        color: number;
        name: string;
        position: number;
        emoji: string;
        isDefault: boolean;
        allowedRoleNames: string[];
        notifyRoleIds: string[];
        firstResponseMinutes: number | null;
        resolutionMinutes: number | null;
    }>;
    updatePriority(u: AuthUser, id: string, b: z.infer<typeof prioritySchema>): Promise<{
        id: string;
        color: number;
        name: string;
        position: number;
        emoji: string;
        isDefault: boolean;
        allowedRoleNames: string[];
        notifyRoleIds: string[];
        firstResponseMinutes: number | null;
        resolutionMinutes: number | null;
    }>;
    delPriority(u: AuthUser, id: string): Promise<void>;
    createReason(u: AuthUser, b: z.infer<typeof reasonSchema>): Promise<{
        id: string;
        position: number;
        text: string;
    }>;
    updateReason(u: AuthUser, id: string, b: z.infer<typeof reasonSchema>): Promise<{
        id: string;
        position: number;
        text: string;
    }>;
    delReason(u: AuthUser, id: string): Promise<void>;
    createDepartment(u: AuthUser, b: z.infer<typeof departmentSchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string;
        active: boolean;
        name: string;
        position: number;
        emoji: string | null;
        staffRoleIds: string[];
        leadRoleIds: string[];
        accessRoleNames: string[];
        notifyChannelId: string | null;
    }>;
    updateDepartment(u: AuthUser, id: string, b: z.infer<typeof departmentSchema>): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        description: string;
        active: boolean;
        name: string;
        position: number;
        emoji: string | null;
        staffRoleIds: string[];
        leadRoleIds: string[];
        accessRoleNames: string[];
        notifyChannelId: string | null;
    }>;
    delDepartment(u: AuthUser, id: string): Promise<void>;
    archiveCategory(u: AuthUser, id: string, b: {
        archived: boolean;
    }): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: number;
        description: string;
        active: boolean;
        guildId: string | null;
        name: string;
        position: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        archivedAt: Date | null;
        emoji: string | null;
        staffRoleIds: string[];
        accessRoleNames: string[];
        formVersion: number;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        maxOpen: number;
        cooldownMinutes: number;
        defaultPriorityId: string | null;
        welcomeTitle: string;
        welcomeMessage: string;
        mentionStaff: boolean;
        mentionText: string;
        buttons: import("@prisma/client/runtime/library").JsonValue;
        claimMode: string;
        claimMessage: string;
        claimNotifyStaff: boolean;
        creatorCanClose: boolean;
        closeReasonMode: string;
        closeReasonSource: string;
        closeRemovesAccess: boolean;
        allowReopen: boolean;
        transcriptOnClose: boolean;
        transcriptChannelId: string | null;
        transcriptToUser: boolean;
        ratingEnabled: boolean;
        ratingQuestion: string;
        autoCloseMinutes: number;
        autoCloseWarnMinutes: number;
        autoCloseMessage: string;
        deleteAfterMinutes: number;
        escalationRoleIds: string[];
        escalationPriorityId: string | null;
        escalationMessage: string;
        welcomeImageUrl: string | null;
        capacity: number;
        creatorCanAddUsers: boolean;
        claimDiscordCategoryId: string | null;
        claimLocksChat: boolean;
        autoClaimOnMessage: boolean;
        autoUnclaimMinutes: number;
        staffAlertMinutes: number;
        closeRequestCloses: boolean;
        departmentId: string | null;
        confidential: boolean;
        formMode: string;
        escalateUnassignedMinutes: number;
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    formVersions(id: string): import("@prisma/client").Prisma.PrismaPromise<{
        id: string;
        createdById: string | null;
        createdAt: Date;
        version: number;
        categoryId: string;
        createdByName: string | null;
        fields: import("@prisma/client/runtime/library").JsonValue;
    }[]>;
    /** Formular testen: serverseitige Prüfung wie beim Einreichen, es entsteht KEIN Ticket. */
    previewForm(b: z.infer<typeof previewQ>): {
        steps: string[][];
        ok: boolean;
        errors: Record<string, string>;
        answers: import("@enrp/shared").FormAnswer[];
    };
    list(u: AuthUser, q: z.infer<typeof listQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        items: {
            id: string;
            number: string;
            ref: string;
            subject: string | null;
            name: string;
            guildId: string;
            creatorId: string;
            creatorName: string;
            claimers: string[];
            locked: boolean;
            createdAt: Date;
            closedAt: Date | null;
            deletedAt: Date | null;
            escalatedAt: Date | null;
            waitingSince: Date | null;
            category: {
                id: string;
                name: string;
                emoji: string | null;
                confidential: boolean;
            } | null;
            department: {
                id: string;
                name: string;
                emoji: string | null;
            } | null;
            status: {
                id: string;
                color: number;
                name: string;
                kind: string;
                position: number;
                key: string | null;
                emoji: string;
                isDefault: boolean;
                isClaimed: boolean;
                isEscalation: boolean;
                isClose: boolean;
            } | null;
            priority: {
                id: string;
                color: number;
                name: string;
                position: number;
                emoji: string;
                isDefault: boolean;
                allowedRoleNames: string[];
                notifyRoleIds: string[];
                firstResponseMinutes: number | null;
                resolutionMinutes: number | null;
            } | null;
            sla: {
                firstDueAt: Date | null;
                resolveDueAt: Date | null;
                overdue: boolean;
                paused: boolean;
            };
        }[];
    }>;
    create(u: AuthUser, b: z.infer<typeof openQ>): Promise<{
        ticket: ReturnType<SupportTicketsService["summary"]>;
        effects: import("@enrp/shared").TicketEffect[];
        existing?: boolean;
    } | {
        form: {
            categoryId: string;
            panelId: string | null;
        };
    }>;
    stats(u: AuthUser): Promise<{
        names: Record<string, string>;
        total: number;
        open: number;
        closed: number;
        archived: number;
        today: number;
        week: number;
        month: number;
        avgFirstResponseMinutes: number | null;
        avgCloseMinutes: number | null;
        escalations: number;
        perCategory: {
            id: string;
            name: string;
            total: number;
            open: number;
        }[];
        perStaff: {
            tickets: number;
            closed: number;
            discordId: string;
        }[];
        ratings: {
            count: number;
            average: number | null;
            positive: number;
            negative: number;
            perStaff: {
                discordId: string;
                count: number;
                average: number | null;
            }[];
            perCategory: {
                id: string;
                name: string;
                count: number;
                average: number | null;
            }[];
        };
    }>;
    overview(u: AuthUser, q: {
        guildId?: string;
    }): Promise<{
        open: number;
        unassigned: number;
        inProgress: number;
        waiting: number;
        overdue: number;
        closed: number;
        archived: number;
    }>;
    auditLog(q: z.infer<typeof auditQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        items: {
            actorName: string | null;
            result: string;
            id: string;
            createdAt: Date;
            entityId: string | null;
            entityType: string | null;
            action: string;
            actorUserId: string | null;
            after: import("@prisma/client/runtime/library").JsonValue;
            requestId: string | null;
        }[];
    }>;
    /** Transkript-Seite /transcript/EMD-000123: Versionen (Mitarbeiter mit Zugriff oder der Ersteller selbst – Prüfung im Service). */
    byRef(u: AuthUser, ref: string, res: Response): Promise<{
        ticketId: string | null;
        ref: string;
        subject: string | null;
        category: {
            name: string;
            emoji: string | null;
        } | null;
        createdAt: Date;
        closedAt: Date | null;
        as: "staff" | "creator";
        canExport: boolean;
        canJson: boolean;
        canManage: boolean;
        versions: {
            lastError: string | null;
            createdByName: string | null;
            id: string;
            status: string;
            createdAt: Date;
            version: number;
            trigger: string;
            attempts: number;
            sizeBytes: number;
            completedAt: Date | null;
            sha256: string | null;
        }[];
    }>;
    ratings(u: AuthUser, q: z.infer<typeof ratingQ>): Promise<{
        total: number;
        summary: {
            count: number;
            average: number | null;
            positive: number;
            negative: number;
            perStaff: {
                discordId: string;
                count: number;
                average: number | null;
            }[];
            perCategory: {
                id: string;
                name: string;
                count: number;
                average: number | null;
            }[];
        };
        names: Record<string, string>;
        items: {
            ticket: {
                number: string;
                creatorName: string;
            } | null;
            category: string;
            id: string;
            createdAt: Date;
            categoryId: string;
            comment: string | null;
            ticketId: string;
            creatorId: string;
            staffIds: string[];
            stars: number;
        }[];
    }>;
    transcripts(u: AuthUser, q: z.infer<typeof transcriptQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        items: {
            ref: string;
            ticketNumber: string;
            id: string;
            status: string;
            createdAt: Date;
            version: number;
            lastError: string | null;
            createdByName: string | null;
            attempts: number;
            ticketId: string;
            creatorId: string;
            creatorName: string;
            claimers: string[];
            categoryName: string;
            statusName: string;
            sizeBytes: number;
            completedAt: Date | null;
        }[];
    }>;
    /** Transkript abrufen: HTML (Ansicht/Download), TXT oder JSON. Zugriff wird bei jedem Abruf im Service geprüft und protokolliert. */
    transcript(u: AuthUser, id: string, download: string | undefined, format: string | undefined, res: Response): Promise<void>;
    delTranscript(u: AuthUser, id: string): Promise<{
        ok: boolean;
    }>;
    attachment(u: AuthUser, key: string, res: Response): Promise<void>;
    detail(u: AuthUser, id: string): Promise<{
        number: string;
        ref: string;
        transcriptUrl: string;
        category: {
            id: string;
            name: string;
            emoji: string | null;
            claimMode: string;
            closeReasonMode: string;
            closeReasonSource: string;
            allowReopen: boolean;
            confidential: boolean;
            active: boolean;
        };
        department: {
            id: string;
            name: string;
            emoji: string | null;
        } | null;
        formVersion: {
            createdAt: Date;
            version: number;
        } | null;
        sla: {
            firstDueAt: Date | null;
            resolveDueAt: Date | null;
            paused: boolean;
            firstOverdue: boolean;
            resolveOverdue: boolean;
        };
        status: {
            id: string;
            color: number;
            name: string;
            kind: string;
            position: number;
            key: string | null;
            emoji: string;
            isDefault: boolean;
            isClaimed: boolean;
            isEscalation: boolean;
            isClose: boolean;
        } | null;
        priority: {
            id: string;
            color: number;
            name: string;
            position: number;
            emoji: string;
            isDefault: boolean;
            allowedRoleNames: string[];
            notifyRoleIds: string[];
            firstResponseMinutes: number | null;
            resolutionMinutes: number | null;
        } | null;
        access: {
            id: string;
            createdAt: Date;
            expiresAt: Date | null;
            kind: string;
            addedById: string | null;
            ticketId: string;
            targetId: string;
        }[];
        messages: {
            id: string;
            createdAt: Date;
            authorId: string;
            discordId: string | null;
            attachments: import("@prisma/client/runtime/library").JsonValue;
            content: string;
            authorName: string;
            ticketId: string;
            authorAvatar: string | null;
            isStaff: boolean;
            isBot: boolean;
            embeds: import("@prisma/client/runtime/library").JsonValue;
        }[];
        notes: {
            id: string;
            createdAt: Date;
            authorId: string | null;
            text: string;
            authorName: string;
            ticketId: string;
            authorUserId: string | null;
        }[] | null;
        logs: {
            id: string;
            createdAt: Date;
            action: string;
            actorId: string | null;
            detail: import("@prisma/client/runtime/library").JsonValue;
            ticketId: string;
            actorName: string | null;
        }[];
        transcripts: {
            id: string;
            status: string;
            createdAt: Date;
            version: number;
            trigger: string;
            lastError: string | null;
            createdByName: string | null;
            attempts: number;
            sizeBytes: number;
            completedAt: Date | null;
            sha256: string | null;
        }[] | null;
        rating: {
            id: string;
            createdAt: Date;
            categoryId: string;
            comment: string | null;
            ticketId: string;
            creatorId: string;
            staffIds: string[];
            stars: number;
        } | null;
        names: Record<string, string>;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastActivityAt: Date;
        closedAt: Date | null;
        guildId: string;
        name: string;
        categoryId: string;
        channelId: string | null;
        archivedAt: Date | null;
        deletedAt: Date | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        panelId: string | null;
        departmentId: string | null;
        controlMessageId: string | null;
        creatorId: string;
        creatorName: string;
        creatorUserId: string | null;
        statusId: string;
        priorityId: string | null;
        claimers: string[];
        questionIndex: number;
        locked: boolean;
        closeReason: string | null;
        closedById: string | null;
        closedByName: string | null;
        firstResponseAt: Date | null;
        warnedAt: Date | null;
        staffAlertedAt: Date | null;
        closeRequestedAt: Date | null;
        deleteAt: Date | null;
        escalatedAt: Date | null;
        subject: string | null;
        openKey: string | null;
        waitingSince: Date | null;
        waitingSeconds: number;
        firstResponseDueAt: Date | null;
        resolveDueAt: Date | null;
        slaFirstWarnedAt: Date | null;
        slaResolveWarnedAt: Date | null;
        slaEscalatedAt: Date | null;
        unassignedEscalatedAt: Date | null;
        resolvedAt: Date | null;
        userMessageNotifiedAt: Date | null;
    }>;
    options(u: AuthUser, id: string): Promise<{
        closed: boolean;
        statuses: {
            id: string;
            color: number;
            name: string;
            kind: string;
            position: number;
            key: string | null;
            emoji: string;
            isDefault: boolean;
            isClaimed: boolean;
            isEscalation: boolean;
            isClose: boolean;
        }[];
        priorities: {
            id: string;
            color: number;
            name: string;
            position: number;
            emoji: string;
            isDefault: boolean;
            allowedRoleNames: string[];
            notifyRoleIds: string[];
            firstResponseMinutes: number | null;
            resolutionMinutes: number | null;
        }[];
        categories: {
            id: string;
            name: string;
            emoji: string | null;
        }[];
        reasons: {
            id: string;
            position: number;
            text: string;
        }[];
        access: {
            id: string;
            createdAt: Date;
            expiresAt: Date | null;
            kind: string;
            addedById: string | null;
            ticketId: string;
            targetId: string;
        }[];
        departments: {
            id: string;
            name: string;
            emoji: string | null;
        }[];
        close: {
            mode: string;
            source: string;
        };
    }>;
    /** Alle Ticket-Aktionen (Web und Discord-Buttons); jede Aktion prüft ihr eigenes Recht. */
    action(u: AuthUser, id: string, b: z.infer<typeof actionSchema>): Promise<{
        ok: boolean;
        message: string;
        ticket: {
            id: string;
            number: string;
            ref: string;
            subject: string | null;
            name: string;
            channelId: string | null;
            category: {
                id: string;
                name: string;
                emoji: string | null;
            };
            department: {
                id: string;
                name: string;
            } | null;
            status: {
                id: string;
                color: number;
                name: string;
                kind: string;
                position: number;
                key: string | null;
                emoji: string;
                isDefault: boolean;
                isClaimed: boolean;
                isEscalation: boolean;
                isClose: boolean;
            };
            priority: {
                id: string;
                color: number;
                name: string;
                position: number;
                emoji: string;
                isDefault: boolean;
                allowedRoleNames: string[];
                notifyRoleIds: string[];
                firstResponseMinutes: number | null;
                resolutionMinutes: number | null;
            } | null;
            claimers: string[];
            creatorId: string;
            creatorName: string;
            locked: boolean;
            closedAt: Date | null;
            createdAt: Date;
        };
        effects: import("@enrp/shared").TicketEffect[];
    }>;
}
declare const botOpen: z.ZodObject<{
    categoryId: z.ZodString;
    panelId: z.ZodOptional<z.ZodString>;
    guildId: z.ZodString;
    discordId: z.ZodString;
    discordName: z.ZodString;
    memberRoleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    interactionId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    guildId: string;
    discordId: string;
    discordName: string;
    categoryId: string;
    memberRoleIds: string[];
    panelId?: string | undefined;
    interactionId?: string | undefined;
}, {
    guildId: string;
    discordId: string;
    discordName: string;
    categoryId: string;
    panelId?: string | undefined;
    memberRoleIds?: string[] | undefined;
    interactionId?: string | undefined;
}>;
declare const formSubmit: z.ZodObject<{
    discordId: z.ZodString;
    step: z.ZodNumber;
    values: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">, z.ZodBoolean, z.ZodNull]>>>;
    files: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
        size: z.ZodNumber;
        contentType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }, {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    discordId: string;
    step: number;
    values: Record<string, string | boolean | string[] | null>;
    files: Record<string, {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }[]>;
}, {
    discordId: string;
    step: number;
    values?: Record<string, string | boolean | string[] | null> | undefined;
    files?: Record<string, {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }[]> | undefined;
}>;
declare const botMessage: z.ZodObject<{
    channelId: z.ZodString;
    discordMessageId: z.ZodString;
    authorId: z.ZodString;
    authorName: z.ZodString;
    authorAvatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isBot: z.ZodBoolean;
    content: z.ZodString;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
        size: z.ZodNumber;
        contentType: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }, {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }>, "many">>;
    embeds: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        title?: string | undefined;
        description?: string | undefined;
    }, {
        title?: string | undefined;
        description?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    authorId: string;
    attachments: {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }[];
    channelId: string;
    content: string;
    authorName: string;
    isBot: boolean;
    embeds: {
        title?: string | undefined;
        description?: string | undefined;
    }[];
    discordMessageId: string;
    authorAvatar?: string | null | undefined;
}, {
    authorId: string;
    channelId: string;
    content: string;
    authorName: string;
    isBot: boolean;
    discordMessageId: string;
    attachments?: {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }[] | undefined;
    authorAvatar?: string | null | undefined;
    embeds?: {
        title?: string | undefined;
        description?: string | undefined;
    }[] | undefined;
}>;
/** Dienst-Endpunkte für den Bot (Ersteller ohne Konto, Channel-Meldungen, Panels, Transcripts). */
export declare class BotSupportTicketsController {
    private readonly s;
    constructor(s: SupportTicketsService);
    open(b: z.infer<typeof botOpen>): Promise<{
        ticket: ReturnType<SupportTicketsService["summary"]>;
        effects: import("@enrp/shared").TicketEffect[];
        existing?: boolean;
    } | {
        form: {
            categoryId: string;
            panelId: string | null;
        };
    }>;
    formStart(b: z.infer<typeof botOpen>): Promise<{
        open: true;
        draftId?: undefined;
        steps?: undefined;
        modal?: undefined;
    } | {
        draftId: string;
        steps: number;
        modal: import("@enrp/shared").FormModalSpec;
        open?: undefined;
    }>;
    formModal(id: string, q: {
        discordId: string;
        step: number;
    }): Promise<{
        modal: import("@enrp/shared").FormModalSpec;
    }>;
    formSubmitStep(id: string, b: z.infer<typeof formSubmit>): Promise<{
        ticket: ReturnType<SupportTicketsService["summary"]>;
        effects: import("@enrp/shared").TicketEffect[];
        existing?: boolean;
    } | {
        errors: {
            field: string;
            message: string;
        }[];
        step: number;
        next?: undefined;
        steps?: undefined;
    } | {
        next: number;
        steps: number;
        errors?: undefined;
        step?: undefined;
    }>;
    panelFailed(id: string, b: {
        error: string;
    }): Promise<{
        ok: boolean;
    }>;
    attach(id: string, b: {
        channelId: string;
        controlMessageId: string | null;
    }): Promise<{
        ok: boolean;
    }>;
    abort(id: string, b: {
        reason: string;
    }): Promise<{
        ok: boolean;
    }>;
    answer(id: string, b: {
        discordId: string;
        questionId: string;
        values: string[] | null;
    }): Promise<{
        answer: string;
        done: boolean;
        effects: import("@enrp/shared").TicketEffect[];
    }>;
    closeRequest(id: string, b: {
        discordId: string;
        accept: boolean;
    }): Promise<{
        ok: boolean;
        message: string;
        effects: import("@enrp/shared").TicketEffect[];
    }>;
    creatorAdd(id: string, b: {
        discordId: string;
        targetId: string;
    }): Promise<{
        ok: boolean;
        message: string;
        effects: import("@enrp/shared").TicketEffect[];
    }>;
    creatorClose(id: string, b: {
        discordId: string;
        reason?: string;
    }): Promise<{
        ok: boolean;
        message: string;
        effects: import("@enrp/shared").TicketEffect[];
    }>;
    rate(id: string, b: {
        discordId: string;
        stars: number;
    }): Promise<{
        ok: boolean;
        thanks: string;
    }>;
    rateComment(id: string, b: {
        discordId: string;
        comment: string;
    }): Promise<{
        ok: boolean;
    }>;
    message(b: z.infer<typeof botMessage>): Promise<{
        ok: boolean;
    }>;
    channels(): Promise<string[]>;
    categories(q: {
        guildId?: string;
    }): Promise<{
        id: string;
        name: string;
        emoji: string | null;
        description: string;
        requiredRoleIds: string[];
        allowedUserIds: string[];
    }[]>;
    closeOptions(id: string): Promise<{
        mode: string;
        source: string;
        reasons: string[];
        closed: boolean;
    }>;
    posted(id: string, b: {
        channelId: string;
        messageId: string;
    }): Promise<{
        ok: boolean;
    }>;
    transcript(id: string): Promise<{
        html: string;
    }>;
}
export {};
