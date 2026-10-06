import type { Response } from 'express';
import { z } from 'zod';
import type { AuthUser } from '../common/request-context';
import { SupportTicketsService } from './tickets.service';
import { TicketConfigService } from './config.service';
import { categorySchema, panelSchema, prioritySchema, reasonSchema, settingsSchema, statusSchema } from './config.schemas';
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
    action: "add_access";
    targetId: string;
    kind: "ROLE" | "USER";
    minutes?: number | undefined;
}, {
    action: "add_access";
    targetId: string;
    kind: "ROLE" | "USER";
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
    action: "category";
    categoryId: string;
}, {
    action: "category";
    categoryId: string;
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
    action: "note";
    text: string;
}, {
    action: "note";
    text: string;
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
}>]>;
declare const listQ: z.ZodObject<{
    kind: z.ZodOptional<z.ZodEnum<["open", "closed", "archived", "escalated", "deleted", "all"]>>;
    statusId: z.ZodOptional<z.ZodString>;
    priorityId: z.ZodOptional<z.ZodString>;
    categoryId: z.ZodOptional<z.ZodString>;
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
    q?: string | undefined;
    kind?: "open" | "archived" | "all" | "closed" | "escalated" | "deleted" | undefined;
    to?: Date | undefined;
    categoryId?: string | undefined;
    statusId?: string | undefined;
    priorityId?: string | undefined;
    creator?: string | undefined;
    from?: Date | undefined;
    claimer?: string | undefined;
}, {
    guildId?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    kind?: "open" | "archived" | "all" | "closed" | "escalated" | "deleted" | undefined;
    to?: Date | undefined;
    categoryId?: string | undefined;
    statusId?: string | undefined;
    priorityId?: string | undefined;
    creator?: string | undefined;
    from?: Date | undefined;
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
    q?: string | undefined;
    to?: Date | undefined;
    staff?: string | undefined;
    creator?: string | undefined;
    from?: Date | undefined;
    categoryName?: string | undefined;
}, {
    number?: number | undefined;
    status?: string | undefined;
    page?: number | undefined;
    pageSize?: number | undefined;
    q?: string | undefined;
    to?: Date | undefined;
    staff?: string | undefined;
    creator?: string | undefined;
    from?: Date | undefined;
    categoryName?: string | undefined;
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
    page?: number | undefined;
    pageSize?: number | undefined;
    categoryId?: string | undefined;
    stars?: number | undefined;
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
            name: string;
            description: string;
            active: boolean;
            updatedAt: Date;
            guildId: string | null;
            color: number;
            cooldownMinutes: number;
            questions: import("@prisma/client/runtime/library").JsonValue;
            position: number;
            emoji: string | null;
            buttonStyle: string;
            discordCategoryId: string | null;
            channelNameFormat: string;
            staffRoleIds: string[];
            extraRoleIds: string[];
            requiredRoleIds: string[];
            allowedUserIds: string[];
            accessRoleNames: string[];
            maxOpen: number;
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
        } & {
            buttons: import("@enrp/shared").TicketButtonConfig[];
            questions: import("@enrp/shared").TicketQuestion[];
        })[];
        panels: {
            id: string;
            createdAt: Date;
            name: string;
            description: string;
            updatedAt: Date;
            guildId: string | null;
            color: number;
            imageUrl: string | null;
            title: string;
            channelId: string | null;
            position: number;
            placeholder: string;
            emoji: string | null;
            style: string;
            thumbnailUrl: string | null;
            bannerUrl: string | null;
            footer: string | null;
            footerIconUrl: string | null;
            authorName: string | null;
            authorIconUrl: string | null;
            categoryIds: string[];
            allowedRoleIds: string[];
            messageChannelId: string | null;
            messageId: string | null;
        }[];
        statuses: {
            id: string;
            name: string;
            color: number;
            kind: string;
            position: number;
            emoji: string;
            isDefault: boolean;
            isClaimed: boolean;
            isEscalation: boolean;
            isClose: boolean;
        }[];
        priorities: {
            id: string;
            name: string;
            color: number;
            position: number;
            emoji: string;
            isDefault: boolean;
            allowedRoleNames: string[];
            notifyRoleIds: string[];
        }[];
        reasons: {
            id: string;
            text: string;
            position: number;
        }[];
        settings: {
            transcriptChannelId: string | null;
            logChannelId: string | null;
            closedTitle: string;
            closedMessage: string;
            closedColor: number;
            reopenedMessage: string;
            ratingMessage: string;
            ratingThanks: string;
            transcriptRetentionDays: number;
        };
    }>;
    settings(u: AuthUser, b: z.infer<typeof settingsSchema>): Promise<{
        transcriptChannelId: string | null;
        logChannelId: string | null;
        closedTitle: string;
        closedMessage: string;
        closedColor: number;
        reopenedMessage: string;
        ratingMessage: string;
        ratingThanks: string;
        transcriptRetentionDays: number;
    }>;
    createCategory(u: AuthUser, b: z.infer<typeof categorySchema>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        color: number;
        cooldownMinutes: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        position: number;
        emoji: string | null;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        staffRoleIds: string[];
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        accessRoleNames: string[];
        maxOpen: number;
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
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    updateCategory(u: AuthUser, id: string, b: z.infer<typeof categorySchema>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        color: number;
        cooldownMinutes: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        position: number;
        emoji: string | null;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        staffRoleIds: string[];
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        accessRoleNames: string[];
        maxOpen: number;
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
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    dupCategory(u: AuthUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        active: boolean;
        updatedAt: Date;
        guildId: string | null;
        color: number;
        cooldownMinutes: number;
        questions: import("@prisma/client/runtime/library").JsonValue;
        position: number;
        emoji: string | null;
        buttonStyle: string;
        discordCategoryId: string | null;
        channelNameFormat: string;
        staffRoleIds: string[];
        extraRoleIds: string[];
        requiredRoleIds: string[];
        allowedUserIds: string[];
        accessRoleNames: string[];
        maxOpen: number;
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
    } & {
        buttons: import("@enrp/shared").TicketButtonConfig[];
        questions: import("@enrp/shared").TicketQuestion[];
    }>;
    delCategory(u: AuthUser, id: string): Promise<void>;
    createPanel(u: AuthUser, b: z.infer<typeof panelSchema>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        updatedAt: Date;
        guildId: string | null;
        color: number;
        imageUrl: string | null;
        title: string;
        channelId: string | null;
        position: number;
        placeholder: string;
        emoji: string | null;
        style: string;
        thumbnailUrl: string | null;
        bannerUrl: string | null;
        footer: string | null;
        footerIconUrl: string | null;
        authorName: string | null;
        authorIconUrl: string | null;
        categoryIds: string[];
        allowedRoleIds: string[];
        messageChannelId: string | null;
        messageId: string | null;
    }>;
    updatePanel(u: AuthUser, id: string, b: z.infer<typeof panelSchema>): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        updatedAt: Date;
        guildId: string | null;
        color: number;
        imageUrl: string | null;
        title: string;
        channelId: string | null;
        position: number;
        placeholder: string;
        emoji: string | null;
        style: string;
        thumbnailUrl: string | null;
        bannerUrl: string | null;
        footer: string | null;
        footerIconUrl: string | null;
        authorName: string | null;
        authorIconUrl: string | null;
        categoryIds: string[];
        allowedRoleIds: string[];
        messageChannelId: string | null;
        messageId: string | null;
    }>;
    dupPanel(u: AuthUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        description: string;
        updatedAt: Date;
        guildId: string | null;
        color: number;
        imageUrl: string | null;
        title: string;
        channelId: string | null;
        position: number;
        placeholder: string;
        emoji: string | null;
        style: string;
        thumbnailUrl: string | null;
        bannerUrl: string | null;
        footer: string | null;
        footerIconUrl: string | null;
        authorName: string | null;
        authorIconUrl: string | null;
        categoryIds: string[];
        allowedRoleIds: string[];
        messageChannelId: string | null;
        messageId: string | null;
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
        name: string;
        color: number;
        kind: string;
        position: number;
        emoji: string;
        isDefault: boolean;
        isClaimed: boolean;
        isEscalation: boolean;
        isClose: boolean;
    }>;
    updateStatus(u: AuthUser, id: string, b: z.infer<typeof statusSchema>): Promise<{
        id: string;
        name: string;
        color: number;
        kind: string;
        position: number;
        emoji: string;
        isDefault: boolean;
        isClaimed: boolean;
        isEscalation: boolean;
        isClose: boolean;
    }>;
    delStatus(u: AuthUser, id: string): Promise<void>;
    createPriority(u: AuthUser, b: z.infer<typeof prioritySchema>): Promise<{
        id: string;
        name: string;
        color: number;
        position: number;
        emoji: string;
        isDefault: boolean;
        allowedRoleNames: string[];
        notifyRoleIds: string[];
    }>;
    updatePriority(u: AuthUser, id: string, b: z.infer<typeof prioritySchema>): Promise<{
        id: string;
        name: string;
        color: number;
        position: number;
        emoji: string;
        isDefault: boolean;
        allowedRoleNames: string[];
        notifyRoleIds: string[];
    }>;
    delPriority(u: AuthUser, id: string): Promise<void>;
    createReason(u: AuthUser, b: z.infer<typeof reasonSchema>): Promise<{
        id: string;
        text: string;
        position: number;
    }>;
    updateReason(u: AuthUser, id: string, b: z.infer<typeof reasonSchema>): Promise<{
        id: string;
        text: string;
        position: number;
    }>;
    delReason(u: AuthUser, id: string): Promise<void>;
    list(u: AuthUser, q: z.infer<typeof listQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        items: {
            id: string;
            number: string;
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
            category: {
                id: string;
                name: string;
                emoji: string | null;
            } | null;
            status: {
                id: string;
                name: string;
                color: number;
                kind: string;
                position: number;
                emoji: string;
                isDefault: boolean;
                isClaimed: boolean;
                isEscalation: boolean;
                isClose: boolean;
            } | null;
            priority: {
                id: string;
                name: string;
                color: number;
                position: number;
                emoji: string;
                isDefault: boolean;
                allowedRoleNames: string[];
                notifyRoleIds: string[];
            } | null;
        }[];
    }>;
    create(u: AuthUser, b: z.infer<typeof openQ>): Promise<{
        ticket: {
            id: string;
            number: string;
            name: string;
            channelId: string | null;
            category: {
                id: string;
                name: string;
                emoji: string | null;
            };
            status: {
                id: string;
                name: string;
                color: number;
                kind: string;
                position: number;
                emoji: string;
                isDefault: boolean;
                isClaimed: boolean;
                isEscalation: boolean;
                isClose: boolean;
            };
            priority: {
                id: string;
                name: string;
                color: number;
                position: number;
                emoji: string;
                isDefault: boolean;
                allowedRoleNames: string[];
                notifyRoleIds: string[];
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
            creatorId: string;
            ticketId: string;
            staffIds: string[];
            stars: number;
            comment: string | null;
        }[];
    }>;
    transcripts(u: AuthUser, q: z.infer<typeof transcriptQ>): Promise<{
        total: number;
        page: number;
        pageSize: number;
        items: {
            ticketNumber: string;
            id: string;
            createdAt: Date;
            creatorId: string;
            creatorName: string;
            claimers: string[];
            ticketId: string;
            categoryName: string;
            statusName: string;
            sizeBytes: number;
            createdByName: string | null;
        }[];
    }>;
    transcript(u: AuthUser, id: string, download: string | undefined, res: Response): Promise<void>;
    delTranscript(u: AuthUser, id: string): Promise<{
        ok: boolean;
    }>;
    attachment(u: AuthUser, key: string, res: Response): Promise<void>;
    detail(u: AuthUser, id: string): Promise<{
        number: string;
        category: {
            id: string;
            name: string;
            emoji: string | null;
            claimMode: string;
            closeReasonMode: string;
            closeReasonSource: string;
            allowReopen: boolean;
        };
        status: {
            id: string;
            name: string;
            color: number;
            kind: string;
            position: number;
            emoji: string;
            isDefault: boolean;
            isClaimed: boolean;
            isEscalation: boolean;
            isClose: boolean;
        } | null;
        priority: {
            id: string;
            name: string;
            color: number;
            position: number;
            emoji: string;
            isDefault: boolean;
            allowedRoleNames: string[];
            notifyRoleIds: string[];
        } | null;
        access: {
            id: string;
            createdAt: Date;
            expiresAt: Date | null;
            targetId: string;
            kind: string;
            addedById: string | null;
            ticketId: string;
        }[];
        messages: {
            id: string;
            createdAt: Date;
            discordId: string | null;
            authorId: string;
            content: string;
            authorName: string;
            ticketId: string;
            authorAvatar: string | null;
            isStaff: boolean;
            isBot: boolean;
            attachments: import("@prisma/client/runtime/library").JsonValue;
            embeds: import("@prisma/client/runtime/library").JsonValue;
        }[];
        notes: {
            id: string;
            createdAt: Date;
            text: string;
            authorId: string | null;
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
            createdAt: Date;
            sizeBytes: number;
            createdByName: string | null;
        }[] | null;
        rating: {
            id: string;
            createdAt: Date;
            categoryId: string;
            creatorId: string;
            ticketId: string;
            staffIds: string[];
            stars: number;
            comment: string | null;
        } | null;
        names: Record<string, string>;
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        guildId: string;
        closedAt: Date | null;
        channelId: string | null;
        answers: import("@prisma/client/runtime/library").JsonValue;
        deletedAt: Date | null;
        categoryId: string;
        statusId: string;
        priorityId: string | null;
        panelId: string | null;
        controlMessageId: string | null;
        creatorId: string;
        creatorName: string;
        creatorUserId: string | null;
        claimers: string[];
        questionIndex: number;
        locked: boolean;
        closeReason: string | null;
        closedById: string | null;
        closedByName: string | null;
        firstResponseAt: Date | null;
        lastActivityAt: Date;
        warnedAt: Date | null;
        deleteAt: Date | null;
        escalatedAt: Date | null;
    }>;
    options(u: AuthUser, id: string): Promise<{
        closed: boolean;
        statuses: {
            id: string;
            name: string;
            color: number;
            kind: string;
            position: number;
            emoji: string;
            isDefault: boolean;
            isClaimed: boolean;
            isEscalation: boolean;
            isClose: boolean;
        }[];
        priorities: {
            id: string;
            name: string;
            color: number;
            position: number;
            emoji: string;
            isDefault: boolean;
            allowedRoleNames: string[];
            notifyRoleIds: string[];
        }[];
        categories: {
            id: string;
            name: string;
            emoji: string | null;
        }[];
        reasons: {
            id: string;
            text: string;
            position: number;
        }[];
        access: {
            id: string;
            createdAt: Date;
            expiresAt: Date | null;
            targetId: string;
            kind: string;
            addedById: string | null;
            ticketId: string;
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
            name: string;
            channelId: string | null;
            category: {
                id: string;
                name: string;
                emoji: string | null;
            };
            status: {
                id: string;
                name: string;
                color: number;
                kind: string;
                position: number;
                emoji: string;
                isDefault: boolean;
                isClaimed: boolean;
                isEscalation: boolean;
                isClose: boolean;
            };
            priority: {
                id: string;
                name: string;
                color: number;
                position: number;
                emoji: string;
                isDefault: boolean;
                allowedRoleNames: string[];
                notifyRoleIds: string[];
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
}, "strip", z.ZodTypeAny, {
    discordId: string;
    guildId: string;
    discordName: string;
    categoryId: string;
    memberRoleIds: string[];
    panelId?: string | undefined;
}, {
    discordId: string;
    guildId: string;
    discordName: string;
    categoryId: string;
    panelId?: string | undefined;
    memberRoleIds?: string[] | undefined;
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
        description?: string | undefined;
        title?: string | undefined;
    }, {
        description?: string | undefined;
        title?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    authorId: string;
    content: string;
    channelId: string;
    authorName: string;
    isBot: boolean;
    attachments: {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }[];
    embeds: {
        description?: string | undefined;
        title?: string | undefined;
    }[];
    discordMessageId: string;
    authorAvatar?: string | null | undefined;
}, {
    authorId: string;
    content: string;
    channelId: string;
    authorName: string;
    isBot: boolean;
    discordMessageId: string;
    authorAvatar?: string | null | undefined;
    attachments?: {
        name: string;
        size: number;
        url: string;
        contentType?: string | null | undefined;
    }[] | undefined;
    embeds?: {
        description?: string | undefined;
        title?: string | undefined;
    }[] | undefined;
}>;
/** Dienst-Endpunkte für den Bot (Ersteller ohne Konto, Channel-Meldungen, Panels, Transcripts). */
export declare class BotSupportTicketsController {
    private readonly s;
    constructor(s: SupportTicketsService);
    open(b: z.infer<typeof botOpen>): Promise<{
        ticket: {
            id: string;
            number: string;
            name: string;
            channelId: string | null;
            category: {
                id: string;
                name: string;
                emoji: string | null;
            };
            status: {
                id: string;
                name: string;
                color: number;
                kind: string;
                position: number;
                emoji: string;
                isDefault: boolean;
                isClaimed: boolean;
                isEscalation: boolean;
                isClose: boolean;
            };
            priority: {
                id: string;
                name: string;
                color: number;
                position: number;
                emoji: string;
                isDefault: boolean;
                allowedRoleNames: string[];
                notifyRoleIds: string[];
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
