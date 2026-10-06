import { Prisma, type SupportTicket, type TicketPriority, type TicketStatus } from '@prisma/client';
import { type MessageSpec, type TicketEffect } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { TicketConfigService } from './config.service';
import type { TicketSettings } from './config.schemas';
/** Wer handelt: Mitarbeiter (System-Benutzer), Ticket-Ersteller über den Bot oder die Automatik. */
export interface TicketActor {
    userId: string | null;
    discordId: string | null;
    name: string;
    viaBot: boolean;
    system?: boolean;
}
type Category = Awaited<ReturnType<TicketConfigService['category']>>;
interface Loaded {
    t: SupportTicket;
    cat: Category;
    status: TicketStatus;
    priority: TicketPriority | null;
    settings: TicketSettings;
    tz: string;
}
export type ActionInput = {
    action: 'close';
    reason?: string;
} | {
    action: 'reopen';
} | {
    action: 'claim';
} | {
    action: 'unclaim';
    targetId?: string;
} | {
    action: 'add_access';
    targetId: string;
    kind: 'USER' | 'ROLE';
    minutes?: number;
} | {
    action: 'remove_access';
    targetId: string;
} | {
    action: 'priority';
    priorityId: string;
} | {
    action: 'status';
    statusId: string;
} | {
    action: 'category';
    categoryId: string;
} | {
    action: 'rename';
    name: string;
} | {
    action: 'move';
    parentId: string | null;
} | {
    action: 'transcript';
} | {
    action: 'lock';
} | {
    action: 'unlock';
} | {
    action: 'escalate';
} | {
    action: 'note';
    text: string;
} | {
    action: 'rating';
} | {
    action: 'delete';
};
/**
 * Support-Ticket-System. Das System entscheidet (Rechte, Regeln, Daten, Protokoll), der Bot führt die Discord-Seite aus (Effekte).
 * Aktionen aus Discord bekommen ihre Effekte direkt zurück; Aktionen aus dem Web und der Automatik laufen über die Outbox.
 */
