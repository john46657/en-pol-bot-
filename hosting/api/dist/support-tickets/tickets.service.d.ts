import { NotifyService } from '../notifications/notify.service';
import { Prisma, type SupportTicket, type TicketDepartment, type TicketPriority, type TicketStatus } from '@prisma/client';
import { type FormAnswer, type FormFile, type FormRawValue, type MessageSpec, type TicketEffect, type TicketQuestion } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { AuditService } from '../audit/audit.service';
import { TicketConfigService } from './config.service';
import { TicketTranscriptService } from './transcript.service';
import type { TicketSettings } from './config.schemas';
/** Wer handelt: Mitarbeiter (System-Benutzer), Ticket-Ersteller über den Bot oder die Automatik. */
export interface TicketActor {
    userId: string | null;
    discordId: string | null;
    name: string;
    viaBot: boolean;
    system?: boolean; /** Korrelations-ID (Automatik) */
    requestId?: string;
}
type Category = Awaited<ReturnType<TicketConfigService['category']>>;
interface Loaded {
    t: SupportTicket;
    cat: Category;
    status: TicketStatus;
    priority: TicketPriority | null;
    settings: TicketSettings;
    tz: string;
    dept: TicketDepartment | null;
}
export type ActionInput = {
    action: 'close';
    reason?: string;
} | {
    action: 'close_request';
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
} | {
    action: 'reply';
    text: string;
} | {
    action: 'assign';
    targetId: string;
} | {
    action: 'department';
    departmentId: string;
} | {
    action: 'request_info';
    text: string;
} | {
    action: 'archive';
} | {
    action: 'transcript_retry';
    transcriptId: string;
};
export interface OpenInput {
    categoryId: string;
    panelId?: string | null;
    guildId: string;
    discordId: string;
    discordName: string;
    memberRoleIds: string[];
    /** Idempotenz-Schlüssel (Discord-Interaktion bzw. Formular-Entwurf) */
    openKey?: string;
    /** geprüfte Formular-Antworten (Formular vor dem Erstellen) */
    form?: {
        version: number;
        answers: FormAnswer[];
        subject?: string | null;
    };
}
export declare const permissionFor: (a: ActionInput["action"]) => string;
/**
 * Support-Ticket-System. Das System entscheidet (Rechte, Regeln, Daten, Protokoll), der Bot führt die Discord-Seite aus (Effekte).
 * Aktionen aus Discord bekommen ihre Effekte direkt zurück; Aktionen aus dem Web und der Automatik laufen über die Outbox.
 */
