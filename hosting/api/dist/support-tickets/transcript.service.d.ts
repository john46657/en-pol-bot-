import { Prisma, type TicketTranscript } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { TicketConfigService } from './config.service';
export declare const MAX_TRANSCRIPT_ATTEMPTS: number;
export interface TranscriptNotify {
    channelIds?: string[];
    userId?: string | null;
    message?: string;
}
type Hook = (tr: TicketTranscript, ok: boolean) => Promise<void>;
/**
 * Transkripte als Hintergrund-Aufträge: beim Schließen wird nur ein Auftrag angelegt (die Nachrichten liegen bereits in der
 * Datenbank, nichts geht verloren), die Erstellung läuft danach mit begrenzten Wiederholungen. Jede Erstellung ist eine neue
 * Version; derselbe Anlass (`jobKey`) erzeugt nie zwei Aufträge.
 */
export declare class TicketTranscriptService {
    private readonly prisma;
    private readonly discord;
    private readonly config;
    private readonly log;
    private readonly dir;
    private hook;
    private running;
    constructor(prisma: PrismaService, discord: DiscordService, config: TicketConfigService);
    /** Benachrichtigungen bei Erfolg/Fehlschlag (gesetzt vom Ticket-Service). */
    onFinished(h: Hook): void;
    /** Auftrag anlegen (idempotent über `key`). Liefert den bestehenden Auftrag, falls es ihn schon gibt. */
    enqueue(ticketId: string, o: {
        trigger: string;
        key?: string;
        actor: {
            id: string | null;
            name: string;
        };
        notify?: TranscriptNotify;
    }): Promise<{
        transcript: {
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
            attempts: number;
            ticketId: string;
            creatorId: string;
            creatorName: string;
            claimers: string[];
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
        };
        created: boolean;
    }>;
    /** Fehlgeschlagenen Auftrag erneut einplanen. */
    retry(id: string): Promise<{
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
        attempts: number;
        ticketId: string;
        creatorId: string;
        creatorName: string;
        claimers: string[];
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
    /** Fällige Aufträge abarbeiten (auch nach einem Neustart hängengebliebene). Mehrere Instanzen sperren sich gegenseitig aus. */
    processDue(now?: Date, limit?: number): Promise<{
        done: number;
        failed: number;
    }>;
    private runJob;
    /** Fertiges Transkript in Discord zustellen (Datei + Link zur Online-Ansicht); Fehler dabei ändern das Transkript nicht. */
    private deliver;
    /** Transkript aus den gespeicherten Daten erzeugen (ohne interne Notizen und interne Ereignisse). */
    render(ticketId: string, version: number): Promise<{
        html: string;
        text: string;
        data: {
            sha256: string;
            entries: ({
                kind: "event";
                at: Date;
                text: string;
            } | {
                attachments: {
                    name: string;
                    size: number;
                    contentType: string | undefined;
                }[];
                kind: "message";
                at: Date;
                author: string;
                authorId: string;
                avatar?: string | null;
                staff: boolean;
                bot: boolean;
                content: string;
                embeds: {
                    title?: string;
                    description?: string;
                }[];
            })[];
            createdAt: string;
            closedAt: string | null;
            generatedAt: string;
            ref?: string;
            subject?: string | null;
            department?: string | null;
            version?: number;
            number: string;
            name: string;
            category: string;
            status: string;
            priority: string;
            creator: {
                id: string;
                name: string;
            };
            claimers: {
                id: string;
                name: string;
            }[];
            participants: string[];
            closedBy: string | null;
            closeReason: string | null;
            timezone: string;
            answers: {
                label: string;
                value: string;
            }[];
        };
        sha256: string;
        meta: {
            ref: string;
            guildId: string;
            category: string;
            status: string;
            claimers: string[];
        };
    }>;
    private timezone;
}
export {};