export declare class SupportTicketsService {
    private readonly prisma;
    private readonly perms;
    private readonly discord;
    private readonly config;
    private readonly log;
    private readonly dir;
    constructor(prisma: PrismaService, perms: PermissionService, discord: DiscordService, config: TicketConfigService);
    actorFromUser(u: {
        id: string;
        displayName: string;
        sessionId: string;
    }): Promise<TicketActor>;
    private timezone;
    private fmt;
    private load;
    private vars;
    private isClosed;
    /** Ticket-Embed mit Buttons (wird bei jeder Änderung neu gezeichnet). */
    private control;
    /** n = ohne Grund, m = Formular, s = Auswahl (feste Gründe). */
    private closeMode;
    private questionMessage;
    private logAction;
    private dispatch;
    /** Darf der Mitarbeiter diese Kategorie sehen / dieses Recht ausüben? (ticket.manage darf alles) */
    private assertCan;
    private categoryVisible;
    /** IDs der Kategorien, deren Tickets der Benutzer sehen darf (null = alle). */
    visibleCategoryIds(userId: string): Promise<string[] | null>;
    /** Prüft alle Voraussetzungen, legt das Ticket an und liefert den „create“-Effekt (Channel, Rechte, Ticket-Embed, erste Frage). */
    /** `byStaff`: vom Team für ein Mitglied geöffnet (Recht ticket.create) – ohne Rollen-, Limit- und Cooldown-Prüfung. */
    open(d: {
        categoryId: string;
        panelId?: string | null;
        guildId: string;
        discordId: string;
        discordName: string;
        memberRoleIds: string[];
    }, actor: TicketActor, byStaff?: boolean): Promise<{
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
        effects: TicketEffect[];
    }>;
    private checkCanOpen;
    private create;
    /** Ticket aus dem Dashboard für einen Discord-Benutzer öffnen (Recht ticket.create). */
    openFromDashboard(actor: TicketActor, d: {
        categoryId: string;
        discordId: string;
        discordName?: string;
        guildId?: string;
    }): Promise<{
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
        effects: TicketEffect[];
    }>;
    /** Für /ticket im Discord: aktive Ticket-Arten (Voraussetzungen prüft der Bot vorab, das System beim Öffnen erneut). */
    openableCategories(): Promise<{
        id: string;
        name: string;
        emoji: string | null;
        description: string;
        requiredRoleIds: string[];
        allowedUserIds: string[];
    }[]>;
    /** Bot meldet: Channel und Ticket-Embed sind angelegt. */
    attachChannel(id: string, channelId: string, controlMessageId: string | null): Promise<{
        ok: boolean;
    }>;
    /** Bot meldet: Channel konnte nicht angelegt werden → Ticket verwerfen. */
    abort(id: string, reason: string): Promise<{
        ok: boolean;
    }>;
    answer(id: string, discordId: string, questionId: string, values: string[] | null): Promise<{
        answer: string;
        done: boolean;
        effects: TicketEffect[];
    }>;
    action(id: string, actor: TicketActor, input: ActionInput): Promise<{
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
        effects: TicketEffect[];
    }>;
    /** Ersteller schließt sein eigenes Ticket (falls in der Kategorie erlaubt). */
    creatorClose(id: string, discordId: string, reason: string | undefined): Promise<{
        ok: boolean;
        message: string;
        effects: TicketEffect[];
    }>;
    private requireOpen;
    private actorTag;
    private perform;
    /** Schließen (auch für Ersteller und Automatik): Status, Rechte, CLOSED-Anzeige, Transcript, Bewertung, Löschplanung. */
    private close;
    private ratingRequest;
    rate(id: string, discordId: string, stars: number): Promise<{
        ok: boolean;
        thanks: string;
    }>;
    rateComment(id: string, discordId: string, comment: string): Promise<{
        ok: boolean;
    }>;
    /** Bot meldet eine Nachricht aus einem Ticket-Channel (Verlauf + Transcript). */
    message(d: {
        channelId: string;
        discordMessageId: string;
        authorId: string;
        authorName: string;
        authorAvatar?: string | null;
        isBot: boolean;
        content: string;
        attachments: {
            name: string;
            url: string;
            size: number;
            contentType?: string | null;
        }[];
        embeds: {
            title?: string;
            description?: string;
        }[];
    }): Promise<{
        ok: boolean;
    }>;
    private storeAttachment;
    /** Anhang ausliefern (nur mit Zugriff auf das Ticket). Nur Bilder inline, alles andere als Download. */
    attachment(userId: string, key: string): Promise<{
        data: NonSharedBuffer;
        name: string;
        contentType: string;
        inline: boolean;
    }>;
    createTranscript(id: string, actor: TicketActor): Promise<{
        id: string;
        createdById: string | null;
        createdAt: Date;
        creatorId: string;
        creatorName: string;
        claimers: string[];
        ticketId: string;
        ticketNumber: number;
        categoryName: string;
        statusName: string;
        html: string;
        sizeBytes: number;
        createdByName: string | null;
    }>;
    /** Anzeigenamen zu Discord-IDs (verknüpfte Konten, sonst zuletzt gesehener Name in Tickets). */
    private discordNames;
    summary(l: Loaded): {
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
    list(userId: string, f: {
        kind?: string;
        statusId?: string;
        priorityId?: string;
        categoryId?: string;
        claimer?: string;
        creator?: string;
        from?: Date;
        to?: Date;
        q?: string;
        guildId?: string;
        page: number;
        pageSize: number;
    }): Promise<{
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
    detail(userId: string, id: string): Promise<{
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
            attachments: Prisma.JsonValue;
            embeds: Prisma.JsonValue;
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
            detail: Prisma.JsonValue;
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
        answers: Prisma.JsonValue;
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
    /** Auswahllisten für Discord-Menüs (Priorität, Status, Kategorie, Gründe, Zugriff). */
    options(actor: TicketActor, id: string): Promise<{
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
    /** Schließen-Auswahl für den Bot (auch für Ersteller ohne Konto). */
    closeOptions(id: string): Promise<{
        mode: string;
        source: string;
        reasons: string[];
        closed: boolean;
    }>;
    transcripts(userId: string, f: {
        q?: string;
        categoryName?: string;
        creator?: string;
        staff?: string;
        status?: string;
        from?: Date;
        to?: Date;
        number?: number;
        page: number;
        pageSize: number;
    }): Promise<{
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
    transcript(userId: string | null, id: string): Promise<{
        id: string;
        createdById: string | null;
        createdAt: Date;
        creatorId: string;
        creatorName: string;
        claimers: string[];
        ticketId: string;
        ticketNumber: number;
        categoryName: string;
        statusName: string;
        html: string;
        sizeBytes: number;
        createdByName: string | null;
    }>;
    deleteTranscript(actor: TicketActor, id: string): Promise<{
        ok: boolean;
    }>;
    stats(userId: string): Promise<{
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
    private ratingSummary;
    ratings(userId: string, f: {
        stars?: number;
        categoryId?: string;
        page: number;
        pageSize: number;
    }): Promise<{
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
    /** Offene Ticket-Channels (der Bot schneidet nur dort Nachrichten mit). */
    channels(): Promise<string[]>;
    panelMessage(id: string): Promise<MessageSpec>;
    /** Panel in Discord senden bzw. vorhandenes Panel aktualisieren. */
    publishPanel(actor: TicketActor, id: string, channelId?: string | null): Promise<{
        ok: boolean;
        updating: boolean;
    }>;
    panelPosted(id: string, channelId: string, messageId: string): Promise<{
        ok: boolean;
    }>;
    runAutomation(now?: Date): Promise<{
        closed: number;
        warned: number;
        deleted: number;
        expired: number;
    }>;
}
export {};