export declare class SupportTicketsService {
    private readonly prisma;
    private readonly perms;
    private readonly discord;
    private readonly config;
    private readonly notify;
    private readonly audit;
    private readonly transcriptsSvc;
    private readonly log;
    private readonly dir;
    constructor(prisma: PrismaService, perms: PermissionService, discord: DiscordService, config: TicketConfigService, notify: NotifyService, audit: AuditService, transcriptsSvc: TicketTranscriptService);
    /** Einstellungen des Servers, zu dem das Ticket gehört (Ticket-Einstellungen können je Server gelten). */
    private settingsFor;
    ref(n: number, settings?: Pick<TicketSettings, 'refPrefix'>): string;
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
    /** Nur unkritische Metadaten ins Audit (keine Notiztexte, Gründe oder Nachrichten – das Audit kann in Discord-Logkanäle gespiegelt werden). */
    private auditDetail;
    private auditTicket;
    private dispatch;
    /**
     * Darf der Mitarbeiter dieses Ticket sehen / dieses Recht ausüben? Standard: verweigern. ticket.manage darf alles.
     * Abgelehnte Versuche landen im Audit-Protokoll (ohne Inhalte).
     */
    private assertCan;
    private roleNames;
    /**
     * Sichtbarkeit eines Tickets: Systemrollen der Kategorie und der Abteilung des Tickets. Ohne eingestellte Rollen sehen alle mit
     * ticket.view das Ticket – außer bei vertraulichen Kategorien (dann nur ticket.manage).
     */
    private categoryVisible;
    /** IDs der Kategorien, deren Tickets der Benutzer grundsätzlich sehen darf (null = alle) – für Bewertungen/Statistiken je Kategorie. */
    visibleCategoryIds(userId: string): Promise<string[] | null>;
    /** Filter für alle Tickets, die der Benutzer sehen darf (null = alle). Gleiche Regel wie `categoryVisible`, aber als Datenbank-Abfrage. */
    visibleWhere(userId: string): Promise<Prisma.SupportTicketWhereInput | null>;
    /** Zuständige Discord-Rollen eines Tickets (Kategorie + Abteilung) mit sicherem Ersatz, falls keine eingerichtet sind. */
    private routing;
    /** Prüft alle Voraussetzungen, legt das Ticket an und liefert den „create“-Effekt (Channel, Rechte, Ticket-Embed, erste Frage). */
    /** `byStaff`: vom Team für ein Mitglied geöffnet (Recht ticket.create) – ohne Rollen-, Limit- und Cooldown-Prüfung. */
    open(d: OpenInput, actor: TicketActor, byStaff?: boolean): Promise<{
        ticket: ReturnType<SupportTicketsService['summary']>;
        effects: TicketEffect[];
        existing?: boolean;
    } | {
        form: {
            categoryId: string;
            panelId: string | null;
        };
    }>;
    /** Nach dem Speichern: Protokoll, Hinweis auf fehlende Zuständigkeit, Formular-Anhänge, Panel-Auslastung, Benachrichtigungen. */
    private finishCreate;
    /** Formular-Anhänge sicher ablegen und als Nachricht im Verlauf speichern (Dashboard, Transkript). */
    private storeFormFiles;
    private checkOpenable;
    private checkCanOpen;
    private create;
    /** Ticket aus dem Dashboard für einen Discord-Benutzer öffnen (Recht ticket.create). */
    openFromDashboard(actor: TicketActor, d: {
        categoryId: string;
        discordId: string;
        discordName?: string;
        guildId?: string;
    }): Promise<{
        ticket: ReturnType<SupportTicketsService["summary"]>;
        effects: TicketEffect[];
        existing?: boolean;
    } | {
        form: {
            categoryId: string;
            panelId: string | null;
        };
    }>;
    /** Für /ticket im Discord: aktive Ticket-Arten (Voraussetzungen prüft der Bot vorab, das System beim Öffnen erneut). */
    openableCategories(guildId?: string): Promise<{
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
        effects: TicketEffect[];
    }>;
    /** Ersteller schließt sein eigenes Ticket (falls in der Kategorie erlaubt). */
    creatorClose(id: string, discordId: string, reason: string | undefined): Promise<{
        ok: boolean;
        message: string;
        effects: TicketEffect[];
    }>;
    /** Antwort des Erstellers auf „Schließen anfragen“. */
    closeRequestAnswer(id: string, discordId: string, accept: boolean): Promise<{
        ok: boolean;
        message: string;
        effects: TicketEffect[];
    }>;
    /** Ersteller fügt eine Person hinzu (wenn in der Kategorie erlaubt). */
    creatorAdd(id: string, discordId: string, targetId: string): Promise<{
        ok: boolean;
        message: string;
        effects: TicketEffect[];
    }>;
    /** Ticketauslastung: Panels mit „Auslastung anzeigen“, die diese Kategorie enthalten, neu zeichnen. */
    private panelLoad;
    private requireOpen;
    private statusPerm;
    /**
     * Datenänderung bei jedem Statuswechsel (zentral): Wartezeit auf den Nutzer (SLA ruht), Zeitpunkt „gelöst“, neue Lösungsfrist.
     */
    private statusData;
    private statusByKey;
    /** Ist das Discord-Konto ein Mitarbeiter mit Zugriff auf dieses Ticket? (Zuweisen, Bearbeiter-Prüfung nach Wechseln) */
    private staffWithAccess;
    /** Nach Kategorie-/Abteilungswechsel: Bearbeiter ohne Zugriff entfernen (vertrauliche Inhalte nicht versehentlich offenlegen). */
    private revalidateClaimers;
    /** Rollen-Zugriff im Kanal von alter auf neue Zuständigkeit umstellen (nur Differenzen). */
    private moveRoleAccess;
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
    /** Bewertung in den Team-Channel (alles) und den öffentlichen Channel (gewählte Werte); Kommentar kommt als eigene Nachricht. */
    private postRating;
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
    /** Ersteller schreibt: „Wartet auf Nutzer“ endet (SLA läuft weiter), Bearbeiter werden höchstens alle X Minuten benachrichtigt. */
    private onCreatorMessage;
    /** Kategoriewechsel aus vertraulich heraus: nur die Leitung (ticket.manage) – sonst würde der bisherige Verlauf für ein größeres Team sichtbar. */
    private assertConfidentialMove;
    /**
     * Benachrichtigung nach den Regeln unter Allgemein → Benachrichtigungen. Empfänger sind nur Berechtigte: der interne Kanal der
     * Abteilung, die Bearbeiter (DM) und deren verknüpfte Dashboard-Konten. Vertrauliche Tickets: nur Ticket-ID, keine Details.
     * `to`: Discord-IDs statt der Bearbeiter (z. B. die zugewiesene Person); `leads`: zusätzlich die Leitung im Kanal erwähnen.
     */
    private queueNotify;
    /** Transkript fertig bzw. endgültig fehlgeschlagen → Benachrichtigung (fehlgeschlagen zusätzlich im Log-Kanal). */
    private transcriptFinished;
    private storeAttachment;
    /** Anhang ausliefern (nur mit Zugriff auf das Ticket). Nur Bilder inline, alles andere als Download. */
    attachment(userId: string, key: string): Promise<{
        data: NonSharedBuffer;
        name: string;
        contentType: string;
        inline: boolean;
    }>;
    /** Anzeigenamen zu Discord-IDs (verknüpfte Konten, sonst zuletzt gesehener Name in Tickets). */
    private discordNames;
    summary(l: Loaded): {
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
    /** Warteschlangen (offen, unzugewiesen, …) als Abfrage; Status-IDs nach Art bzw. fester Bedeutung. */
    private queueWhere;
    list(userId: string, f: {
        kind?: string;
        queue?: string;
        statusId?: string;
        priorityId?: string;
        categoryId?: string;
        departmentId?: string;
        claimer?: string;
        creator?: string;
        from?: Date;
        to?: Date;
        closedFrom?: Date;
        closedTo?: Date;
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
    /** Zahlen für die Übersicht im Ticket-Center (nur sichtbare Tickets). */
    overview(userId: string, guildId?: string): Promise<{
        open: number;
        unassigned: number;
        inProgress: number;
        waiting: number;
        overdue: number;
        closed: number;
        archived: number;
    }>;
    detail(userId: string, id: string): Promise<{
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
            attachments: Prisma.JsonValue;
            content: string;
            authorName: string;
            ticketId: string;
            authorAvatar: string | null;
            isStaff: boolean;
            isBot: boolean;
            embeds: Prisma.JsonValue;
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
            detail: Prisma.JsonValue;
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
            creatorId: string;
            comment: string | null;
            ticketId: string;
            staffIds: string[];
            stars: number;
        } | null;
        names: Record<string, string>;
        guildId: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        lastActivityAt: Date;
        closedAt: Date | null;
        name: string;
        categoryId: string;
        channelId: string | null;
        archivedAt: Date | null;
        answers: Prisma.JsonValue;
        panelId: string | null;
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
        deletedAt: Date | null;
        escalatedAt: Date | null;
        departmentId: string | null;
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
    /** Auswahllisten für Discord-Menüs (Priorität, Status, Kategorie, Gründe, Zugriff). */
    options(actor: TicketActor, id: string): Promise<{
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
            ref: string;
            ticketNumber: string;
            id: string;
            status: string;
            createdAt: Date;
            version: number;
            lastError: string | null;
            createdByName: string | null;
            creatorId: string;
            creatorName: string;
            claimers: string[];
            attempts: number;
            ticketId: string;
            categoryName: string;
            statusName: string;
            sizeBytes: number;
            completedAt: Date | null;
        }[];
    }>;
    /**
     * Zugriff auf ein Transkript – bei JEDEM Abruf serverseitig geprüft (ein Link allein reicht nie):
     * Mitarbeiter mit ticket.transcript (Export: ticket.transcript_export) und Zugriff auf das Ticket, oder der Ersteller selbst
     * (verknüpftes Discord-Konto; nur Ansicht/Text, kein JSON). Alles andere: einheitlich „nicht gefunden“ (keine Rückschlüsse) + Audit.
     */
    transcriptAccess(userId: string, ticketId: string, need: 'view' | 'export' | 'json'): Promise<'staff' | 'creator'>;
    /** Ein Transkript (Version) für Ansicht/Download; `userId` null = Bot-Dienst (Zustellung in Discord). */
    transcript(userId: string | null, id: string, need?: 'view' | 'export' | 'json'): Promise<{
        id: string;
        status: string;
        createdById: string | null;
        createdAt: Date;
        version: number;
        trigger: string;
        lastError: string | null;
        text: string;
        data: Prisma.JsonValue | null;
        createdByName: string | null;
        creatorId: string;
        creatorName: string;
        claimers: string[];
        attempts: number;
        ticketId: string;
        ticketNumber: number;
        categoryName: string;
        statusName: string;
        html: string;
        sizeBytes: number;
        jobKey: string | null;
        nextAttemptAt: Date | null;
        completedAt: Date | null;
        sha256: string | null;
        notify: Prisma.JsonValue;
    }>;
    /** Versionen eines Tickets für die Transkript-Seite `/transcript/EMD-000123`. */
    transcriptsByRef(userId: string, ref: string): Promise<{
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
    /** Audit-Protokoll des Ticket-Systems (nur Metadaten; Recht ticket.audit). */
    auditLog(f: {
        ticketId?: string;
        action?: string;
        result?: string;
        page: number;
        pageSize: number;
    }): Promise<{
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
            after: Prisma.JsonValue;
            requestId: string | null;
        }[];
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
            comment: string | null;
            ticketId: string;
            staffIds: string[];
            stars: number;
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
    /** Bot meldet: Panel konnte nicht gesendet/aktualisiert werden (Kanal fehlt, Rechte fehlen …) – im Dashboard sichtbar. */
    panelFailed(id: string, error: string): Promise<{
        ok: boolean;
    }>;
    private formFields;
    private formTitle;
    /**
     * Klick auf eine Kategorie mit Formular: Voraussetzungen prüfen (bevor jemand umsonst ausfüllt), Entwurf anlegen und Schritt 1 liefern.
     * `open: true`: die Kategorie braucht (inzwischen) kein Formular – direkt öffnen.
     */
    formStart(d: Omit<OpenInput, 'form' | 'openKey'>): Promise<{
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
    private draftOf;
    /** Formular (erneut) für einen Schritt – z. B. nach „Weiter“ oder nach einem Prüffehler mit den zuletzt eingegebenen Werten. */
    formModalFor(draftId: string, discordId: string, step: number): Promise<{
        modal: import("@enrp/shared").FormModalSpec;
    }>;
    /**
     * Schritt absenden: serverseitig prüfen (dieselbe Prüfung wie im Dashboard), Werte am Entwurf speichern; im letzten Schritt
     * das Ticket anlegen. Ein Entwurf erzeugt höchstens ein Ticket (erneutes Absenden liefert dasselbe Ticket).
     */
    formSubmit(draftId: string, discordId: string, step: number, values: Record<string, FormRawValue>, files: Record<string, FormFile[]>): Promise<{
        ticket: ReturnType<SupportTicketsService["summary"]>;
        effects: TicketEffect[];
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
    /** Dashboard-Vorschau: Formular prüfen, ohne ein Ticket anzulegen. */
    previewForm(fields: TicketQuestion[], values: Record<string, FormRawValue>): {
        steps: string[][];
        ok: boolean;
        errors: Record<string, string>;
        answers: FormAnswer[];
    };
    /** Ersteller hat den Discord-Server verlassen: offene Tickets dort schließen (Einstellung unter Tickets → General). */
    memberLeft(guildId: string, discordId: string): Promise<{
        closed: number;
    }>;
    runAutomation(now?: Date): Promise<{
        reminded: number;
        escalated: number;
        closed: number;
        warned: number;
        deleted: number;
        expired: number;
        alerted: number;
        unclaimed: number;
    }>;
    /**
     * SLA und Eskalation (nur mit eingestellten Zielzeiten): Erinnerung an die Zuständigen (wiederholt nach Einstellung),
     * danach einmalige Meldung an die Leitung; unzugewiesene Tickets nach der Wartezeit der Kategorie. Eskalationen geben
     * NIEMANDEM zusätzlichen Zugriff – die Leitung wird nur benachrichtigt.
     */
    private runSla;
    /** Meldung an die Leitung im internen Kanal der Abteilung (sonst Log-Kanal) + Benachrichtigungsregel „Eskalation“. */
    private leadAlert;
}
export {};
